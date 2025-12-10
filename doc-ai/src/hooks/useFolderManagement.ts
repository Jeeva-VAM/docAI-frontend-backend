/**
 * Folder Management Hook
 * Handles folder creation, listing, and deletion operations
 */

import { useState, useCallback } from 'react';
import type { ProjectFolder } from '../types';
import { FolderApiService } from '../services/folderApiService';

interface UseFolderManagementReturn {
  folders: ProjectFolder[];
  isLoading: boolean;
  error: string | null;
  createFolder: (projectId: string, folderName: string) => Promise<ProjectFolder>;
  deleteFolder: (folderId: string) => Promise<void>;
  refreshFolders: (projectId: string) => Promise<void>;
  validateFolderName: (name: string) => boolean;
  sanitizeFolderName: (name: string) => string;
}

export const useFolderManagement = (): UseFolderManagementReturn => {
  const [folders, setFolders] = useState<ProjectFolder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createFolder = useCallback(async (projectId: string, folderName: string): Promise<ProjectFolder> => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('📁 Creating folder:', folderName, 'in project:', projectId);
      
      // Validate and sanitize folder name
      const sanitized = FolderApiService.sanitizeFolderName(folderName);
      if (!FolderApiService.validateFolderName(sanitized)) {
        throw new Error('Invalid folder name. Folder names cannot contain special characters or be empty.');
      }
      
      // Create folder via API
      const apiResponse = await FolderApiService.createFolder(projectId, sanitized);
      const newFolder = FolderApiService.convertToProjectFolder(apiResponse);
      
      // Add to local state
      setFolders(prevFolders => [...prevFolders, newFolder]);
      
      console.log('✅ Folder created successfully:', newFolder.name);
      return newFolder;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to create folder';
      console.error('❌ Failed to create folder:', error);
      setError(errorMsg);
      throw error; // Re-throw so UI can handle it
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deleteFolder = useCallback(async (folderId: string): Promise<void> => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('🗑️ Deleting folder:', folderId);
      
      // Delete from API
      await FolderApiService.deleteFolder(folderId);
      
      // Remove from local state
      setFolders(prevFolders => prevFolders.filter(folder => folder.id !== folderId));
      
      console.log('✅ Folder deleted successfully:', folderId);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to delete folder';
      console.error('❌ Failed to delete folder:', error);
      setError(errorMsg);
      throw error; // Re-throw so UI can handle it
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshFolders = useCallback(async (projectId: string): Promise<void> => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('🔄 Refreshing folders for project:', projectId);
      
      // Get folders from API
      const apiResponse = await FolderApiService.listFoldersInProject(projectId);
      const projectFolders = FolderApiService.convertToProjectFolders(apiResponse);
      
      // Debug: Log folder structure
      console.log('📁 Raw API response:', apiResponse);
      console.log('📁 Converted folders:', projectFolders);
      projectFolders.forEach(folder => {
        console.log(`📁 Folder: ${folder.name}, ID: ${folder.id}, ParentID: ${folder.parentId}, RelativePath: ${folder.relativePath}`);
      });
      
      // Update local state
      setFolders(projectFolders);
      
      console.log(`✅ Successfully loaded ${projectFolders.length} folders`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to refresh folders';
      console.error('❌ Failed to refresh folders:', error);
      setError(errorMsg);
      
      // Clear folders on error
      setFolders([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const validateFolderName = useCallback((name: string): boolean => {
    return FolderApiService.validateFolderName(name);
  }, []);

  const sanitizeFolderName = useCallback((name: string): string => {
    return FolderApiService.sanitizeFolderName(name);
  }, []);

  return {
    folders,
    isLoading,
    error,
    createFolder,
    deleteFolder,
    refreshFolders,
    validateFolderName,
    sanitizeFolderName,
  };
};
