import { useState, useEffect, useCallback } from 'react';
import { IndexedDBService, type StoredFileData, type ComparisonFile } from '../services/indexedDBService';
import type { FileData, JsonData } from '../types';

export interface UseIndexedDBStorageReturn {
  // File operations
  storeFile: (fileData: FileData, projectId: string) => Promise<StoredFileData>;
  getProjectFiles: (projectId: string) => Promise<StoredFileData[]>;
  getProjectRootFiles: (projectId: string) => Promise<StoredFileData[]>;
  getFolderFiles: (projectId: string, folderId: string) => Promise<StoredFileData[]>;
  removeFile: (fileId: string) => Promise<void>;
  
  // PDF images
  storePdfImages: (fileId: string, projectId: string, images: string[]) => Promise<void>;
  getPdfImages: (fileId: string) => Promise<string[] | null>;
  
  // JSON data
  storeJsonData: (fileId: string, projectId: string, jsonData: JsonData, fileName: string, fileSize: number, lastModified: number) => Promise<void>;
  getJsonData: (fileId: string) => Promise<JsonData | null>;
  getJsonDataByContent: (fileName: string, fileSize: number, lastModified: number) => Promise<JsonData | null>;
  
  // Comparison files (BA/QA)
  storeComparisonFile: (fileData: FileData, projectId: string, pageType: 'BA' | 'QA') => Promise<ComparisonFile>;
  getComparisonFiles: (projectId: string, pageType: 'BA' | 'QA') => Promise<ComparisonFile[]>;
  
  // Auto-upload matching JSON
  autoUploadMatchingJson: (pdfFile: FileData, projectId: string) => Promise<StoredFileData | null>;
  
  // Project operations
  clearProjectData: (projectId: string) => Promise<void>;
  clearAllData: () => Promise<void>;
  
  // State
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
}

