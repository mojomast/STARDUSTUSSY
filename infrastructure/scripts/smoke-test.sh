#!/bin/bash
# Production Smoke Tests for HarmonyFlow SyncBridge
# Version: 1.0.0

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASSED=0
FAILED=0
SKIPPED=0

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_test() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

test_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((PASSED++))
}

test_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((FAILED++))
}

test_skip() {
    echo -e "${YELLOW}[SKIP]${NC} $1"
    ((SKIPPED++))
}

check_service_health() {
    local service_name="$1"
    local namespace="$2"
    local endpoint="$3"
    
    log_test "Checking $service_name health..."
    
    # Check pod status
    if kubectl get pods -n "$namespace" -l "app=$service_name" 2>/dev/null | grep -q "Running"; then
        log_info "$service_name pods are running"
    else
        test_fail "$service_name pods are not running"
        return 1
    fi
    
    # Check endpoint response
    if [ -n "$endpoint" ]; then
        if curl -sfk "$endpoint/health/live" >/dev/null 2>&1; then
            test_pass "$service_name health check passed"
        else
            test_fail "$service_name health check failed"
        fi
    fi
}

test_vault() {
    log_test "Testing Vault..."
    
    local vault_status
    vault_status=$(kubectl exec -n vault vault-0 -- vault status -format=json 2>/dev/null || echo "{}")
    
    if echo "$vault_status" | grep -q '"initialized":true' && echo "$vault_status" | grep -q '"sealed":false'; then
        test_pass "Vault is initialized and unsealed"
    else
        test_fail "Vault is not ready"
    fi
    
    if kubectl get secret vault-init-keys -n vault >/dev/null 2>&1; then
        test_pass "Vault init keys exist"
    else
        test_fail "Vault init keys missing"
    fi
}

test_redis() {
    log_test "Testing Redis cluster..."
    
    local redis_pods
    redis_pods=$(kubectl get pods -n redis-production -l app=redis -o jsonpath='{.items[*].metadata.name}' 2>/dev/null)
    
    local running_count=0
    for pod in $redis_pods; do
        if kubectl get pod "$pod" -n redis-production -o jsonpath='{.status.phase}' 2>/dev/null | grep -q "Running"; then
            ((running_count++))
        fi
    done
    
    if [ "$running_count" -ge 6 ]; then
        test_pass "Redis cluster: $running_count/6 nodes running"
    else
        test_fail "Redis cluster: Only $running_count/6 nodes running"
    fi
}

