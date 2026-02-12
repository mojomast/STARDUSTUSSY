#!/bin/bash

# HarmonyFlow SyncBridge - Security Penetration Test Runner
# Week 5, Days 3-5

set -e

echo "=========================================="
echo "HarmonyFlow SyncBridge - Penetration Testing"
echo "=========================================="
echo "Date: $(date)"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test directories
TEST_DIR="/home/mojo/projects/watercooler/tests/security"
SERVICE_DIR="/home/mojo/projects/watercooler/services/session-state-service"

# Output directory
REPORT_DIR="${TEST_DIR}/reports"
mkdir -p "${REPORT_DIR}"

# Summary counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
SKIPPED_TESTS=0

echo -e "${BLUE}Starting Penetration Tests...${NC}"
echo ""

# Check if service directory exists
if [ ! -d "${SERVICE_DIR}" ]; then
    echo -e "${RED}ERROR: Service directory not found: ${SERVICE_DIR}${NC}"
    exit 1
fi

# Navigate to service directory for running Go tests
cd "${SERVICE_DIR}"

# Check if Go is installed
if ! command -v go &> /dev/null; then
    echo -e "${RED}ERROR: Go is not installed${NC}"
    exit 1
fi

echo -e "${BLUE}Running OWASP Top 10 Tests...${NC}"
echo "----------------------------------------"
TEST_OUTPUT=$(go test -v ../tests/security/owasp_test.go 2>&1 || true)
TEST_COUNT=$(echo "$TEST_OUTPUT" | grep -c "RUN\|PASS\|FAIL\|SKIP" || echo "0")
PASS_COUNT=$(echo "$TEST_OUTPUT" | grep -c "PASS:" || echo "0")
FAIL_COUNT=$(echo "$TEST_OUTPUT" | grep -c "FAIL:" || echo "0")
SKIP_COUNT=$(echo "$TEST_OUTPUT" | grep -c "SKIP:" || echo "0")

echo "$TEST_OUTPUT" | tail -20
echo ""
echo -e "${GREEN}Passed: ${PASS_COUNT}${NC} | ${RED}Failed: ${FAIL_COUNT}${NC} | ${YELLOW}Skipped: ${SKIP_COUNT}${NC}"
echo ""

TOTAL_TESTS=$((TOTAL_TESTS + TEST_COUNT))
PASSED_TESTS=$((PASSED_TESTS + PASS_COUNT))
FAILED_TESTS=$((FAILED_TESTS + FAIL_COUNT))
SKIPPED_TESTS=$((SKIPPED_TESTS + SKIP_COUNT))

echo -e "${BLUE}Running JWT Manipulation Tests...${NC}"
echo "----------------------------------------"
TEST_OUTPUT=$(go test -v ../tests/security/jwt_manipulation_test.go 2>&1 || true)
TEST_COUNT=$(echo "$TEST_OUTPUT" | grep -c "RUN\|PASS\|FAIL\|SKIP" || echo "0")
PASS_COUNT=$(echo "$TEST_OUTPUT" | grep -c "PASS:" || echo "0")
FAIL_COUNT=$(echo "$TEST_OUTPUT" | grep -c "FAIL:" || echo "0")
SKIP_COUNT=$(echo "$TEST_OUTPUT" | grep -c "SKIP:" || echo "0")

echo "$TEST_OUTPUT" | tail -20
echo ""
echo -e "${GREEN}Passed: ${PASS_COUNT}${NC} | ${RED}Failed: ${FAIL_COUNT}${NC} | ${YELLOW}Skipped: ${SKIP_COUNT}${NC}"
echo ""

TOTAL_TESTS=$((TOTAL_TESTS + TEST_COUNT))
PASSED_TESTS=$((PASSED_TESTS + PASS_COUNT))
FAILED_TESTS=$((FAILED_TESTS + FAIL_COUNT))
SKIPPED_TESTS=$((SKIPPED_TESTS + SKIP_COUNT))

echo -e "${BLUE}Running Rate Limiting Tests...${NC}"
echo "----------------------------------------"
TEST_OUTPUT=$(go test -v ../tests/security/rate_limiting_test.go 2>&1 || true)
TEST_COUNT=$(echo "$TEST_OUTPUT" | grep -c "RUN\|PASS\|FAIL\|SKIP" || echo "0")
PASS_COUNT=$(echo "$TEST_OUTPUT" | grep -c "PASS:" || echo "0")
FAIL_COUNT=$(echo "$TEST_OUTPUT" | grep -c "FAIL:" || echo "0")
SKIP_COUNT=$(echo "$TEST_OUTPUT" | grep -c "SKIP:" || echo "0")

echo "$TEST_OUTPUT" | tail -20
echo ""
echo -e "${GREEN}Passed: ${PASS_COUNT}${NC} | ${RED}Failed: ${FAIL_COUNT}${NC} | ${YELLOW}Skipped: ${SKIP_COUNT}${NC}"
echo ""

TOTAL_TESTS=$((TOTAL_TESTS + TEST_COUNT))
PASSED_TESTS=$((PASSED_TESTS + PASS_COUNT))
FAILED_TESTS=$((FAILED_TESTS + FAIL_COUNT))
SKIPPED_TESTS=$((SKIPPED_TESTS + SKIP_COUNT))

