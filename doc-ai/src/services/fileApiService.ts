/**
 * File API Service
 * Handles all file-related API operations including uploads, listing, and deletion
 */

import { ApiService } from './apiService';
import type { FileData, StoredFileData, FileExtraction } from '../types';

export interface FileResponse {
  id: string;
  name: string;
  type: string;
  size: number;
  project_id: string;
  folder_id?: string;
  created_at: string;
  updated_at?: string;
  url?: string; // Download URL if provided by backend
}

export interface FileListResponse {
  files: FileResponse[];
  total: number;
}

export interface FileUploadResponse {
  file: FileResponse;
  message?: string;
}

export interface FolderFileListResponse extends FileListResponse {
  folder_id: string;
}

class FileApiServiceClass {
  /**
   * Upload file to project with relative path and batch ID (for folder uploads)
   * POST /api/projects/{projectId}/files
   */
  async uploadFileWithBatch(projectId: string, file: File, relativePath: string, batchId: string): Promise<FileResponse> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('relative_path', relativePath);
      formData.append('import_batch_id', batchId);

      console.log(`📤 Uploading file with batch to project ${projectId}:`, {
        name: file.name,
        size: file.size,
        type: file.type,
        relativePath,
        batchId
      });

      const response = await ApiService.postFormData<FileUploadResponse>(
        `/projects/${projectId}/files`,
        formData
      );
      
