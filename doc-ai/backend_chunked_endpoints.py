"""
FastAPI Chunked File Upload Endpoints for DocAI

This module implements the chunked upload functionality that your frontend expects.
It provides endpoints for:
1. Initializing chunked uploads
2. Uploading individual chunks
3. Completing chunked uploads and assembling the final file

The implementation matches the frontend contract defined in chunkedUploadService.ts
"""

from fastapi import APIRouter, HTTPException, File, UploadFile, Form, Depends
from pydantic import BaseModel
from typing import List, Optional
import os
import tempfile
import hashlib
from pathlib import Path
import uuid
from datetime import datetime

# Pydantic models for request/response validation
class ChunkedUploadInitRequest(BaseModel):
    fileName: str
    totalSize: int
    chunkSize: int
    totalChunks: int
    fileType: Optional[str] = None

class ChunkedUploadInitResponse(BaseModel):
    uploadId: str
    chunkSize: int
    totalChunks: int
    expiresAt: str

class ChunkedUploadCompleteRequest(BaseModel):
    uploadId: str
    fileName: str
    chunks: List[str]  # List of chunk IDs

class ChunkedUploadCompleteResponse(BaseModel):
    fileId: str
    fileName: str
    url: str
    size: int
    message: str

# Router for chunked upload endpoints
chunked_router = APIRouter(prefix="/chunked", tags=["chunked-upload"])

# In-memory storage for upload sessions (use Redis/database in production)
upload_sessions = {}
chunk_storage_path = Path("temp_chunks")
chunk_storage_path.mkdir(exist_ok=True)

@chunked_router.post("/init", response_model=ChunkedUploadInitResponse)
async def initialize_chunked_upload(
    request: ChunkedUploadInitRequest,
    project_id: Optional[str] = None,
    folder_id: Optional[str] = None
):
    """
    Initialize a new chunked upload session.
    
    Expected by frontend: POST /api/projects/{id}/files/chunked/init
    """
    try:
        # Generate unique upload ID
        upload_id = str(uuid.uuid4())
        
        # Calculate expected chunk count
        expected_chunks = (request.totalSize + request.chunkSize - 1) // request.chunkSize
        
        # Validate chunk count
        if request.totalChunks != expected_chunks:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid chunk count. Expected {expected_chunks}, got {request.totalChunks}"
            )
        
        # Create upload session
        session = {
            "uploadId": upload_id,
            "fileName": request.fileName,
            "totalSize": request.totalSize,
            "chunkSize": request.chunkSize,
            "totalChunks": request.totalChunks,
            "fileType": request.fileType,
            "projectId": project_id,
            "folderId": folder_id,
            "chunks": {},  # Will store {chunkIndex: chunkPath}
            "createdAt": datetime.utcnow().isoformat(),
            "expiresAt": datetime.utcnow().isoformat(),  # Add proper expiry logic
            "status": "initialized"
        }
        
        # Store session
        upload_sessions[upload_id] = session
        
        print(f"📦 Initialized chunked upload: {upload_id} for {request.fileName} ({request.totalSize} bytes)")
        
        return ChunkedUploadInitResponse(
            uploadId=upload_id,
            chunkSize=request.chunkSize,
            totalChunks=request.totalChunks,
            expiresAt=session["expiresAt"]
        )
        
    except Exception as e:
        print(f"❌ Failed to initialize chunked upload: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to initialize upload: {str(e)}")