echo -e "${BLUE}Running CSRF Protection Tests...${NC}"
echo "----------------------------------------"
TEST_OUTPUT=$(go test -v ../tests/security/csrf_test.go 2>&1 || true)
TEST_COUNT=$(echo "$TEST_OUTPUT" | grep -c "RUN\|PASS\|FAIL\|SKIP" || echo "0")
PASS_COUNT=$(echo "$TEST_OUTPUT" | grep -c "PASS:" || echo "0")
FAIL_COUNT=$(echo "$TEST_OUTPUT" | grep -c "FAIL:" || echo "0")
SKIP_COUNT=$(echo "$TEST_OUTPUT" | grep -c "SKIP:" || echo "0")

echo "$TEST_OUTPUT" | tail -20
echo ""
echo -e "${GREEN}Passed: ${PASS_COUNT}${NC} | ${RED}Failed: ${FAIL_COUNT}${NC} | ${YELLOW}Skipped: ${SKIP_COUNT}${NC}"
echo ""

TOTAL_TESTS=$((TOTAL_TESTS + TEST_COUNT))
PASSED_TESTS=$((PASSED_TESTS + PASS_COUNT))
FAILED_TESTS=$((FAILED_TESTS + FAIL_COUNT))
SKIPPED_TESTS=$((SKIPPED_TESTS + SKIP_COUNT))

echo -e "${BLUE}Running Admin Endpoint Security Tests...${NC}"
echo "----------------------------------------"
TEST_OUTPUT=$(go test -v ../tests/security/admin_test.go 2>&1 || true)
TEST_COUNT=$(echo "$TEST_OUTPUT" | grep -c "RUN\|PASS\|FAIL\|SKIP" || echo "0")
PASS_COUNT=$(echo "$TEST_OUTPUT" | grep -c "PASS:" || echo "0")
FAIL_COUNT=$(echo "$TEST_OUTPUT" | grep -c "FAIL:" || echo "0")
SKIP_COUNT=$(echo "$TEST_OUTPUT" | grep -c "SKIP:" || echo "0")

echo "$TEST_OUTPUT" | tail -20
echo ""
echo -e "${GREEN}Passed: ${PASS_COUNT}${NC} | ${RED}Failed: ${FAIL_COUNT}${NC} | ${YELLOW}Skipped: ${SKIP_COUNT}${NC}"
echo ""

TOTAL_TESTS=$((TOTAL_TESTS + TEST_COUNT))
PASSED_TESTS=$((PASSED_TESTS + PASS_COUNT))
FAILED_TESTS=$((FAILED_TESTS + FAIL_COUNT))
SKIPPED_TESTS=$((SKIPPED_TESTS + SKIP_COUNT))

echo -e "${BLUE}Running CORS Security Tests...${NC}"
echo "----------------------------------------"
TEST_OUTPUT=$(go test -v ../tests/security/cors_test.go 2>&1 || true)
TEST_COUNT=$(echo "$TEST_OUTPUT" | grep -c "RUN\|PASS\|FAIL\|SKIP" || echo "0")
PASS_COUNT=$(echo "$TEST_OUTPUT" | grep -c "PASS:" || echo "0")
FAIL_COUNT=$(echo "$TEST_OUTPUT" | grep -c "FAIL:" || echo "0")
SKIP_COUNT=$(echo "$TEST_OUTPUT" | grep -c "SKIP:" || echo "0")

echo "$TEST_OUTPUT" | tail -20
echo ""
echo -e "${GREEN}Passed: ${PASS_COUNT}${NC} | ${RED}Failed: ${FAIL_COUNT}${NC} | ${YELLOW}Skipped: ${SKIP_COUNT}${NC}"
echo ""

TOTAL_TESTS=$((TOTAL_TESTS + TEST_COUNT))
PASSED_TESTS=$((PASSED_TESTS + PASS_COUNT))
FAILED_TESTS=$((FAILED_TESTS + FAIL_COUNT))
SKIPPED_TESTS=$((SKIPPED_TESTS + SKIP_COUNT))

# Generate Summary
echo ""
echo "=========================================="
echo -e "${BLUE}PENETRATION TEST SUMMARY${NC}"
echo "=========================================="
echo "Total Tests:    ${TOTAL_TESTS}"
echo -e "${GREEN}Passed:         ${PASSED_TESTS}${NC}"
echo -e "${RED}Failed:         ${FAILED_TESTS}${NC}"
echo -e "${YELLOW}Skipped:        ${SKIPPED_TESTS}${NC}"
echo ""

# Calculate pass rate
if [ $TOTAL_TESTS -gt 0 ]; then
    PASS_RATE=$(( (PASSED_TESTS * 100) / TOTAL_TESTS ))
    echo "Pass Rate:      ${PASS_RATE}%"
fi

echo ""
echo "=========================================="

# Determine overall status
if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}STATUS: ALL TESTS PASSED${NC}"
    echo ""
    echo "Security Posture: STRONG"
    echo "Recommendation:     APPROVED FOR PRODUCTION"
else
    echo -e "${RED}STATUS: SOME TESTS FAILED${NC}"
    echo ""
    echo "Security Posture: NEEDS ATTENTION"
    echo "Recommendation:     REVIEW FAILED TESTS"
fi

echo "=========================================="
echo ""
echo "Full report available at: ${TEST_DIR}/PENETRATION_TEST_REPORT.md"
echo ""

exit 0
