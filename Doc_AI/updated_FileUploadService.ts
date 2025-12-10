import type { FileData } from '../types';

export class FileUploadService {
  // Your existing methods...
  static generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  static async processFile(file: File): Promise<FileData> {
    return new Promise((resolve, reject) => {
      // Validate that we have a proper File object
      if (!file || !(file instanceof File)) {
        reject(new Error('Invalid file object - not an instance of File'));
        return;
      }

      // Additional validation
      if (!file.name || typeof file.size !== 'number') {
        reject(new Error('Invalid file object - missing required properties'));
        return;
      }

      const reader = new FileReader();
      
      reader.onload = (event) => {
        const fileData: FileData = {
          id: this.generateId(),
          name: file.name,
          type: file.type,
          size: file.size,
          content: event.target?.result || undefined,
          lastModified: file.lastModified,
          file: file, // Store original file object for operations that need fresh content
        };
        resolve(fileData);
      };
      
      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };

      try {
        if (file.type === 'application/pdf') {
          reader.readAsArrayBuffer(file);
        } else if (file.type === 'application/json' || file.name.endsWith('.json')) {
          reader.readAsText(file);
        } else {
          reader.readAsDataURL(file);
        }
      } catch (error) {
        reject(new Error(`Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    });
  }

  static validateFile(file: File): { isValid: boolean; error?: string } {
    const maxSize = 50 * 1024 * 1024; // 50MB
    const allowedTypes = ['application/pdf', 'application/json', 'text/plain'];
    const allowedExtensions = ['.pdf', '.json', '.txt'];
    
    console.log('Validating file:', {
      name: file.name,
      type: file.type,
      size: file.size,
      sizeInMB: (file.size / 1024 / 1024).toFixed(2) + 'MB'
    });
    
    if (file.size > maxSize) {
      const error = `File size (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds 50MB limit`;
      console.error('File validation failed:', error);
      return { isValid: false, error };
    }
    
    const hasValidType = allowedTypes.includes(file.type);
    const hasValidExtension = allowedExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
    
    if (!hasValidType && !hasValidExtension) {
      const error = `File type "${file.type}" and extension not supported. Only PDF, JSON, and TXT files are allowed.`;
      console.error('File validation failed:', error);
      return { isValid: false, error };
    }
    
    console.log('File validation passed');
    return { isValid: true };
  }

  // 🆕 ADD THIS: Backend Upload Methods
  static async uploadToProject(projectId: string, file: File): Promise<any> {
    console.log(`🚀 Uploading ${file.name} to project ${projectId}`);
    
    // Validate file first
    const validation = this.validateFile(file);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    // Create FormData
    const formData = new FormData();
    formData.append('file', file);  // 🔑 Key must be 'file'

    try {
      const response = await fetch(`http://localhost:8000/api/projects/${projectId}/files`, {
        method: 'POST',
        body: formData  // 🔑 No Content-Type header - browser sets it automatically
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Upload failed: ${response.status} ${response.statusText} - ${errorData}`);
      }

      const result = await response.json();
      console.log('✅ File uploaded successfully:', result);
      return result;

    } catch (error) {
      console.error('❌ Upload error:', error);
      throw error;
    }
  }

  static async uploadToFolder(folderId: string, file: File): Promise<any> {
    console.log(`🚀 Uploading ${file.name} to folder ${folderId}`);
    
    // Validate file first
    const validation = this.validateFile(file);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    // Create FormData
    const formData = new FormData();
    formData.append('file', file);  // 🔑 Key must be 'file'

    try {
      const response = await fetch(`http://localhost:8000/api/folders/${folderId}/files`, {
        method: 'POST',
        body: formData  // 🔑 No Content-Type header - browser sets it automatically
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Upload failed: ${response.status} ${response.statusText} - ${errorData}`);
      }

      const result = await response.json();
      console.log('✅ File uploaded successfully:', result);
      return result;

    } catch (error) {
      console.error('❌ Upload error:', error);
      throw error;
    }
  }

  // 🆕 Combined method: Process + Upload
  static async processAndUploadToProject(projectId: string, file: File): Promise<{ fileData: FileData; uploadResult: any }> {
    try {
      // Process file locally
      const fileData = await this.processFile(file);
      
      // Upload to backend
      const uploadResult = await this.uploadToProject(projectId, file);
      
      return { fileData, uploadResult };
    } catch (error) {
      console.error('❌ Process and upload failed:', error);
      throw error;
    }
  }

  static async processAndUploadToFolder(folderId: string, file: File): Promise<{ fileData: FileData; uploadResult: any }> {
    try {
      // Process file locally
      const fileData = await this.processFile(file);
      
      // Upload to backend
      const uploadResult = await this.uploadToFolder(folderId, file);
      
      return { fileData, uploadResult };
    } catch (error) {
      console.error('❌ Process and upload failed:', error);
      throw error;
    }
  }
}
