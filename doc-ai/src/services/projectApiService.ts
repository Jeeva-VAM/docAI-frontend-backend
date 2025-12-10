/**
 * Project API Service
 * Handles all project-related API operations
 */

import { ApiService } from './apiService';
import type { Project } from '../types';

export interface CreateProjectRequest {
  name: string;
  project_type: 'QA' | 'BA';
  description?: string;
  specification_instructions?: string;
}

export interface ProjectResponse {
  id: string;
  name: string;
  project_type: 'QA' | 'BA';
  description?: string;
  specification_instructions?: string;
  created_at: string;
  updated_at?: string; // Made optional since API might not provide this
  file_count?: number;
  folder_count?: number;
}

export interface ProjectListResponse {
  projects: ProjectResponse[];
  total: number;
}

export interface SearchProjectsResponse {
  projects: ProjectResponse[];
  total: number;
  query: string;
}

class ProjectApiServiceClass {
  /**
   * Create a new project
   * POST /api/projects
   */
  async createProject(projectData: CreateProjectRequest): Promise<ProjectResponse> {
    try {
      const response = await ApiService.post<ProjectResponse>('/projects', projectData);
      console.log('✅ Project created successfully:', response);
      return response;
    } catch (error) {
      console.error('❌ Failed to create project:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to create project');
    }
  }

  /**
   * Get all projects
   * GET /api/projects
   */
  async getAllProjects(): Promise<ProjectResponse[]> {
    try {
      const response = await ApiService.get<ProjectResponse[]>('/projects');
      console.log('✅ Projects fetched successfully:', response);
      
      // Handle both array and object responses
      if (Array.isArray(response)) {
        return response;
      } else if (response && typeof response === 'object' && 'projects' in response) {
        return (response as ProjectListResponse).projects || [];
      } else {
        console.warn('⚠️ Unexpected response format:', response);
        return [];
      }
    } catch (error) {
      console.error('❌ Failed to fetch projects:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to fetch projects');
    }
  }

  /**
   * Search projects
   * GET /api/projects/search?q={query}
   */
  async searchProjects(query: string): Promise<ProjectResponse[]> {
    try {
      if (!query.trim()) {
        return this.getAllProjects();
      }

      const response = await ApiService.get<ProjectResponse[] | SearchProjectsResponse>('/projects/search', {
        q: query.trim(),
      });
      console.log('✅ Projects search completed:', response);
      
      // Handle both array and object responses
      if (Array.isArray(response)) {
        return response;
      } else if (response && typeof response === 'object' && 'projects' in response) {
        return (response as SearchProjectsResponse).projects || [];
      } else {
        console.warn('⚠️ Unexpected search response format:', response);
        return [];
      }
    } catch (error) {
      console.error('❌ Failed to search projects:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to search projects');
    }
  }

  /**
   * Delete a project
   * DELETE /api/projects/{projectId}
   */
  async deleteProject(projectId: string): Promise<void> {
    try {
      await ApiService.delete(`/projects/${projectId}`);
      console.log('✅ Project deleted successfully:', projectId);
    } catch (error) {
      console.error('❌ Failed to delete project:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to delete project');
    }
  }

  /**
   * Get a single project by ID
   * GET /api/projects/{projectId}
   */
  async getProject(projectId: string): Promise<ProjectResponse> {
    try {
      const response = await ApiService.get<ProjectResponse>(`/projects/${projectId}`);
      console.log('✅ Project fetched successfully:', response);
      return response;
    } catch (error) {
      console.error('❌ Failed to fetch project:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to fetch project');
    }
  }

  /**
   * Convert API response to internal Project type
   */
  convertToProject(apiProject: ProjectResponse): Project {
    console.log('🔄 Converting API project to internal format:', apiProject);
    
    const converted = {
      id: apiProject.id,
      name: apiProject.name,
      type: apiProject.project_type,
      description: apiProject.description || '',
      specificationInstructions: apiProject.specification_instructions,
      createdAt: apiProject.created_at,
      lastModified: apiProject.updated_at || apiProject.created_at, // Fallback to created_at if updated_at doesn't exist
      files: [], // Will be populated separately
      folders: [], // Will be populated separately
    };
    
    console.log('✅ Converted project:', converted);
    return converted;
  }

  /**
   * Convert internal Project type to API request
   */
  convertToApiRequest(project: Omit<Project, 'id' | 'createdAt' | 'lastModified' | 'files' | 'folders'>): CreateProjectRequest {
    return {
      name: project.name,
      project_type: project.type,
      description: project.description,
      specification_instructions: project.specificationInstructions,
    };
  }

  /**
   * Batch convert API responses to internal Project types
   */
  convertToProjects(apiProjects: ProjectResponse[]): Project[] {
    console.log('🔄 Converting API projects array:', apiProjects.length, 'projects');
    const converted = apiProjects.map(apiProject => this.convertToProject(apiProject));
    console.log('✅ Converted projects array:', converted.length, 'projects');
    return converted;
  }
}

// Export singleton instance
export const ProjectApiService = new ProjectApiServiceClass();
