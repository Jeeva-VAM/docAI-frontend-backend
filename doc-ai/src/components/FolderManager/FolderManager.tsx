/**
 * Folder Management Component
 * Provides UI for creating and managing folders within projects
 */

import React, { useState, useEffect } from 'react';
import { FolderPlus, Folder, Trash2, AlertCircle, ChevronRight, ChevronDown } from 'lucide-react';
import type { Project, ProjectFolder } from '../../types';
import { useFolderManagement } from '../../hooks/useFolderManagement';
import { buildFolderHierarchy } from '../../utils/folderHierarchy';
import './FolderManager.css';

interface FolderManagerProps {
  currentProject: Project | null;
  onFolderSelect?: (folder: ProjectFolder | null) => void;
  selectedFolderId?: string | null;
  onFoldersChange?: (folders: ProjectFolder[]) => void;
}

export const FolderManager: React.FC<FolderManagerProps> = ({
  currentProject,
  onFolderSelect,
  selectedFolderId,
  onFoldersChange,
}) => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  
  const {
    folders,
    isLoading,
    error,
    createFolder,
    deleteFolder,
    refreshFolders,
    validateFolderName,
    sanitizeFolderName,
  } = useFolderManagement();

  // Load folders when project changes
  useEffect(() => {
    if (currentProject) {
      refreshFolders(currentProject.id);
    }
  }, [currentProject, refreshFolders]);

  // Notify parent component about folder changes
  useEffect(() => {
    if (onFoldersChange) {
      onFoldersChange(folders);
    }
  }, [folders, onFoldersChange]);

  const handleCreateFolder = async () => {
    if (!currentProject || !newFolderName.trim()) {
      return;
    }

    setCreateError(null);
    
    try {
      // Validate folder name
      const sanitized = sanitizeFolderName(newFolderName.trim());
      if (!validateFolderName(sanitized)) {
        setCreateError('Invalid folder name. Please avoid special characters and ensure the name is not empty.');
        return;
      }

      // Check for duplicate names
      if (folders.some(folder => folder.name.toLowerCase() === sanitized.toLowerCase())) {
        setCreateError('A folder with this name already exists.');
        return;
      }

      await createFolder(currentProject.id, sanitized);
      
      // Reset form
      setNewFolderName('');
      setShowCreateModal(false);
      setCreateError(null);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to create folder';
      setCreateError(errorMsg);
    }
  };

  const handleDeleteFolder = async (folderId: string, folderName: string) => {
    if (!window.confirm(`Are you sure you want to delete the folder "${folderName}"? This will also delete all files within it.`)) {
      return;
    }

    try {
      await deleteFolder(folderId);
      
      // Clear selection if deleted folder was selected
      if (selectedFolderId === folderId && onFolderSelect) {
        onFolderSelect(null);
      }
    } catch (error) {
      console.error('Failed to delete folder:', error);
    }
  };

  const handleFolderSelect = (folder: ProjectFolder) => {
    if (onFolderSelect) {
      // Toggle selection - if already selected, deselect
      if (selectedFolderId === folder.id) {
        onFolderSelect(null);
      } else {
        onFolderSelect(folder);
      }
    }
  };

  const toggleFolderExpansion = (folderId: string) => {
    setExpandedFolders(prev => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(folderId)) {
        newExpanded.delete(folderId);
      } else {
        newExpanded.add(folderId);
      }
      return newExpanded;
    });
  };

  // Recursive folder renderer for hierarchical display
  const renderFolderTree = (folder: ProjectFolder, depth: number = 0): React.ReactNode => {
    const hasChildren = folder.children && folder.children.length > 0;
    const isExpanded = expandedFolders.has(folder.id);
    const isSelected = selectedFolderId === folder.id;

    return (
      <div key={folder.id} className={`folder-tree-item depth-${depth}`}>
        <div className={`folder-item ${isSelected ? 'selected' : ''}`}>
          <div className="folder-button-content">
            {hasChildren && (
              <button
                className="folder-expand-btn"
                onClick={() => toggleFolderExpansion(folder.id)}
                title={isExpanded ? 'Collapse folder' : 'Expand folder'}
              >
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            )}
            {!hasChildren && <div className="folder-spacer" />}
            
            <button
              className="folder-button"
              onClick={() => handleFolderSelect(folder)}
              title={`Select folder: ${folder.name}${folder.relativePath ? ` (${folder.relativePath})` : ''}`}
            >
              <Folder size={16} />
              <span className="folder-name">{folder.name}</span>
              <span className="folder-stats">
                ({folder.files.length} files{folder.subfolderCount ? `, ${folder.subfolderCount} subfolders` : ''})
              </span>
            </button>
          </div>
          
          <button
            className="delete-folder-btn"
            onClick={() => handleDeleteFolder(folder.id, folder.name)}
            title="Delete folder"
          >
            <Trash2 size={12} />
          </button>
        </div>

        {/* Render children when expanded */}
        {hasChildren && isExpanded && (
          <div className="folder-children">
            {folder.children?.map(childFolder => 
              renderFolderTree(childFolder, depth + 1)
            )}
          </div>
        )}
      </div>
    );
  };

  const handleInputKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCreateFolder();
    } else if (e.key === 'Escape') {
      setShowCreateModal(false);
      setNewFolderName('');
      setCreateError(null);
    }
  };

  if (!currentProject) {
    return null;
  }

  return (
    <div className="folder-manager">
      <div className="folder-manager-header">
        <h4>Folders</h4>
        <button
          className="create-folder-btn"
          onClick={() => setShowCreateModal(true)}
          disabled={isLoading}
          title="Create new folder"
        >
          <FolderPlus size={16} />
        </button>
      </div>

      {error && (
        <div className="folder-error">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="folders-list">
        {isLoading && folders.length === 0 ? (
          <div className="loading-state">Loading folders...</div>
        ) : folders.length === 0 ? (
          <div className="empty-state">
            <Folder size={24} className="empty-icon" />
            <span>No folders yet</span>
          </div>
        ) : (
          (() => {
            // Debug: Log all folders before building hierarchy
            console.log('📁 All folders before hierarchy build:', folders.map(f => ({
              id: f.id,
              name: f.name,
              parentId: f.parentId,
              relativePath: f.relativePath
            })));
            
            // Build hierarchical folder structure from flat folder array
            const hierarchicalFolders = buildFolderHierarchy(folders);
            console.log('📁 Built folder hierarchy:', hierarchicalFolders);
            
            // If no root-level folders, show all folders as flat list (fallback)
            if (hierarchicalFolders.length === 0 && folders.length > 0) {
              console.log('⚠️ No root folders found, displaying flat structure');
              return folders.map(folder => renderFolderTree(folder, 0));
            }
            
            // Render the hierarchical folder tree
            return hierarchicalFolders.map(folder => renderFolderTree(folder, 0));
          })()
        )}
      </div>

      {/* Create Folder Modal */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-content folder-create-modal">
            <div className="modal-header">
              <h3>Create New Folder</h3>
              <button
                className="close-btn"
                onClick={() => {
                  setShowCreateModal(false);
                  setNewFolderName('');
                  setCreateError(null);
                }}
              >
                ×
              </button>
            </div>
            
            <div className="modal-body">
              {createError && (
                <div className="create-error">
                  <AlertCircle size={16} />
                  <span>{createError}</span>
                </div>
              )}
              
              <div className="form-group">
                <label htmlFor="folderName">Folder Name</label>
                <input
                  id="folderName"
                  type="text"
                  value={newFolderName}
                  onChange={(e) => {
                    setNewFolderName(e.target.value);
                    setCreateError(null);
                  }}
                  onKeyDown={handleInputKeyPress}
                  placeholder="Enter folder name"
                  autoFocus
                  maxLength={255}
                />
                <small className="input-help">
                  Avoid special characters like {'< > : " / \\ | ? *'}
                </small>
              </div>
            </div>
            
            <div className="modal-footer">
              <button
                className="cancel-btn"
                onClick={() => {
                  setShowCreateModal(false);
                  setNewFolderName('');
                  setCreateError(null);
                }}
              >
                Cancel
              </button>
              <button
                className="create-btn"
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim() || isLoading}
              >
                {isLoading ? 'Creating...' : 'Create Folder'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
