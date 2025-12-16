# DOCAI WebSocket + Batch ID + ThirdParty Integration - Acceptance Tests

## Prerequisites
1. Start backend: `uvicorn python_backend.DocAI.app.main:app --reload`
2. Create a test project in the frontend or get an existing project ID

## Test 1: WebSocket Connection

### Manual WebSocket Test with wscat:
```bash
# Install wscat if needed
npm install -g wscat

# Connect to WebSocket (replace PROJECT_ID)
wscat -c ws://localhost:8000/ws/projects/11111111-2222-3333-4444-555555555555
```

### Expected Results:
- Connection succeeds immediately
- Server logs show: `WS connected: project=11111111-2222-3333-4444-555555555555, client=127.0.0.1`
- No 1006 disconnect errors

### Browser WebSocket Test:
```javascript
// In browser console
const ws = new WebSocket('ws://localhost:8000/ws/projects/11111111-2222-3333-4444-555555555555');
ws.onopen = () => console.log('WebSocket Connected!');
ws.onerror = e => console.log('WebSocket Error:', e);
ws.onmessage = m => console.log('WebSocket Message:', m.data);
ws.onclose = e => console.log('WebSocket Closed:', e.code, e.reason);
```

## Test 2: Multi-file Upload with Batch ID

### Create test files:
```bash
echo "Test file A content" > test_a.pdf
echo "Test file B content" > test_b.pdf
```

### Upload with batch ID:
```bash
curl -X POST "http://localhost:8000/api/projects/11111111-2222-3333-4444-555555555555/files" \
  -F "file=@test_a.pdf" \
  -F "file=@test_b.pdf" \
  -F "batch_id=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
```

### Expected Results:
- Both uploads succeed (HTTP 201)
- Server logs show: `Using effective_batch_id: aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`
- Server logs show: `enqueuing third-party notification for batch_id=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee`
- Database: Both file records have `batch_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'`
- No warnings: `upload missing batch_id`

### Verify Database:
```sql
SELECT id, name, batch_id FROM files WHERE batch_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
```

## Test 3: Callback Processing & WebSocket Broadcast

### Simulate third-party callback:
```bash
curl -X POST http://localhost:8000/api/callbacks/file-processing \
  -H "Content-Type: application/json" \
  -d '{
    "batch_id":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    "file_id":"<ACTUAL_FILE_ID_FROM_UPLOAD>",
    "status":"COMPLETED",
    "extraction_json": { "extracted_text": "Sample extracted content", "confidence": 0.95 }
  }'
```

### Expected Results:
- Callback succeeds (HTTP 200)
- Database: `files.processing_status` updated to `completed`
- Database: New `file_extractions` record created
- Server logs: `Processed callback for file <FILE_ID>, status: COMPLETED`
- Server logs: `Broadcasted file_processed event for file <FILE_ID>`
- WebSocket clients receive message:
  ```json
  {
    "event": "file_processed",
    "file_id": "<FILE_ID>",
    "batch_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    "status": "completed",
    "has_extraction": true
  }
  ```

## Test 4: Chunked Upload with Batch ID

### Test chunked upload completion:
1. Use frontend to upload a large file (>10MB) 
2. Check network tab for batch_id in chunked complete request
3. Verify server logs show third-party notification for chunked upload

### Expected in network request:
```json
{
  "fileId": "<UPLOAD_ID>",
  "projectId": "11111111-2222-3333-4444-555555555555",
  "batch_id": "<GENERATED_BATCH_ID>",
  ...
}
```

## Test 5: Error Scenarios

### Missing batch_id test:
```bash
curl -X POST "http://localhost:8000/api/projects/11111111-2222-3333-4444-555555555555/files" \
  -F "file=@test_a.pdf"
```

### Expected Results:
- Upload still succeeds
- Server logs WARNING: `upload missing batch_id for file test_a.pdf`
- No third-party notification triggered

## Debugging WebSocket 1006 Issues

If WebSocket connections fail with 1006:

1. **Check server logs** for exceptions during WebSocket accept()
2. **Verify path**: Ensure frontend uses exact path `/ws/projects/{projectId}`
3. **Test manually**: Use wscat to isolate frontend vs backend issues
4. **Check CORS**: Ensure WebSocket connections allowed
5. **Verify uvicorn**: Make sure running with `uvicorn` (not gunicorn without proper worker)

### Debug commands:
```bash
# Check if WebSocket endpoint exists
curl -I http://localhost:8000/ws/projects/test

# Check server startup logs for router inclusion
grep -i websocket server_logs.txt

# Test with verbose wscat
wscat -c ws://localhost:8000/ws/projects/test-id --headers
```

## Success Criteria

✅ **WebSocket**: Reliable connection without 1006 errors  
✅ **Batch ID**: All uploads include batch_id, stored in database  
✅ **Third-party**: Background notifications triggered after uploads  
✅ **Callbacks**: Processing status updates via WebSocket  
✅ **Frontend**: Status indicators show in file tree  
✅ **Logging**: Clear debug logs for troubleshooting  

## Troubleshooting

### Common Issues:
1. **WebSocket 1006**: Check server exception logs, verify async WebSocket handler
2. **Null batch_id**: Check FormData field name (use 'batch_id', not 'import_batch_id')
3. **No third-party calls**: Verify project has `specification_instructions`
4. **Missing WebSocket events**: Check callback endpoint processing

### Log Locations:
- Backend: Console output when running with `--reload`
- WebSocket: Browser Network/Console tabs
- Third-party calls: Check backend console for HTTP client logs
