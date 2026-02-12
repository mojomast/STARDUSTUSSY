#!/bin/bash

# E2E Critical Tests Runner
# Usage: ./run-e2e-critical.sh [options]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=======================================${NC}"
echo -e "${BLUE}  HarmonyFlow E2E Critical Tests${NC}"
echo -e "${BLUE}=======================================${NC}"
echo ""

# Default values
BROWSER="chromium"
HEADED=""
GREP=""
RETRIES=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --browser)
      BROWSER="$2"
      shift 2
      ;;
    --headed)
      HEADED="--headed"
      shift
      ;;
    --grep)
      GREP="--grep=$2"
      shift 2
      ;;
    --retries)
      RETRIES="--retries=$2"
      shift 2
      ;;
    --help)
      echo "Usage: ./run-e2e-critical.sh [options]"
      echo ""
      echo "Options:"
      echo "  --browser <name>    Browser to use (chromium, firefox, webkit)"
      echo "  --headed            Run in headed mode (show browser)"
      echo "  --grep <pattern>    Run tests matching pattern"
      echo "  --retries <n>       Number of retries for failed tests"
      echo "  --help              Show this help message"
      echo ""
      echo "Examples:"
      echo "  ./run-e2e-critical.sh"
      echo "  ./run-e2e-critical.sh --headed"
      echo "  ./run-e2e-critical.sh --browser firefox"
      echo "  ./run-e2e-critical.sh --grep 'authentication'"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# Check if required services are running
echo -e "${YELLOW}Checking prerequisites...${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
  echo -e "${RED}Error: Node.js is not installed${NC}"
  exit 1
fi

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
  echo -e "${RED}Error: Must run from tests/ directory${NC}"
  exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo -e "${YELLOW}Installing dependencies...${NC}"
  npm ci
fi

# Install Playwright browsers if needed
if [ ! -d "$HOME/.cache/ms-playwright" ]; then
  echo -e "${YELLOW}Installing Playwright browsers...${NC}"
  npx playwright install $BROWSER
fi

echo -e "${GREEN}✓ Prerequisites met${NC}"
echo ""

# Set environment variables
export E2E_BASE_URL=${E2E_BASE_URL:-"http://localhost:3000"}
export API_BASE_URL=${API_BASE_URL:-"http://localhost:8080"}
export POSTGRES_HOST=${POSTGRES_HOST:-"localhost"}
export POSTGRES_PORT=${POSTGRES_PORT:-"5432"}

# Count tests before running
echo -e "${BLUE}Counting tests...${NC}"
TEST_COUNT=$(npx playwright test e2e/auth/ e2e/journeys/ --list --reporter=line 2>/dev/null | grep -oP '\d+(?= test)' | tail -1 || echo "0")
echo -e "${GREEN}Found $TEST_COUNT critical tests${NC}"
echo ""

# Run tests
echo -e "${BLUE}Running E2E Critical Tests...${NC}"
echo "Browser: $BROWSER"
echo "Headed: $([ -n "$HEADED" ] && echo "yes" || echo "no")"
echo ""

START_TIME=$(date +%s)

npx playwright test e2e/auth/ e2e/journeys/ \
  --project=$BROWSER \
  --grep-invert="cross-browser|mobile|performance" \
  $HEADED \
  $GREP \
  $RETRIES \
  --reporter=html,json,list \
  --output=reports/ || TEST_EXIT_CODE=$?

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# Generate summary
echo ""
echo -e "${BLUE}=======================================${NC}"
echo -e "${BLUE}  Test Results Summary${NC}"
echo -e "${BLUE}=======================================${NC}"
echo ""

if [ -f "reports/playwright-results.json" ]; then
  TOTAL=$(jq '.stats.total' reports/playwright-results.json)
  PASSED=$(jq '.stats.expected' reports/playwright-results.json)
  FAILED=$(jq '.stats.unexpected' reports/playwright-results.json)
  SKIPPED=$(jq '.stats.skipped' reports/playwright-results.json)
  
  PASS_RATE=$((PASSED * 100 / TOTAL))
  
  echo -e "Total Tests:    ${BLUE}$TOTAL${NC}"
  echo -e "Passed:         ${GREEN}$PASSED${NC}"
  echo -e "Failed:         ${RED}$FAILED${NC}"
  echo -e "Skipped:        ${YELLOW}$SKIPPED${NC}"
  echo -e "Pass Rate:      ${BLUE}$PASS_RATE%${NC}"
  echo -e "Duration:       ${BLUE}${DURATION}s${NC}"
  echo ""
  
  if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
    EXIT_CODE=0
  else
    echo -e "${RED}❌ $FAILED test(s) failed${NC}"
    EXIT_CODE=1
  fi
  
  echo ""
  echo -e "${BLUE}Reports:${NC}"
  echo "  HTML: reports/playwright-report/index.html"
  echo "  JSON: reports/playwright-results.json"
  echo "  JUnit: reports/playwright-junit.xml"
else
  echo -e "${RED}❌ Test results not found${NC}"
  EXIT_CODE=1
fi

exit ${EXIT_CODE:-${TEST_EXIT_CODE:-0}}
