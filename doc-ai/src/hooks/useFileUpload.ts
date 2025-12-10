import { useState, useCallback } from 'react';
import type { FileData } from '../types';
import { FileUploadService } from '../services/fileUploadService';

export const useFileUpload = () => {
  const [files, setFiles] = useState<FileData[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadFiles = useCallback(async (fileList: FileList) => {
    console.log('Starting file upload process with', fileList.length, 'files');
    
    // Validate FileList object
    if (!fileList || typeof fileList.length !== 'number') {
      setError('Invalid file list provided');
      console.error('Invalid FileList object:', fileList);
      return;
    }
    
    setIsUploading(true);
    setError(null);
    
    try {
      const processedFiles: FileData[] = [];
      const errors: string[] = [];
      
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        console.log(`Processing file ${i + 1}/${fileList.length}:`, file.name);
        
        // Validate that we have a proper File object
        if (!file || !(file instanceof File)) {
          const errorMsg = 'Invalid file object';
          const fileName = (file as any)?.name || 'unknown';
          console.error(`File validation failed for ${fileName}:`, errorMsg);
          errors.push(`${fileName}: ${errorMsg}`);
          continue;
        }
        
        const validation = FileUploadService.validateFile(file);
        
        if (!validation.isValid) {
          const errorMsg = validation.error || 'Invalid file';
          console.error(`File validation failed for ${file.name}:`, errorMsg);
          errors.push(`${file.name}: ${errorMsg}`);
          continue;
        }
        
        try {
          const processedFile = await FileUploadService.processFile(file);
          processedFiles.push(processedFile);
          console.log(`Successfully processed file:`, file.name);
        } catch (fileError) {
          const errorMsg = fileError instanceof Error ? fileError.message : 'Processing failed';
          console.error(`File processing failed for ${file.name}:`, errorMsg);
          errors.push(`${file.name}: ${errorMsg}`);
        }
      }
      
      if (processedFiles.length > 0) {
        setFiles(prevFiles => [...prevFiles, ...processedFiles]);
        console.log(`Successfully uploaded ${processedFiles.length} files`);
      }
      
      if (errors.length > 0) {
        const errorMessage = `Some files failed to upload:\n${errors.join('\n')}`;
        setError(errorMessage);
        console.error('Upload completed with errors:', errors);
      }
      
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Upload failed';
      console.error('Upload process failed:', err);
      setError(errorMsg);
    } finally {
      setIsUploading(false);
      console.log('File upload process completed');
    }
  }, []);

  const removeFile = useCallback((fileId: string) => {
    setFiles(prevFiles => prevFiles.filter(file => file.id !== fileId));
  }, []);

  const clearFiles = useCallback(() => {
    setFiles([]);
    setError(null);
  }, []);

  const restoreFiles = useCallback((restoredFiles: FileData[]) => {
    console.log('🔄 Restoring files to upload hook:', restoredFiles.length);
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
  };
};