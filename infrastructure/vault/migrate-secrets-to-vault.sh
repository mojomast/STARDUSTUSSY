#!/bin/bash
# Vault Secret Migration Script
# Purpose: Migrate secrets from environment variables and configuration files to Vault
# Usage: ./migrate-secrets-to-vault.sh [environment: staging|production]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENVIRONMENT="${1:-staging}"
VAULT_ADDR="${VAULT_ADDR:-https://vault.harmonyflow.io}"

# Color codes for output
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

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check Vault CLI
    if ! command -v vault &> /dev/null; then
        log_error "Vault CLI not found. Please install Vault CLI."
        exit 1
    fi
    
    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl not found. Please install kubectl."
        exit 1
    fi
    
    # Check OpenSSL
    if ! command -v openssl &> /dev/null; then
        log_error "OpenSSL not found. Please install OpenSSL."
        exit 1
    fi
    
    # Check if Vault token is set
    if [ -z "$VAULT_TOKEN" ]; then
        log_error "VAULT_TOKEN environment variable not set."
        exit 1
    fi
    
    log_info "Prerequisites check passed."
}

generate_jwt_secrets() {
    log_info "Generating JWT secrets..."
    
    JWT_SECRET=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
    JWT_REFRESH_SECRET=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
    JWT_SECRET_PREVIOUS=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
    JWT_SECRET_NEXT=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-32)
    
    log_info "JWT secrets generated."
}

generate_api_key() {
    log_info "Generating API key..."
    
    API_KEY=$(openssl rand -hex 32)
    
    log_info "API key generated."
}

generate_encryption_key() {
    log_info "Generating encryption key..."
    
    ENCRYPTION_KEY=$(openssl rand -base64 32)
    
    log_info "Encryption key generated."
}

generate_database_passwords() {
    log_info "Generating database passwords..."
    
    POSTGRES_PASSWORD=$(openssl rand -base64 32)
    POSTGRES_REPLICATION_PASSWORD=$(openssl rand -base64 32)
    POSTGRES_ADMIN_PASSWORD=$(openssl rand -base64 32)
    REDIS_PASSWORD=$(openssl rand -base64 32)
    REDIS_STANDBY_PASSWORD=$(openssl rand -base64 32)
    RABBITMQ_PASSWORD=$(openssl rand -base64 32)
    RABBITMQ_COOKIE=$(openssl rand -base64 32)
    RABBITMQ_ERLANG_COOKIE=$(openssl rand -base64 32)
    
    log_info "Database passwords generated."
}

write_to_vault() {
    local path="$1"
    shift
    local data=("$@")
    
    log_info "Writing secrets to Vault: $path"
    
    vault kv put "$path" "${data[@]}" 2>&1 || {
        log_error "Failed to write secrets to Vault: $path"
        return 1
    }
    
    log_info "Secrets written to Vault: $path"
}

migrate_session_state_service_secrets() {
    log_info "Migrating session-state-service secrets..."
    
    # Check if secrets already exist in Vault
    if vault kv get secret/harmonyflow/session-state-service &>/dev/null; then
        log_warn "Secrets already exist in Vault. Skipping migration."
        return 0
    fi
    
    generate_jwt_secrets
    generate_api_key
    generate_encryption_key
    
    write_to_vault secret/harmonyflow/session-state-service \
        jwt-secret="$JWT_SECRET" \
        jwt-refresh-secret="$JWT_REFRESH_SECRET" \
        jwt-secret-previous="$JWT_SECRET_PREVIOUS" \
        jwt-secret-next="$JWT_SECRET_NEXT" \
        api-key="$API_KEY" \
        encryption-key="$ENCRYPTION_KEY"
    
    log_info "Session-state-service secrets migrated."
}

migrate_database_secrets() {
    log_info "Migrating database secrets..."
    
    # PostgreSQL
    if ! vault kv get secret/harmonyflow/postgresql &>/dev/null; then
        generate_database_passwords
        write_to_vault secret/harmonyflow/postgresql \
            password="$POSTGRES_PASSWORD" \
            replication-password="$POSTGRES_REPLICATION_PASSWORD" \
            admin-password="$POSTGRES_ADMIN_PASSWORD"
        log_info "PostgreSQL secrets migrated."
    else
        log_warn "PostgreSQL secrets already exist. Skipping."
    fi
    
    # Redis
    if ! vault kv get secret/harmonyflow/redis &>/dev/null; then
        write_to_vault secret/harmonyflow/redis \
            password="$REDIS_PASSWORD" \
            standby-password="$REDIS_STANDBY_PASSWORD"
        log_info "Redis secrets migrated."
    else
        log_warn "Redis secrets already exist. Skipping."
    fi
    
    # RabbitMQ
    if ! vault kv get secret/harmonyflow/rabbitmq &>/dev/null; then
        write_to_vault secret/harmonyflow/rabbitmq \
            username="harmonyflow" \
            password="$RABBITMQ_PASSWORD" \
            cookie="$RABBITMQ_COOKIE" \
            erlang-cookie="$RABBITMQ_ERLANG_COOKIE"
        log_info "RabbitMQ secrets migrated."
    else
        log_warn "RabbitMQ secrets already exist. Skipping."
    fi
}

