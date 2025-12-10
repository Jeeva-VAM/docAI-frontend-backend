/**
 * Enhanced File Upload Hook with API Integration
 * Handles file uploads through the backend API while maintaining compatibility
 */

import { useState, useCallback } from 'react';
import type { FileData, Project } from '../types';
import { FileApiService } from '../services/fileApiService';
import { FileUploadService } from '../services/fileUploadService';
import { chunkedUploadService } from '../services/chunkedUploadService';

interface UseApiFileUploadOptions {
  currentProject?: Project | null;
  targetFolderId?: string | null;
}

interface UseApiFileUploadReturn {
  files: FileData[];
  isUploading: boolean;
  error: string | null;
  uploadFiles: (fileList: FileList, options?: { projectId?: string; folderId?: string }) => Promise<void>;
  removeFile: (fileId: string, projectId?: string) => Promise<void>;
  clearFiles: () => void;
  restoreFiles: (restoredFiles: FileData[]) => void;
  uploadProgress: number;
}

export const useApiFileUpload = (options: UseApiFileUploadOptions = {}): UseApiFileUploadReturn => {
  const [files, setFiles] = useState<FileData[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const uploadFiles = useCallback(async (
    fileList: FileList, 
    uploadOptions: { projectId?: string; folderId?: string } = {}
  ) => {
    console.log('🚀 Starting API file upload process with', fileList.length, 'files');
    
    // Validate inputs
    if (!fileList || typeof fileList.length !== 'number' || fileList.length === 0) {
      setError('No files provided for upload');
      console.error('Invalid or empty FileList object:', fileList);
      return;
    }

    // Determine target project and folder
    const projectId = uploadOptions.projectId || options.currentProject?.id;
    const folderId = uploadOptions.folderId || options.targetFolderId;

    if (!projectId) {
      setError('No project selected. Please select a project before uploading files.');
      console.error('No project ID available for upload');
      return;
    }
    
    setIsUploading(true);
    setError(null);
    setUploadProgress(0);
    
    try {
      // Validate all files first
      const fileArray = Array.from(fileList);
      FileApiService.validateFiles(fileArray, 500 * 1024 * 1024); // 500MB limit for chunked uploads
      
      console.log(`📋 Uploading to project: ${projectId}`, folderId ? `folder: ${folderId}` : 'root');
      
      const uploadedFiles: FileData[] = [];
      const errors: string[] = [];
      
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        const progressPercent = Math.round(((i) / fileArray.length) * 100);
        setUploadProgress(progressPercent);
        
        console.log(`📤 Uploading file ${i + 1}/${fileArray.length}:`, file.name);
        
        try {
          let apiResponse;
          
          // Check if file should use chunked upload (≥10MB)
          const shouldUseChunked = chunkedUploadService.shouldUseChunkedUpload(file);
          
          if (shouldUseChunked) {
            console.log(`🔄 Attempting chunked upload for large file: ${file.name} (${chunkedUploadService.formatBytes(file.size)})`);
            
            try {
              // Try chunked upload first
              const destination = folderId 
                ? { type: 'folder' as const, id: folderId, projectId: projectId }
                : { type: 'project' as const, id: projectId };
              
              const fileId = await chunkedUploadService.uploadFile(file, destination, {
                onProgress: (progress) => {
                  const fileProgressPercent = Math.round(((i + progress.percentage / 100) / fileArray.length) * 100);
                  setUploadProgress(fileProgressPercent);
                  console.log(`📦 Chunked upload progress for ${file.name}: ${progress.percentage.toFixed(1)}% (Chunk ${progress.currentChunk}/${progress.total_chunks})`);
                },
                onChunkComplete: (chunkIndex, total_chunks) => {
                  console.log(`✅ Chunk ${chunkIndex + 1}/${total_chunks} completed for ${file.name}`);
                }
              });
              
              // Create API response format compatible with existing code
              apiResponse = { 
                id: fileId, 
                name: file.name, 
                type: file.type, 
                size: file.size,
                project_id: projectId,
                folder_id: folderId || undefined,
                created_at: new Date().toISOString()
              };
              console.log('✅ Chunked upload completed successfully:', apiResponse);
              
            } catch (chunkedError) {
              console.warn(`⚠️ Chunked upload failed for ${file.name}, falling back to regular upload:`, chunkedError);
              
              // Fallback to regular upload
              if (folderId) {
                console.log('📁 Fallback: Uploading large file to folder via regular upload:', { fileName: file.name, folderId });
                apiResponse = await FileApiService.uploadFileToFolder(folderId, file);
                console.log('✅ Large file uploaded to folder successfully via fallback:', apiResponse);
              } else {
                console.log('📁 Fallback: Uploading large file to project root via regular upload:', { fileName: file.name, projectId });
                apiResponse = await FileApiService.uploadFileToProject(projectId, file);
                console.log('✅ Large file uploaded to project root successfully via fallback:', apiResponse);
              }
            }
          } else {
            // Use regular upload for smaller files
            if (folderId) {
              console.log('📁 Uploading file to folder:', { fileName: file.name, folderId });
              apiResponse = await FileApiService.uploadFileToFolder(folderId, file);
              console.log('✅ File uploaded to folder successfully:', apiResponse);
            } else {
              console.log('📁 Uploading file to project root:', { fileName: file.name, projectId });
              apiResponse = await FileApiService.uploadFileToProject(projectId, file);
              console.log('✅ File uploaded to project root successfully:', apiResponse);
            }
          }
          
          // Process the file content for local use (PDF/JSON processing)
          let fileContent: string | ArrayBuffer | undefined;
          try {
            const localProcessedFile = await FileUploadService.processFile(file);
            fileContent = localProcessedFile.content;
          } catch (processingError) {
            console.warn('Local processing failed, but API upload succeeded:', processingError);
            // Continue without local content - will be fetched from API when needed
          }
          
          // Convert API response to FileData
          const fileData = FileApiService.convertToFileData(apiResponse, fileContent);
          uploadedFiles.push(fileData);
          
          console.log(`✅ Successfully uploaded file:`, file.name);
        } catch (fileError) {
          const errorMsg = fileError instanceof Error ? fileError.message : 'Upload failed';
          console.error(`❌ File upload failed for ${file.name}:`, errorMsg);
          errors.push(`${file.name}: ${errorMsg}`);
        }
      }
      
      // Update progress to complete
      setUploadProgress(100);
      
      // Add successfully uploaded files to state
      if (uploadedFiles.length > 0) {
        setFiles(prevFiles => [...prevFiles, ...uploadedFiles]);
        console.log(`✅ Successfully uploaded ${uploadedFiles.length} files to API`);
      }
      
      // Handle errors
      if (errors.length > 0) {
        const errorMessage = `Some files failed to upload:\n${errors.join('\n')}`;
        setError(errorMessage);
        console.error('Upload completed with errors:', errors);
      }
      
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Upload failed';
      console.error('❌ API upload process failed:', err);
      setError(errorMsg);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      console.log('📤 API file upload process completed');
    }
  }, [options.currentProject?.id, options.targetFolderId]);

  const removeFile = useCallback(async (fileId: string) => {
    try {
      console.log(`🗑️ Removing file from API:`, fileId);
      
      // Remove from API
      await FileApiService.deleteFile(fileId);
      
      // Remove from local state
      setFiles(prevFiles => prevFiles.filter(file => file.id !== fileId));
      
      console.log('✅ File removed successfully:', fileId);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to remove file';
      console.error('❌ Failed to remove file from API:', error);
      setError(errorMsg);
      throw error; // Re-throw so UI can handle it
    }
  }, []);

  const clearFiles = useCallback(() => {
    setFiles([]);
    setError(null);
    setUploadProgress(0);
  }, []);

  const restoreFiles = useCallback((restoredFiles: FileData[]) => {
    console.log('🔄 Restoring files to API upload hook:', restoredFiles.length);
    setFiles(restoredFiles);
    setError(null);
  }, []);

  return {
    files,
    isUploading,
    error,
    uploadFiles,
    removeFile,
    clearFiles,
    restoreFiles,
    uploadProgress,
  };
};

// Export both the new API-based hook and maintain compatibility with the old one
export { useFileUpload } from './useFileUpload'; // Re-export the old hook for backward compatibility