@chunked_router.post("/upload")
async def upload_chunk(
    uploadId: str = Form(...),
    chunkIndex: int = Form(...),
    chunk: UploadFile = File(...)
):
    """
    Upload a single chunk of the file.
    
    Expected by frontend: POST /api/projects/{id}/files/chunked/upload
    """
    try:
        # Validate upload session exists
        if uploadId not in upload_sessions:
            raise HTTPException(status_code=404, detail="Upload session not found")
        
        session = upload_sessions[uploadId]
        
        # Validate chunk index
        if chunkIndex < 0 or chunkIndex >= session["totalChunks"]:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid chunk index {chunkIndex}. Expected 0-{session['totalChunks']-1}"
            )
        
        # Check if chunk already uploaded
        if chunkIndex in session["chunks"]:
            print(f"🔄 Chunk {chunkIndex} already uploaded for upload {uploadId}")
            return {"success": True, "message": f"Chunk {chunkIndex} already received"}
        
        # Read and save chunk
        chunk_data = await chunk.read()
        
        # Generate chunk file path
        chunk_filename = f"{uploadId}_chunk_{chunkIndex}"
        chunk_path = chunk_storage_path / chunk_filename
        
        # Save chunk to disk
        with open(chunk_path, "wb") as f:
            f.write(chunk_data)
        
        # Update session
        session["chunks"][chunkIndex] = str(chunk_path)
        
        print(f"📦 Received chunk {chunkIndex}/{session['totalChunks']-1} for {session['fileName']} ({len(chunk_data)} bytes)")
        
        return {
            "success": True,
            "chunkIndex": chunkIndex,
            "chunkSize": len(chunk_data),
            "message": f"Chunk {chunkIndex} uploaded successfully"
        }
        
    except Exception as e:
        print(f"❌ Failed to upload chunk {chunkIndex}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to upload chunk: {str(e)}")

@chunked_router.post("/complete", response_model=ChunkedUploadCompleteResponse)
async def complete_chunked_upload(
    request: ChunkedUploadCompleteRequest
):
    """
    Complete the chunked upload by assembling all chunks into the final file.
    
    Expected by frontend: POST /api/projects/{id}/files/chunked/complete
    """
    try:
        upload_id = request.uploadId
        
        # Validate upload session exists
        if upload_id not in upload_sessions:
            raise HTTPException(status_code=404, detail="Upload session not found")
        
        session = upload_sessions[upload_id]
        
        # Validate all chunks received
        expected_chunks = set(range(session["totalChunks"]))
        received_chunks = set(session["chunks"].keys())
        
        if received_chunks != expected_chunks:
            missing_chunks = expected_chunks - received_chunks
            raise HTTPException(
                status_code=400,
                detail=f"Missing chunks: {list(missing_chunks)}"
            )
        
        # Create final file directory
        project_id = session.get("projectId")
        folder_id = session.get("folderId")
        
        if project_id:
            upload_dir = Path("static/uploads") / project_id
        elif folder_id:
            upload_dir = Path("static/uploads/folders") / folder_id
        else:
            upload_dir = Path("static/uploads/temp")
        
        upload_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate unique file ID and name
        file_id = str(uuid.uuid4())
        sanitized_filename = f"{file_id}_{session['fileName']}"
        final_file_path = upload_dir / sanitized_filename
        
        # Assemble chunks into final file
        total_size = 0
        with open(final_file_path, "wb") as final_file:
            for chunk_index in sorted(session["chunks"].keys()):
                chunk_path = Path(session["chunks"][chunk_index])
                
                # Read and append chunk
                with open(chunk_path, "rb") as chunk_file:
                    chunk_data = chunk_file.read()
                    final_file.write(chunk_data)
                    total_size += len(chunk_data)
                
                # Clean up chunk file
                try:
                    chunk_path.unlink()
                except:
                    pass  # Ignore cleanup errors
        
        # Validate final file size
        if total_size != session["totalSize"]:
            final_file_path.unlink()  # Remove corrupted file
            raise HTTPException(
                status_code=400,
                detail=f"File size mismatch. Expected {session['totalSize']}, got {total_size}"
            )
        
        # Generate file URL (relative to static serving)
        relative_path = str(final_file_path.relative_to(Path("static")))
        file_url = f"static/{relative_path}"
        
        # Clean up upload session
        del upload_sessions[upload_id]
        
        print(f"✅ Completed chunked upload: {session['fileName']} ({total_size} bytes) -> {file_url}")
        
        # TODO: Save file metadata to database here
        # This should integrate with your existing file storage system
        
        return ChunkedUploadCompleteResponse(
            fileId=file_id,
            fileName=sanitized_filename,
            url=file_url,
            size=total_size,
            message=f"File '{session['fileName']}' uploaded successfully via chunked upload"
        )
        
    except Exception as e:
        print(f"❌ Failed to complete chunked upload: {str(e)}")
        
        # Cleanup on error
        if upload_id in upload_sessions:
            session = upload_sessions[upload_id]
            for chunk_path_str in session["chunks"].values():
                try:
                    Path(chunk_path_str).unlink()
                except:
                    pass
            del upload_sessions[upload_id]
        
        raise HTTPException(status_code=500, detail=f"Failed to complete upload: {str(e)}")