export function useIndexedDBStorage(): UseIndexedDBStorageReturn {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initializationAttempted, setInitializationAttempted] = useState(false);

  // Initialize IndexedDB on first use
  useEffect(() => {
    let mounted = true;
    
    const initDB = async () => {
      // Prevent multiple initialization attempts
      if (initializationAttempted) {
        console.log('⏭️ IndexedDB initialization already attempted, skipping...');
        return;
      }
      
      setInitializationAttempted(true);
      
      try {
        setIsLoading(true);
        setError(null);
        
        console.log('🔄 Attempting to initialize IndexedDB...');
        
        // Add timeout to prevent hanging
        const initPromise = IndexedDBService.initialize();
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('IndexedDB initialization timeout')), 5000);
        });
        
        await Promise.race([initPromise, timeoutPromise]);
        
        if (mounted) {
          setIsInitialized(true);
          console.log('✅ IndexedDB storage initialized successfully');
        }
      } catch (err) {
        console.error('❌ Failed to initialize IndexedDB:', err);
        if (mounted) {
          const errorMessage = err instanceof Error ? err.message : 'Failed to initialize storage';
          setError(errorMessage);
          
          // For common IndexedDB issues, provide helpful messages
          if (errorMessage.includes('timeout')) {
            console.warn('⚠️ IndexedDB initialization timed out - using fallback mode');
          } else if (errorMessage.includes('not supported')) {
            console.warn('⚠️ IndexedDB not supported in this browser - using fallback mode');
          } else {
            console.warn('⚠️ IndexedDB failed to initialize - using fallback mode');
          }
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    initDB();
    
    return () => {
      mounted = false;
    };
  }, [initializationAttempted]);

  // Store file
  const storeFile = useCallback(async (fileData: FileData, projectId: string): Promise<StoredFileData> => {
    try {
      setError(null);
      const result = await IndexedDBService.storeFile(fileData, projectId);
      
      // If it's a PDF, try to auto-upload matching JSON
      if (fileData.type === 'application/pdf') {
        try {
          await IndexedDBService.autoUploadMatchingJson(fileData, projectId);
        } catch (jsonError) {
          console.warn('Auto JSON upload failed, continuing without it:', jsonError);
        }
      }
      
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to store file';
      setError(errorMsg);
      throw new Error(errorMsg);
    }
  }, []);

  // Get project files
  const getProjectFiles = useCallback(async (projectId: string): Promise<StoredFileData[]> => {
    try {
      setError(null);
      return await IndexedDBService.getProjectFiles(projectId);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to get project files';
      setError(errorMsg);
      throw new Error(errorMsg);
    }
  }, []);

  // Get project root files (files without folderId)
  const getProjectRootFiles = useCallback(async (projectId: string): Promise<StoredFileData[]> => {
    try {
      setError(null);
      return await IndexedDBService.getProjectRootFiles(projectId);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to get project root files';
      setError(errorMsg);
      throw new Error(errorMsg);
    }
  }, []);

  // Get folder files
  const getFolderFiles = useCallback(async (projectId: string, folderId: string): Promise<StoredFileData[]> => {
    try {
      setError(null);
      return await IndexedDBService.getFolderFiles(projectId, folderId);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to get folder files';
      setError(errorMsg);
      throw new Error(errorMsg);
    }
  }, []);

  // Remove file
  const removeFile = useCallback(async (fileId: string): Promise<void> => {
    try {
      setError(null);
      await IndexedDBService.removeFile(fileId);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to remove file';
      setError(errorMsg);
      throw new Error(errorMsg);
    }
  }, []);

  // Store PDF images
  const storePdfImages = useCallback(async (fileId: string, projectId: string, images: string[]): Promise<void> => {
    try {
      setError(null);
      await IndexedDBService.storePdfImages(fileId, projectId, images);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to store PDF images';
      setError(errorMsg);
      throw new Error(errorMsg);
    }
  }, []);

  // Get PDF images
  const getPdfImages = useCallback(async (fileId: string): Promise<string[] | null> => {
    try {
      setError(null);
      return await IndexedDBService.getPdfImages(fileId);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to get PDF images';
      setError(errorMsg);
      throw new Error(errorMsg);
    }
  }, []);

  // Store JSON data
  const storeJsonData = useCallback(async (fileId: string, projectId: string, jsonData: JsonData, fileName: string, fileSize: number, lastModified: number): Promise<void> => {
    try {
      setError(null);
      await IndexedDBService.storeJsonData(fileId, projectId, jsonData, fileName, fileSize, lastModified);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to store JSON data';
      setError(errorMsg);
      throw new Error(errorMsg);
    }
  }, []);

  // Get JSON data
  const getJsonData = useCallback(async (fileId: string): Promise<JsonData | null> => {
    try {
      setError(null);
      return await IndexedDBService.getJsonData(fileId);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to get JSON data';
      setError(errorMsg);
      throw new Error(errorMsg);
    }
  }, []);

  // Get JSON data by content
  const getJsonDataByContent = useCallback(async (fileName: string, fileSize: number, lastModified: number): Promise<JsonData | null> => {
    try {
      setError(null);
      return await IndexedDBService.getJsonDataByContent(fileName, fileSize, lastModified);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to get JSON data by content';
      setError(errorMsg);
      throw new Error(errorMsg);
    }
  }, []);

  // Store comparison file
  const storeComparisonFile = useCallback(async (fileData: FileData, projectId: string, pageType: 'BA' | 'QA'): Promise<ComparisonFile> => {
    try {
      setError(null);
      return await IndexedDBService.storeComparisonFile(fileData, projectId, pageType);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to store comparison file';
      setError(errorMsg);
      throw new Error(errorMsg);
    }
  }, []);

  // Get comparison files
  const getComparisonFiles = useCallback(async (projectId: string, pageType: 'BA' | 'QA'): Promise<ComparisonFile[]> => {
    try {
      setError(null);
      return await IndexedDBService.getComparisonFiles(projectId, pageType);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to get comparison files';
      setError(errorMsg);
      throw new Error(errorMsg);
    }
  }, []);

  // Auto-upload matching JSON
  const autoUploadMatchingJson = useCallback(async (pdfFile: FileData, projectId: string): Promise<StoredFileData | null> => {
    try {
      setError(null);
      return await IndexedDBService.autoUploadMatchingJson(pdfFile, projectId);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to auto-upload matching JSON';
      setError(errorMsg);
      console.warn(errorMsg, err);
      return null; // Don't throw, as this is optional
    }
  }, []);

  // Clear project data
  const clearProjectData = useCallback(async (projectId: string): Promise<void> => {
    try {
      setError(null);
      await IndexedDBService.clearProjectData(projectId);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to clear project data';
      setError(errorMsg);
      throw new Error(errorMsg);
    }
  }, []);

  // Clear all data
  const clearAllData = useCallback(async (): Promise<void> => {
    try {
      setError(null);
      await IndexedDBService.clearAllData();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to clear all data';
      setError(errorMsg);
      throw new Error(errorMsg);
    }
  }, []);

  return {
    storeFile,
    getProjectFiles,
    getProjectRootFiles,
    getFolderFiles,
    removeFile,
    storePdfImages,
    getPdfImages,
    storeJsonData,
    getJsonData,
    getJsonDataByContent,
    storeComparisonFile,
    getComparisonFiles,
    autoUploadMatchingJson,
    clearProjectData,
    clearAllData,
    isInitialized,
    isLoading,
    error
  };
}