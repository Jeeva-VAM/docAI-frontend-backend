import type { FileData, JsonData } from '../types';

export interface StoredFileData extends FileData {
  projectId: string;
  storedAt: string;
  hasImages?: boolean;
  hasAssociatedJson?: boolean;
  associatedJsonFileId?: string; // Reference to automatically uploaded JSON file
  folderId?: string; // If undefined, it's a root file. If set, it's a folder file
  folderPath?: string; // Optional: for nested folder support in future
}

export interface StoredPdfImages {
  fileId: string;
  projectId: string;
  images: string[];
  storedAt: string;
}

export interface StoredJsonData {
  fileId: string;
  projectId: string;
  jsonData: JsonData;
  storedAt: string;
  // Add content-based identifier for lookup even with new file IDs
  contentHash: string;
  fileName: string;
  fileSize: number;
}

export interface ComparisonFile {
  id: string;
  projectId: string;
  pageType: 'BA' | 'QA'; // Which page uploaded it
  fileData: FileData;
  storedAt: string;
}

export class IndexedDBService {
  private static readonly DB_NAME = 'DocAIDatabase';
  private static readonly DB_VERSION = 1;
  private static db: IDBDatabase | null = null;
  private static initializationPromise: Promise<void> | null = null;

  // Object store names
  private static readonly STORES = {
    FILES: 'files',
    PDF_IMAGES: 'pdfImages',
    JSON_DATA: 'jsonData',
    COMPARISON_FILES: 'comparisonFiles',
    PROJECTS: 'projects'
  };

  // Generate a simple hash from file content for lookup
  private static generateContentHash(fileName: string, fileSize: number, lastModified: number): string {
    const key = `${fileName}_${fileSize}_${lastModified}`;
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  // Initialize IndexedDB
  static async initialize(): Promise<void> {
    // Return existing promise if initialization is in progress
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // If already initialized, don't do it again
    if (this.db) {
      console.log('✅ IndexedDB already initialized');
      return Promise.resolve();
    }
    
    // Create and store the initialization promise
    this.initializationPromise = new Promise((resolve, reject) => {
      console.log('🔄 Opening IndexedDB...');
      
      if (!window.indexedDB) {
        const error = new Error('IndexedDB is not supported in this browser');
        console.error('❌ IndexedDB not supported');
        reject(error);
        return;
      }
      
      // Add timeout to prevent hanging
      const timeout = setTimeout(() => {
        console.error('❌ IndexedDB initialization timeout');
        this.initializationPromise = null; // Reset on timeout
        reject(new Error('IndexedDB initialization timeout'));
      }, 15000); // Increased to 15 seconds
      
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onerror = () => {
        clearTimeout(timeout);
        this.initializationPromise = null; // Reset on error
        console.error('❌ Failed to open IndexedDB:', request.error);
        reject(request.error || new Error('Unknown IndexedDB error'));
      };

      request.onsuccess = (event) => {
        clearTimeout(timeout);
        this.db = (event.target as IDBOpenDBRequest).result;
        console.log('✅ IndexedDB initialized successfully');
        
        // Add error handler to the database
        this.db.onerror = (event) => {
          console.error('IndexedDB database error:', event);
        };
        
        resolve();
      };

      request.onupgradeneeded = (event) => {
        console.log('🔄 IndexedDB upgrade needed, creating stores...');
        const db = (event.target as IDBOpenDBRequest).result;
        
        try {
          // Create files store
          if (!db.objectStoreNames.contains(this.STORES.FILES)) {
            const filesStore = db.createObjectStore(this.STORES.FILES, { keyPath: 'id' });
            filesStore.createIndex('projectId', 'projectId', { unique: false });
            filesStore.createIndex('name', 'name', { unique: false });
          }

          // Create PDF images store
          if (!db.objectStoreNames.contains(this.STORES.PDF_IMAGES)) {
            const imagesStore = db.createObjectStore(this.STORES.PDF_IMAGES, { keyPath: 'fileId' });
            imagesStore.createIndex('projectId', 'projectId', { unique: false });
          }

          // Create JSON data store
          if (!db.objectStoreNames.contains(this.STORES.JSON_DATA)) {
            const jsonStore = db.createObjectStore(this.STORES.JSON_DATA, { keyPath: 'fileId' });
            jsonStore.createIndex('projectId', 'projectId', { unique: false });
            jsonStore.createIndex('contentHash', 'contentHash', { unique: false });
          }

          // Create comparison files store
          if (!db.objectStoreNames.contains(this.STORES.COMPARISON_FILES)) {
            const comparisonStore = db.createObjectStore(this.STORES.COMPARISON_FILES, { keyPath: 'id' });
            comparisonStore.createIndex('projectId', 'projectId', { unique: false });
            comparisonStore.createIndex('pageType', 'pageType', { unique: false });
          }

          // Create projects store
          if (!db.objectStoreNames.contains(this.STORES.PROJECTS)) {
            db.createObjectStore(this.STORES.PROJECTS, { keyPath: 'id' });
          }
          
          console.log('✅ IndexedDB stores created/updated successfully');
        } catch (error) {
          console.error('❌ Error creating IndexedDB stores:', error);
          clearTimeout(timeout);
          reject(error);
        }
      };

      request.onblocked = () => {
        console.warn('⚠️ IndexedDB upgrade blocked - please close other tabs');
      };
    });

    return this.initializationPromise;
  }

  // Ensure DB is initialized
  private static async ensureDB(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.initialize();
    }
    if (!this.db) {
      throw new Error('Failed to initialize IndexedDB');
    }
    return this.db;
  }

