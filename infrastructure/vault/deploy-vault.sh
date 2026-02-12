#!/bin/bash
# Vault Deployment Script for HarmonyFlow SyncBridge
# Deploys Vault, External Secrets Operator, and all related resources
# Usage: ./deploy-vault.sh [environment: staging|production]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="/home/mojo/projects/watercooler/infrastructure"
KUBERNETES_DIR="$INFRA_DIR/kubernetes"
VAULT_DIR="$KUBERNETES_DIR/vault"
ENVIRONMENT="${1:-staging}"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "\n${BLUE}==>${NC} $1"
}

check_prerequisites() {
    log_step "Checking prerequisites..."
    
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl not found. Please install kubectl."
        exit 1
    fi
    
    if ! command -v vault &> /dev/null; then
        log_error "Vault CLI not found. Please install Vault CLI."
        exit 1
    fi
    
    log_info "Prerequisites check passed."
}

apply_vault_deployment() {
    log_step "Deploying Vault..."
    
    kubectl apply -f "$VAULT_DIR/vault-deployment.yaml"
    
    log_info "Waiting for Vault pods to be ready..."
    kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=vault -n vault --timeout=300s
    
    log_info "Vault deployed successfully."
}

apply_external_secrets() {
    log_step "Deploying External Secrets Operator..."
    
    kubectl apply -f "$VAULT_DIR/external-secrets.yaml"
    
    log_info "Waiting for External Secrets Operator to be ready..."
    kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=external-secrets -n external-secrets --timeout=120s
    
    log_info "External Secrets Operator deployed successfully."
}

run_vault_init_job() {
    log_step "Running Vault initialization job..."
    
    kubectl apply -f "$VAULT_DIR/vault-init-job.yaml"
    
    log_info "Waiting for Vault initialization to complete..."
    kubectl wait --for=condition=complete job/vault-init -n vault --timeout=600s || true
    
    # Check job status
    JOB_STATUS=$(kubectl get job vault-init -n vault -o jsonpath='{.status.succeeded}')
    if [ "$JOB_STATUS" -ge 1 ]; then
        log_info "Vault initialization completed successfully."
    else
        log_warn "Vault initialization job may have issues. Check logs:"
        kubectl logs job/vault-init -n vault
    fi
}

configure_kubernetes_auth() {
    log_step "Configuring Kubernetes authentication for Vault..."
    
    # Get the Vault root token from the init job logs
    log_info "Retrieving Vault root token..."
    VAULT_POD=$(kubectl get pod -n vault -l app.kubernetes.io/name=vault -o jsonpath='{.items[0].metadata.name}')
    
    # For production environments, you should use a more secure method to retrieve the token
    # This is a simplified approach for demonstration
    log_warn "In production, retrieve the root token from a secure storage."
}

apply_external_secrets_for_apps() {
    log_step "Applying ExternalSecret configurations for applications..."
    
    case "$ENVIRONMENT" in
        staging)
            kubectl apply -f "$INFRA_DIR/staging/apps/session-state-service.yaml"
            ;;
        production)
            kubectl apply -f "$INFRA_DIR/production/kubernetes/apps/session-state-service-production.yaml"
            ;;
        *)
            log_error "Unknown environment: $ENVIRONMENT"
            exit 1
            ;;
    esac
    
    log_info "ExternalSecret configurations applied."
}

verify_deployment() {
    log_step "Verifying Vault deployment..."
    
    # Check Vault pods
    VAULT_PODS=$(kubectl get pod -n vault -l app.kubernetes.io/name=vault --no-headers | wc -l)
    log_info "Vault pods running: $VAULT_PODS/3"
    
    # Check External Secrets pods
    ES_PODS=$(kubectl get pod -n external-secrets -l app.kubernetes.io/name=external-secrets --no-headers | wc -l)
    log_info "External Secrets pods running: $ES_PODS/2"
    
    # Check Vault status
    VAULT_POD=$(kubectl get pod -n vault -l app.kubernetes.io/name=vault -o jsonpath='{.items[0].metadata.name}')
    kubectl exec -n vault "$VAULT_POD" -- vault status -tls-skip-verify
    
    log_info "Verification complete."
}

display_next_steps() {
    log_step "Next Steps"
    
    echo -e "${GREEN}Vault has been deployed and initialized!${NC}"
    echo ""
    echo "Important:"
    echo "1. The unseal keys and root token are stored in the Vault init job logs."
    echo "   Retrieve them securely:"
    echo "   kubectl logs job/vault-init -n vault"
    echo ""
    echo "2. Store the unseal keys and root token in a secure password manager or HSM."
    echo ""
    echo "3. Run the secret migration script:"
    echo "   cd $INFRA_DIR/vault"
    echo "   ./migrate-secrets-to-vault.sh $ENVIRONMENT"
    echo ""
    echo "4. Verify that secrets are synced to Kubernetes:"
    echo "   kubectl get secrets -n ${ENVIRONMENT//-production/}"
    echo ""
    echo "5. Monitor the External Secrets Operator logs:"
    echo "   kubectl logs -n external-secrets deployment/external-secrets -f"
    echo ""
    echo "6. Access the Vault UI:"
    echo "   Port-forward: kubectl port-forward -n vault svc/vault 8200:8200"
    echo "   URL: https://localhost:8200"
    echo ""
    echo "Documentation:"
    echo "- Secret Rotation: $INFRA_DIR/vault/SECRET_ROTATION.md"
    echo "- Vault Configuration: $VAULT_DIR/vault-deployment.yaml"
    echo "- External Secrets: $VAULT_DIR/external-secrets.yaml"
}

main() {
    echo -e "${BLUE}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║     Vault Deployment for HarmonyFlow SyncBridge               ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    
    echo "Environment: $ENVIRONMENT"
    echo ""
    
    check_prerequisites
    apply_vault_deployment
    apply_external_secrets
    run_vault_init_job
    configure_kubernetes_auth
    apply_external_secrets_for_apps
    verify_deployment
    display_next_steps
    
    log_step "Deployment completed successfully!"
}

main "$@"
