import type { FileData, JsonData } from '../types';

export interface StoredFileData extends FileData {
  storedPath: string;
  createdAt: string;
  hasImages?: boolean;
  hasAssociatedJson?: boolean;
}

interface ProjectStorage {
  files: StoredFileData[];
  lastModified: string;
  version: string;
}

export class StorageService {
  private static readonly STORAGE_KEY = 'docai-project-storage';
  private static readonly STORAGE_VERSION = '1.0.0';
  
  // Storage limits (conservative estimates for LocalStorage)
  private static readonly MAX_ITEM_SIZE = 2 * 1024 * 1024; // 2MB per item
  private static readonly MAX_TOTAL_STORAGE = 4 * 1024 * 1024; // 4MB total
  
  // Calculate current storage usage
  static getStorageUsage(): { used: number; total: number; percentage: number } {
    let used = 0;
    try {
      for (const key in localStorage) {
        if (Object.prototype.hasOwnProperty.call(localStorage, key) && key.startsWith('docai-')) {
          used += localStorage.getItem(key)?.length || 0;
        }
      }
    } catch (error) {
      console.warn('Could not calculate storage usage:', error);
    }
    
    const total = this.MAX_TOTAL_STORAGE;
    const percentage = (used / total) * 100;
    
    return { used, total, percentage };
  }
  
  // Clean up old storage entries when quota is exceeded
  static cleanupOldEntries(): void {
    console.log('🧹 Starting storage cleanup...');
    const usage = this.getStorageUsage();
    
    if (usage.percentage < 80) {
      console.log('✅ Storage usage acceptable:', usage.percentage.toFixed(1) + '%');
      return;
    }
    
    console.log('⚠️ Storage usage high:', usage.percentage.toFixed(1) + '%, cleaning up...');
    
    // Get all DocAI storage keys with timestamps
    const storageEntries: Array<{ key: string; timestamp: number; size: number }> = [];
    
    try {
      for (const key in localStorage) {
        if (Object.prototype.hasOwnProperty.call(localStorage, key) && key.startsWith('docai-')) {
          const value = localStorage.getItem(key);
          if (value) {
            let timestamp = Date.now(); // Default to now if no timestamp found
            
            // Try to extract timestamp from metadata or use file creation pattern
            if (key.includes('meta-')) {
              try {
                const meta = JSON.parse(value);
                timestamp = meta.createdAt ? new Date(meta.createdAt).getTime() : timestamp;
              } catch (e) {
                // Ignore parse errors
              }
            }
            
            storageEntries.push({
              key,
              timestamp,
              size: value.length
            });
          }
        }
      }
      
      // Sort by timestamp (oldest first) and remove until usage is acceptable
      storageEntries.sort((a, b) => a.timestamp - b.timestamp);
      
      let currentUsage = usage.used;
      let removedCount = 0;
      
      for (const entry of storageEntries) {
        if (currentUsage / this.MAX_TOTAL_STORAGE < 0.7) { // Target 70% usage
          break;
        }
        
        try {
          localStorage.removeItem(entry.key);
          currentUsage -= entry.size;
          removedCount++;
          console.log('🗑️ Removed old storage entry:', entry.key);
        } catch (error) {
          console.warn('Failed to remove storage entry:', entry.key, error);
        }
      }
      
      console.log(`✅ Cleanup complete. Removed ${removedCount} entries. New usage: ${((currentUsage / this.MAX_TOTAL_STORAGE) * 100).toFixed(1)}%`);
      
    } catch (error) {
      console.error('❌ Storage cleanup failed:', error);
    }
  }

  // Get detailed storage breakdown for debugging
  static getStorageBreakdown(): { [key: string]: { size: number; percentage: number } } {
    const breakdown: { [key: string]: { size: number; percentage: number } } = {};
    let totalSize = 0;

    try {
      for (const key in localStorage) {
        if (Object.prototype.hasOwnProperty.call(localStorage, key) && key.startsWith('docai-')) {
          const value = localStorage.getItem(key);
          const size = value?.length || 0;
          
          let category = 'other';
          if (key.includes('docai-file-')) category = 'files';
          else if (key.includes('docai-images-')) category = 'images';
          else if (key.includes('docai-json-')) category = 'json';
          else if (key.includes('docai-meta-')) category = 'metadata';
          else if (key === this.STORAGE_KEY) category = 'project-storage';

          if (!breakdown[category]) {
            breakdown[category] = { size: 0, percentage: 0 };
          }
          
          breakdown[category].size += size;
          totalSize += size;
        }
      }

      // Calculate percentages
      for (const category in breakdown) {
        breakdown[category].percentage = totalSize > 0 ? (breakdown[category].size / totalSize) * 100 : 0;
      }

    } catch (error) {
      console.warn('Could not generate storage breakdown:', error);
    }

    return breakdown;
  }



