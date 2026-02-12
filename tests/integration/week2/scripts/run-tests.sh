#!/bin/bash
#
# HarmonyFlow Integration Test Runner
# Week 2 - API Contract Freeze & Integration Setup
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GO_SERVICE_DIR="/home/mojo/projects/watercooler/services/session-state-service"
INTEGRATION_DIR="/home/mojo/projects/watercooler/tests/integration/week2"

# Test configuration
WS_URL="${WS_URL:-ws://localhost:8080/ws}"
API_URL="${API_URL:-http://localhost:8080}"
CONNECTION_TIMEOUT="${CONNECTION_TIMEOUT:-10000}"
MESSAGE_TIMEOUT="${MESSAGE_TIMEOUT:-5000}"

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    local missing=()
    
    if ! command_exists node; then
        missing+=("Node.js")
    fi
    
    if ! command_exists npm; then
        missing+=("npm")
    fi
    
    if ! command_exists curl; then
        missing+=("curl")
    fi
    
    if [ ${#missing[@]} -ne 0 ]; then
        log_error "Missing prerequisites: ${missing[*]}"
        exit 1
    fi
    
    log_success "All prerequisites satisfied"
}

# Check if Go service is running
check_go_service() {
    log_info "Checking Session State Service..."
    
    if curl -s "${API_URL}/health" > /dev/null 2>&1; then
        log_success "Session State Service is running"
        return 0
    else
        log_warn "Session State Service is not running"
        return 1
    fi
}

# Start Go service
start_go_service() {
    log_info "Starting Session State Service..."
    
    if [ -d "$GO_SERVICE_DIR" ]; then
        cd "$GO_SERVICE_DIR"
        
        # Check if go.mod exists
        if [ ! -f "go.mod" ]; then
            log_error "Go module not found in $GO_SERVICE_DIR"
            return 1
        fi
        
        # Start the service in the background
        go run cmd/main.go &
        GO_PID=$!
        
        # Wait for service to start
        log_info "Waiting for service to start..."
        for i in {1..30}; do
            if curl -s "${API_URL}/health" > /dev/null 2>&1; then
                log_success "Session State Service started (PID: $GO_PID)"
                return 0
            fi
            sleep 1
        done
        
        log_error "Service failed to start within 30 seconds"
        kill $GO_PID 2>/dev/null || true
        return 1
    else
        log_error "Service directory not found: $GO_SERVICE_DIR"
        return 1
    fi
}

# Check Redis
check_redis() {
    log_info "Checking Redis..."
    
    if command_exists redis-cli; then
        if redis-cli ping > /dev/null 2>&1; then
            log_success "Redis is running"
            return 0
        fi
    fi
    
    log_warn "Redis is not running"
    return 1
}

# Install test dependencies
install_dependencies() {
    log_info "Installing test dependencies..."
    
    cd "$INTEGRATION_DIR"
    
    if [ ! -d "node_modules" ]; then
        npm install
    fi
    
    log_success "Dependencies installed"
}

# Run type checking
run_typecheck() {
    log_info "Running TypeScript type checking..."
    
    cd "$INTEGRATION_DIR"
    
    if npm run typecheck; then
        log_success "Type checking passed"
        return 0
    else
        log_error "Type checking failed"
        return 1
    fi
}

# Run tests
run_tests() {
    log_info "Running integration tests..."
    log_info "WebSocket URL: $WS_URL"
    log_info "API URL: $API_URL"
    
    cd "$INTEGRATION_DIR"
    
    # Set environment variables
    export WS_URL
    export API_URL
    export CONNECTION_TIMEOUT
    export MESSAGE_TIMEOUT
    
    # Run tests
    if npm test; then
        log_success "All tests passed"
        return 0
    else
        log_error "Some tests failed"
        return 1
    fi
}

# Run tests with coverage
run_coverage() {
    log_info "Running tests with coverage..."
    
    cd "$INTEGRATION_DIR"
    
    export WS_URL
    export API_URL
    export CONNECTION_TIMEOUT
    export MESSAGE_TIMEOUT
    
    if npm run test:coverage; then
        log_success "Coverage report generated"
        
        # Display coverage summary
        if [ -f "coverage/lcov-report/index.html" ]; then
            log_info "Coverage report: coverage/lcov-report/index.html"
        fi
        
        return 0
    else
        log_error "Tests failed"
        return 1
    fi
}

# Validate contracts
validate_contracts() {
    log_info "Validating API contracts..."
    
    # Check if OpenAPI spec exists
    if [ -f "$INTEGRATION_DIR/contracts/openapi-v1.0-frozen.yaml" ]; then
        log_success "OpenAPI v1.0 spec found"
    else
        log_error "OpenAPI spec not found"
        return 1
    fi
    
    # Check if WebSocket protocol doc exists
    if [ -f "$INTEGRATION_DIR/contracts/websocket-protocol-v1.0-frozen.md" ]; then
        log_success "WebSocket protocol v1.0 spec found"
    else
        log_error "WebSocket protocol spec not found"
        return 1
    fi
    
    # Check if changelog exists
    if [ -f "$INTEGRATION_DIR/docs/contract-changelog.md" ]; then
        log_success "Contract changelog found"
    else
        log_error "Contract changelog not found"
        return 1
    fi
    
    log_success "All contracts validated"
}

# Generate test report
generate_report() {
    log_info "Generating test report..."
    
    local report_file="$INTEGRATION_DIR/test-report.md"
    local timestamp=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
    
    cat > "$report_file" << EOF
# Integration Test Report

**Generated:** $timestamp  
**Environment:** Week 2 - API Contract Freeze

## Test Configuration

- WebSocket URL: $WS_URL
- API URL: $API_URL
- Connection Timeout: ${CONNECTION_TIMEOUT}ms
- Message Timeout: ${MESSAGE_TIMEOUT}ms

## Contracts Status

| Contract | Version | Status |
|----------|---------|--------|
| OpenAPI | v1.0 | FROZEN |
| WebSocket Protocol | v1.0 | FROZEN |

## Services Status

EOF

    if check_go_service >> /dev/null 2>&1; then
        echo "- Session State Service: RUNNING" >> "$report_file"
    else
        echo "- Session State Service: NOT RUNNING" >> "$report_file"
    fi
    
    if check_redis >> /dev/null 2>&1; then
        echo "- Redis: RUNNING" >> "$report_file"
    else
        echo "- Redis: NOT RUNNING" >> "$report_file"
    fi
    
    echo "" >> "$report_file"
    echo "## Test Results" >> "$report_file"
    echo "" >> "$report_file"
    echo "Run 'npm test' to see detailed results." >> "$report_file"
    
    log_info "Test report generated: $report_file"
}

# Main execution
main() {
    echo "========================================"
    echo "HarmonyFlow Integration Test Runner"
    echo "Week 2 - API Contract Freeze"
    echo "========================================"
    echo ""
    
    # Parse arguments
    local run_coverage=false
    local skip_deps=false
    local validate_only=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --coverage)
                run_coverage=true
                shift
                ;;
            --skip-deps)
                skip_deps=true
                shift
                ;;
            --validate-only)
                validate_only=true
                shift
                ;;
            --help|-h)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --coverage        Run tests with coverage report"
                echo "  --skip-deps       Skip dependency installation"
                echo "  --validate-only   Only validate contracts, don't run tests"
                echo "  --help            Show this help message"
                echo ""
                echo "Environment Variables:"
                echo "  WS_URL            WebSocket URL (default: ws://localhost:8080/ws)"
                echo "  API_URL           API URL (default: http://localhost:8080)"
                echo "  CONNECTION_TIMEOUT Connection timeout in ms (default: 10000)"
                echo "  MESSAGE_TIMEOUT   Message timeout in ms (default: 5000)"
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    # Validate contracts
    validate_contracts
    
    if [ "$validate_only" = true ]; then
        log_success "Contract validation complete"
        exit 0
    fi
    
    # Check prerequisites
    check_prerequisites
    
    # Check services
    if ! check_go_service; then
        log_warn "Attempting to start Go service..."
        if ! start_go_service; then
            log_error "Failed to start Go service. Please start it manually."
            log_info "Run: cd $GO_SERVICE_DIR && go run cmd/main.go"
            exit 1
        fi
    fi
    
    if ! check_redis; then
        log_warn "Redis is not running. Some tests may fail."
        log_info "Run: docker run -d -p 6379:6379 redis:7-alpine"
    fi
    
    # Install dependencies
    if [ "$skip_deps" = false ]; then
        install_dependencies
    fi
    
    # Run type checking
    if ! run_typecheck; then
        exit 1
    fi
    
    # Run tests
    if [ "$run_coverage" = true ]; then
        if ! run_coverage; then
            exit 1
        fi
    else
        if ! run_tests; then
            exit 1
        fi
    fi
    
    # Generate report
    generate_report
    
    echo ""
    echo "========================================"
    log_success "Integration tests completed successfully!"
    echo "========================================"
}

# Run main function
main "$@"