  // Store a file
  static async storeFile(fileData: FileData, projectId: string, folderId?: string): Promise<StoredFileData> {
    const db = await this.ensureDB();
    
    const storedFile: StoredFileData = {
      ...fileData,
      projectId,
      storedAt: new Date().toISOString(),
      hasImages: false,
      hasAssociatedJson: false,
      folderId: folderId || undefined // Store folder association
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.STORES.FILES], 'readwrite');
      const store = transaction.objectStore(this.STORES.FILES);
      
      const request = store.put(storedFile);
      
      request.onsuccess = () => {
        console.log('File stored successfully:', fileData.name, folderId ? `in folder: ${folderId}` : 'in root');
        resolve(storedFile);
      };
      
      request.onerror = () => {
        console.error('Failed to store file:', request.error);
        reject(request.error);
      };
    });
  }

  // Get all files for a project
  static async getProjectFiles(projectId: string): Promise<StoredFileData[]> {
    const db = await this.ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.STORES.FILES], 'readonly');
      const store = transaction.objectStore(this.STORES.FILES);
      const index = store.index('projectId');
      
      const request = index.getAll(projectId);
      
      request.onsuccess = () => {
        resolve(request.result || []);
      };
      
      request.onerror = () => {
        console.error('Failed to get project files:', request.error);
        reject(request.error);
      };
    });
  }

  // Get only root files for a project (files without folderId)
  static async getProjectRootFiles(projectId: string): Promise<StoredFileData[]> {
    const allFiles = await this.getProjectFiles(projectId);
    return allFiles.filter(file => !file.folderId);
  }

  // Get files for a specific folder
  static async getFolderFiles(projectId: string, folderId: string): Promise<StoredFileData[]> {
    const allFiles = await this.getProjectFiles(projectId);
    return allFiles.filter(file => file.folderId === folderId);
  }

  // Store PDF images
  static async storePdfImages(fileId: string, projectId: string, images: string[]): Promise<void> {
    const db = await this.ensureDB();
    
    const imageData: StoredPdfImages = {
      fileId,
      projectId,
      images,
      storedAt: new Date().toISOString()
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.STORES.PDF_IMAGES, this.STORES.FILES], 'readwrite');
      
      // Store images
      const imagesStore = transaction.objectStore(this.STORES.PDF_IMAGES);
      const imagesRequest = imagesStore.put(imageData);
      
      // Update file metadata
      const filesStore = transaction.objectStore(this.STORES.FILES);
      const fileRequest = filesStore.get(fileId);
      
      fileRequest.onsuccess = () => {
        const file = fileRequest.result;
        if (file) {
          file.hasImages = true;
          filesStore.put(file);
        }
      };
      
      imagesRequest.onsuccess = () => {
        console.log('PDF images stored successfully for file:', fileId);
        resolve();
      };
      
      imagesRequest.onerror = () => {
        console.error('Failed to store PDF images:', imagesRequest.error);
        reject(imagesRequest.error);
      };
    });
  }

  // Get PDF images
  static async getPdfImages(fileId: string): Promise<string[] | null> {
    const db = await this.ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.STORES.PDF_IMAGES], 'readonly');
      const store = transaction.objectStore(this.STORES.PDF_IMAGES);
      
      const request = store.get(fileId);
      
      request.onsuccess = () => {
        const result = request.result as StoredPdfImages | undefined;
        resolve(result ? result.images : null);
      };
      
      request.onerror = () => {
        console.error('Failed to get PDF images:', request.error);
        reject(request.error);
      };
    });
  }

  // Store JSON data with content-based lookup
  static async storeJsonData(
    fileId: string, 
    projectId: string, 
    jsonData: JsonData, 
    fileName: string, 
    fileSize: number, 
    lastModified: number
  ): Promise<void> {
    const db = await this.ensureDB();
    
    const contentHash = this.generateContentHash(fileName, fileSize, lastModified);
    
    const storedJson: StoredJsonData = {
      fileId,
      projectId,
      jsonData,
      storedAt: new Date().toISOString(),
      contentHash,
      fileName,
      fileSize
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.STORES.JSON_DATA, this.STORES.FILES], 'readwrite');
      
      // Store JSON data
      const jsonStore = transaction.objectStore(this.STORES.JSON_DATA);
      const jsonRequest = jsonStore.put(storedJson);
      
      // Update file metadata
      const filesStore = transaction.objectStore(this.STORES.FILES);
      const fileRequest = filesStore.get(fileId);
      
      fileRequest.onsuccess = () => {
        const file = fileRequest.result;
        if (file) {
          file.hasAssociatedJson = true;
          filesStore.put(file);
        }
      };
      
      jsonRequest.onsuccess = () => {
        console.log('JSON data stored successfully for file:', fileId);
        resolve();
      };
      
      jsonRequest.onerror = () => {
        console.error('Failed to store JSON data:', jsonRequest.error);
        reject(jsonRequest.error);
      };
    });
  }

  // Get JSON data
  static async getJsonData(fileId: string): Promise<JsonData | null> {
    const db = await this.ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.STORES.JSON_DATA], 'readonly');
      const store = transaction.objectStore(this.STORES.JSON_DATA);
      
      const request = store.get(fileId);
      
      request.onsuccess = () => {
        const result = request.result as StoredJsonData | undefined;
        resolve(result ? result.jsonData : null);
      };
      
      request.onerror = () => {
        console.error('Failed to get JSON data:', request.error);
        reject(request.error);
      };
    });
  }

  // Get JSON data by content hash (for finding existing data when file has new ID)
  static async getJsonDataByContent(fileName: string, fileSize: number, lastModified: number): Promise<JsonData | null> {
    const db = await this.ensureDB();
    const contentHash = this.generateContentHash(fileName, fileSize, lastModified);
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.STORES.JSON_DATA], 'readonly');
      const store = transaction.objectStore(this.STORES.JSON_DATA);
      const index = store.index('contentHash');
      
      const request = index.get(contentHash);
      
      request.onsuccess = () => {
        const result = request.result as StoredJsonData | undefined;
        if (result) {
          console.log('✅ Found existing JSON data for content hash:', contentHash);
          resolve(result.jsonData);
        } else {
          resolve(null);
        }
      };
      
      request.onerror = () => {
        console.error('Failed to get JSON data by content hash:', request.error);
        reject(request.error);
      };
    });
  }

  // Delete annotation by ID from JSON data
  static async deleteAnnotationById(fileId: string, annotationId: string | number): Promise<void> {
    const db = await this.ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.STORES.JSON_DATA], 'readwrite');
      const store = transaction.objectStore(this.STORES.JSON_DATA);
      
      // Get the stored JSON data first
      const getRequest = store.get(fileId);
      
      getRequest.onsuccess = () => {
        const storedData = getRequest.result as StoredJsonData;
        if (!storedData) {
          reject(new Error('JSON data not found for fileId: ' + fileId));
          return;
        }
        
        let annotationFound = false;
        let jsonData = storedData.jsonData;
        
        console.log('🔍 Deleting annotation:', { annotationId, jsonDataType: Array.isArray(jsonData) ? 'array' : 'object' });
        
        // Search and remove annotation from various possible structures
        if (Array.isArray(jsonData)) {
          // Handle direct array format (your manual annotations case)
          console.log('📋 Processing direct array format, length:', jsonData.length);
          const originalLength = jsonData.length;
          const filteredData = jsonData.filter((item: any) => {
            const shouldKeep = item.id !== annotationId;
            if (!shouldKeep) {
              console.log('🗑️ Removing item:', { id: item.id, text: item.text });
            }
            return shouldKeep;
          });
          
          if (filteredData.length < originalLength) {
            // Update the stored data with filtered array
            storedData.jsonData = filteredData;
            annotationFound = true;
            console.log('✅ Successfully filtered array, new length:', filteredData.length);
          }
        }
        else if (jsonData.pages && Array.isArray(jsonData.pages)) {
          // Handle pages structure
          jsonData.pages.forEach(page => {
            if (page.textItems && Array.isArray(page.textItems)) {
              const originalLength = page.textItems.length;
              page.textItems = page.textItems.filter((item: any) => item.id !== annotationId);
              if (page.textItems.length < originalLength) {
                annotationFound = true;
              }
            }
            if (page.fields && Array.isArray(page.fields)) {
              const originalLength = page.fields.length;
              page.fields = page.fields.filter((item: any) => item.id !== annotationId);
              if (page.fields.length < originalLength) {
                annotationFound = true;
              }
            }
          });
        }
        else if (jsonData.form_fields && Array.isArray(jsonData.form_fields)) {
          // Handle form_fields structure
          const originalLength = jsonData.form_fields.length;
          jsonData.form_fields = jsonData.form_fields.filter((item: any) => item.id !== annotationId);
          if (jsonData.form_fields.length < originalLength) {
            annotationFound = true;
          }
        }
        
        if (!annotationFound) {
          reject(new Error(`Annotation with ID ${annotationId} not found`));
          return;
        }
        
        // storedData.jsonData already updated above, now save to IndexedDB
        const putRequest = store.put(storedData);
        
        putRequest.onsuccess = () => {
          console.log(`✅ Annotation ${annotationId} deleted successfully from fileId: ${fileId}`);
          resolve();
        };
        
        putRequest.onerror = () => {
          console.error('Failed to update JSON data after deletion:', putRequest.error);
          reject(putRequest.error);
        };
      };
      
      getRequest.onerror = () => {
        console.error('Failed to get JSON data for deletion:', getRequest.error);
        reject(getRequest.error);
      };
    });
  }

  // Store comparison file (from BA/QA pages)
  static async storeComparisonFile(fileData: FileData, projectId: string, pageType: 'BA' | 'QA'): Promise<ComparisonFile> {
    const db = await this.ensureDB();
    
    const comparisonFile: ComparisonFile = {
      id: `comparison_${pageType}_${projectId}_${Date.now()}`,
      projectId,
      pageType,
      fileData,
      storedAt: new Date().toISOString()
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.STORES.COMPARISON_FILES], 'readwrite');
      const store = transaction.objectStore(this.STORES.COMPARISON_FILES);
      
      const request = store.put(comparisonFile);
      
      request.onsuccess = () => {
        console.log('Comparison file stored successfully:', fileData.name);
        resolve(comparisonFile);
      };
      
      request.onerror = () => {
        console.error('Failed to store comparison file:', request.error);
        reject(request.error);
      };
    });
  }

  // Get comparison files for a project and page type
  static async getComparisonFiles(projectId: string, pageType: 'BA' | 'QA'): Promise<ComparisonFile[]> {
    const db = await this.ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.STORES.COMPARISON_FILES], 'readonly');
      const store = transaction.objectStore(this.STORES.COMPARISON_FILES);
      const index = store.index('projectId');
      
      const request = index.getAll(projectId);
      
      request.onsuccess = () => {
        const allFiles = request.result || [];
        const filteredFiles = allFiles.filter(file => file.pageType === pageType);
        resolve(filteredFiles);
      };
      
      request.onerror = () => {
        console.error('Failed to get comparison files:', request.error);
        reject(request.error);
      };
    });
  }

  // Auto-upload matching JSON file for PDF
  static async autoUploadMatchingJson(pdfFile: FileData, projectId: string): Promise<StoredFileData | null> {
    try {
      // Extract filename without extension
      const pdfBaseName = pdfFile.name.replace(/\.pdf$/i, '');
      const expectedJsonName = `${pdfBaseName}.json`;
      
      console.log(`Looking for matching JSON file: ${expectedJsonName}`);
      
      // Create a file input element to let user select the JSON file
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.multiple = false;
        
        input.onchange = async (event) => {
          const files = (event.target as HTMLInputElement).files;
          if (!files || files.length === 0) {
            resolve(null);
            return;
          }
          
          const file = files[0];
          
          // Check if the filename matches what we expect (case-insensitive)
          if (file.name.toLowerCase() === expectedJsonName.toLowerCase()) {
            try {
              const content = await file.text();
              const jsonFileData: FileData = {
                id: Math.random().toString(36).slice(2),
                name: file.name,
                type: file.type,
                size: file.size,
                lastModified: file.lastModified,
                content: content
              };
              
              const storedJsonFile = await this.storeFile(jsonFileData, projectId);
              
              // Link the PDF and JSON files
              const pdfFileUpdate = await this.getFile(pdfFile.id);
              if (pdfFileUpdate) {
                pdfFileUpdate.associatedJsonFileId = storedJsonFile.id;
                await this.updateFile(pdfFileUpdate);
              }
              
              console.log('Auto-uploaded matching JSON file:', expectedJsonName);
              resolve(storedJsonFile);
            } catch (error) {
              console.error('Failed to process JSON file:', error);
              resolve(null);
            }
          } else {
            console.warn(`Selected file ${file.name} doesn't match expected name ${expectedJsonName}`);
            resolve(null);
          }
        };
        
        input.oncancel = () => {
          console.log('User cancelled JSON file selection');
          resolve(null);
        };
        
        // Trigger file selection dialog
        input.click();
      });
    } catch (error) {
      console.error('Failed to auto-upload matching JSON:', error);
      return null;
    }
  }

  // Get a single file
  static async getFile(fileId: string): Promise<StoredFileData | null> {
    const db = await this.ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.STORES.FILES], 'readonly');
      const store = transaction.objectStore(this.STORES.FILES);
      
      const request = store.get(fileId);
      
      request.onsuccess = () => {
        resolve(request.result || null);
      };
      
      request.onerror = () => {
        console.error('Failed to get file:', request.error);
        reject(request.error);
      };
    });
  }

  // Update a file
  static async updateFile(fileData: StoredFileData): Promise<void> {
    const db = await this.ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.STORES.FILES], 'readwrite');
      const store = transaction.objectStore(this.STORES.FILES);
      
      const request = store.put(fileData);
      
      request.onsuccess = () => {
        resolve();
      };
      
      request.onerror = () => {
        console.error('Failed to update file:', request.error);
        reject(request.error);
      };
    });
  }

  // Remove a file and all associated data
  static async removeFile(fileId: string): Promise<void> {
    const db = await this.ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([
        this.STORES.FILES,
        this.STORES.PDF_IMAGES,
        this.STORES.JSON_DATA
      ], 'readwrite');
      
      // Remove file
      const filesStore = transaction.objectStore(this.STORES.FILES);
      filesStore.delete(fileId);
      
      // Remove associated images
      const imagesStore = transaction.objectStore(this.STORES.PDF_IMAGES);
      imagesStore.delete(fileId);
      
      // Remove associated JSON data
      const jsonStore = transaction.objectStore(this.STORES.JSON_DATA);
      jsonStore.delete(fileId);
      
      transaction.oncomplete = () => {
        console.log('File and associated data removed successfully:', fileId);
        resolve();
      };
      
      transaction.onerror = () => {
        console.error('Failed to remove file:', transaction.error);
        reject(transaction.error);
      };
    });
  }

  // Clear all data for a project
  static async clearProjectData(projectId: string): Promise<void> {
    const db = await this.ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([
        this.STORES.FILES,
        this.STORES.PDF_IMAGES,
        this.STORES.JSON_DATA,
        this.STORES.COMPARISON_FILES
      ], 'readwrite');
      
      // Clear files
      const filesStore = transaction.objectStore(this.STORES.FILES);
      const filesIndex = filesStore.index('projectId');
      let filesRequest = filesIndex.openCursor(projectId);
      filesRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      
      // Clear images
      const imagesStore = transaction.objectStore(this.STORES.PDF_IMAGES);
      const imagesIndex = imagesStore.index('projectId');
      let imagesRequest = imagesIndex.openCursor(projectId);
      imagesRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      
      // Clear JSON data
      const jsonStore = transaction.objectStore(this.STORES.JSON_DATA);
      const jsonIndex = jsonStore.index('projectId');
      let jsonRequest = jsonIndex.openCursor(projectId);
      jsonRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      
      // Clear comparison files
      const comparisonStore = transaction.objectStore(this.STORES.COMPARISON_FILES);
      const comparisonIndex = comparisonStore.index('projectId');
      let comparisonRequest = comparisonIndex.openCursor(projectId);
      comparisonRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
      
      transaction.oncomplete = () => {
        console.log('Project data cleared successfully:', projectId);
        resolve();
      };
      
      transaction.onerror = () => {
        console.error('Failed to clear project data:', transaction.error);
        reject(transaction.error);
      };
    });
  }

  // Get storage stats
  static async getStorageStats(): Promise<{
    totalFiles: number;
    totalProjects: number;
    estimatedSize: number;
  }> {
    const db = await this.ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([
        this.STORES.FILES,
        this.STORES.PROJECTS
      ], 'readonly');
      
      let totalFiles = 0;
      let totalProjects = 0;
      let estimatedSize = 0;
      
      // Count files
      const filesStore = transaction.objectStore(this.STORES.FILES);
      const filesRequest = filesStore.count();
      filesRequest.onsuccess = () => {
        totalFiles = filesRequest.result;
      };
      
      // Count projects
      const projectsStore = transaction.objectStore(this.STORES.PROJECTS);
      const projectsRequest = projectsStore.count();
      projectsRequest.onsuccess = () => {
        totalProjects = projectsRequest.result;
      };
      
      // Estimate size (rough calculation)
      const allFilesRequest = filesStore.getAll();
      allFilesRequest.onsuccess = () => {
        const files = allFilesRequest.result as StoredFileData[];
        estimatedSize = files.reduce((total, file) => total + file.size, 0);
      };
      
      transaction.oncomplete = () => {
        resolve({
          totalFiles,
          totalProjects,
          estimatedSize: Math.round(estimatedSize / 1024 / 1024 * 100) / 100 // MB
        });
      };
      
      transaction.onerror = () => {
        console.error('Failed to get storage stats:', transaction.error);
        reject(transaction.error);
      };
    });
  }

  /**
   * Clear all data from IndexedDB
   */
  static async clearAllData(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const db = this.db;
    
    return new Promise((resolve, reject) => {
      const storeNames = [
        this.STORES.FILES,
        this.STORES.PDF_IMAGES,
        this.STORES.JSON_DATA,
        this.STORES.COMPARISON_FILES,
        this.STORES.PROJECTS
      ];

      const transaction = db.transaction(storeNames, 'readwrite');
      
      // Clear all object stores
      storeNames.forEach(storeName => {
        const store = transaction.objectStore(storeName);
        store.clear();
      });
      
      transaction.oncomplete = () => {
        console.log('✅ All IndexedDB data cleared successfully');
        resolve();
      };
      
      transaction.onerror = () => {
        console.error('❌ Failed to clear IndexedDB data:', transaction.error);
        reject(transaction.error);
      };
    });
  }
}