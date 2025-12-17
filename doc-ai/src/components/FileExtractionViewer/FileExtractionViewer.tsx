import React from 'react';
import { JsonViewer } from '../JsonViewer/JsonViewer';

interface FileExtractionState {
  fileId: string | null;
  status: 'idle' | 'loading' | 'completed' | 'failed';
  filename?: string;
  error?: string;
  extractionData?: {
    structured_output: Record<string, unknown>;
    total_fields: number;
    filled_fields: number;
    empty_fields: number;
  };
}

interface FileExtractionViewerProps {
  fileState: FileExtractionState;
  jsonData?: Record<string, unknown>;
  jsonError?: string;
  onToggleViewMode?: () => void;
  viewMode?: 'json' | 'form';
}

export const FileExtractionViewer: React.FC<FileExtractionViewerProps> = ({
  fileState,
  jsonData,
  jsonError,
  onToggleViewMode,
  viewMode
}) => {
  // If we have extraction data or existing jsonData, show the JsonViewer
  const hasExtractionData = fileState.status === 'completed' && fileState.extractionData;
  const dataToDisplay = hasExtractionData ? fileState.extractionData!.structured_output : jsonData;
  
  if (dataToDisplay && !jsonError) {
    return (
      <div className="json-viewer-container">
        <JsonViewer
          jsonData={dataToDisplay}
          error={null}
          onToggleViewMode={onToggleViewMode || (() => {})}
          viewMode={viewMode || 'json'}
        />
      </div>
    );
  }

  // Show loading state when a file is selected and being processed
  if (fileState.status === 'loading' && fileState.fileId) {
    return (
      <div className="json-viewer-placeholder" style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: '2rem',
        textAlign: 'center',
        color: '#666',
        fontSize: '16px'
      }}>
        <div style={{ marginBottom: '1rem' }}>
          <div 
            className="loading-spinner" 
            style={{
              width: '40px',
              height: '40px',
              border: '4px solid #f3f3f3',
              borderTop: '4px solid #3498db',
              borderRadius: '50%',
              margin: '0 auto 1rem'
            }}
          ></div>
        </div>
        <div style={{ marginBottom: '0.5rem', fontSize: '18px', fontWeight: 'bold' }}>
          🔄 Processing Extraction
        </div>
        <div style={{ fontSize: '14px', opacity: 0.8, marginBottom: '1rem' }}>
          {fileState.filename}
        </div>
        <div style={{ fontSize: '14px', opacity: 0.6 }}>
          Waiting for extraction to complete...
        </div>
        
        <style>{`
          .loading-spinner {
            animation: spin 1s linear infinite;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // Show error state
  if (fileState.status === 'failed' && fileState.error) {
    return (
      <div className="json-viewer-placeholder" style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: '2rem',
        textAlign: 'center',
        color: '#e74c3c',
        fontSize: '16px'
      }}>
        <div style={{ marginBottom: '1rem', fontSize: '48px' }}>
          ⚠️
        </div>
        <div style={{ marginBottom: '0.5rem', fontSize: '18px', fontWeight: 'bold' }}>
          Extraction Failed
        </div>
        <div style={{ fontSize: '14px', opacity: 0.8, marginBottom: '1rem' }}>
          {fileState.filename}
        </div>
        <div style={{ fontSize: '14px', opacity: 0.7 }}>
          {fileState.error}
        </div>
      </div>
    );
  }

  // Show extraction completed but with statistics
  if (fileState.status === 'completed' && fileState.extractionData && !dataToDisplay) {
    return (
      <div className="json-viewer-placeholder" style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: '2rem',
        textAlign: 'center',
        color: '#666',
        fontSize: '16px'
      }}>
        <div style={{ marginBottom: '1rem', fontSize: '48px' }}>
          ✅
        </div>
        <div style={{ marginBottom: '0.5rem', fontSize: '18px', fontWeight: 'bold' }}>
          Extraction Completed
        </div>
        <div style={{ fontSize: '14px', opacity: 0.8, marginBottom: '1.5rem' }}>
          {fileState.filename}
        </div>
        
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(3, 1fr)', 
          gap: '1rem', 
          width: '100%', 
          maxWidth: '400px',
          marginBottom: '1rem'
        }}>
          <div style={{ 
            padding: '1rem', 
            backgroundColor: '#f8f9fa', 
            borderRadius: '8px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#3498db' }}>
              {fileState.extractionData.total_fields}
            </div>
            <div style={{ fontSize: '12px', opacity: 0.7 }}>Total Fields</div>
          </div>
          
          <div style={{ 
            padding: '1rem', 
            backgroundColor: '#d4edda', 
            borderRadius: '8px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#28a745' }}>
              {fileState.extractionData.filled_fields}
            </div>
            <div style={{ fontSize: '12px', opacity: 0.7 }}>Filled</div>
          </div>
          
          <div style={{ 
            padding: '1rem', 
            backgroundColor: '#f8d7da', 
            borderRadius: '8px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#dc3545' }}>
              {fileState.extractionData.empty_fields}
            </div>
            <div style={{ fontSize: '12px', opacity: 0.7 }}>Empty</div>
          </div>
        </div>
        
        <div style={{ fontSize: '14px', opacity: 0.6 }}>
          Data extracted but not loaded in viewer
        </div>
      </div>
    );
  }

  // Show error from jsonError prop
  if (jsonError) {
    return (
      <div className="json-viewer-placeholder" style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: '2rem',
        textAlign: 'center',
        color: '#e74c3c',
        fontSize: '16px'
      }}>
        <div style={{ marginBottom: '1rem', fontSize: '48px' }}>
          ❌
        </div>
        <div style={{ marginBottom: '0.5rem', fontSize: '18px', fontWeight: 'bold' }}>
          JSON Error
        </div>
        <div style={{ fontSize: '14px', opacity: 0.7 }}>
          {jsonError}
        </div>
      </div>
    );
  }

  // Default placeholder
  return (
    <div className="json-viewer-placeholder" style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      padding: '2rem',
      textAlign: 'center',
      color: '#999',
      fontSize: '18px'
    }}>
      <div style={{ marginBottom: '1rem' }}>
        📄 JSON Viewer
      </div>
      <div style={{ fontSize: '14px', opacity: 0.7 }}>
        Click on a file to view extraction results
      </div>
    </div>
  );
};