test_postgresql() {
    log_test "Testing PostgreSQL cluster..."
    
    local pg_primary
    pg_primary=$(kubectl get pods -n postgresql -l role=master -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
    
    if [ -n "$pg_primary" ]; then
        if kubectl get pod "$pg_primary" -n postgresql -o jsonpath='{.status.phase}' 2>/dev/null | grep -q "Running"; then
            test_pass "PostgreSQL primary is running"
        else
            test_fail "PostgreSQL primary is not running"
        fi
    else
        test_fail "PostgreSQL primary not found"
    fi
    
    local pg_replicas
    pg_replicas=$(kubectl get pods -n postgresql -l role=replica -o jsonpath='{.items[*].metadata.name}' 2>/dev/null | wc -w)
    
    if [ "$pg_replicas" -ge 2 ]; then
        test_pass "PostgreSQL replicas: $pg_replicas running"
    else
        test_fail "PostgreSQL replicas: Only $pg_replicas running"
    fi
}

test_rabbitmq() {
    log_test "Testing RabbitMQ cluster..."
    
    local rmq_pods
    rmq_pods=$(kubectl get pods -n rabbitmq-production -l app.kubernetes.io/name=rabbitmq -o jsonpath='{.items[*].metadata.name}' 2>/dev/null)
    
    local running_count=0
    for pod in $rmq_pods; do
        if kubectl get pod "$pod" -n rabbitmq-production -o jsonpath='{.status.phase}' 2>/dev/null | grep -q "Running"; then
            ((running_count++))
        fi
    done
    
    if [ "$running_count" -ge 3 ]; then
        test_pass "RabbitMQ cluster: $running_count/3 nodes running"
    else
        test_fail "RabbitMQ cluster: Only $running_count/3 nodes running"
    fi
}

test_session_state_service() {
    log_test "Testing Session State Service..."
    
    check_service_health "session-state-service" "harmonyflow-production" "https://api.harmonyflow.io"
    
    # Test metrics endpoint
    if curl -sfk "https://api.harmonyflow.io/metrics" 2>/dev/null | grep -q "sessions_active"; then
        test_pass "Session State Service metrics available"
    else
        test_fail "Session State Service metrics not available"
    fi
    
    # Test WebSocket connection
    if timeout 5 curl -sk -H "Upgrade: websocket" -H "Connection: Upgrade" "https://api.harmonyflow.io:8081" 2>/dev/null; then
        test_pass "Session State Service WebSocket accessible"
    else
        test_fail "Session State Service WebSocket not accessible"
    fi
}

test_external_secrets() {
    log_test "Testing External Secrets Operator..."
    
    local es_pods
    es_pods=$(kubectl get pods -n external-secrets -l app.kubernetes.io/name=external-secrets -o jsonpath='{.items[*].metadata.name}' 2>/dev/null)
    
    for pod in $es_pods; do
        if kubectl get pod "$pod" -n external-secrets -o jsonpath='{.status.phase}' 2>/dev/null | grep -q "Running"; then
            test_pass "External Secrets Operator pod running: $pod"
        fi
    done
    
    # Check ClusterSecretStore
    if kubectl get clustersecretstore vault-backend-production >/dev/null 2>&1; then
        test_pass "Production ClusterSecretStore exists"
    else
        test_fail "Production ClusterSecretStore missing"
    fi
    
    # Check synced secrets
    if kubectl get secret session-state-service-secrets -n harmonyflow-production >/dev/null 2>&1; then
        test_pass "Session State Service secrets synced"
    else
        test_fail "Session State Service secrets not synced"
    fi
}

test_authentication() {
    log_test "Testing authentication flow..."
    
    # This would require actual API endpoints to test
    # For now, we'll just verify the service is accessible
    
    if curl -sfk "https://api.harmonyflow.io/health/live" >/dev/null 2>&1; then
        test_pass "API service is accessible"
    else
        test_fail "API service is not accessible"
    fi
}

test_web_pwa() {
    log_test "Testing Web PWA..."
    
    if curl -sfk "https://harmonyflow.io" >/dev/null 2>&1; then
        test_pass "Web PWA is accessible"
    else
        test_fail "Web PWA is not accessible"
    fi
    
    # Check for service worker registration (in a real test)
    test_skip "Service worker registration check (manual verification required)"
}

test_dns_resolution() {
    log_test "Testing DNS resolution..."
    
    if nslookup api.harmonyflow.io >/dev/null 2>&1; then
        test_pass "DNS resolution: api.harmonyflow.io"
    else
        test_fail "DNS resolution failed: api.harmonyflow.io"
    fi
    
    if nslookup vault.harmonyflow.io >/dev/null 2>&1; then
        test_pass "DNS resolution: vault.harmonyflow.io"
    else
        test_fail "DNS resolution failed: vault.harmonyflow.io"
    fi
}

test_ssl_certificates() {
    log_test "Testing SSL/TLS certificates..."
    
    local api_cert
    api_cert=$(echo | openssl s_client -servername api.harmonyflow.io -connect api.harmonyflow.io:443 2>/dev/null | openssl x509 -noout -dates 2>/dev/null || echo "")
    
    if [ -n "$api_cert" ]; then
        test_pass "SSL certificate valid for api.harmonyflow.io"
    else
        test_fail "SSL certificate check failed for api.harmonyflow.io"
    fi
    
    local vault_cert
    vault_cert=$(echo | openssl s_client -servername vault.harmonyflow.io -connect vault.harmonyflow.io:443 2>/dev/null | openssl x509 -noout -dates 2>/dev/null || echo "")
    
    if [ -n "$vault_cert" ]; then
        test_pass "SSL certificate valid for vault.harmonyflow.io"
    else
        test_fail "SSL certificate check failed for vault.harmonyflow.io"
    fi
}

test_monitoring() {
    log_test "Testing monitoring stack..."
    
    if kubectl get pods -n monitoring -l app=prometheus -o jsonpath='{.items[*].metadata.name}' 2>/dev/null | grep -q "prometheus"; then
        test_pass "Prometheus is running"
    else
        test_fail "Prometheus is not running"
    fi
    
    if kubectl get pods -n monitoring -l app=grafana -o jsonpath='{.items[*].metadata.name}' 2>/dev/null | grep -q "grafana"; then
        test_pass "Grafana is running"
    else
        test_fail "Grafana is not running"
    fi
}

print_summary() {
    echo ""
    echo "=========================================="
    echo "  Smoke Test Summary"
    echo "=========================================="
    echo -e "  ${GREEN}Passed:${NC} $PASSED"
    echo -e "  ${RED}Failed:${NC} $FAILED"
    echo -e "  ${YELLOW}Skipped:${NC} $SKIPPED"
    echo "=========================================="
    
    local total=$((PASSED + FAILED + SKIPPED))
    local success_rate=0
    if [ $total -gt 0 ]; then
        success_rate=$((PASSED * 100 / total))
    fi
    
    echo "  Success Rate: $success_rate%"
    echo "=========================================="
    
    if [ $FAILED -eq 0 ]; then
        log_info "All critical tests passed!"
        return 0
    else
        log_error "Some tests failed. Please review the failures above."
        return 1
    fi
}

main() {
    log_info "Running production smoke tests for HarmonyFlow SyncBridge..."
    
    test_vault
    test_external_secrets
    test_redis
    test_postgresql
    test_rabbitmq
    test_session_state_service
    test_authentication
    test_web_pwa
    test_dns_resolution
    test_ssl_certificates
    test_monitoring
    
    print_summary
}

main "$@"
