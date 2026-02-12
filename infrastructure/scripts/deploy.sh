#!/bin/bash
# Deploy script for HarmonyFlow Infrastructure
# Usage: ./deploy.sh [environment] [component]

set -e

ENVIRONMENT=${1:-dev}
COMPONENT=${2:-all}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|production)$ ]]; then
    log_error "Invalid environment. Must be: dev, staging, or production"
    exit 1
fi

log_info "Deploying infrastructure for environment: $ENVIRONMENT"

# Function to deploy Terraform
deploy_terraform() {
    log_info "Deploying Terraform infrastructure..."
    cd ../terraform
    
    terraform init
    terraform workspace select $ENVIRONMENT || terraform workspace new $ENVIRONMENT
    terraform plan -var="environment=$ENVIRONMENT" -out=tfplan
    terraform apply tfplan
    
    log_info "Terraform deployment complete"
}

# Function to deploy Kubernetes resources
deploy_kubernetes() {
    log_info "Deploying Kubernetes resources..."
    
    # Update kubeconfig
    aws eks update-kubeconfig --region us-west-2 --name harmonyflow-$ENVIRONMENT
    
    # Deploy components based on selection
    case $COMPONENT in
        all|linkerd)
            log_info "Deploying Linkerd..."
            kubectl apply -f ../kubernetes/linkerd/
            ;;
    esac
    
    case $COMPONENT in
        all|redis)
            log_info "Deploying Redis..."
            kubectl apply -f ../kubernetes/redis/
            ;;
    esac
    
    case $COMPONENT in
        all|postgresql)
            log_info "Deploying PostgreSQL..."
            kubectl apply -f ../kubernetes/postgresql/
            ;;
    esac
    
    case $COMPONENT in
        all|rabbitmq)
            log_info "Deploying RabbitMQ..."
            kubectl apply -f ../kubernetes/rabbitmq/
            ;;
    esac
    
    case $COMPONENT in
        all|monitoring)
            log_info "Deploying Monitoring Stack..."
            kubectl apply -f ../kubernetes/monitoring/
            ;;
    esac
    
    case $COMPONENT in
        all|vault)
            log_info "Deploying Vault..."
            kubectl apply -f ../kubernetes/vault/
            ;;
    esac
    
    log_info "Kubernetes deployment complete"
}

# Function to verify deployment
verify_deployment() {
    log_info "Verifying deployment..."
    
    echo "=== Cluster Status ==="
    kubectl get nodes -o wide
    
    echo ""
    echo "=== Pod Status ==="
    kubectl get pods --all-namespaces
    
    echo ""
    echo "=== Services ==="
    kubectl get svc --all-namespaces
    
    log_info "Deployment verification complete"
}

# Main execution
main() {
    log_info "Starting deployment process..."
    
    # Deploy Terraform if component is all or terraform
    if [[ "$COMPONENT" == "all" ]] || [[ "$COMPONENT" == "terraform" ]]; then
        deploy_terraform
    fi
    
    # Deploy Kubernetes if component is not terraform-only
    if [[ "$COMPONENT" != "terraform" ]]; then
        deploy_kubernetes
        verify_deployment
    fi
    
    log_info "Deployment completed successfully!"
}

# Run main function
main