migrate_admin_secrets() {
    log_info "Migrating admin secrets..."
    
    if ! vault kv get secret/harmonyflow/admin &>/dev/null; then
        ADMIN_API_TOKEN=$(openssl rand -hex 64)
        write_to_vault secret/harmonyflow/admin \
            api-token="$ADMIN_API_TOKEN"
        log_info "Admin secrets migrated."
    else
        log_warn "Admin secrets already exist. Skipping."
    fi
}

setup_vault_policies() {
    log_info "Setting up Vault policies..."
    
    # Create policies directory
    mkdir -p /tmp/vault-policies
    
    # Session State Service policy
    cat > /tmp/vault-policies/session-state-policy.hcl << 'EOF'
path "secret/data/harmonyflow/session-state-service" {
  capabilities = ["read", "list"]
}

path "secret/data/harmonyflow/redis" {
  capabilities = ["read"]
}

path "transit/encrypt/session-state" {
  capabilities = ["update"]
}

path "transit/decrypt/session-state" {
  capabilities = ["update"]
}
EOF
    
    vault policy write session-state-service /tmp/vault-policies/session-state-policy.hcl || log_warn "Policy already exists."
    
    # External Secrets policy
    cat > /tmp/vault-policies/external-secrets-policy.hcl << 'EOF'
path "secret/data/harmonyflow/*" {
  capabilities = ["read", "list"]
}
EOF
    
    vault policy write external-secrets /tmp/vault-policies/external-secrets-policy.hcl || log_warn "Policy already exists."
    
    # Admin policy
    cat > /tmp/vault-policies/admin-policy.hcl << 'EOF'
path "*" {
  capabilities = ["create", "read", "update", "delete", "list", "sudo"]
}
EOF
    
    vault policy write admin /tmp/vault-policies/admin-policy.hcl || log_warn "Policy already exists."
    
    log_info "Vault policies configured."
}

verify_secrets() {
    log_info "Verifying secrets in Vault..."
    
    # Verify session-state-service secrets
    vault kv get secret/harmonyflow/session-state-service > /dev/null 2>&1 && \
        log_info "✓ session-state-service secrets verified" || \
        log_error "✗ session-state-service secrets missing"
    
    # Verify PostgreSQL secrets
    vault kv get secret/harmonyflow/postgresql > /dev/null 2>&1 && \
        log_info "✓ PostgreSQL secrets verified" || \
        log_error "✗ PostgreSQL secrets missing"
    
    # Verify Redis secrets
    vault kv get secret/harmonyflow/redis > /dev/null 2>&1 && \
        log_info "✓ Redis secrets verified" || \
        log_error "✗ Redis secrets missing"
    
    # Verify RabbitMQ secrets
    vault kv get secret/harmonyflow/rabbitmq > /dev/null 2>&1 && \
        log_info "✓ RabbitMQ secrets verified" || \
        log_error "✗ RabbitMQ secrets missing"
    
    # Verify Admin secrets
    vault kv get secret/harmonyflow/admin > /dev/null 2>&1 && \
        log_info "✓ Admin secrets verified" || \
        log_error "✗ Admin secrets missing"
}

trigger_kubernetes_sync() {
    log_info "Triggering Kubernetes secret sync..."
    
    # Force sync by restarting external-secrets pod
    kubectl rollout restart deployment external-secrets -n external-secrets
    
    # Wait for sync
    kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=external-secrets -n external-secrets --timeout=60s
    
    log_info "Kubernetes secret sync triggered."
}

verify_kubernetes_secrets() {
    log_info "Verifying Kubernetes secrets..."
    
    case "$ENVIRONMENT" in
        staging)
            NAMESPACE="harmonyflow-staging"
            ;;
        production)
            NAMESPACE="harmonyflow-production"
            ;;
        *)
            log_error "Unknown environment: $ENVIRONMENT"
            exit 1
            ;;
    esac
    
    # Verify session-state-service secrets
    kubectl get secret session-state-service-secrets -n $NAMESPACE > /dev/null 2>&1 && \
        log_info "✓ Kubernetes secret session-state-service-secrets verified" || \
        log_error "✗ Kubernetes secret session-state-service-secrets missing"
    
    # Verify Redis secrets
    kubectl get secret redis-secret -n ${NAMESPACE%-production*}redis-staging > /dev/null 2>&1 || \
    kubectl get secret redis-secret -n redis-production > /dev/null 2>&1 && \
        log_info "✓ Kubernetes secret redis-secret verified" || \
        log_warn "Kubernetes secret redis-secret not found (may be in different namespace)"
}

main() {
    log_info "Starting secret migration to Vault..."
    log_info "Environment: $ENVIRONMENT"
    log_info "Vault Address: $VAULT_ADDR"
    
    check_prerequisites
    
    # Run migrations
    setup_vault_policies
    migrate_session_state_service_secrets
    migrate_database_secrets
    migrate_admin_secrets
    
    # Verification
    verify_secrets
    trigger_kubernetes_sync
    sleep 10
    verify_kubernetes_secrets
    
    log_info "Secret migration completed successfully!"
}

main "$@"
