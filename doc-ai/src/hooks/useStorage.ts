import { useState, useCallback, useEffect } from 'react';
import type { FileData, StoredFileData, JsonData } from '../types';
import { StorageService } from '../services/storageService';

export const useStorage = () => {
  const [storedFiles, setStoredFiles] = useState<StoredFileData[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load stored files on mount
  useEffect(() => {
    loadStoredFiles();
  }, []);

  const loadStoredFiles = useCallback(() => {
    setIsLoading(true);
    try {
      const storage = StorageService.getProjectStorage();
      setStoredFiles(storage.files);
    } catch (error) {
      console.error('Failed to load stored files:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveFile = useCallback((fileData: FileData) => {
    try {
      // Check if file already exists to prevent duplicate storage
      const existingFile = storedFiles.find(f => f.id === fileData.id);
      if (existingFile) {
        console.log('File already stored, skipping:', fileData.name);
        return existingFile;
      }

      const storedFile = StorageService.addFileToStorage(fileData);
      
      // Store file content if available and not too large
      if (fileData.content) {
        const success = StorageService.storeFileContent(fileData.id, fileData.content);
        if (!success) {
          console.warn('Failed to store file content for:', fileData.name);
        }
      }
      
      setStoredFiles(prev => {
        // Double-check to prevent duplicates
        const exists = prev.find(f => f.id === fileData.id);
        if (exists) return prev;
        
        return [...prev, storedFile];
      });
      
      return storedFile;
    } catch (error) {
      console.error('Failed to save file:', error);
      throw error;
    }
  }, [storedFiles]); // Add storedFiles dependency but with duplicate check

  const removeFile = useCallback((fileId: string) => {
    try {
      StorageService.removeFileFromStorage(fileId);
      setStoredFiles(prev => prev.filter(f => f.id !== fileId));
      
      // Clean up associated data
      localStorage.removeItem(`docai-file-${fileId}`);
      localStorage.removeItem(`docai-meta-${fileId}`);
      localStorage.removeItem(`docai-images-${fileId}`);
      localStorage.removeItem(`docai-json-${fileId}`);
    } catch (error) {
      console.error('Failed to remove file:', error);
      throw error;
    }
  }, []);

  const loadFileContent = useCallback((fileId: string): string | ArrayBuffer | null => {
    return StorageService.getFileContent(fileId);
  }, []);

  const savePdfImages = useCallback((fileId: string, images: string[]) => {
    try {
      StorageService.storePdfImages(fileId, images);
      setStoredFiles(prev => prev.map(f => 
        f.id === fileId ? { ...f, hasImages: true } : f
      ));
    } catch (error) {
      console.error('Failed to save PDF images:', error);
      throw error;
    }
  }, []);

  const loadPdfImages = useCallback((fileId: string): string[] | null => {
    return StorageService.getPdfImages(fileId);
  }, []);

  const saveAssociatedJson = useCallback((pdfFileId: string, jsonData: JsonData) => {
    try {
      StorageService.storeAssociatedJson(pdfFileId, jsonData);
      setStoredFiles(prev => prev.map(f => 
        f.id === pdfFileId ? { ...f, hasAssociatedJson: true } : f
      ));
    } catch (error) {
      console.error('Failed to save associated JSON:', error);
      throw error;
    }
  }, []);

  const loadAssociatedJson = useCallback((pdfFileId: string): JsonData | null => {
    return StorageService.getAssociatedJson(pdfFileId);
  }, []);

  const findJsonForPdf = useCallback((pdfFileName: string): JsonData | null => {
    // Look for JSON file with same base name as PDF
    const baseName = pdfFileName.replace(/\.pdf$/i, '');
    const jsonFile = storedFiles.find(f => 
      f.type === 'application/json' && 
      f.name.replace(/\.json$/i, '') === baseName
    );
    
    if (jsonFile) {
      const content = loadFileContent(jsonFile.id);
      if (typeof content === 'string') {
        try {
          return JSON.parse(content);
        } catch (error) {
          console.error('Failed to parse JSON file:', error);
        }
      }
    }
    
    return null;
  }, [storedFiles, loadFileContent]);

  const clearAllStorage = useCallback(() => {
    try {
      StorageService.clearAllStorage();
      setStoredFiles([]);
    } catch (error) {
      console.error('Failed to clear storage:', error);
      throw error;
    }
  }, []);

  const getStorageInfo = useCallback(() => {
    return StorageService.getStorageInfo();
  }, []);

  return {
    storedFiles,
    isLoading,
    saveFile,
    removeFile,
    loadFileContent,
    savePdfImages,
    loadPdfImages,
    saveAssociatedJson,
    loadAssociatedJson,
    findJsonForPdf,
    clearAllStorage,
    getStorageInfo,
    refreshStoredFiles: loadStoredFiles,
  };
};