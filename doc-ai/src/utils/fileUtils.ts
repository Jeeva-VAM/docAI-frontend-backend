// Utility functions for file handling and ArrayBuffer operations

export class FileUtils {
  /**
   * Create a deep copy of an ArrayBuffer to prevent detachment issues
   */
  static cloneArrayBuffer(buffer: ArrayBuffer): ArrayBuffer {
    const cloned = new ArrayBuffer(buffer.byteLength);
    new Uint8Array(cloned).set(new Uint8Array(buffer));
    return cloned;
  }

  /**
   * Check if an ArrayBuffer is detached (transferred or neutered)
   */
  static isArrayBufferDetached(buffer: ArrayBuffer): boolean {
    try {
      // Try to create a view - this will throw if the buffer is detached
      new Uint8Array(buffer, 0, 1);
      return false;
    } catch (error) {
      return true;
    }
  }

  /**
   * Safely access ArrayBuffer content with automatic cloning if needed
   */
  static getSafeArrayBuffer(buffer: ArrayBuffer): ArrayBuffer {
    if (this.isArrayBufferDetached(buffer)) {
      throw new Error('ArrayBuffer is detached and cannot be recovered');
    }
    return this.cloneArrayBuffer(buffer);
  }

  /**
   * Format file size in human readable format
   */
  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Validate file type
   */
  static isValidFileType(file: File, allowedTypes: string[]): boolean {
    return allowedTypes.some(type => {
      if (type.startsWith('.')) {
        return file.name.toLowerCase().endsWith(type.toLowerCase());
      }
      return file.type === type || file.type.includes(type);
    });
  }

  /**
   * Get file extension from filename
   */
  static getFileExtension(filename: string): string {
    return filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2).toLowerCase();
  }

  /**
   * Generate a unique file ID
   */
  static generateFileId(): string {
    return `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate a deterministic file ID based on file content
   * This ensures the same file gets the same ID across sessions
   */
  static generateDeterministicFileId(file: File): string {
    // Use file name, size, and lastModified to create a deterministic ID
    const key = `${file.name}_${file.size}_${file.lastModified}`;
    // Simple hash function to create a shorter ID
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `file_${Math.abs(hash).toString(36)}`;
  }

  /**
   * Safely convert ArrayBuffer to base64 with chunking
   */
  static arrayBufferToBase64(buffer: ArrayBuffer): string {
    try {
      const bytes = new Uint8Array(buffer);
      const chunkSize = 8192; // Process in 8KB chunks
      let binaryString = '';
      
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.slice(i, i + chunkSize);
        binaryString += String.fromCharCode.apply(null, Array.from(chunk));
      }
      
      return btoa(binaryString);
    } catch (error) {
      console.error('Failed to convert ArrayBuffer to base64:', error);
      throw new Error('ArrayBuffer conversion failed');
    }
  }

  /**
   * Convert base64 back to ArrayBuffer
   */
  static base64ToArrayBuffer(base64: string): ArrayBuffer {
    try {
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      return bytes.buffer;
    } catch (error) {
      console.error('Failed to convert base64 to ArrayBuffer:', error);
      throw new Error('Base64 conversion failed');
    }
  }
}