@chunked_router.get("/status/{upload_id}")
async def get_upload_status(upload_id: str):
    """
    Get the current status of a chunked upload session.
    """
    if upload_id not in upload_sessions:
        raise HTTPException(status_code=404, detail="Upload session not found")
    
    session = upload_sessions[upload_id]
    
    return {
        "uploadId": upload_id,
        "fileName": session["fileName"],
        "totalChunks": session["totalChunks"],
        "receivedChunks": len(session["chunks"]),
        "missingChunks": [i for i in range(session["totalChunks"]) if i not in session["chunks"]],
        "status": session["status"],
        "progress": len(session["chunks"]) / session["totalChunks"] * 100
    }

@chunked_router.delete("/cancel/{upload_id}")
async def cancel_chunked_upload(upload_id: str):
    """
    Cancel a chunked upload and clean up temporary files.
    """
    if upload_id not in upload_sessions:
        raise HTTPException(status_code=404, detail="Upload session not found")
    
    session = upload_sessions[upload_id]
    
    # Clean up chunk files
    for chunk_path_str in session["chunks"].values():
        try:
            Path(chunk_path_str).unlink()
        except:
            pass
    
    # Remove session
    del upload_sessions[upload_id]
    
    print(f"🗑️ Cancelled chunked upload: {upload_id}")
    
    return {"message": f"Upload {upload_id} cancelled successfully"}

# Project-specific endpoints (to match your frontend expectations)
@chunked_router.post("/projects/{project_id}/files/chunked/init", response_model=ChunkedUploadInitResponse)
async def init_project_chunked_upload(project_id: str, request: ChunkedUploadInitRequest):
    """Project-specific chunked upload initialization."""
    return await initialize_chunked_upload(request, project_id=project_id)

@chunked_router.post("/projects/{project_id}/files/chunked/upload")
async def upload_project_chunk(project_id: str, uploadId: str = Form(...), chunkIndex: int = Form(...), chunk: UploadFile = File(...)):
    """Project-specific chunk upload."""
    return await upload_chunk(uploadId, chunkIndex, chunk)

@chunked_router.post("/projects/{project_id}/files/chunked/complete", response_model=ChunkedUploadCompleteResponse)
async def complete_project_chunked_upload(project_id: str, request: ChunkedUploadCompleteRequest):
    """Project-specific chunked upload completion."""
    return await complete_chunked_upload(request)

# Folder-specific endpoints
@chunked_router.post("/folders/{folder_id}/files/chunked/init", response_model=ChunkedUploadInitResponse)
async def init_folder_chunked_upload(folder_id: str, request: ChunkedUploadInitRequest):
    """Folder-specific chunked upload initialization."""
    return await initialize_chunked_upload(request, folder_id=folder_id)

@chunked_router.post("/folders/{folder_id}/files/chunked/upload")
async def upload_folder_chunk(folder_id: str, uploadId: str = Form(...), chunkIndex: int = Form(...), chunk: UploadFile = File(...)):
    """Folder-specific chunk upload."""
    return await upload_chunk(uploadId, chunkIndex, chunk)

@chunked_router.post("/folders/{folder_id}/files/chunked/complete", response_model=ChunkedUploadCompleteResponse)
async def complete_folder_chunked_upload(folder_id: str, request: ChunkedUploadCompleteRequest):
    """Folder-specific chunked upload completion."""
    return await complete_chunked_upload(request)
