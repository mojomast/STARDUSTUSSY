#!/bin/bash

# HarmonyFlow SyncBridge - Week 3 Multi-Device Test Runner
# Usage: ./scripts/run-tests.sh [options]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR/.."
REPORTS_DIR="$PROJECT_ROOT/reports"

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

show_help() {
    cat << EOF
HarmonyFlow SyncBridge - Week 3 Multi-Device Test Runner

Usage: $(basename "$0") [OPTIONS]

Options:
    -h, --help              Show this help message
    -s, --scenario N        Run specific test scenario (1-5)
    -b, --browser BROWSER   Run on specific browser (chromium, firefox, webkit)
    -m, --mobile            Run with mobile emulation
    -a, --all               Run all tests (default)
    -p, --performance       Run performance benchmarks only
    -r, --report            Generate test report after run
    -d, --debug             Run in debug mode
    --headed                Run in headed mode (show browser)
    --slowmo MS             Slow motion delay in milliseconds

Scenarios:
    1   Mobile to Web Handoff
    2   Simultaneous Multi-Device Usage
    3   Network Interruption Recovery
    4   Session Expiration Edge Cases
    5   Device Disconnection

Examples:
    $(basename "$0")                          # Run all tests
    $(basename "$0") -s 1                     # Run Test Case 1 only
    $(basename "$0") -s 2 -b firefox          # Run Test Case 2 on Firefox
    $(basename "$0") -p                       # Run performance benchmarks
    $(basename "$0") -d --headed              # Debug in headed mode

EOF
}

# Parse arguments
SCENARIO=""
BROWSER=""
MOBILE=false
ALL=true
PERFORMANCE=false
GENERATE_REPORT=false
DEBUG=false
HEADED=false
SLOWMO=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -s|--scenario)
            SCENARIO="$2"
            ALL=false
            shift 2
            ;;
        -b|--browser)
            BROWSER="$2"
            shift 2
            ;;
        -m|--mobile)
            MOBILE=true
            ALL=false
            shift
            ;;
        -a|--all)
            ALL=true
            shift
            ;;
        -p|--performance)
            PERFORMANCE=true
            ALL=false
            shift
            ;;
        -r|--report)
            GENERATE_REPORT=true
            shift
            ;;
        -d|--debug)
            DEBUG=true
            shift
            ;;
        --headed)
            HEADED=true
            shift
            ;;
        --slowmo)
            SLOWMO="$2"
            shift 2
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Main execution
cd "$PROJECT_ROOT"

log_info "HarmonyFlow SyncBridge - Week 3 Multi-Device Tests"
log_info "Working directory: $(pwd)"

# Create reports directory
mkdir -p "$REPORTS_DIR"

# Check dependencies
if ! command -v npx &> /dev/null; then
    log_error "npx not found. Please install Node.js and npm."
    exit 1
fi

# Install Playwright browsers if needed
if ! npx playwright install --with-deps chromium 2>/dev/null | grep -q "already installed"; then
    log_info "Installing Playwright browsers..."
    npx playwright install
fi

# Build test command
TEST_CMD="npx playwright test"
TEST_ARGS=()

# Add scenario filter
if [ -n "$SCENARIO" ]; then
    case $SCENARIO in
        1)
            TEST_ARGS+=("e2e/mobile-to-web-handoff.spec.ts")
            log_info "Running Test Case 1: Mobile to Web Handoff"
            ;;
        2)
            TEST_ARGS+=("e2e/simultaneous-multi-device.spec.ts")
            log_info "Running Test Case 2: Simultaneous Multi-Device Usage"
            ;;
        3)
            TEST_ARGS+=("e2e/network-interruption.spec.ts")
            log_info "Running Test Case 3: Network Interruption Recovery"
            ;;
        4)
            TEST_ARGS+=("e2e/session-expiration.spec.ts")
            log_info "Running Test Case 4: Session Expiration Edge Cases"
            ;;
        5)
            TEST_ARGS+=("e2e/device-disconnection.spec.ts")
            log_info "Running Test Case 5: Device Disconnection"
            ;;
        *)
            log_error "Invalid scenario: $SCENARIO (must be 1-5)"
            exit 1
            ;;
    esac
else
    if [ "$ALL" = true ]; then
        TEST_ARGS+=("e2e/")
        log_info "Running all test scenarios"
    fi
fi

# Add browser filter
if [ -n "$BROWSER" ]; then
    TEST_ARGS+=("--project=$BROWSER")
    log_info "Running on browser: $BROWSER"
fi

# Add mobile emulation
if [ "$MOBILE" = true ]; then
    TEST_ARGS+=("--project=Mobile Chrome")
    log_info "Running with mobile emulation"
fi

# Add debug options
if [ "$DEBUG" = true ]; then
    TEST_ARGS+=("--debug")
    log_info "Debug mode enabled"
fi

if [ "$HEADED" = true ]; then
    TEST_ARGS+=("--headed")
    log_info "Headed mode enabled"
fi

if [ -n "$SLOWMO" ]; then
    TEST_ARGS+=("--slowmo=$SLOWMO")
    log_info "Slow motion: ${SLOWMO}ms"
fi

# Run performance benchmarks
if [ "$PERFORMANCE" = true ]; then
    log_info "Running performance benchmarks..."
    
    # Handoff latency benchmark
    log_info "Benchmark: Handoff Latency"
    node benchmarks/handoff-latency.js | tee "$REPORTS_DIR/handoff-latency.log"
    
    # Concurrent devices benchmark
    log_info "Benchmark: Concurrent Devices"
    node benchmarks/concurrent-devices.js | tee "$REPORTS_DIR/concurrent-devices.log"
    
    # Memory usage benchmark
    log_info "Benchmark: Memory Usage"
    node benchmarks/memory-usage.js | tee "$REPORTS_DIR/memory-usage.log"
    
    log_success "Performance benchmarks complete"
    
    if [ "$ALL" = false ]; then
        exit 0
    fi
fi

# Execute tests
log_info "Starting test execution..."
log_info "Command: $TEST_CMD ${TEST_ARGS[*]}"

set +e
$TEST_CMD "${TEST_ARGS[@]}"
TEST_EXIT_CODE=$?
set -e

# Generate report
if [ "$GENERATE_REPORT" = true ] || [ $TEST_EXIT_CODE -eq 0 ]; then
    log_info "Generating test report..."
    ./scripts/generate-report.sh
fi

# Summary
if [ $TEST_EXIT_CODE -eq 0 ]; then
    log_success "All tests passed!"
    echo
    log_info "View HTML report:"
    echo "  npx playwright show-report $REPORTS_DIR/playwright-report"
else
    log_error "Tests failed with exit code: $TEST_EXIT_CODE"
    echo
    log_info "View HTML report for details:"
    echo "  npx playwright show-report $REPORTS_DIR/playwright-report"
fi

exit $TEST_EXIT_CODE
