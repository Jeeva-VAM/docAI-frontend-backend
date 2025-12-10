import { useState, useEffect } from 'react';
import { fileSystemStorageService, type FileSystemStorage, type ProjectManifest } from '../services/fileSystemStorageService';

export const useFileSystemStorage = () => {
  const [manifest, setManifest] = useState<ProjectManifest | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load manifest on mount
  useEffect(() => {
    loadManifest();
  }, []);

  const loadManifest = () => {
    try {
      const currentManifest = fileSystemStorageService.getProjectManifest();
      setManifest(currentManifest);
      setError(null);
    } catch (err) {
      setError(`Failed to load project manifest: ${err}`);
    }
  };

  const addFile = async (file: File): Promise<FileSystemStorage> => {
    setIsLoading(true);
    setError(null);

    try {
      const fileEntry = fileSystemStorageService.addFileToManifest(file);
      loadManifest(); // Refresh manifest
      return fileEntry;
    } catch (err) {
      const errorMessage = `Failed to add file: ${err}`;
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const removeFile = (fileId: string) => {
    try {
      fileSystemStorageService.removeFile(fileId);
      loadManifest(); // Refresh manifest
      setError(null);
    } catch (err) {
      setError(`Failed to remove file: ${err}`);
    }
  };

  const updateFileStatus = (fileId: string, status: FileSystemStorage['status']) => {
    try {
      fileSystemStorageService.updateFileStatus(fileId, status);
      loadManifest(); // Refresh manifest
      setError(null);
    } catch (err) {
      setError(`Failed to update file status: ${err}`);
    }
  };

  const exportProject = () => {
    try {
      fileSystemStorageService.exportProject();
      setError(null);
    } catch (err) {
      setError(`Failed to export project: ${err}`);
    }
  };

  const importProject = async (manifestFile: File): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      await fileSystemStorageService.importProject(manifestFile);
      loadManifest(); // Refresh manifest
    } catch (err) {
      const errorMessage = `Failed to import project: ${err}`;
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const getFileById = (fileId: string): FileSystemStorage | undefined => {
    return fileSystemStorageService.getFileById(fileId);
  };

  // Helper functions
  const getStorageStats = () => {
    if (!manifest) return { totalFiles: 0, totalSize: 0, downloadedFiles: 0 };

    const totalFiles = manifest.files.length;
    const totalSize = manifest.files.reduce((sum, file) => sum + file.size, 0);
    const downloadedFiles = manifest.files.filter(f => f.status === 'downloaded' || f.status === 'moved').length;

    return { totalFiles, totalSize, downloadedFiles };
  };

  const getFilesByType = (type: string) => {
    if (!manifest) return [];
    return manifest.files.filter(file => file.type.includes(type));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return {
    // State
    manifest,
    isLoading,
    error,

    // Actions
    addFile,
    removeFile,
    updateFileStatus,
    exportProject,
    importProject,
    loadManifest,

    // Getters
    getFileById,
    getStorageStats,
    getFilesByType,

    // Utils
    formatFileSize,

    // Computed values
    files: manifest?.files || [],
    storageLocation: manifest?.storageLocation || './storage',
    stats: getStorageStats()
  };
};