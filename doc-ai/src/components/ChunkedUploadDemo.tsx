import React, { useState } from 'react';
import ReactUploadyFileUploader from '../components/ReactUploadyFileUploader/ReactUploadyFileUploader';
import { chunkedUploadService } from '../services/chunkedUploadService';

interface UploadResult {
  id: string;
  name: string;
  response?: unknown;
  status: string;
}

export const ChunkedUploadDemo: React.FC = () => {
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);

  const handleUploadSuccess = (results: UploadResult[]) => {
    console.log('✅ Upload success:', results);
    setUploadResults(prev => [...prev, ...results]);
  };

  const handleUploadError = (error: Error) => {
    console.error('❌ Upload error:', error);
    setUploadErrors(prev => [...prev, error.message]);
  };

  const clearResults = () => {
    setUploadResults([]);
    setUploadErrors([]);
  };

  const getActiveUploads = () => {
    const active = chunkedUploadService.getActiveUploads();
    return active;
  };

  const formatBytes = (bytes: number): string => {
    return chunkedUploadService.formatBytes(bytes);
  };

  const formatTime = (seconds: number): string => {
    return chunkedUploadService.formatTime(seconds);
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1>Chunked Upload Demo</h1>
        <p>This demo shows the chunked upload functionality for large files (≥10MB).</p>
        <p>Files smaller than 10MB will use regular upload, larger files will be automatically chunked.</p>
      </div>

      {/* Upload Component */}
      <ReactUploadyFileUploader
        destination="demo-project"
        multiple={true}
        accept=".pdf,.json,.txt,.mp4,.zip,.tar"
        maxFileSize={500 * 1024 * 1024} // 500MB
        onUploadSuccess={handleUploadSuccess}
        onUploadError={handleUploadError}
        allowFolderUpload={true}
      />

      {/* Active Upload Monitoring */}
      <div style={{ 
        marginTop: '2rem', 
        padding: '1rem', 
        backgroundColor: '#f8fafc', 
        borderRadius: '8px',
        border: '1px solid #e2e8f0'
      }}>
        <h3>Active Upload Monitoring</h3>
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          {getActiveUploads().map((progress) => (
            <div 
              key={progress.fileId} 
              style={{ 
                padding: '0.75rem', 
                backgroundColor: 'white', 
                borderRadius: '4px',
                border: '1px solid #e5e7eb',
                fontFamily: 'monospace',
                fontSize: '0.875rem'
              }}
            >
              <div><strong>{progress.fileName}</strong></div>
              <div>Status: {progress.status}</div>
              <div>Size: {formatBytes(progress.fileSize)}</div>
              <div>Progress: {progress.percentage}%</div>
              {progress.uploadSpeed > 0 && (
                <div>Speed: {formatBytes(progress.uploadSpeed)}/s</div>
              )}
              {progress.estimatedTimeRemaining > 0 && (
                <div>ETA: {formatTime(progress.estimatedTimeRemaining)}</div>
              )}
              {progress.total_chunks > 1 && (
                <div>Chunks: {progress.currentChunk}/{progress.total_chunks}</div>
              )}
              {progress.errorMessage && (
                <div style={{ color: '#dc2626' }}>Error: {progress.errorMessage}</div>
              )}
            </div>
          ))}
          {getActiveUploads().length === 0 && (
            <div style={{ color: '#6b7280', fontStyle: 'italic' }}>
              No active uploads
            </div>
          )}
        </div>
      </div>

      {/* Results Display */}
      {(uploadResults.length > 0 || uploadErrors.length > 0) && (
        <div style={{ marginTop: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
            <h3>Upload Results</h3>
            <button 
              onClick={clearResults}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Clear Results
            </button>
          </div>

          {uploadResults.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <h4 style={{ color: '#059669' }}>✅ Successful Uploads ({uploadResults.length})</h4>
              <div style={{ 
                padding: '1rem', 
                backgroundColor: '#ecfdf5', 
                borderRadius: '4px',
                border: '1px solid #a7f3d0',
                fontFamily: 'monospace',
                fontSize: '0.875rem'
              }}>
                {uploadResults.map((result, index) => (
                  <div key={index}>
                    {result.name} → {result.status}
                  </div>
                ))}
              </div>
            </div>
          )}

          {uploadErrors.length > 0 && (
            <div>
              <h4 style={{ color: '#dc2626' }}>❌ Upload Errors ({uploadErrors.length})</h4>
              <div style={{ 
                padding: '1rem', 
                backgroundColor: '#fef2f2', 
                borderRadius: '4px',
                border: '1px solid #fca5a5',
                fontFamily: 'monospace',
                fontSize: '0.875rem'
              }}>
                {uploadErrors.map((error, index) => (
                  <div key={index} style={{ color: '#dc2626' }}>
                    {error}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Information */}
      <div style={{ 
        marginTop: '2rem', 
        padding: '1rem', 
        backgroundColor: '#eff6ff', 
        borderRadius: '8px',
        border: '1px solid #bfdbfe'
      }}>
        <h4>🔧 Chunked Upload Configuration</h4>
        <ul style={{ margin: '0.5rem 0', paddingLeft: '1.5rem' }}>
          <li><strong>Chunk Size:</strong> 5MB per chunk</li>
          <li><strong>Large File Threshold:</strong> 10MB (files ≥10MB use chunked upload)</li>
          <li><strong>Maximum File Size:</strong> 500MB</li>
          <li><strong>Parallel Chunks:</strong> 3 chunks uploaded simultaneously</li>
          <li><strong>Progress Tracking:</strong> Real-time progress, speed, and ETA calculation</li>
          <li><strong>Error Handling:</strong> Automatic retry on chunk failures</li>
        </ul>
        
        <div style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#374151' }}>
          <strong>Note:</strong> This is a demo implementation. In a real application, you would need to implement the backend API endpoints:
          <ul style={{ margin: '0.5rem 0', paddingLeft: '1.5rem' }}>
            <li><code>/api/projects/:id/files/chunked/init</code> - Initialize multipart upload</li>
            <li><code>/api/projects/:id/files/chunked/upload</code> - Upload individual chunks</li>
            <li><code>/api/projects/:id/files/chunked/complete</code> - Complete multipart upload</li>
            <li><code>/api/folders/:id/files/chunked/*</code> - Folder-based chunked uploads</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
