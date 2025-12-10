import React, { useState, useEffect, useCallback } from 'react';
import { Search, Plus, Trash2, FolderOpen, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import type { Project } from '../types';
import { useProjects } from '../hooks/useProjects';
import './ProjectLanding.css';

interface ProjectLandingProps {
  projects: Project[];
  onCreateProject: (project: Omit<Project, 'id' | 'createdAt' | 'lastModified' | 'files' | 'folders'>) => void;
  onDeleteProject: (projectId: string) => void;
  onOpenProject: (project: Project) => void;
}

export const ProjectLanding: React.FC<ProjectLandingProps> = ({
  projects: propsProjects,
  onCreateProject,
  onDeleteProject,
  onOpenProject,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Project[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [deletingProjects, setDeletingProjects] = useState<Set<string>>(new Set());
  const [newProject, setNewProject] = useState({
  name: '',
  type: 'QA' as 'QA' | 'BA',
  description: '',
  specificationInstructions: '',
  });

  // Get search function and projects management from hook
  const { searchProjects, refreshProjects: refreshProjectsHook, isLoading, error } = useProjects();

  // Manual refresh handler
  const handleRefresh = useCallback(async () => {
    console.log('🔄 Manual refresh triggered');
    try {
      await refreshProjectsHook();
      // If we're searching, re-run the search after refresh
      if (searchTerm.trim()) {
        handleSearch(searchTerm);
      }
    } catch (error) {
      console.error('❌ Manual refresh failed:', error);
    }
  }, [refreshProjectsHook, searchTerm]);

  // Debounced search effect
  useEffect(() => {
    const debounceTimeout = setTimeout(() => {
      if (searchTerm.trim()) {
        handleSearch(searchTerm);
      } else {
        setSearchResults([]);
        setSearchError(null);
        setIsSearching(false);
      }
    }, 500); // 500ms delay

    return () => clearTimeout(debounceTimeout);
  }, [searchTerm]);

  // Handle search with API
  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setSearchError(null);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    
    try {
      console.log('🔍 Searching projects with query:', query);
      const results = await searchProjects(query);
      setSearchResults(results);
      console.log(`✅ Search completed: found ${results.length} projects`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Search failed';
      console.error('❌ Search failed:', error);
      setSearchError(errorMsg);
      
      // Fallback to local filtering using props projects
      console.log('🔄 Falling back to local search on props projects');
      const localResults = propsProjects.filter((project: Project) =>
        project.name.toLowerCase().includes(query.toLowerCase()) ||
        project.description.toLowerCase().includes(query.toLowerCase())
      );
      setSearchResults(localResults);
      console.log(`🔄 Local search found ${localResults.length} projects`);
    } finally {
      setIsSearching(false);
    }
  }, [searchProjects, propsProjects]);

  // Determine which projects to display
  const displayProjects = searchTerm.trim() ? searchResults : propsProjects;

  // Debug logging
  useEffect(() => {
    console.log('🎯 ProjectLanding Debug:', {
      propsProjects: propsProjects.length,
      searchTerm,
      searchResults: searchResults.length,
      displayProjects: displayProjects.length,
      isSearching,
      error
    });
  }, [propsProjects.length, searchTerm, searchResults.length, displayProjects.length, isSearching, error]);

  // Filter function for backward compatibility with local filtering
  const filteredProjects = displayProjects.filter((project: Project) =>
    project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    project.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreateProject = () => {
    if (newProject.name.trim()) {
      onCreateProject(newProject);
      setNewProject({ name: '', type: 'QA', description: '', specificationInstructions: '' });
      setShowCreateModal(false);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    try {
      // Set deleting state for UI feedback
      setDeletingProjects(prev => new Set(prev).add(projectId));
      
      console.log('🗑️ Starting project deletion:', projectId);
      
      // Call the actual delete function (this will handle optimistic updates in the hook)
      await onDeleteProject(projectId);
      
      console.log('✅ Project deletion completed successfully');
      
      // Remove from search results if they exist
      if (searchResults.length > 0) {
        setSearchResults(prev => prev.filter(project => project.id !== projectId));
      }
      
      // If we're showing search results, refresh the search
      if (searchTerm.trim()) {
        handleSearch(searchTerm);
      }
    } catch (error) {
      console.error('❌ Failed to delete project:', error);
      
      // If we had search results, clear them and show error
      if (searchResults.length > 0) {
        setSearchResults([]);
        setSearchError('Delete failed. Please try again.');
      }
    } finally {
      // Remove from deleting state
      setDeletingProjects(prev => {
        const newSet = new Set(prev);
        newSet.delete(projectId);
        return newSet;
      });
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getProjectTypeColor = (type: 'QA' | 'BA') => {
    return type === 'QA' ? 'qa-type' : 'ba-type';
  };

  const handleSearchInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);
    
    // Reset search state when clearing input
    if (!value.trim()) {
      setSearchResults([]);
      setSearchError(null);
      setIsSearching(false);
    }
  };

  return (
    <div className="project-landing">
      <div className="project-header">
        <div className="header-content">
          <div className="title-with-owl">
            <svg 
              className="header-owl"
              width="60" 
              height="72" 
              viewBox="0 0 64 64" 
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Document body (white paper with slight shadow) */}
              <rect x="12" y="20" width="40" height="32" rx="2" fill="white" stroke="#E0E0E0" strokeWidth="1"/>
              <rect x="10" y="18" width="40" height="32" rx="2" fill="#F8F8F8" stroke="#D0D0D0" strokeWidth="1"/>
              
              {/* Document lines (text representation) */}
              <line x1="15" y1="25" x2="45" y2="25" stroke="#4CBB17" strokeWidth="2" strokeLinecap="round"/>
              <line x1="15" y1="30" x2="40" y2="30" stroke="#1E88E5" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="15" y1="35" x2="42" y2="35" stroke="#1E88E5" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="15" y1="40" x2="38" y2="40" stroke="#1E88E5" strokeWidth="1.5" strokeLinecap="round"/>
              
              {/* Owl face overlay on document */}
              <circle cx="32" cy="15" r="12" fill="#4CBB17" stroke="white" strokeWidth="2"/>
              
              {/* Owl ears (document tabs) */}
              <path d="M22 8 L26 2 L30 10 Z" fill="#1E88E5" stroke="white" strokeWidth="1"/>
              <path d="M42 8 L38 2 L34 10 Z" fill="#1E88E5" stroke="white" strokeWidth="1"/>
              
              {/* Eyes (smart/AI look) */}
              <circle cx="28" cy="13" r="4" fill="white"/>
              <circle cx="36" cy="13" r="4" fill="white"/>
              <circle cx="28" cy="13" r="2.5" fill="#2E2E2E"/>
              <circle cx="36" cy="13" r="2.5" fill="#2E2E2E"/>
              
              {/* Eye highlights (digital/AI sparkle) */}
              <circle cx="29" cy="12" r="1" fill="white"/>
              <circle cx="37" cy="12" r="1" fill="white"/>
              <rect x="26.5" y="10.5" width="0.5" height="1" fill="#4CBB17" opacity="0.7"/>
              <rect x="34.5" y="10.5" width="0.5" height="1" fill="#4CBB17" opacity="0.7"/>
              
              {/* Beak (pen tip/cursor) */}
              <path d="M32 18 L30 22 L34 22 Z" fill="#FF8C00"/>
              
              {/* Document corner fold */}
              <path d="M45 20 L45 25 L50 25 Z" fill="#E8E8E8" stroke="#D0D0D0" strokeWidth="1"/>
              
              {/* AI/Tech accent dots */}
              <circle cx="20" cy="45" r="1" fill="#4CBB17" opacity="0.6"/>
              <circle cx="44" cy="45" r="1" fill="#1E88E5" opacity="0.6"/>
              <circle cx="32" cy="52" r="1" fill="#FF8C00" opacity="0.6"/>
            </svg>
            <div className="title-section">
              <h1>DocAI Projects</h1>
              <p>Intelligent document analysis powered by AI</p>
            </div>
          </div>
        </div>
        
        <div className="header-actions">
          <div className="search-container">
            <Search size={20} className="search-icon" />
            {isSearching && <Loader2 size={16} className="search-spinner" />}
            <input
              type="text"
              placeholder="Search projects..."
              value={searchTerm}
              onChange={handleSearchInputChange}
              className="search-input"
            />
            {searchTerm && (
              <button 
                className="clear-search-btn"
                onClick={() => setSearchTerm('')}
                title="Clear search"
              >
                ×
              </button>
            )}
          </div>
          
          <button
            className="refresh-btn"
            onClick={handleRefresh}
            disabled={isLoading}
            title="Refresh projects"
          >
            <RefreshCw size={18} className={isLoading ? 'spinning' : ''} />
            {isLoading ? 'Loading...' : 'Refresh'}
          </button>
          
          <button
            className="create-project-btn"
            onClick={() => setShowCreateModal(true)}
          >
            <Plus size={20} />
            Create Project
          </button>
        </div>
      </div>

      {/* Global Error Banner */}
      {error && (
        <div className="error-banner">
          <div className="error-content">
            <AlertCircle size={20} />
            <div className="error-text">
              <strong>Connection Error:</strong> {error}
            </div>
            <button 
              className="retry-btn"
              onClick={handleRefresh}
              disabled={isLoading}
            >
              {isLoading ? <Loader2 size={16} className="spinning" /> : 'Retry'}
            </button>
          </div>
        </div>
      )}

      {/* Search Status */}
      {searchTerm && (
        <div className="search-status">
          {isSearching ? (
            <span>Searching...</span>
          ) : searchError ? (
            <div className="search-error">
              <AlertCircle size={16} />
              <span>{searchError}</span>
            </div>
          ) : (
            <span>
              {searchResults.length > 0 
                ? `Found ${searchResults.length} project${searchResults.length !== 1 ? 's' : ''} matching "${searchTerm}"`
                : `No projects found matching "${searchTerm}"`
              }
            </span>
          )}
        </div>
      )}

      <div className="projects-grid">
        {filteredProjects.length === 0 ? (
          <div className="no-projects">
            <FolderOpen size={48} className="no-projects-icon" />
            <h3>
              {searchTerm ? 'No matching projects found' : 'No projects found'}
            </h3>
            <p>
              {searchTerm 
                ? 'Try adjusting your search terms or create a new project'
                : 'Create your first project to get started'
              }
            </p>
          </div>
        ) : (
          filteredProjects.map((project: Project) => (
            <div 
              key={project.id} 
              className="project-card"
            >
              <div className="project-card-header">
                <button
                  className="project-name-link"
                  onClick={() => onOpenProject(project)}
                  title="Open project"
                >
                  {project.name}
                </button>
                <div className="project-actions">
                  <button
                    className="delete-btn"
                    onClick={() => handleDeleteProject(project.id)}
                    disabled={deletingProjects.has(project.id)}
                    title={deletingProjects.has(project.id) ? "Deleting..." : "Delete project"}
                  >
                    {deletingProjects.has(project.id) ? (
                      <Loader2 size={14} className="spinning" />
                    ) : (
                      <Trash2 size={14} />
                    )}
                  </button>
                </div>
              </div>
              
              <div className="project-info">
                <span className={`project-type ${getProjectTypeColor(project.type)}`}>
                  {project.type}
                </span>
                <span className="project-date">
                  {formatDate(project.lastModified)}
                </span>
              </div>
              
              <p className="project-description">
                {project.description || 'No description provided'}
              </p>
              
              <div className="project-stats">
                <span>{project.folders.length} folders</span>
                <span>{project.files.length} files</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create Project Modal */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Create New Project</h3>
              <button
                className="close-btn"
                onClick={() => setShowCreateModal(false)}
              >
                ×
              </button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label htmlFor="projectName">Project Name *</label>
                <input
                  id="projectName"
                  type="text"
                  value={newProject.name}
                  onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                  placeholder="Enter project name"
                  autoFocus
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="projectType">Project Type *</label>
                <select
                  id="projectType"
                  value={newProject.type}
                  onChange={(e) => setNewProject({ ...newProject, type: e.target.value as 'QA' | 'BA' })}
                  title="Select project type"
                >
                  <option value="QA">QA - Quality Assurance</option>
                  <option value="BA">BA - Business Analysis</option>
                </select>
              </div>
              
              <div className="form-group">
                <label htmlFor="projectDescription">Project Description</label>
                <textarea
                  id="projectDescription"
                  value={newProject.description}
                  onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                  placeholder="Enter project description (optional)"
                  rows={3}
                />
              </div>
              <div className="form-group">
                <label htmlFor="projectSpecificationInstructions">Project Specification Instructions</label>
                <textarea
                  id="projectSpecificationInstructions"
                  value={newProject.specificationInstructions}
                  onChange={(e) => setNewProject({ ...newProject, specificationInstructions: e.target.value })}
                  placeholder="Enter project specification instructions (optional)"
                  rows={3}
                />
              </div>
            </div>
            
            <div className="modal-footer">
              <button
                className="cancel-btn"
                onClick={() => setShowCreateModal(false)}
              >
                Cancel
              </button>
              <button
                className="create-btn"
                onClick={handleCreateProject}
                disabled={!newProject.name.trim()}
              >
                Create Project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};