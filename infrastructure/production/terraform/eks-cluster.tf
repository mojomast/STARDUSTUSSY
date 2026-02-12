# Terraform Configuration for HarmonyFlow Production EKS Cluster
# Provider: AWS (EKS)
# Nodes: 6+ with larger instance types for production workloads
# Multi-AZ deployment for high availability

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.11"
    }
  }
  
  backend "s3" {
    bucket         = "harmonyflow-terraform-state"
    key            = "infrastructure/production/eks/terraform.tfstate"
    region         = "us-west-2"
    encrypt        = true
    dynamodb_table = "harmonyflow-terraform-locks"
  }
}

provider "aws" {
  region = var.aws_region
  
  default_tags {
    tags = {
      Project     = "HarmonyFlow"
      Environment = "production"
      ManagedBy   = "Terraform"
      Criticality = "high"
      CostCenter  = "engineering"
    }
  }
}

provider "aws" {
  alias  = "dr"
  region = var.dr_region
  
  default_tags {
    tags = {
      Project     = "HarmonyFlow"
      Environment = "production-dr"
      ManagedBy   = "Terraform"
      Criticality = "high"
      Purpose     = "disaster-recovery"
    }
  }
}

# Data sources
data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_availability_zones" "available_dr" {
  provider = aws.dr
  state    = "available"
}

data "aws_caller_identity" "current" {}

# KMS Key for encryption
resource "aws_kms_key" "eks_encryption" {
  description             = "EKS Secret Encryption Key"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  
  tags = {
    Name = "harmonyflow-production-eks-encryption"
  }
}

resource "aws_kms_alias" "eks_encryption" {
  name          = "alias/harmonyflow-production-eks"
  target_key_id = aws_kms_key.eks_encryption.key_id
}

# VPC Configuration - Multi-AZ
data "aws_availability_zones" "available" {
  state = "available"
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"
  
  name = "harmonyflow-production"
  cidr = "10.0.0.0/16"
  
  azs             = slice(data.aws_availability_zones.available.names, 0, 3)
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]
  
  # High availability NAT Gateways (one per AZ)
  enable_nat_gateway     = true
  single_nat_gateway     = false
  enable_dns_hostnames   = true
  enable_dns_support     = true
  
  # VPC Flow Logs for security auditing
  enable_flow_log                      = true
  create_flow_log_cloudwatch_iam_role  = true
  create_flow_log_cloudwatch_log_group = true
  
  public_subnet_tags = {
    "kubernetes.io/role/elb" = "1"
    "Type"                   = "public"
  }
  
  private_subnet_tags = {
    "kubernetes.io/role/internal-elb" = "1"
    "Type"                            = "private"
  }
  
  tags = {
    Name = "harmonyflow-production"
  }
}

