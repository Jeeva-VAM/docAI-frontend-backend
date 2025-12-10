import { useState, useCallback, useEffect } from 'react';
import type { Project } from '../types';
import { ProjectApiService } from '../services/projectApiService';
import { FolderApiService } from '../services/folderApiService';
import { FileApiService } from '../services/fileApiService';

interface UseProjectsReturn {
  projects: Project[];
  isLoading: boolean;
  error: string | null;
  createProject: (projectData: Omit<Project, 'id' | 'createdAt' | 'lastModified' | 'files' | 'folders'>) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  updateProject: (projectId: string, updates: Partial<Project>) => Promise<void>;
  getProject: (projectId: string) => Project | undefined;
  refreshProjects: () => Promise<void>;
  searchProjects: (query: string) => Promise<Project[]>;
}

export const useProjects = (): UseProjectsReturn => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Function to load project with folders and files from API
  const loadProjectWithDetails = useCallback(async (projectId: string) => {
    try {
      console.log(`📋 Loading project details for: ${projectId}`);
      
      // Load folders
      const foldersResponse = await FolderApiService.listFoldersInProject(projectId);
      const folders = FolderApiService.convertToProjectFolders(foldersResponse);
      
      // Load all files in the project
      const filesResponse = await FileApiService.listFilesInProject(projectId);
      const allFiles = FileApiService.convertToStoredFileDataList(filesResponse);
      
      // Separate root files and folder files
      const rootFiles = allFiles.filter(file => !file.folderId);
      
      // Group folder files by folder ID
      const folderFilesMap = new Map<string, typeof allFiles>();
      allFiles.filter(file => file.folderId).forEach(file => {
        const folderId = file.folderId!;
        if (!folderFilesMap.has(folderId)) {
          folderFilesMap.set(folderId, []);
        }
        folderFilesMap.get(folderId)!.push(file);
      });
      
      // Assign files to folders
      const foldersWithFiles = folders.map(folder => ({
        ...folder,
        files: folderFilesMap.get(folder.id) || []
      }));
      
      console.log(`✅ Project details loaded: ${rootFiles.length} root files, ${foldersWithFiles.length} folders`);
      
      return {
        files: rootFiles,
        folders: foldersWithFiles
      };
    } catch (error) {
      console.error('Error loading project details:', error);
      return { files: [], folders: [] };
    }
  }, []);

  // Function to refresh all projects with their details
  const refreshProjects = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('🔄 Refreshing all projects from API...');
      
      // Get all projects from API
      const apiProjects = await ProjectApiService.getAllProjects();
      console.log('🔄 API projects received:', apiProjects.length, apiProjects);
      const baseProjects = ProjectApiService.convertToProjects(apiProjects);
      console.log('🔄 Base projects converted:', baseProjects.length, baseProjects);
      
      // Load details for each project
      const projectsWithDetails = await Promise.all(
        baseProjects.map(async (project) => {
          const details = await loadProjectWithDetails(project.id);
          return {
            ...project,
            files: details.files,
            folders: details.folders
          };
        })
      );
      
      setProjects(projectsWithDetails);
      console.log(`✅ Successfully loaded ${projectsWithDetails.length} projects`);
      console.log('📊 Projects data:', projectsWithDetails.map(p => ({ id: p.id, name: p.name, files: p.files.length, folders: p.folders.length })));
    } catch (error) {
      console.error('❌ Failed to refresh projects:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to refresh projects';
      setError(errorMessage);
      
      // Fallback to empty array on error
      setProjects([]);
    } finally {
      setIsLoading(false);
    }
  }, [loadProjectWithDetails]);

  // Load projects on mount
  useEffect(() => {
    console.log('🚀 useProjects: Component mounted, loading projects...');
    refreshProjects();
  }, [refreshProjects]);

  // Auto-refresh when coming back from other tabs/background
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && projects.length === 0) {
        console.log('🔄 Page became visible with no projects, refreshing...');
        refreshProjects();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [projects.length, refreshProjects]);

  // Window focus refresh (for when coming back to browser)
  useEffect(() => {
    const handleWindowFocus = () => {
      if (projects.length === 0) {
        console.log('🔄 Window focused with no projects, refreshing...');
        refreshProjects();
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    return () => window.removeEventListener('focus', handleWindowFocus);
  }, [projects.length, refreshProjects]);

  const createProject = useCallback(async (projectData: Omit<Project, 'id' | 'createdAt' | 'lastModified' | 'files' | 'folders'>) => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('🆕 Creating new project:', projectData.name);
      
      // Convert to API format and create project
      const apiRequest = ProjectApiService.convertToApiRequest(projectData);
      const apiResponse = await ProjectApiService.createProject(apiRequest);
      
      // Convert back to internal format
      const newProject = ProjectApiService.convertToProject(apiResponse);
      
      // Add to projects list
      setProjects(prev => [{ ...newProject, files: [], folders: [] }, ...prev]);
      
      console.log('✅ Project created successfully:', newProject.name);
    } catch (error) {
      console.error('❌ Failed to create project:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create project';
      setError(errorMessage);
      throw error; // Re-throw so UI can handle it
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deleteProject = useCallback(async (projectId: string) => {
    try {
      console.log('🗑️ Deleting project:', projectId);
      
      // Optimistically remove from local state FIRST
      setProjects(prev => {
        const filtered = prev.filter(project => project.id !== projectId);
        console.log('🔄 Optimistically removed from state. Projects count:', filtered.length);
        return filtered;
      });
      
      // Then delete from API
      await ProjectApiService.deleteProject(projectId);
      
      console.log('✅ Project deleted successfully from API:', projectId);
    } catch (error) {
      console.error('❌ Failed to delete project from API, reverting state:', error);
      
      // If API deletion failed, refresh the projects to get the correct state
      await refreshProjects();
      
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete project';
      setError(errorMessage);
      throw error; // Re-throw so UI can handle it
    }
  }, [refreshProjects]);

  const updateProject = useCallback(async (projectId: string, updates: Partial<Project>) => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('📝 Updating project:', projectId, updates);
      
      // Update local state immediately for better UX
      setProjects(prev => prev.map(project => 
        project.id === projectId 
          ? { ...project, ...updates, lastModified: new Date().toISOString() }
          : project
      ));
      
      // TODO: Implement API update endpoint when available
      // await ProjectApiService.updateProject(projectId, updates);
      
      console.log('✅ Project updated successfully:', projectId);
    } catch (error) {
      console.error('❌ Failed to update project:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to update project';
      setError(errorMessage);
      
      // Refresh projects to revert any optimistic updates
      refreshProjects();
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [refreshProjects]);

  const getProject = useCallback((projectId: string) => {
    return projects.find(project => project.id === projectId);
  }, [projects]);

  const searchProjects = useCallback(async (query: string): Promise<Project[]> => {
    try {
      console.log('🔍 Searching projects:', query);
      
      if (!query.trim()) {
        console.log('📝 Empty query, returning all projects');
        return projects;
      }

      // Search using API
      const apiProjects = await ProjectApiService.searchProjects(query);
      const searchResults = ProjectApiService.convertToProjects(apiProjects);
      
      // Load details for search results (optional, may want to optimize this)
      const searchResultsWithDetails = await Promise.all(
        searchResults.map(async (project) => {
          const details = await loadProjectWithDetails(project.id);
          return {
            ...project,
            files: details.files,
            folders: details.folders
          };
        })
      );
      
      console.log(`✅ Search completed: found ${searchResultsWithDetails.length} projects`);
      return searchResultsWithDetails;
    } catch (error) {
      console.error('❌ Failed to search projects:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to search projects';
      setError(errorMessage);
      
      // Fallback to local filtering
      const localResults = projects.filter(project =>
        project.name.toLowerCase().includes(query.toLowerCase()) ||
        project.description.toLowerCase().includes(query.toLowerCase())
      );
      
      console.log(`🔄 Falling back to local search: found ${localResults.length} projects`);
      return localResults;
    }
  }, [projects, loadProjectWithDetails]);

  return {
    projects,
    isLoading,
    error,
    createProject,
    deleteProject,
    updateProject,
    getProject,
    refreshProjects,
    searchProjects,
  };
};