  // Get project storage from localStorage
  static getProjectStorage(): ProjectStorage {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as ProjectStorage;
        return parsed;
      }
    } catch (error) {
      console.warn('Failed to load project storage:', error);
    }
    
    return {
      files: [],
      lastModified: new Date().toISOString(),
      version: this.STORAGE_VERSION
    };
  }

  // Save project storage to localStorage
  static saveProjectStorage(storage: ProjectStorage): void {
    try {
      storage.lastModified = new Date().toISOString();
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(storage));
    } catch (error) {
      console.error('Failed to save project storage:', error);
    }
  }

  // Add a file to storage
  static addFileToStorage(fileData: FileData): StoredFileData {
    const storage = this.getProjectStorage();
    
    const storedFile: StoredFileData = {
      ...fileData,
      storedPath: this.generateStoragePath(fileData),
      createdAt: new Date().toISOString(),
      hasImages: false,
      hasAssociatedJson: false
    };

    // Check if file already exists (by name and size)
    const existingIndex = storage.files.findIndex(
      f => f.name === fileData.name && f.size === fileData.size
    );

    if (existingIndex >= 0) {
      storage.files[existingIndex] = storedFile;
    } else {
      storage.files.push(storedFile);
    }

    this.saveProjectStorage(storage);
    return storedFile;
  }

  // Remove a file from storage
  static removeFileFromStorage(fileId: string): void {
    const storage = this.getProjectStorage();
    storage.files = storage.files.filter(f => f.id !== fileId);
    this.saveProjectStorage(storage);
  }

  // Update file metadata
  static updateFileMetadata(fileId: string, updates: Partial<StoredFileData>): void {
    const storage = this.getProjectStorage();
    const fileIndex = storage.files.findIndex(f => f.id === fileId);
    
    if (fileIndex >= 0) {
      storage.files[fileIndex] = { ...storage.files[fileIndex], ...updates };
      this.saveProjectStorage(storage);
    }
  }

  // Generate storage path for a file
  private static generateStoragePath(fileData: FileData): string {
    const sanitizedName = fileData.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const timestamp = Date.now();
    return `stored_files/${timestamp}_${sanitizedName}`;
  }

  // Store file content in localStorage with improved quota management
  static storeFileContent(fileId: string, content: string | ArrayBuffer): boolean {
    const contentKey = `docai-file-${fileId}`;
    const metaKey = `docai-meta-${fileId}`;
    let storedContent: string = '';
    let contentType: 'string' | 'arrayBuffer' = 'string';
    
    try {

      if (content instanceof ArrayBuffer) {
        contentType = 'arrayBuffer';
        // Check size before conversion to prevent memory issues
        if (content.byteLength > this.MAX_ITEM_SIZE) {
          console.warn('📦 ArrayBuffer too large for localStorage storage:', {
            fileSize: content.byteLength,
            maxSize: this.MAX_ITEM_SIZE,
            fileSizeMB: (content.byteLength / 1024 / 1024).toFixed(2) + 'MB'
          });
          return false;
        }
        
        // Convert ArrayBuffer to base64 for storage (safer method)
        try {
          const bytes = new Uint8Array(content);
          const chunkSize = 8192; // Process in smaller chunks
          let binaryString = '';
          
          for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.slice(i, i + chunkSize);
            binaryString += String.fromCharCode.apply(null, Array.from(chunk));
          }
          
          storedContent = btoa(binaryString);
        } catch (conversionError) {
          console.error('📛 Failed to convert ArrayBuffer to base64:', conversionError);
          return false;
        }
      } else {
        contentType = 'string';
        storedContent = content;
      }

      // Check if content is too large for our limits
      if (storedContent.length > this.MAX_ITEM_SIZE) {
        console.warn('📦 Content too large for localStorage storage:', {
          contentSize: storedContent.length,
          maxSize: this.MAX_ITEM_SIZE,
          contentSizeMB: (storedContent.length / 1024 / 1024).toFixed(2) + 'MB'
        });
        return false;
      }

      // Check current storage usage and cleanup if necessary
      const usage = this.getStorageUsage();
      const metadata = { 
        contentType, 
        createdAt: new Date().toISOString(),
        size: storedContent.length 
      };
      const estimatedNewSize = storedContent.length + JSON.stringify(metadata).length;
      
      if (usage.used + estimatedNewSize > this.MAX_TOTAL_STORAGE) {
        console.warn('💾 Storage quota would be exceeded, attempting cleanup...', {
          currentUsage: usage.used,
          newContent: estimatedNewSize,
          total: this.MAX_TOTAL_STORAGE,
          usagePercentage: usage.percentage.toFixed(1) + '%'
        });
        
        this.cleanupOldEntries();
        
        // Check again after cleanup
        const newUsage = this.getStorageUsage();
        if (newUsage.used + estimatedNewSize > this.MAX_TOTAL_STORAGE) {
          console.warn('💾 Still insufficient storage after cleanup, skipping content storage:', {
            usageAfterCleanup: newUsage.percentage.toFixed(1) + '%'
          });
          return false;
        }
      }

      // Store content and metadata with timestamp
      localStorage.setItem(contentKey, storedContent);
      localStorage.setItem(metaKey, JSON.stringify(metadata));
      
      console.log('💾 File content stored successfully:', {
        fileId,
        size: (storedContent.length / 1024).toFixed(1) + 'KB',
        storageUsage: this.getStorageUsage().percentage.toFixed(1) + '%'
      });
      
      return true;
    } catch (error) {
      console.error('📛 Failed to store file content:', error);
      
      // Handle quota exceeded error specifically
      if (error instanceof DOMException && error.code === DOMException.QUOTA_EXCEEDED_ERR) {
        console.warn('💾 Storage quota exceeded, attempting cleanup and retry...');
        this.cleanupOldEntries();
        
        // Try one more time after cleanup with minimal metadata
        try {
          const minimalMeta = { 
            contentType: contentType, 
            createdAt: new Date().toISOString() 
          };
          localStorage.setItem(contentKey, storedContent);
          localStorage.setItem(metaKey, JSON.stringify(minimalMeta));
          console.log('✅ File stored successfully after cleanup');
          return true;
        } catch {
          console.warn('💾 Still unable to store after cleanup, continuing without localStorage cache');
        }
      }
      
      // Clear the problematic keys if they exist
      try {
        localStorage.removeItem(contentKey);
        localStorage.removeItem(metaKey);
      } catch {
        console.warn('Failed to cleanup storage keys for:', fileId);
      }
      return false;
    }
  }

  // Retrieve file content from localStorage
  static getFileContent(fileId: string): string | ArrayBuffer | null {
    try {
      const contentKey = `docai-file-${fileId}`;
      const metaKey = `docai-meta-${fileId}`;
      const stored = localStorage.getItem(contentKey);
      const metaStored = localStorage.getItem(metaKey);
      
      if (!stored) return null;

      // Check if we have metadata to determine content type
      if (metaStored) {
        try {
          const meta = JSON.parse(metaStored);
          if (meta.contentType === 'string') {
            return stored;
          } else if (meta.contentType === 'arrayBuffer') {
            // Decode base64 to ArrayBuffer
            const decoded = atob(stored);
            const bytes = new Uint8Array(decoded.length);
            for (let i = 0; i < decoded.length; i++) {
              bytes[i] = decoded.charCodeAt(i);
            }
            return bytes.buffer;
          }
        } catch {
          console.warn('Failed to parse content metadata, falling back to auto-detection');
        }
      }

      // Fallback: Try to determine if it's base64 encoded ArrayBuffer (legacy)
      try {
        const decoded = atob(stored);
        const bytes = new Uint8Array(decoded.length);
        for (let i = 0; i < decoded.length; i++) {
          bytes[i] = decoded.charCodeAt(i);
        }
        return bytes.buffer;
      } catch {
        // Not base64, return as string
        return stored;
      }
    } catch (error) {
      console.error('Failed to retrieve file content:', error);
      return null;
    }
  }

  // Store PDF images with improved quota management
  static storePdfImages(fileId: string, images: string[]): void {
    try {
      const imagesKey = `docai-images-${fileId}`;
      const imagesData = JSON.stringify(images);
      
      // Check if images data is too large
      if (imagesData.length > this.MAX_ITEM_SIZE) {
        console.warn('🖼️ PDF images too large for localStorage storage:', {
          imagesSize: imagesData.length,
          maxSize: this.MAX_ITEM_SIZE,
          imagesSizeMB: (imagesData.length / 1024 / 1024).toFixed(2) + 'MB',
          imageCount: images.length
        });
        this.updateFileMetadata(fileId, { hasImages: false });
        return;
      }

      // Check current storage usage and cleanup if necessary
      const usage = this.getStorageUsage();
      if (usage.used + imagesData.length > this.MAX_TOTAL_STORAGE) {
        console.warn('🖼️ Storage quota would be exceeded by PDF images, attempting cleanup...', {
          currentUsage: usage.used,
          imagesSize: imagesData.length,
          total: this.MAX_TOTAL_STORAGE,
          usagePercentage: usage.percentage.toFixed(1) + '%'
        });
        
        this.cleanupOldEntries();
        
        // Check again after cleanup
        const newUsage = this.getStorageUsage();
        if (newUsage.used + imagesData.length > this.MAX_TOTAL_STORAGE) {
          console.warn('🖼️ Still insufficient storage for PDF images after cleanup:', {
            usageAfterCleanup: newUsage.percentage.toFixed(1) + '%'
          });
          this.updateFileMetadata(fileId, { hasImages: false });
          return;
        }
      }
      
      localStorage.setItem(imagesKey, imagesData);
      
      console.log('🖼️ PDF images stored successfully:', {
        fileId,
        imageCount: images.length,
        size: (imagesData.length / 1024).toFixed(1) + 'KB',
        storageUsage: this.getStorageUsage().percentage.toFixed(1) + '%'
      });
      
      // Update file metadata
      this.updateFileMetadata(fileId, { hasImages: true });
    } catch (error) {
      console.error('📛 Failed to store PDF images:', error);
      if (error instanceof DOMException && error.code === DOMException.QUOTA_EXCEEDED_ERR) {
        console.warn('🖼️ PDF images storage quota exceeded, attempting cleanup and retry...');
        this.cleanupOldEntries();
        
        // Try one more time after cleanup
        try {
          localStorage.setItem(`docai-images-${fileId}`, JSON.stringify(images));
          this.updateFileMetadata(fileId, { hasImages: true });
          console.log('✅ PDF images stored successfully after cleanup');
        } catch {
          console.warn('🖼️ Still unable to store PDF images after cleanup, continuing without localStorage cache');
          this.updateFileMetadata(fileId, { hasImages: false });
        }
      } else {
        // Still try to update metadata without images for other errors
        try {
          this.updateFileMetadata(fileId, { hasImages: false });
        } catch {
          console.warn('Could not update file metadata either');
        }
      }
    }
  }

  // Retrieve PDF images
  static getPdfImages(fileId: string): string[] | null {
    try {
      const imagesKey = `docai-images-${fileId}`;
      const stored = localStorage.getItem(imagesKey);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('Failed to retrieve PDF images:', error);
      return null;
    }
  }

  // Store associated JSON for a PDF
  static storeAssociatedJson(pdfFileId: string, jsonData: JsonData): void {
    try {
      const jsonKey = `docai-json-${pdfFileId}`;
      localStorage.setItem(jsonKey, JSON.stringify(jsonData));
      
      // Update file metadata
      this.updateFileMetadata(pdfFileId, { hasAssociatedJson: true });
    } catch (error) {
      console.error('Failed to store associated JSON:', error);
      if (error instanceof DOMException && error.code === DOMException.QUOTA_EXCEEDED_ERR) {
        console.warn('⚠️ Associated JSON storage quota exceeded, continuing without localStorage cache');
        try {
          this.updateFileMetadata(pdfFileId, { hasAssociatedJson: false });
        } catch {
          console.warn('Could not update file metadata either');
        }
      }
    }
  }

  // Retrieve associated JSON for a PDF
  static getAssociatedJson(pdfFileId: string): JsonData | null {
    try {
      const jsonKey = `docai-json-${pdfFileId}`;
      const stored = localStorage.getItem(jsonKey);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('Failed to retrieve associated JSON:', error);
      return null;
    }
  }

  // Clear all storage
  static clearAllStorage(): void {
    try {
      // Remove main storage
      localStorage.removeItem(this.STORAGE_KEY);
      
      // Remove all file contents and images
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith('docai-')) {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.error('Failed to clear storage:', error);
    }
  }

  // Get storage size info
  static getStorageInfo(): { used: number; available: number; files: number } {
    let used = 0;
    let files = 0;
    
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith('docai-')) {
          const item = localStorage.getItem(key);
          used += item ? item.length * 2 : 0; // Rough estimate (UTF-16)
          if (key.startsWith('docai-file-')) files++;
        }
      });
    } catch (error) {
      console.error('Failed to calculate storage info:', error);
    }

    return {
      used: Math.round(used / 1024 / 1024 * 100) / 100, // MB
      available: 10, // Estimate 10MB total
      files
    };
  }
}