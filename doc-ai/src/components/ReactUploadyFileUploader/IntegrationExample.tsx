// Integration Example: Adding Enhanced Uploader to ExtractPage
// This shows how to integrate the enhanced uploader without modifying existing code

import React from 'react';
import ReactUploadyFileUploader from './ReactUploadyFileUploader';
import { useToast } from '../../hooks/useToast';

interface UploadResult {
  id: string;
  name: string;
  response?: unknown;
  status: string;
}

// Example integration in ExtractPage or any other page
export const EnhancedUploadSection: React.FC<{
  projectId?: string;
  onFilesUploaded?: () => void;
}> = ({ projectId, onFilesUploaded }) => {
  const { addToast } = useToast();

  const handleUploadSuccess = (items: UploadResult[]) => {
    addToast('success', `Successfully uploaded ${items.length} file(s)!`);
    
    // Trigger any necessary refresh actions
    if (onFilesUploaded) {
      onFilesUploaded();
    }
  };

  const handleUploadError = (error: Error) => {
    addToast('error', 'Upload Failed', error.message);
  };

  const uploadUrl = projectId 
    ? `http://localhost:8000/api/projects/${projectId}/files`
    : 'http://localhost:8000/api/upload';

  return (
    <div className="enhanced-upload-section">
      <h3>Enhanced File Upload</h3>
      <p>Upload multiple files with real-time progress tracking and advanced controls.</p>
      
      <ReactUploadyFileUploader
        destination={uploadUrl}
        multiple={true}
        accept=".pdf,.json,.docx,.xlsx,.txt"
        maxFileSize={50 * 1024 * 1024} // 50MB
        onUploadSuccess={handleUploadSuccess}
        onUploadError={handleUploadError}
        className="project-enhanced-uploader"
      />
    </div>
  );
};

// Usage in ExtractPage.tsx:
/*
import { EnhancedUploadSection } from './EnhancedUploadSection';

// Add this inside your ExtractPage component:
<div className="upload-options">
  <h2>Upload Options</h2>
  
  <!-- Existing uploader -->
  <div className="standard-upload">
    <h3>Standard Upload</h3>
    <FileUploader {...existingProps} />
  </div>
  
  <!-- Enhanced uploader -->
  <EnhancedUploadSection 
    projectId={currentProject?.id}
    onFilesUploaded={refreshApiFiles}
  />
</div>
*/
