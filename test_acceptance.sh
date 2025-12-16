#!/bin/bash

# Acceptance Tests for WebSocket + Batch ID + ThirdParty Integration
# Run these tests after starting the backend

echo "=== DOCAI BACKEND ACCEPTANCE TESTS ==="
echo ""

# Test 1: WebSocket Connection
echo "1. Testing WebSocket Connection..."
echo "Manual test:"
echo "   wscat -c ws://localhost:8000/ws/projects/<PROJECT_ID>"
echo "   Expected: Connection success, server logs 'WS connected'"
echo ""

# Test 2: Multi-file Upload with Batch ID
echo "2. Testing Multi-file Upload with Batch ID..."
PROJECT_ID="11111111-2222-3333-4444-555555555555"
BATCH_ID="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

echo "Creating test files..."
echo "Test file A" > test_a.txt
echo "Test file B" > test_b.txt

echo ""
echo "Running multi-file upload test:"
echo "curl -X POST \"http://localhost:8000/api/projects/$PROJECT_ID/files\" \\"
echo "  -F \"file=@test_a.txt\" \\"
echo "  -F \"file=@test_b.txt\" \\"
echo "  -F \"batch_id=$BATCH_ID\""

curl -X POST "http://localhost:8000/api/projects/$PROJECT_ID/files" \
  -F "file=@test_a.txt" \
  -F "file=@test_b.txt" \
  -F "batch_id=$BATCH_ID"

echo ""
echo "Expected: Both files should have batch_id=$BATCH_ID in database"
echo "Expected: Server logs show 'enqueuing third-party notification'"
echo ""

# Test 3: Callback Test
echo "3. Testing Processing Callback..."
FILE_ID="ffffffff-aaaa-bbbb-cccc-dddddddddddd"

echo "Simulating third-party callback:"
echo "curl -X POST http://localhost:8000/api/callbacks/file-processing \\"
echo "  -H \"Content-Type: application/json\" \\"
echo "  -d '{"
echo "    \"batch_id\":\"$BATCH_ID\","
echo "    \"file_id\":\"$FILE_ID\","
echo "    \"status\":\"COMPLETED\","
echo "    \"extraction_json\": { \"test\":\"data\" }"
echo "  }'"

curl -X POST http://localhost:8000/api/callbacks/file-processing \
  -H "Content-Type: application/json" \
  -d "{
    \"batch_id\":\"$BATCH_ID\",
    \"file_id\":\"$FILE_ID\",
    \"status\":\"COMPLETED\",
    \"extraction_json\": { \"test\":\"data\" }
  }"

echo ""
echo "Expected: Database updated, WebSocket broadcasts file_processed event"
echo ""

# Clean up
echo "Cleaning up test files..."
rm -f test_a.txt test_b.txt

echo "=== TESTS COMPLETE ==="
echo "Check server logs for:"
echo "- 'WS connected' messages"  
echo "- 'enqueuing third-party notification' messages"
echo "- 'Broadcasted file_processed event' messages"
echo "- No 'upload missing batch_id' warnings for test uploads"
