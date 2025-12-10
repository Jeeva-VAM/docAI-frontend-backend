/**
 * API-based File Management Hook
 * Loads and manages files purely from database via API calls
 */

import { useState, useCallback, useEffect } from 'react';
import type { FileData, Project, ProjectFolder } from '../types';
import { FileApiService } from '../services/fileApiService';
import { FolderApiService } from '../services/folderApiService';
import { buildFolderHierarchy } from '../utils/folderHierarchy';

interface UseApiFilesOptions {
  currentProject?: Project | null;
}

interface UseApiFilesReturn {
  files: FileData[];
  folders: ProjectFolder[];
  isLoading: boolean;
  error: string | null;
  refreshFiles: () => Promise<void>;
  loadFolderFiles: (folderId: string) => Promise<FileData[]>;
}

export const useApiFiles = (options: UseApiFilesOptions = {}): UseApiFilesReturn => {
  const { currentProject } = options;
  
  const [files, setFiles] = useState<FileData[]>([]);
  const [folders, setFolders] = useState<ProjectFolder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load all files and folders for the current project from API
  const refreshFiles = useCallback(async () => {
    if (!currentProject) {
      setFiles([]);
      setFolders([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('📁 Loading files from API for project:', currentProject.id);

      // Load project root files from API
      const projectFiles = await FileApiService.listFilesInProject(currentProject.id);
      console.log('✅ Loaded project files from API:', projectFiles.length);
      
      // Debug: Check raw API response
      console.log('🔍 Raw API files response:', projectFiles);

      // Log file details to understand URL structure
      if (projectFiles.length > 0) {
        console.log('📝 Sample file from API:', {
          id: projectFiles[0].id,
          name: projectFiles[0].name,
          url: projectFiles[0].url,
          type: projectFiles[0].type,
          size: projectFiles[0].size,
          fullStructure: projectFiles[0]
        });
      }

      // Load project folders from API
      const projectFolders = await FolderApiService.listFoldersInProject(currentProject.id);
      console.log('✅ Loaded project folders from API:', projectFolders.length);
      console.log('📁 Raw folder data:', projectFolders);

      // Convert API responses to internal format
      console.log('🔄 Converting API files to internal format...');
      const convertedFiles = FileApiService.convertToFileDataList(projectFiles);
      console.log('🔄 Converted files result:', convertedFiles.length, 'files');
      
      let convertedFolders = FolderApiService.convertToProjectFolders(projectFolders);
      console.log('📁 Converted folders result:', convertedFolders.length, 'folders');
      console.log('📁 Converted folder details:', convertedFolders);

      // Log converted file details to see if URL is preserved
      if (convertedFiles.length > 0) {
        console.log('🔄 Sample converted file:', {
          id: convertedFiles[0].id,
          name: convertedFiles[0].name,
          url: convertedFiles[0].url,
          hasContent: !!convertedFiles[0].content
        });
      } else {
        console.log('❌ No files were converted from API response');
      }

      // Load files for each folder and populate folder.files property
      const allFolderFiles: FileData[] = [];
      for (let i = 0; i < projectFolders.length; i++) {
        const folder = projectFolders[i];
        try {
          const folderFiles = await FileApiService.listFilesInFolder(folder.id);
          const convertedFolderFiles = FileApiService.convertToFileDataList(folderFiles);
          
          // Add folder reference to each file and convert to StoredFileData
          const filesWithFolder = convertedFolderFiles.map(file => ({
            ...file,
            folderId: folder.id,
            folderName: folder.name,
            storedPath: file.url || '', // Use URL as stored path for API files
            createdAt: new Date().toISOString(), // Add required createdAt field
          }));
          
          allFolderFiles.push(...filesWithFolder);
          console.log(`✅ Loaded ${folderFiles.length} files from folder "${folder.name}"`);
          
          // Populate the files property on the converted folder
          convertedFolders[i] = {
            ...convertedFolders[i],
            files: filesWithFolder
          };
          
        } catch (folderError) {
          console.warn(`⚠️ Failed to load files for folder "${folder.name}":`, folderError);
          // Set empty files array for folders that failed to load
          convertedFolders[i] = {
            ...convertedFolders[i],
            files: []
          };
        }
      }

      console.log('📁 Folders with populated files:', convertedFolders.map(f => ({ 
        id: f.id, 
        name: f.name, 
        fileCount: f.files.length,
        parentId: f.parentId 
      })));

      // Build hierarchical folder structure
      console.log('🏗️ Building folder hierarchy...');
      const hierarchicalFolders = buildFolderHierarchy(convertedFolders);
      console.log('✅ Hierarchical folders built:', {
        totalFolders: convertedFolders.length,
        rootFolders: hierarchicalFolders.length,
        hierarchicalStructure: hierarchicalFolders.map(f => ({ 
          id: f.id, 
          name: f.name, 
          childrenCount: f.children?.length || 0,
          children: f.children?.map(c => ({ id: c.id, name: c.name, parentId: c.parentId })) || []
        }))
      });

      // Only return project root files (without folderId) in the main files array
      // Folder files are available through the folders[].files property
      // FIXED: Double-check filtering to ensure no folder files leak into main files array
      const rootLevelFiles = convertedFiles.filter(file => !file.folderId);
      console.log('📋 Final file filtering check:', {
        totalConverted: convertedFiles.length,
        rootLevel: rootLevelFiles.length,
        filteredOut: convertedFiles.length - rootLevelFiles.length
      });
      
      setFiles(rootLevelFiles); // Only project-level files, not folder files
      setFolders(hierarchicalFolders); // Use hierarchical folders instead of flat list
      
      console.log('✅ Files loaded from API:', {
        projectLevelFiles: convertedFiles.length,
        totalFolderFiles: allFolderFiles.length,
        folders: convertedFolders.length,
        folderDetails: convertedFolders.map(f => ({ name: f.name, fileCount: f.files.length }))
      });

    } catch (apiError) {
      console.error('❌ Failed to load files from API:', apiError);
      const errorMessage = apiError instanceof Error ? apiError.message : 'Failed to load files from database';
      setError(errorMessage);
      
      // Clear files on error
      setFiles([]);
      setFolders([]);
    } finally {
      setIsLoading(false);
    }
  }, [currentProject]);

  // Load files for a specific folder
  const loadFolderFiles = useCallback(async (folderId: string): Promise<FileData[]> => {
    try {
      console.log('📁 Loading files for folder:', folderId);
      
      const folderFiles = await FileApiService.listFilesInFolder(folderId);
      const convertedFiles = FileApiService.convertToFileDataList(folderFiles);
      
      console.log('✅ Loaded folder files:', convertedFiles.length);
      return convertedFiles;
      
    } catch (apiError) {
      console.error('❌ Failed to load folder files:', apiError);
      throw apiError;
    }
  }, []);

  // Auto-load files when project changes
  useEffect(() => {
    if (currentProject) {
      console.log('🔄 Project changed, loading files for:', currentProject.name);
      refreshFiles();
    } else {
      console.log('🔄 No project selected, clearing files');
      setFiles([]);
      setFolders([]);
      setError(null);
    }
  }, [currentProject, refreshFiles]);

  return {
    files,
    folders,
    isLoading,
    error,
    refreshFiles,
    loadFolderFiles,
  };
};
