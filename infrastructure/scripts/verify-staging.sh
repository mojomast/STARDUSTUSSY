#!/bin/bash
# Staging Environment Deployment Verification Script
# Version: 1.0.0
# Usage: ./verify-staging-deployment.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE="harmonyflow-staging"
CLUSTER_NAME="harmonyflow-staging"
AWS_REGION="us-west-2"
API_URL="https://api.staging.harmonyflow.io"
WS_URL="wss://ws.staging.harmonyflow.io"

# Counters
TESTS_PASSED=0
TESTS_FAILED=0

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
    ((TESTS_PASSED++))
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
    ((TESTS_FAILED++))
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Header
echo "======================================"
echo "HarmonyFlow Staging Deployment Verification"
echo "======================================"
echo ""

# Check prerequisites
log_info "Checking prerequisites..."

if ! command -v kubectl &> /dev/null; then
    log_error "kubectl not found"
    exit 1
fi

if ! command -v aws &> /dev/null; then
    log_error "aws cli not found"
    exit 1
fi

if ! command -v curl &> /dev/null; then
    log_error "curl not found"
    exit 1
fi

log_success "Prerequisites check"

# Update kubeconfig
log_info "Configuring kubectl..."
aws eks update-kubeconfig --region $AWS_REGION --name $CLUSTER_NAME &> /dev/null
if [ $? -eq 0 ]; then
    log_success "kubectl configured"
else
    log_error "Failed to configure kubectl"
fi

echo ""
echo "======================================"
echo "Infrastructure Verification"
echo "======================================"
echo ""

# Check nodes
log_info "Checking cluster nodes..."
NODE_COUNT=$(kubectl get nodes --no-headers 2>/dev/null | wc -l)
if [ "$NODE_COUNT" -ge 3 ]; then
    log_success "Cluster has $NODE_COUNT nodes"
else
    log_error "Cluster has only $NODE_COUNT nodes (expected >= 3)"
fi

# Check namespaces
log_info "Checking namespaces..."
REQUIRED_NAMESPACES=("harmonyflow-staging" "redis-staging" "postgresql-staging" "rabbitmq-staging" "linkerd" "monitoring")
for ns in "${REQUIRED_NAMESPACES[@]}"; do
    if kubectl get namespace "$ns" &> /dev/null; then
        log_success "Namespace $ns exists"
    else
        log_error "Namespace $ns not found"
    fi
done

echo ""
echo "======================================"
echo "Application Verification"
echo "======================================"
echo ""

# Check Session State Service pods
log_info "Checking Session State Service pods..."
POD_STATUS=$(kubectl get pods -n $NAMESPACE -l app=session-state-service --no-headers 2>/dev/null | awk '{print $3}')
if echo "$POD_STATUS" | grep -q "Running"; then
    RUNNING_COUNT=$(echo "$POD_STATUS" | grep -c "Running")
    log_success "Session State Service has $RUNNING_COUNT Running pods"
else
    log_error "Session State Service pods not Running"
fi

# Check service
log_info "Checking Session State Service..."
if kubectl get svc session-state-service -n $NAMESPACE &> /dev/null; then
    log_success "Session State Service exists"
else
    log_error "Session State Service not found"
fi

