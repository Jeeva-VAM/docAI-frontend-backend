# Integration Instructions for Backend Chunked Upload

## 🚀 How to Integrate Chunked Upload Endpoints

### 1. **Add to your main FastAPI app:**

```python
from fastapi import FastAPI
from backend_chunked_endpoints import chunked_router

app = FastAPI()

# Include the chunked upload router
app.include_router(chunked_router, prefix="/api")

# Your existing routes...
```

### 2. **Or integrate with existing project/folder routes:**

```python
from fastapi import APIRouter
from backend_chunked_endpoints import (
    initialize_chunked_upload,
    upload_chunk, 
    complete_chunked_upload
)

# In your existing projects router
@app.post("/api/projects/{project_id}/files/chunked/init")
async def init_project_upload(project_id: str, request: ChunkedUploadInitRequest):
    return await initialize_chunked_upload(request, project_id=project_id)

@app.post("/api/projects/{project_id}/files/chunked/upload")
async def upload_project_chunk(project_id: str, uploadId: str = Form(...), chunkIndex: int = Form(...), chunk: UploadFile = File(...)):
    return await upload_chunk(uploadId, chunkIndex, chunk)

@app.post("/api/projects/{project_id}/files/chunked/complete")
async def complete_project_upload(project_id: str, request: ChunkedUploadCompleteRequest):
    return await complete_chunked_upload(request)
```

### 3. **Required Dependencies:**

Add to your `requirements.txt`:
```
fastapi
python-multipart
pydantic
```

### 4. **File Storage Integration:**

After the chunked upload completes, integrate with your existing database:

```python
# In the complete_chunked_upload function, add:
from your_db_models import File, Project  # Your existing models

# After assembling the file:
db_file = File(
    id=file_id,
    name=sanitized_filename,
    original_name=session['fileName'],
    path=str(final_file_path),
    url=file_url,
    size=total_size,
    type=session['fileType'],
    project_id=project_id,
    folder_id=folder_id,
    created_at=datetime.utcnow()
)
db.add(db_file)
db.commit()
```

### 5. **Production Considerations:**

- Replace in-memory `upload_sessions` with Redis or database storage
- Add proper authentication and authorization
- Implement upload session expiry cleanup
- Add file type validation and security checks
- Configure proper file size limits
- Set up monitoring and logging

### 6. **Testing the Integration:**

Once integrated, your large file upload will work like this:

1. **Frontend detects large file (≥10MB)**
2. **Calls chunked upload init** → `POST /api/projects/{id}/files/chunked/init`
3. **Uploads chunks in parallel** → `POST /api/projects/{id}/files/chunked/upload`
4. **Completes upload** → `POST /api/projects/{id}/files/chunked/complete`
5. **File is assembled and stored** in your existing file system

Your current logs will change from:
```
❌ Chunked upload failed: 500 Internal Server Error
⚠️ Falling back to regular upload
```

To:
```
✅ Chunked upload completed successfully
📦 File assembled from 3 chunks
```

## 🎯 **Expected Behavior After Integration:**

- **Small files (<10MB):** Continue using regular upload
- **Large files (≥10MB):** Use chunked upload automatically
- **Failed chunked uploads:** Graceful fallback to regular upload
- **Storage management:** Your existing storage quota system continues working