# EKS Cluster - Production Configuration
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 19.0"
  
  cluster_name    = "harmonyflow-production"
  cluster_version = "1.28"
  
  vpc_id                         = module.vpc.vpc_id
  subnet_ids                     = module.vpc.private_subnets
  control_plane_subnet_ids       = module.vpc.private_subnets
  
  # Enhanced security for production
  cluster_endpoint_public_access  = true
  cluster_endpoint_private_access = true
  
  # Encryption at rest for secrets
  cluster_encryption_config = {
    resources        = ["secrets"]
    provider_key_arn = aws_kms_key.eks_encryption.arn
  }
  
  # Cluster logging enabled for all components
  cluster_enabled_log_types = ["api", "audit", "authenticator", "controllerManager", "scheduler"]
  
  # EKS Add-ons
  cluster_addons = {
    coredns = {
      most_recent = true
      configuration_values = jsonencode({
        computeType = "Fargate"
      })
    }
    kube-proxy = {
      most_recent = true
    }
    vpc-cni = {
      most_recent = true
    }
    aws-ebs-csi-driver = {
      most_recent = true
    }
    amazon-cloudwatch-observability = {
      most_recent = true
    }
  }
  
  # Managed Node Groups - Production Grade
  eks_managed_node_groups = {
    # General workload nodes - larger instances for production
    general = {
      desired_size = 6
      min_size     = 6
      max_size     = 20
      
      instance_types = ["m6i.xlarge", "m6i.2xlarge", "m5.xlarge"]
      capacity_type  = "ON_DEMAND"
      
      disk_size = 100
      
      labels = {
        workload = "general"
        environment = "production"
      }
      
      taints = []
      
      update_config = {
        max_unavailable_percentage = 25
      }
      
      # Launch template for additional configuration
      block_device_mappings = {
        xvda = {
          device_name = "/dev/xvda"
          ebs = {
            volume_size           = 100
            volume_type           = "gp3"
            iops                  = 3000
            throughput            = 125
            encrypted             = true
            kms_key_id            = aws_kms_key.eks_encryption.arn
            delete_on_termination = true
          }
        }
      }
      
      tags = {
        Name = "harmonyflow-production-general"
        "k8s.io/cluster-autoscaler/enabled"             = "true"
        "k8s.io/cluster-autoscaler/harmonyflow-production" = "true"
      }
    }
    
    # Memory optimized nodes for Redis/PostgreSQL
    memory_optimized = {
      desired_size = 3
      min_size     = 3
      max_size     = 10
      
      instance_types = ["r6i.xlarge", "r6i.2xlarge"]
      capacity_type  = "ON_DEMAND"
      
      disk_size = 200
      
      labels = {
        workload = "database"
        memory-optimized = "true"
        environment = "production"
      }
      
      taints = [{
        key    = "database"
        value  = "true"
        effect = "NO_SCHEDULE"
      }]
      
      block_device_mappings = {
        xvda = {
          device_name = "/dev/xvda"
          ebs = {
            volume_size           = 200
            volume_type           = "io2"
            iops                  = 10000
            encrypted             = true
            kms_key_id            = aws_kms_key.eks_encryption.arn
            delete_on_termination = true
          }
        }
      }
      
      tags = {
        Name = "harmonyflow-production-database"
        "k8s.io/cluster-autoscaler/enabled"             = "true"
        "k8s.io/cluster-autoscaler/harmonyflow-production" = "true"
      }
    }
    
    # Spot instances for non-critical workloads
    spot = {
      desired_size = 2
      min_size     = 0
      max_size     = 10
      
      instance_types = ["m6i.large", "m5.large", "m5a.large", "m6i.xlarge"]
      capacity_type  = "SPOT"
      
      labels = {
        workload = "spot"
        environment = "production"
      }
      
      taints = [{
        key    = "spot"
        value  = "true"
        effect = "NO_SCHEDULE"
      }]
      
      tags = {
        Name = "harmonyflow-production-spot"
        "k8s.io/cluster-autoscaler/enabled"             = "true"
        "k8s.io/cluster-autoscaler/harmonyflow-production" = "true"
      }
    }
  }
  
  # Fargate Profiles for specific workloads
  fargate_profiles = {
    monitoring = {
      name = "monitoring"
      selectors = [
        { namespace = "monitoring" }
      ]
      subnet_ids = module.vpc.private_subnets
    }
    kube_system = {
      name = "kube-system"
      selectors = [
        { namespace = "kube-system" }
      ]
      subnet_ids = module.vpc.private_subnets
    }
  }
  
  # Cluster access entry
  manage_aws_auth_configmap = true
  aws_auth_roles = [
    {
      rolearn  = aws_iam_role.eks_admin.arn
      username = "admin"
      groups   = ["system:masters"]
    },
    {
      rolearn  = aws_iam_role.eks_readonly.arn
      username = "readonly"
      groups   = ["view"]
    }
  ]
  
  tags = {
    Name = "harmonyflow-production"
  }
}

# IAM Role for EKS Admin Access
resource "aws_iam_role" "eks_admin" {
  name = "harmonyflow-eks-admin-production"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
      }
    ]
  })
}

# IAM Role for Read-Only Access
resource "aws_iam_role" "eks_readonly" {
  name = "harmonyflow-eks-readonly-production"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
      }
    ]
  })
}

# Security Group for EKS Control Plane
resource "aws_security_group" "eks_control_plane" {
  name        = "harmonyflow-production-eks-control-plane"
  description = "Security group for EKS control plane"
  vpc_id      = module.vpc.vpc_id
  
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  tags = {
    Name = "harmonyflow-production-eks-control-plane"
  }
}

# WAF WebACL for EKS Ingress Protection
resource "aws_wafv2_web_acl" "eks_protection" {
  name        = "harmonyflow-production-eks"
  description = "WAF rules for EKS production ingress protection"
  scope       = "REGIONAL"
  
  default_action {
    allow {}
  }
  
  # AWS Managed Rule - Common Rule Set
  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 1
    
    override_action {
      none {}
    }
    
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }
    
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AWSManagedRulesCommonRuleSetMetric"
      sampled_requests_enabled   = true
    }
  }
  
  # Rate Limiting
  rule {
    name     = "RateLimiting"
    priority = 2
    
    action {
      block {}
    }
    
    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }
    
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "RateLimitingMetric"
      sampled_requests_enabled   = true
    }
  }
  
  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "harmonyflow-production-eks"
    sampled_requests_enabled   = true
  }
}

# Outputs
output "cluster_endpoint" {
  description = "Endpoint for EKS control plane"
  value       = module.eks.cluster_endpoint
}

output "cluster_name" {
  description = "Kubernetes Cluster Name"
  value       = module.eks.cluster_name
}

output "cluster_oidc_issuer_url" {
  description = "The URL on the EKS cluster for the OpenID Connect identity provider"
  value       = module.eks.cluster_oidc_issuer_url
}

output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "private_subnets" {
  description = "Private subnet IDs"
  value       = module.vpc.private_subnets
}

output "public_subnets" {
  description = "Public subnet IDs"
  value       = module.vpc.public_subnets
}

output "kms_key_arn" {
  description = "KMS Key ARN for encryption"
  value       = aws_kms_key.eks_encryption.arn
}

output "waf_web_acl_arn" {
  description = "WAF WebACL ARN"
  value       = aws_wafv2_web_acl.eks_protection.arn
}