      console.log('✅ File uploaded with batch successfully:', response);
      return response.file || (response as unknown as FileResponse);
    } catch (error) {
      console.error('❌ Failed to upload file with batch:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to upload file with batch');
    }
  }

  /**
   * Upload file to project root
   * POST /api/projects/{projectId}/files
   */
  async uploadFileToProject(projectId: string, file: File, batchId?: string, importBatchId?: string): Promise<FileResponse> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      // ALWAYS add batch_id if provided
      if (batchId) {
        formData.append('batch_id', batchId);
      }
      
      // Add import_batch_id if provided (for folder uploads)
      if (importBatchId) {
        formData.append('import_batch_id', importBatchId);
      }
      
      // Add relativePath if available (for folder uploads with subfolders)
      const relativePath = 'webkitRelativePath' in file ? (file as File & { webkitRelativePath: string }).webkitRelativePath : '';
      if (relativePath) {
        formData.append('relative_path', relativePath);
        console.log(`📁 Including relativePath: ${relativePath}`);
      }

      console.log(`📤 Uploading file to project ${projectId}:`, {
        name: file.name,
        size: file.size,
        type: file.type,
        relativePath: relativePath || 'root',
        batchId: batchId || 'none',
        importBatchId: importBatchId || 'none'
      });

      const response = await ApiService.postFormData<FileUploadResponse>(
        `/projects/${projectId}/files`,
        formData
      );
      
      console.log('✅ File uploaded to project successfully:', response);
      return response.file || (response as unknown as FileResponse);
    } catch (error) {
      console.error('❌ Failed to upload file to project:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to upload file to project');
    }
  }

  /**
   * Upload file to a specific folder
   * POST /api/folders/{folderId}/files
   */
  async uploadFileToFolder(folderId: string, file: File, batchId?: string, importBatchId?: string): Promise<FileResponse> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      // ALWAYS add batch_id if provided
      if (batchId) {
        formData.append('batch_id', batchId);
      }
      
      // Add import_batch_id if provided (for folder uploads)
      if (importBatchId) {
        formData.append('import_batch_id', importBatchId);
      }
      
      // Add relativePath if available (for folder uploads with subfolders)
      const relativePath = 'webkitRelativePath' in file ? (file as File & { webkitRelativePath: string }).webkitRelativePath : '';
      if (relativePath) {
        formData.append('relative_path', relativePath);
        console.log(`📁 Including relativePath: ${relativePath}`);
      }

      console.log(`📤 Uploading file to folder ${folderId}:`, {
        name: file.name,
        size: file.size,
        type: file.type,
        relativePath: relativePath || 'root',
        batchId: batchId || 'none',
        importBatchId: importBatchId || 'none'
      });

      const response = await ApiService.postFormData<FileUploadResponse>(
        `/folders/${folderId}/files`,
        formData
      );
      
      console.log('✅ File uploaded to folder successfully:', response);
      return response.file || (response as unknown as FileResponse);
    } catch (error) {
      console.error('❌ Failed to upload file to folder:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to upload file to folder');
    }
  }

  /**
   * Upload multiple files to project root
   */
  async uploadFilesToProject(projectId: string, files: FileList | File[]): Promise<FileResponse[]> {
    const fileArray = Array.from(files);
    console.log(`📤 Uploading ${fileArray.length} files to project ${projectId}`);
    const uploadPromises = fileArray.map((file, i) =>
      this.uploadFileToProject(projectId, file)
        .then(result => {
          console.log(`✅ File ${i + 1}/${fileArray.length} uploaded successfully:`, result.name);
          return result;
        })
        .catch(error => {
          console.error(`❌ Failed to upload file ${i + 1}/${fileArray.length}:`, error);
          throw new Error(`Failed to upload file "${file.name}": ${error instanceof Error ? error.message : 'Unknown error'}`);
        })
    );
    const results = await Promise.all(uploadPromises);
    console.log('✅ All files uploaded successfully');
    return results;
  }

  /**
   * Upload multiple files to a specific folder
   */
  async uploadFilesToFolder(folderId: string, files: FileList | File[]): Promise<FileResponse[]> {
    const fileArray = Array.from(files);
    console.log(`📤 Uploading ${fileArray.length} files to folder ${folderId}`);
    const uploadPromises = fileArray.map((file, i) =>
      this.uploadFileToFolder(folderId, file)
        .then(result => {
          console.log(`✅ File ${i + 1}/${fileArray.length} uploaded successfully:`, result.name);
          return result;
        })
        .catch(error => {
          console.error(`❌ Failed to upload file ${i + 1}/${fileArray.length}:`, error);
          throw new Error(`Failed to upload file "${file.name}": ${error instanceof Error ? error.message : 'Unknown error'}`);
        })
    );
    const results = await Promise.all(uploadPromises);
    console.log('✅ All files uploaded successfully');
    return results;
  }

  /**
   * List all files in a project (only root-level files, not in folders)
   * GET /api/projects/{projectId}/files
   */
  async listFilesInProject(projectId: string): Promise<FileResponse[]> {
    try {
      const response = await ApiService.get<FileResponse[] | FileListResponse>(`/projects/${projectId}/files`);
      console.log('✅ Project files fetched successfully:', response);
      
      // Handle both direct array response and wrapped response
      let files: FileResponse[] = [];
      if (Array.isArray(response)) {
        // Direct array response
        console.log('📋 Received direct array response with', response.length, 'files');
        files = response;
      } else if (response && 'files' in response) {
        // Wrapped response with files property
        console.log('📋 Received wrapped response with', response.files?.length || 0, 'files');
        files = response.files || [];
      } else {
        console.log('❌ Unexpected response format:', response);
        return [];
      }
      
      // FIXED: Only return files that don't belong to any folder (folder_id is null/undefined)
      const rootFiles = files.filter(file => !file.folder_id);
      console.log('📋 Filtered to root-level files only:', {
        totalFiles: files.length,
        rootFiles: rootFiles.length,
        filteredOut: files.length - rootFiles.length
      });
      
      return rootFiles;
    } catch (error) {
      console.error('❌ Failed to fetch project files:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to fetch project files');
    }
  }

  /**
   * List all files in a folder
   * GET /api/folders/{folderId}/files
   */
  async listFilesInFolder(folderId: string): Promise<FileResponse[]> {
    try {
      const response = await ApiService.get<FileResponse[] | FolderFileListResponse>(`/folders/${folderId}/files`);
      console.log('✅ Folder files fetched successfully:', response);
      
      // Handle both direct array response and wrapped response
      if (Array.isArray(response)) {
        // Direct array response
        console.log('📋 Received direct folder files array with', response.length, 'files');
        return response;
      } else if (response && 'files' in response) {
        // Wrapped response with files property
        console.log('📋 Received wrapped folder files response with', response.files?.length || 0, 'files');
        return response.files || [];
      } else {
        console.log('❌ Unexpected folder files response format:', response);
        return [];
      }
    } catch (error) {
      console.error('❌ Failed to fetch folder files:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to fetch folder files');
    }
  }

  /**
   * Delete a file
   * DELETE /api/files/{fileId}
   */
  async deleteFile(fileId: string): Promise<void> {
    try {
      await ApiService.delete(`/files/${fileId}`);
      console.log('✅ File deleted successfully:', fileId);
    } catch (error) {
      console.error('❌ Failed to delete file:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to delete file');
    }
  }

  /**
   * Get a single file metadata
   * GET /api/files/{fileId}
   */
  async getFile(fileId: string): Promise<FileResponse> {
    try {
      const response = await ApiService.get<FileResponse>(`/files/${fileId}`);
      console.log('✅ File metadata fetched successfully:', response);
      return response;
    } catch (error) {
      console.error('❌ Failed to fetch file metadata:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to fetch file metadata');
    }
  }

  /**
   * Download file content
   * GET /api/files/{fileId}/download
   */
  async downloadFile(fileId: string): Promise<Blob> {
    try {
      // Use a direct fetch for file downloads to handle binary content
      const response = await fetch(`${ApiService.getBaseUrl()}/files/${fileId}/download`);
      
      if (!response.ok) {
        throw new Error(`Download failed with status: ${response.status}`);
      }

      const blob = await response.blob();
      console.log('✅ File downloaded successfully:', fileId);
      return blob;
    } catch (error) {
      console.error('❌ Failed to download file:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to download file');
    }
  }

  /**
   * Convert API response to internal FileData type
   */
  convertToFileData(apiFile: FileResponse, content?: string | ArrayBuffer): FileData {
    // Handle missing type and size fields gracefully
    const fileType = apiFile.type || this.inferFileType(apiFile.name);
    const fileSize = apiFile.size || 0; // Default to 0 if size is missing
    
    console.log('🔄 Converting API file to FileData:', {
      name: apiFile.name,
      type: fileType,
      size: fileSize,
      url: apiFile.url,
      folderId: apiFile.folder_id,
      hasContent: !!content
    });

    return {
      id: apiFile.id,
      name: apiFile.name || 'unnamed-file', // Fallback for missing name
      type: fileType,
      size: fileSize,
      lastModified: new Date(apiFile.created_at).getTime(),
      content: content,
      projectId: apiFile.project_id,
      folderId: apiFile.folder_id, // Map folder_id from API to folderId
      url: apiFile.url, // Preserve the backend URL for rendering files
    };
  }

  /**
   * Infer file type from file name extension
   */
  private inferFileType(fileName: string): string {
    if (!fileName) {
      return 'application/octet-stream'; // Default fallback
    }
    
    const extension = fileName.toLowerCase().split('.').pop();
    
    switch (extension) {
      case 'pdf':
        return 'application/pdf';
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'json':
        return 'application/json';
      case 'txt':
        return 'text/plain';
      default:
        return 'application/octet-stream';
    }
  }

  /**
   * Convert API response to internal StoredFileData type
   */
  convertToStoredFileData(apiFile: FileResponse, content?: string | ArrayBuffer): StoredFileData {
    return {
      id: apiFile.id,
      name: apiFile.name,
      type: apiFile.type,
      size: apiFile.size,
      lastModified: new Date(apiFile.created_at).getTime(),
      content: content,
      projectId: apiFile.project_id,
      folderId: apiFile.folder_id, // Include folderId from API response
      storedPath: `project_${apiFile.project_id}/${apiFile.name}`,
      createdAt: apiFile.created_at,
    };
  }

  /**
   * Batch convert API responses to internal FileData types
   */
  convertToFileDataList(apiFiles: FileResponse[]): FileData[] {
    return apiFiles.map(apiFile => this.convertToFileData(apiFile));
  }

  /**
   * Batch convert API responses to internal StoredFileData types
   */
  convertToStoredFileDataList(apiFiles: FileResponse[]): StoredFileData[] {
    return apiFiles.map(apiFile => this.convertToStoredFileData(apiFile));
  }

  /**
   * Validate file before upload
   */
  validateFile(file: File, maxSize: number = 50 * 1024 * 1024): boolean { // Default 50MB
    if (!file) {
      return false;
    }

    // Check file size
    if (file.size > maxSize) {
      throw new Error(`File size (${(file.size / 1024 / 1024).toFixed(1)}MB) exceeds maximum allowed size (${maxSize / 1024 / 1024}MB)`);
    }

    // Check file name
    if (!file.name || file.name.trim().length === 0) {
      throw new Error('File name cannot be empty');
    }

    // Basic file type validation (you can extend this)
    const allowedTypes = [
      'application/pdf',
      'application/json',
      'text/plain',
      'image/png',
      'image/jpeg',
      'image/jpg',
    ];

    if (!allowedTypes.includes(file.type) && !file.name.toLowerCase().endsWith('.json')) {
      throw new Error(`File type "${file.type}" is not allowed`);
    }

    return true;
  }

  /**
   * Batch validate files
   */
  validateFiles(files: FileList | File[], maxSize?: number): boolean {
    const fileArray = Array.from(files);
    
    if (fileArray.length === 0) {
      throw new Error('No files provided for upload');
    }

    for (let i = 0; i < fileArray.length; i++) {
      try {
        this.validateFile(fileArray[i], maxSize);
      } catch (error) {
        throw new Error(`File "${fileArray[i].name}": ${error instanceof Error ? error.message : 'Validation failed'}`);
      }
    }

    return true;
  }

  /**
   * Get file processing status from MongoDB
   * GET /api/files/{fileId}/status
   */
  async getFileStatus(fileId: string): Promise<{ file_id: string; status: string; message: string }> {
    try {
      console.log(`🔍 Getting status for file ${fileId}`);
      
      const response = await ApiService.get<{ file_id: string; status: string; message: string }>(`/files/${fileId}/status`);
      
      console.log('✅ File status retrieved successfully:', response);
      return response;
    } catch (error) {
      console.error('❌ Failed to get file status:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to get file status');
    }
  }

  /**
   * Get extraction results for a file
   * GET /api/files/{fileId}/extraction
   */
  async getFileExtraction(fileId: string): Promise<FileExtraction> {
    try {
      console.log(`📋 Getting extraction for file ${fileId}`);
      
      const response = await ApiService.get<FileExtraction>(`/files/${fileId}/extraction`);
      
      console.log('✅ File extraction retrieved successfully:', response);
      return response;
    } catch (error) {
      console.error('❌ Failed to get file extraction:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to get file extraction');
    }
  }
}

// Export singleton instance
export const FileApiService = new FileApiServiceClass();
