/**
 * React-Uploady Enhanced File Uploader Component
 * Works alongside existing FileUploader without altering current logic
 */

import React, { useCallback, useRef } from 'react';
import Uploady, { useItemProgressListener, useItemFinishListener, useItemErrorListener } from '@rpldy/uploady';
import UploadButton from '@rpldy/upload-button';
import { getChunkedEnhancer } from '@rpldy/chunked-sender';
import type { FileData, Project } from '../../types';
import './ReactUploadyEnhancedUploader.css';

interface ReactUploadyEnhancedUploaderProps {
  currentProject?: Project | null;
  targetFolderId?: string | null;
  onFileUpload?: (files: FileData[]) => void;
  onProgress?: (progress: number) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
  chunkSize?: number; // 3MB - 7MB as requested
  maxParallelChunks?: number;
}

// Progress tracking component (must be inside Uploady)
const UploadProgress: React.FC<{ onProgress?: (progress: number) => void }> = ({ onProgress }) => {
  useItemProgressListener((item) => {
    console.log(`📊 React-Uploady Progress: ${item.file.name} - ${item.completed}%`);
    if (onProgress) {
      onProgress(item.completed);
    }
  });

  useItemFinishListener((item) => {
    console.log(`✅ React-Uploady Upload completed: ${item.file.name}`, item.uploadResponse);
  });

  useItemErrorListener((item) => {
    console.error(`❌ React-Uploady Upload error: ${item.file.name}`, item.uploadResponse);
  });

  return null;
};

export const ReactUploadyEnhancedUploader: React.FC<ReactUploadyEnhancedUploaderProps> = ({
  currentProject,
  targetFolderId,
  onProgress,
  onError,
  disabled = false,
  chunkSize = 3 * 1024 * 1024, // 3MB default
  maxParallelChunks = 3
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Determine upload destination
  const uploadDestination = targetFolderId 
    ? `http://localhost:8000/api/folders/${targetFolderId}/files/chunk`
    : currentProject 
      ? `http://localhost:8000/api/projects/${currentProject.id}/files/chunk`
      : null;

  // Configure chunked enhancer
  const chunkedEnhancer = getChunkedEnhancer({
    chunked: true,
    chunkSize,
    retries: 3,
    parallel: maxParallelChunks
  });

  // File filter for supported types
  const fileFilter = useCallback((file: File | string) => {
    if (typeof file === 'string') return true; // Skip string validation
    
    const allowedTypes = [
      'application/pdf',
      'application/json',
      'text/plain',
      'image/png',
      'image/jpeg'
    ];
    
    const isAllowed = allowedTypes.includes(file.type) || file.name.toLowerCase().endsWith('.json');
    
    if (!isAllowed) {
      console.warn(`File type ${file.type} not allowed for ${file.name}`);
      if (onError) {
        onError(`File type "${file.type}" is not supported`);
      }
    }
    
    return isAllowed;
  }, [onError]);

  if (!uploadDestination) {
    return (
      <div className="react-uploady-uploader disabled">
        <p>Please select a project to enable uploads</p>
      </div>
    );
  }

  return (
    <div className="react-uploady-uploader">
      <Uploady
        destination={{
          url: uploadDestination,
          method: 'POST'
        }}
        enhancer={chunkedEnhancer}
        fileFilter={fileFilter}
        autoUpload={true}
      >
        {/* Progress and event handling */}
        <UploadProgress onProgress={onProgress} />
        
        {/* Upload Button */}
        {disabled ? (
          <div className="upload-btn disabled">
            📤 Upload Large Files (Chunked)
          </div>
        ) : (
          <UploadButton className="upload-btn">
            📤 Upload Large Files (Chunked)
          </UploadButton>
        )}
        
        {/* File Input for Drag & Drop or Click */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files) {
              // Files will be handled by Uploady automatically
              console.log('📁 Files selected for React-Uploady upload:', Array.from(e.target.files).map(f => f.name));
            }
          }}
        />
      </Uploady>
      
      <div className="chunked-info">
        <small>
          Chunk size: {(chunkSize / (1024 * 1024)).toFixed(1)}MB | 
          Parallel chunks: {maxParallelChunks} | 
          For files ≥ 10MB
        </small>
      </div>
    </div>
  );
};
