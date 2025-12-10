import type { FileData } from '../types';

export class FileUploadService {
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
}