# Check deployment
log_info "Checking deployment status..."
if kubectl get deployment session-state-service -n $NAMESPACE &> /dev/null; then
    READY=$(kubectl get deployment session-state-service -n $NAMESPACE -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
    DESIRED=$(kubectl get deployment session-state-service -n $NAMESPACE -o jsonpath='{.spec.replicas}' 2>/dev/null)
    if [ "$READY" == "$DESIRED" ]; then
        log_success "Deployment has $READY/$DESIRED replicas ready"
    else
        log_error "Deployment has $READY/$DESIRED replicas ready"
    fi
else
    log_error "Deployment not found"
fi

# Check HPA
log_info "Checking Horizontal Pod Autoscaler..."
if kubectl get hpa session-state-service-hpa -n $NAMESPACE &> /dev/null; then
    log_success "HPA configured"
else
    log_warn "HPA not found"
fi

# Check ingress
log_info "Checking Ingress..."
if kubectl get ingress -n $NAMESPACE 2>/dev/null | grep -q "session-state"; then
    log_success "Ingress configured"
else
    log_error "Ingress not found"
fi

# Check TLS certificate
log_info "Checking TLS certificate..."
if kubectl get certificate -n $NAMESPACE 2>/dev/null | grep -q "harmonyflow-staging-tls"; then
    log_success "TLS certificate configured"
else
    log_warn "TLS certificate not found"
fi

echo ""
echo "======================================"
echo "Infrastructure Services Verification"
echo "======================================"
echo ""

# Check Redis
log_info "Checking Redis..."
if kubectl get pods -n redis-staging 2>/dev/null | grep -q "Running"; then
    REDIS_PODS=$(kubectl get pods -n redis-staging --no-headers 2>/dev/null | grep "Running" | wc -l)
    log_success "Redis cluster has $REDIS_PODS running pods"
else
    log_error "Redis cluster not healthy"
fi

# Check PostgreSQL
log_info "Checking PostgreSQL..."
if kubectl get pods -n postgresql-staging 2>/dev/null | grep -q "Running"; then
    PG_PODS=$(kubectl get pods -n postgresql-staging --no-headers 2>/dev/null | grep "Running" | wc -l)
    log_success "PostgreSQL has $PG_PODS running pods"
else
    log_error "PostgreSQL not healthy"
fi

# Check RabbitMQ
log_info "Checking RabbitMQ..."
if kubectl get pods -n rabbitmq-staging 2>/dev/null | grep -q "Running"; then
    RMQ_PODS=$(kubectl get pods -n rabbitmq-staging --no-headers 2>/dev/null | grep "Running" | wc -l)
    log_success "RabbitMQ has $RMQ_PODS running pods"
else
    log_error "RabbitMQ not healthy"
fi

# Check Linkerd
log_info "Checking Linkerd..."
if kubectl get pods -n linkerd 2>/dev/null | grep -q "Running"; then
    log_success "Linkerd control plane is running"
else
    log_error "Linkerd control plane not found"
fi

# Check monitoring
log_info "Checking Monitoring Stack..."
if kubectl get pods -n monitoring 2>/dev/null | grep -q "prometheus"; then
    log_success "Prometheus is running"
else
    log_warn "Prometheus not found"
fi

if kubectl get pods -n monitoring 2>/dev/null | grep -q "grafana"; then
    log_success "Grafana is running"
else
    log_warn "Grafana not found"
fi

echo ""
echo "======================================"
echo "Health Check Verification"
echo "======================================"
echo ""

# API health check
log_info "Checking API health endpoint..."
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health/ready" 2>/dev/null || echo "000")
if [ "$HEALTH_STATUS" == "200" ]; then
    log_success "API health endpoint responding (HTTP 200)"
else
    log_error "API health endpoint not responding (HTTP $HEALTH_STATUS)"
fi

# Liveness check
log_info "Checking liveness endpoint..."
LIVENESS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/health/live" 2>/dev/null || echo "000")
if [ "$LIVENESS_STATUS" == "200" ]; then
    log_success "Liveness endpoint responding (HTTP 200)"
else
    log_error "Liveness endpoint not responding (HTTP $LIVENESS_STATUS)"
fi

echo ""
echo "======================================"
echo "Summary"
echo "======================================"
echo ""

echo "Tests Passed: $TESTS_PASSED"
echo "Tests Failed: $TESTS_FAILED"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}======================================${NC}"
    echo -e "${GREEN}✅ STAGING DEPLOYMENT VERIFIED${NC}"
    echo -e "${GREEN}======================================${NC}"
    echo ""
    echo "Staging Environment URLs:"
    echo "  API:        $API_URL"
    echo "  WebSocket:  $WS_URL"
    echo ""
    echo "All services are operational!"
    exit 0
else
    echo -e "${RED}======================================${NC}"
    echo -e "${RED}❌ VERIFICATION FAILED${NC}"
    echo -e "${RED}======================================${NC}"
    echo ""
    echo "Please check the failed tests above."
    exit 1
fi
