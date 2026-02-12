#!/bin/bash
# Health check script for HarmonyFlow Infrastructure

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

check_passed=0
check_failed=0

check_pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((check_passed++))
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
    ((check_failed++))
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

echo "================================"
echo "HarmonyFlow Health Check"
echo "================================"
echo ""

# Check Kubernetes cluster
echo "Checking Kubernetes cluster..."
if kubectl cluster-info >/dev/null 2>&1; then
    check_pass "Kubernetes cluster is accessible"
else
    check_fail "Cannot access Kubernetes cluster"
    exit 1
fi

# Check nodes
echo ""
echo "Checking nodes..."
ready_nodes=$(kubectl get nodes -o jsonpath='{.items[*].status.conditions[?(@.type=="Ready")].status}' | tr ' ' '\n' | grep -c "True" || true)
total_nodes=$(kubectl get nodes --no-headers | wc -l)

if [ "$ready_nodes" -ge 3 ]; then
    check_pass "All nodes are ready ($ready_nodes/$total_nodes)"
else
    check_fail "Not enough ready nodes ($ready_nodes/$total_nodes)"
fi

# Check Linkerd
echo ""
echo "Checking Linkerd..."
if kubectl get pods -n linkerd -l app.kubernetes.io/name=linkerd-destination --no-headers 2>/dev/null | grep -q "Running"; then
    check_pass "Linkerd control plane is running"
else
    check_fail "Linkerd control plane is not running"
fi

# Check Redis
echo ""
echo "Checking Redis..."
if kubectl get pods -n redis -l app=redis --no-headers 2>/dev/null | grep -q "Running"; then
    redis_pods=$(kubectl get pods -n redis -l app=redis --no-headers 2>/dev/null | grep -c "Running" || true)
    if [ "$redis_pods" -ge 6 ]; then
        check_pass "Redis cluster is running ($redis_pods pods)"
    else
        check_warn "Redis cluster has only $redis_pods pods (expected 6)"
    fi
else
    check_fail "Redis cluster is not running"
fi

# Check PostgreSQL
echo ""
echo "Checking PostgreSQL..."
if kubectl get pods -n postgresql -l app=postgresql,role=primary --no-headers 2>/dev/null | grep -q "Running"; then
    check_pass "PostgreSQL primary is running"
else
    check_fail "PostgreSQL primary is not running"
fi

replica_pods=$(kubectl get pods -n postgresql -l app=postgresql,role=replica --no-headers 2>/dev/null | grep -c "Running" || true)
if [ "$replica_pods" -ge 2 ]; then
    check_pass "PostgreSQL replicas are running ($replica_pods)"
else
    check_warn "PostgreSQL has only $replica_pods replicas (expected 2)"
fi

# Check RabbitMQ
echo ""
echo "Checking RabbitMQ..."
if kubectl get pods -n rabbitmq -l app=rabbitmq --no-headers 2>/dev/null | grep -q "Running"; then
    rabbitmq_pods=$(kubectl get pods -n rabbitmq -l app=rabbitmq --no-headers 2>/dev/null | grep -c "Running" || true)
    if [ "$rabbitmq_pods" -ge 3 ]; then
        check_pass "RabbitMQ cluster is running ($rabbitmq_pods pods)"
    else
        check_warn "RabbitMQ cluster has only $rabbitmq_pods pods (expected 3)"
    fi
else
    check_fail "RabbitMQ cluster is not running"
fi

# Check Monitoring
echo ""
echo "Checking Monitoring Stack..."
if kubectl get pods -n monitoring -l app.kubernetes.io/name=prometheus --no-headers 2>/dev/null | grep -q "Running"; then
    check_pass "Prometheus is running"
else
    check_fail "Prometheus is not running"
fi

if kubectl get pods -n monitoring -l app.kubernetes.io/name=grafana --no-headers 2>/dev/null | grep -q "Running"; then
    check_pass "Grafana is running"
else
    check_fail "Grafana is not running"
fi

# Check Vault
echo ""
echo "Checking Vault..."
if kubectl get pods -n vault -l app.kubernetes.io/name=vault --no-headers 2>/dev/null | grep -q "Running"; then
    vault_pods=$(kubectl get pods -n vault -l app.kubernetes.io/name=vault --no-headers 2>/dev/null | grep -c "Running" || true)
    if [ "$vault_pods" -ge 3 ]; then
        check_pass "Vault cluster is running ($vault_pods pods)"
    else
        check_warn "Vault cluster has only $vault_pods pods (expected 3)"
    fi
else
    check_fail "Vault is not running"
fi

# Summary
echo ""
echo "================================"
echo "Health Check Summary"
echo "================================"
echo -e "${GREEN}Passed:${NC} $check_passed"
echo -e "${RED}Failed:${NC} $check_failed"

if [ $check_failed -eq 0 ]; then
    echo ""
    echo -e "${GREEN}All systems operational!${NC}"
    exit 0
else
    echo ""
    echo -e "${RED}Some systems are not operational.${NC}"
    exit 1
fi
