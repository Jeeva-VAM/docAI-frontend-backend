import React, { useState } from 'react';
import ReactUploadyFileUploader from '../components/ReactUploadyFileUploader';
import { useToast } from '../hooks/useToast';
import { chunkedUploadService } from '../services/chunkedUploadService';
import './UploadDemoPage.css';

interface UploadResult {
  id: string;
  name: string;
  response?: unknown;
}

// Inline Chunked Upload Monitor Component
const ChunkedUploadMonitor: React.FC = () => {
  const [activeUploads, setActiveUploads] = useState(() => chunkedUploadService.getActiveUploads());

  // Update active uploads every second
  React.useEffect(() => {
    const interval = setInterval(() => {
      setActiveUploads(chunkedUploadService.getActiveUploads());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  if (activeUploads.length === 0) {
    return (
      <div className="monitor-empty-state">
        <div className="monitor-icon">📊</div>
        <p>No active uploads</p>
        <small>Large files (≥10MB) will appear here during chunked upload</small>
      </div>
    );
  }

  return (
    <div className="chunked-uploads-list">
      {activeUploads.map((progress) => (
        <div key={progress.fileId} className="chunked-upload-item">
          <div className="upload-item-header">
            <span className="upload-filename">{progress.fileName}</span>
            <span className="upload-status">{progress.status}</span>
          </div>
          
          <div className="upload-progress-details">
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
            
            <div className="upload-stats">
              <span>Size: {chunkedUploadService.formatBytes(progress.fileSize)}</span>
              <span>Progress: {progress.percentage.toFixed(1)}%</span>
              {progress.uploadSpeed > 0 && (
                <span>Speed: {chunkedUploadService.formatBytes(progress.uploadSpeed)}/s</span>
              )}
              {progress.estimatedTimeRemaining > 0 && (
                <span>ETA: {chunkedUploadService.formatTime(progress.estimatedTimeRemaining)}</span>
              )}
              {progress.total_chunks > 1 && (
                <span>Chunks: {progress.currentChunk}/{progress.total_chunks}</span>
              )}
            </div>
          </div>
          
          {progress.errorMessage && (
            <div className="upload-error">
              ❌ {progress.errorMessage}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export const UploadDemoPage: React.FC = () => {
  const [uploadedFiles, setUploadedFiles] = useState<UploadResult[]>([]);
  const { addToast } = useToast();

  const handleUploadSuccess = (items: UploadResult[]) => {
    setUploadedFiles(prev => [...prev, ...items]);
    addToast('success', `Successfully uploaded ${items.length} file(s)!`);
  };

  const handleUploadError = (error: Error) => {
    addToast('error', 'Upload Failed', error.message);
  };

  const clearUploadHistory = () => {
    setUploadedFiles([]);
    addToast('info', 'Upload history cleared');
  };

  return (
    <div className="upload-demo-page">
      <div className="upload-demo-header">
        <h1>React-Uploady File Uploader Demo</h1>
        <p className="upload-demo-description">
          Experience parallel file uploads with real-time progress tracking, folder upload support, and comprehensive error handling. 
          Upload individual files or entire folders with automatic file validation.
        </p>
      </div>

      <div className="upload-demo-content">
        <div className="upload-demo-section">
          <h2>🚀 Advanced Parallel & Chunked Upload</h2>
          <p>Drop multiple files, entire folders, or click to browse. Large files (≥10MB) automatically use chunked upload for better performance and reliability. Files upload in parallel for maximum speed.</p>
          
          <div className="upload-features-highlight">
            <div className="feature-badge">📦 Chunked Upload for Large Files</div>
            <div className="feature-badge">⚡ Parallel Processing</div>
            <div className="feature-badge">📊 Real-time Progress</div>
            <div className="feature-badge">📁 Folder Support</div>
            <div className="feature-badge">🛡️ Error Recovery</div>
          </div>
          
          <ReactUploadyFileUploader
            destination="http://localhost:8000/api/demo/upload"
            multiple={true}
            accept=".pdf,.json,.docx,.txt,.xlsx,.md,.js,.ts,.tsx,.css,.html,.xml,.log,.zip,.tar,.mp4,.mov,.avi,.png,.jpg,.jpeg"
            maxFileSize={500 * 1024 * 1024} // 500MB - now supports much larger files
            allowFolderUpload={true}
            folderValidationOptions={{
              maxTotalFiles: 200,
              // More permissive extension list for demo
              allowedExtensions: ['.pdf', '.json', '.docx', '.txt', '.xlsx', '.md', '.js', '.ts', '.tsx', '.css', '.html', '.xml', '.log', '.csv', '.png', '.jpg', '.jpeg', '.gif', '.svg'],
              maxFileSize: 50 * 1024 * 1024
            }}
            onUploadSuccess={handleUploadSuccess}
            onUploadError={handleUploadError}
            className="demo-uploader"
          />
        </div>

        {/* Live Chunked Upload Monitoring */}
        <div className="upload-demo-section">
          <h3>🔍 Live Upload Monitoring</h3>
          <p>Monitor active chunked uploads with real-time progress, speed, and ETA information:</p>
          
          <div className="chunked-upload-monitor">
            <ChunkedUploadMonitor />
          </div>
        </div>

        {uploadedFiles.length > 0 && (
          <div className="upload-demo-section">
            <div className="upload-history-header">
              <h3>Upload History ({uploadedFiles.length} files)</h3>
              <button 
                onClick={clearUploadHistory}
                className="clear-history-button"
              >
                Clear History
              </button>
            </div>
            
            <div className="upload-history-list">
              {uploadedFiles.map((file, index) => (
                <div key={`${file.id}-${index}`} className="upload-history-item">
                  <div className="upload-history-icon">📄</div>
                  <div className="upload-history-info">
                    <span className="upload-history-name">{file.name}</span>
                    <span className="upload-history-id">ID: {file.id}</span>
                  </div>
                  <div className="upload-history-status">✓</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="upload-demo-section">
          <h3>🔧 Advanced Upload Features</h3>
          <div className="features-grid">
            <div className="feature-card">
              <h4>� Folder Upload Support</h4>
              <p>Upload entire directories with webkitdirectory and drag-and-drop</p>
            </div>
            <div className="feature-card">
              <h4>�🚀 Parallel Processing</h4>
              <p>Upload up to 3 files simultaneously for maximum efficiency</p>
            </div>
            <div className="feature-card">
              <h4>📊 Per-File Progress</h4>
              <p>Real-time progress with upload speed and time remaining</p>
            </div>
            <div className="feature-card">
              <h4>🔄 Status Tracking</h4>
              <p>Complete status management: queued, uploading, done, error, canceled</p>
            </div>
            <div className="feature-card">
              <h4>⚡ Retry & Cancel</h4>
              <p>Individual and batch retry/cancel operations with one click</p>
            </div>
            <div className="feature-card">
              <h4>🎯 Queue Management</h4>
              <p>Smart file queue with batch operations and priority handling</p>
            </div>
            <div className="feature-card">
              <h4>🎨 DocAI Integration</h4>
              <p>Seamlessly integrates with existing DocAI UI patterns</p>
            </div>
            <div className="feature-card">
              <h4>📱 Responsive Design</h4>
              <p>Optimized for all screen sizes with touch-friendly controls</p>
            </div>
            <div className="feature-card">
              <h4>♿ Accessibility</h4>
              <p>Full keyboard navigation and screen reader support</p>
            </div>
          </div>
        </div>

        <div className="upload-demo-section">
          <h3>Integration Example</h3>
          <pre className="code-example">
{`// Basic usage with folder support
<ReactUploadyFileUploader
  destination="/api/upload"
  multiple={true}
  accept=".pdf,.json,.docx"
  maxFileSize={50 * 1024 * 1024}
  allowFolderUpload={true}
  folderValidationOptions={{
    maxTotalFiles: 100,
    allowedExtensions: ['.pdf', '.json', '.docx']
  }}
  onUploadSuccess={(items) => console.log('Success:', items)}
  onUploadError={(error) => console.error('Error:', error)}
/>`}
          </pre>
        </div>
      </div>
    </div>
  );
};
