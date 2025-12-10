/**
 * Integration Example: Enhanced FileUploader with React-Uploady
 * Shows how to use both systems together without altering existing logic
 */

import React, { useState } from 'react';
import { FileUploader } from '../FileUploader/FileUploader';
import { ReactUploadyEnhancedUploader } from '../ReactUploadyEnhancedUploader/ReactUploadyEnhancedUploader';
import type { FileData, Project, ProjectFolder } from '../../types';

interface EnhancedFileUploaderProps {
  files: FileData[];
  folders?: ProjectFolder[];
  isUploading: boolean;
  error: string | null;
  onFileUpload: (files: FileList) => void;
  onFileRemove: (fileId: string) => void;
  onFileSelect: (file: FileData) => void;
  onFolderCreate?: (folderName: string, parentId?: string) => Promise<any>;
  onFolderDelete?: (folderId: string) => Promise<void>;
  onRefresh?: () => Promise<void>;
  selectedFileId?: string;
  currentProject?: Project | null;
}

export const EnhancedFileUploaderIntegration: React.FC<EnhancedFileUploaderProps> = ({
  files,
  folders,
  isUploading,
  error,
  onFileUpload,
  onFileRemove,
  onFileSelect,
  onFolderCreate,
  onFolderDelete,
  onRefresh,
  selectedFileId,
  currentProject
}) => {
  const [uploadMode, setUploadMode] = useState<'standard' | 'chunked'>('standard');
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleChunkedFileUpload = (uploadedFiles: FileData[]) => {
    console.log('✅ React-Uploady files uploaded:', uploadedFiles);
    // Refresh the file list to show newly uploaded files
    if (onRefresh) {
      onRefresh();
    }
  };

  const handleChunkedProgress = (progress: number) => {
    setUploadProgress(progress);
    console.log(`📊 React-Uploady progress: ${progress}%`);
  };

  const handleChunkedError = (errorMessage: string) => {
    console.error('❌ React-Uploady error:', errorMessage);
    // You can integrate this with your existing error handling
  };

  return (
    <div className="enhanced-file-uploader">
      {/* Upload Mode Toggle */}
      <div className="upload-mode-toggle">
        <button
          className={`mode-btn ${uploadMode === 'standard' ? 'active' : ''}`}
          onClick={() => setUploadMode('standard')}
        >
          Standard Upload
        </button>
        <button
          className={`mode-btn ${uploadMode === 'chunked' ? 'active' : ''}`}
          onClick={() => setUploadMode('chunked')}
        >
          Chunked Upload (Large Files)
        </button>
      </div>

      {/* Standard FileUploader (Existing - No Changes) */}
      {uploadMode === 'standard' && (
        <FileUploader
          files={files}
          folders={folders}
          isUploading={isUploading}
          error={error}
          onFileUpload={onFileUpload}
          onFileRemove={onFileRemove}
          onFileSelect={onFileSelect}
          onFolderCreate={onFolderCreate}
          onFolderDelete={onFolderDelete}
          onRefresh={onRefresh}
          selectedFileId={selectedFileId}
          currentProject={currentProject}
        />
      )}

      {/* React-Uploady Enhanced Uploader (New Addition) */}
      {uploadMode === 'chunked' && (
        <div className="chunked-upload-section">
          <ReactUploadyEnhancedUploader
            currentProject={currentProject}
            targetFolderId={null}
            onFileUpload={handleChunkedFileUpload}
            onProgress={handleChunkedProgress}
            onError={handleChunkedError}
            disabled={isUploading}
            chunkSize={3 * 1024 * 1024} // 3MB chunks
            maxParallelChunks={3}
          />

          {/* Progress Display */}
          {uploadProgress > 0 && uploadProgress < 100 && (
            <div className="upload-progress">
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <div className="progress-text">
                Uploading: {uploadProgress}%
              </div>
            </div>
          )}

          {/* Existing File List (Read-only in chunked mode) */}
          <div className="existing-files">
            <h4>Uploaded Files</h4>
            {files.map(file => (
              <div
                key={file.id}
                className={`file-item ${selectedFileId === file.id ? 'selected' : ''}`}
                onClick={() => onFileSelect(file)}
              >
                <span className="file-name">{file.name}</span>
                <span className="file-size">
                  {(file.size / (1024 * 1024)).toFixed(1)}MB
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onFileRemove(file.id);
                  }}
                  className="remove-btn"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Usage Instructions */}
      <div className="usage-info">
        <h5>Upload Modes:</h5>
        <ul>
          <li><strong>Standard Upload:</strong> Your existing file uploader with fallback chunking (works as before)</li>
          <li><strong>Chunked Upload:</strong> React-Uploady for large files with 3MB chunks and parallel upload</li>
        </ul>
        <p><small>Both modes integrate with your FastAPI backend seamlessly.</small></p>
      </div>
    </div>
  );
};

// Styles for the integration component
const integrationStyles = `
.enhanced-file-uploader {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.upload-mode-toggle {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.mode-btn {
  padding: 0.5rem 1rem;
  border: 1px solid var(--border-light);
  background: white;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.mode-btn.active {
  background: var(--primary-sea-blue);
  color: white;
  border-color: var(--primary-sea-blue);
}

.mode-btn:hover:not(.active) {
  background: var(--bg-secondary);
}

.chunked-upload-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.existing-files {
  padding: 1rem;
  border: 1px solid var(--border-light);
  border-radius: 6px;
}

.usage-info {
  padding: 1rem;
  background: var(--bg-secondary);
  border-radius: 6px;
  font-size: 0.875rem;
}

.usage-info ul {
  margin: 0.5rem 0;
}

.usage-info li {
  margin-bottom: 0.25rem;
}
`;

export { integrationStyles };
