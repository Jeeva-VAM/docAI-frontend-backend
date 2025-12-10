/**
 * Folder API Service
 * Handles all folder-related API operations
 */

import { ApiService } from './apiService';
import type { ProjectFolder } from '../types';

export interface CreateFolderRequest {
  folder_name: string;
  parent_id?: string | null;
  relative_path?: string;
}

export interface FolderResponse {
  id: string;
  name: string;
  project_id: string;
  parent_id?: string | null;
  relative_path?: string;
  created_at: string;
  updated_at?: string;
  file_count?: number;
  subfolder_count?: number; // Add subfolder count
}

export interface FolderListResponse {
  folders: FolderResponse[];
  total: number;
}

class FolderApiServiceClass {
  /**
   * Create a new folder in a project
   * POST /api/projects/{projectId}/folders
   */
  async createFolder(projectId: string, folderName: string, parentId?: string, relativePath?: string): Promise<FolderResponse> {
    try {
      const requestData: CreateFolderRequest = {
        folder_name: folderName,
        parent_id: parentId || null,
        relative_path: relativePath
      };
      console.log('📁 Input params:', { folderName, parentId, relativePath });
      console.log(`📁 Creating folder: ${folderName} with parent: ${parentId || 'root'}`);
      console.log('📁 Request data being sent:', JSON.stringify(requestData, null, 2));
      
      const response = await ApiService.post<FolderResponse>(
        `/projects/${projectId}/folders`,
        requestData
      );
      
      console.log('✅ Folder created successfully:', JSON.stringify(response, null, 2));
      console.log('📁 Response parent_id:', response.parent_id);
      console.log('🔍 Is parent_id null?', response.parent_id === null);
      console.log('🔍 Is parent_id undefined?', response.parent_id === undefined);

      // If this folder has a parent, update the parent's subfolder count
      if (parentId) {
        await this.updateParentSubfolderCount(parentId, projectId);
      }

      return response;
    } catch (error) {
      console.error('❌ Failed to create folder:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to create folder');
    }
  }

  /**
   * List all folders in a project
   * GET /api/projects/{projectId}/folders
   */
  async listFoldersInProject(projectId: string): Promise<FolderResponse[]> {
    try {
      const response = await ApiService.get<FolderResponse[] | FolderListResponse>(
        `/projects/${projectId}/folders`
      );
      
      console.log('✅ Folders fetched successfully:', response);
      console.log('📁 Raw API response type:', typeof response, Array.isArray(response) ? 'Array' : 'Object');
      
      // Handle both direct array response and wrapped response
      if (Array.isArray(response)) {
        console.log('📁 Using direct array response, length:', response.length);
        return response;
      } else if (response && 'folders' in response) {
        console.log('📁 Using wrapped response, folders length:', response.folders?.length || 0);
        return response.folders || [];
      } else {
        console.log('📁 Unexpected response format, returning empty array');
        return [];
      }
    } catch (error) {
      console.error('❌ Failed to fetch folders:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to fetch folders');
    }
  }

  /**
   * Delete a folder
   * DELETE /api/folders/{folderId}
   */
  async deleteFolder(folderId: string): Promise<void> {
    try {
      await ApiService.delete(`/folders/${folderId}`);
      console.log('✅ Folder deleted successfully:', folderId);
    } catch (error) {
      console.error('❌ Failed to delete folder:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to delete folder');
    }
  }

  /**
   * Get a single folder by ID
   * GET /api/folders/{folderId}
   */
  async getFolder(folderId: string): Promise<FolderResponse> {
    try {
      const response = await ApiService.get<FolderResponse>(`/folders/${folderId}`);
      console.log('✅ Folder fetched successfully:', response);
      return response;
    } catch (error) {
      console.error('❌ Failed to fetch folder:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to fetch folder');
    }
  }

  /**
   * Count subfolders for a given folder
   * This counts direct children only (not recursive)
   */
  async countSubfolders(folderId: string, projectId: string): Promise<number> {
    try {
      const allFolders = await this.listFoldersInProject(projectId);
      const subfolderCount = allFolders.filter(folder => folder.parent_id === folderId).length;
      console.log(`📁 Folder ${folderId} has ${subfolderCount} direct subfolders`);
      return subfolderCount;
    } catch (error) {
      console.error('❌ Failed to count subfolders:', error);
      return 0;
    }
  }

  /**
   * Update the subfolder count for a parent folder
   * This should ideally be done by the backend, but we can do it client-side for now
   */
  private async updateParentSubfolderCount(parentId: string, projectId: string): Promise<void> {
    try {
      const subfolderCount = await this.countSubfolders(parentId, projectId);
      // Note: In a real implementation, you'd call an API endpoint to update the folder
      // For now, we'll just log it - the backend should handle this automatically
      console.log(`📊 Updated subfolder count for parent ${parentId}: ${subfolderCount}`);
    } catch (error) {
      console.error('❌ Failed to update parent subfolder count:', error);
    }
  }

  /**
   * Convert API response to internal ProjectFolder type
   */
  convertToProjectFolder(apiFolder: FolderResponse): ProjectFolder {
    return {
      id: apiFolder.id,
      name: apiFolder.name,
      projectId: apiFolder.project_id,
      createdAt: apiFolder.created_at,
      parentId: apiFolder.parent_id || undefined,
      relativePath: apiFolder.relative_path || undefined,
      files: [], // Files will be populated separately
      subfolderCount: apiFolder.subfolder_count || 0,
    };
  }

  /**
   * Convert internal ProjectFolder type to API request
   */
  convertToApiRequest(folderName: string): CreateFolderRequest {
    return {
      folder_name: folderName,
    };
  }

  /**
   * Batch convert API responses to internal ProjectFolder types
   */
  convertToProjectFolders(apiFolders: FolderResponse[]): ProjectFolder[] {
    return apiFolders.map(apiFolder => this.convertToProjectFolder(apiFolder));
  }

  /**
   * Validate folder name
   */
  validateFolderName(name: string): boolean {
    if (!name || typeof name !== 'string') {
      return false;
    }
    
    const trimmed = name.trim();
    
    // Basic validation rules
    if (trimmed.length === 0 || trimmed.length > 255) {
      return false;
    }
    
    // Check for invalid characters (basic set)
    const invalidChars = /[<>:"/\\|?*]/;
    if (invalidChars.test(trimmed)) {
      return false;
    }
    
    // Check for reserved names
    const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
    if (reservedNames.includes(trimmed.toUpperCase())) {
      return false;
    }
    
    return true;
  }

  /**
   * Sanitize folder name
   */
  sanitizeFolderName(name: string): string {
    if (!name || typeof name !== 'string') {
      return '';
    }
    
    return name.trim().replace(/[<>:"/\\|?*]/g, '');
  }
}

// Export singleton instance
export const FolderApiService = new FolderApiServiceClass();
