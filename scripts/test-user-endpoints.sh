#!/bin/bash

# Test script for user endpoints with authentication

COOKIE_JAR="/tmp/speakonimage-cookies.txt"
BASE_URL="http://localhost:3000"
TEST_EMAIL="test@example.com"
TEST_PASSWORD="testpassword123"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================"
echo "Testing User Endpoints (Authenticated)"
echo "========================================"
echo ""

# Clean up old cookies
rm -f "$COOKIE_JAR"

# Step 1: Get CSRF token
echo -e "${YELLOW}Step 1: Getting CSRF token...${NC}"
CSRF_RESPONSE=$(curl -s --noproxy localhost -c "$COOKIE_JAR" -b "$COOKIE_JAR" "$BASE_URL/api/auth/csrf")
CSRF_TOKEN=$(echo "$CSRF_RESPONSE" | grep -o '"csrfToken":"[^"]*"' | cut -d'"' -f4)

if [ -z "$CSRF_TOKEN" ]; then
    echo -e "${RED}Failed to get CSRF token${NC}"
    echo "Response: $CSRF_RESPONSE"
    exit 1
fi
echo -e "${GREEN}Got CSRF token: ${CSRF_TOKEN:0:20}...${NC}"
echo ""

# Step 2: Register a test user (or login if exists)
echo -e "${YELLOW}Step 2: Registering test user...${NC}"
REGISTER_RESPONSE=$(curl -s --noproxy localhost -X POST \
    -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "csrfToken=$CSRF_TOKEN&email=$TEST_EMAIL&password=$TEST_PASSWORD&action=register" \
    "$BASE_URL/api/auth/callback/credentials")

# Check if we got a redirect (successful auth) or error
REGISTER_STATUS=$(echo "$REGISTER_RESPONSE" | head -c 100)
echo "Register response (first 100 chars): $REGISTER_STATUS"
echo ""

# Step 3: Try login (in case user already exists)
echo -e "${YELLOW}Step 3: Logging in...${NC}"
LOGIN_RESPONSE=$(curl -s --noproxy localhost -X POST \
    -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "csrfToken=$CSRF_TOKEN&email=$TEST_EMAIL&password=$TEST_PASSWORD&action=login" \
    -L \
    "$BASE_URL/api/auth/callback/credentials")

echo "Login completed"
echo ""

# Step 4: Check session
echo -e "${YELLOW}Step 4: Checking session...${NC}"
SESSION_RESPONSE=$(curl -s --noproxy localhost -b "$COOKIE_JAR" "$BASE_URL/api/auth/session")
echo "Session: $SESSION_RESPONSE"
echo ""

# Step 5: Test user endpoints
echo "========================================"
echo -e "${YELLOW}Testing User Endpoints${NC}"
echo "========================================"
echo ""

# Test /api/user/stats
echo -e "${YELLOW}Testing GET /api/user/stats...${NC}"
STATS_RESPONSE=$(curl -s --noproxy localhost -b "$COOKIE_JAR" "$BASE_URL/api/user/stats")
STATS_STATUS=$(curl -s --noproxy localhost -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE_URL/api/user/stats")
echo "Status: $STATS_STATUS"
echo "Response: $STATS_RESPONSE"
echo ""

# Test /api/user/topics
echo -e "${YELLOW}Testing GET /api/user/topics...${NC}"
TOPICS_RESPONSE=$(curl -s --noproxy localhost -b "$COOKIE_JAR" "$BASE_URL/api/user/topics")
TOPICS_STATUS=$(curl -s --noproxy localhost -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE_URL/api/user/topics")
echo "Status: $TOPICS_STATUS"
echo "Response: $TOPICS_RESPONSE"
echo ""

# Test /api/user/submissions
echo -e "${YELLOW}Testing GET /api/user/submissions...${NC}"
SUBS_RESPONSE=$(curl -s --noproxy localhost -b "$COOKIE_JAR" "$BASE_URL/api/user/submissions")
SUBS_STATUS=$(curl -s --noproxy localhost -o /dev/null -w "%{http_code}" -b "$COOKIE_JAR" "$BASE_URL/api/user/submissions")
echo "Status: $SUBS_STATUS"
echo "Response: $SUBS_RESPONSE"
echo ""

# Summary
echo "========================================"
echo "Summary"
echo "========================================"
if [ "$STATS_STATUS" = "200" ] && [ "$TOPICS_STATUS" = "200" ] && [ "$SUBS_STATUS" = "200" ]; then
    echo -e "${GREEN}All authenticated endpoints working correctly!${NC}"
else
    echo -e "${RED}Some endpoints may have issues${NC}"
    echo "Stats: $STATS_STATUS, Topics: $TOPICS_STATUS, Submissions: $SUBS_STATUS"
fi

# Clean up
rm -f "$COOKIE_JAR"
