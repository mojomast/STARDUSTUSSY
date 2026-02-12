#!/bin/bash
# HarmonyFlow SyncBridge - Production Deployment Script
# Usage: ./deploy-production.sh [component]
# Components: all|terraform|redis|postgresql|session-service|monitoring

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$SCRIPT_DIR/../production"

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

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed"
        exit 1
    fi
    
    if ! command -v terraform &> /dev/null; then
        log_warn "terraform is not installed (optional for k8s-only deployment)"
    fi
    
    # Check cluster connectivity
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster"
        exit 1
    fi
    
    log_info "Prerequisites check passed"
}

# Deploy Terraform infrastructure
deploy_terraform() {
    log_info "Deploying EKS cluster via Terraform..."
    cd "$INFRA_DIR/terraform"
    
    terraform init
    terraform plan -out=tfplan
    terraform apply tfplan
    
    log_info "EKS cluster deployment complete"
}

# Deploy Redis cluster
deploy_redis() {
    log_info "Deploying Redis production cluster..."
    kubectl apply -f "$INFRA_DIR/kubernetes/redis/redis-cluster-production.yaml"
    
    log_info "Waiting for Redis cluster to be ready..."
    kubectl wait --for=condition=ready pod -l app=redis,tier=database,environment=production -n redis-production --timeout=300s || true
    
    log_info "Redis cluster deployment complete"
}

# Deploy PostgreSQL cluster
deploy_postgresql() {
    log_info "Deploying PostgreSQL production cluster..."
    kubectl apply -f "$INFRA_DIR/kubernetes/postgresql/postgresql-cluster-production.yaml"
    
    log_info "Waiting for PostgreSQL cluster to be ready..."
    kubectl wait --for=condition=ready pod -l app=postgresql,environment=production -n postgresql-production --timeout=300s || true
    
    log_info "PostgreSQL cluster deployment complete"
}

# Deploy Session State Service
deploy_session_service() {
    log_info "Deploying Session State Service..."
    kubectl apply -f "$INFRA_DIR/kubernetes/apps/session-state-service-production.yaml"
    
    log_info "Waiting for Session State Service to be ready..."
    kubectl wait --for=condition=ready pod -l app=session-state-service -n harmonyflow-production --timeout=180s || true
    
    log_info "Session State Service deployment complete"
}

# Deploy monitoring stack
deploy_monitoring() {
    log_info "Deploying monitoring stack (Prometheus, Grafana, Alertmanager)..."
    
    # Apply configs first
    kubectl apply -f "$INFRA_DIR/kubernetes/monitoring/prometheus-production.yaml"
    
    # Apply deployments
    kubectl apply -f "$INFRA_DIR/kubernetes/monitoring/prometheus-deployment.yaml"
    kubectl apply -f "$INFRA_DIR/kubernetes/monitoring/alertmanager-production.yaml"
    kubectl apply -f "$INFRA_DIR/kubernetes/monitoring/grafana-production.yaml"
    
    log_info "Waiting for monitoring stack to be ready..."
    kubectl wait --for=condition=ready pod -l app=prometheus -n monitoring --timeout=180s || true
    kubectl wait --for=condition=ready pod -l app=alertmanager -n monitoring --timeout=180s || true
    kubectl wait --for=condition=ready pod -l app=grafana -n monitoring --timeout=180s || true
    
    log_info "Monitoring stack deployment complete"
}

# Deploy everything
deploy_all() {
    log_info "Starting full production deployment..."
    
    # Skip Terraform by default - cluster should already exist
    # deploy_terraform
    
    deploy_redis
    deploy_postgresql
    deploy_session_service
    deploy_monitoring
    
    log_info "Full production deployment complete!"
    print_status
}

# Print deployment status
print_status() {
    echo ""
    echo "========================================"
    log_info "Production Deployment Status"
    echo "========================================"
    
    echo ""
    echo "Namespaces:"
    kubectl get namespaces | grep -E "(redis-production|postgresql-production|harmonyflow-production|monitoring)"
    
    echo ""
    echo "Redis Cluster:"
    kubectl get pods -n redis-production
    
    echo ""
    echo "PostgreSQL Cluster:"
    kubectl get pods -n postgresql-production
    
    echo ""
    echo "Session State Service:"
    kubectl get pods -n harmonyflow-production
    
    echo ""
    echo "Monitoring Stack:"
    kubectl get pods -n monitoring
    
    echo ""
    echo "========================================"
    log_info "Deployment Summary"
    echo "========================================"
    echo "Grafana: https://grafana.harmonyflow.io"
    echo "Prometheus: https://prometheus.harmonyflow.io"
    echo "API Endpoint: https://api.harmonyflow.io"
    echo ""
    log_warn "Remember to update secrets before production use!"
}

# Main execution
main() {
    local component="${1:-all}"
    
    check_prerequisites
    
    case "$component" in
        terraform)
            deploy_terraform
            ;;
        redis)
            deploy_redis
            ;;
        postgresql|postgres)
            deploy_postgresql
            ;;
        session-service|session)
            deploy_session_service
            ;;
        monitoring)
            deploy_monitoring
            ;;
        all)
            deploy_all
            ;;
        status)
            print_status
            ;;
        *)
            echo "Usage: $0 [component]"
            echo ""
            echo "Components:"
            echo "  all              - Deploy everything (default)"
            echo "  terraform        - Deploy EKS cluster via Terraform"
            echo "  redis            - Deploy Redis cluster only"
            echo "  postgresql       - Deploy PostgreSQL cluster only"
            echo "  session-service  - Deploy Session State Service only"
            echo "  monitoring       - Deploy monitoring stack only"
            echo "  status           - Show deployment status"
            echo ""
            exit 1
            ;;
    esac
}

main "$@"
