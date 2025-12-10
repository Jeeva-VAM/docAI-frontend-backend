import React, { useRef, useState, useEffect } from 'react';
import { Upload, X, FileText, File, MoreVertical, FolderPlus, Plus, Minus, Folder } from 'lucide-react';
import { 
  extractFilesFromFolder, 
  validateFolderContents, 
  supportsFolderUpload,
  type FolderValidationOptions 
} from '../../utils/folderUpload';

// Removed useFileSystemStorage as we're now using API-based file management
// import { useFileSystemStorage } from '../../hooks/useFileSystemStorage';
import { IndexedDBService } from '../../services/indexedDBService';
import { FileApiService } from '../../services/fileApiService';
import type { FolderResponse } from '../../services/folderApiService';
import type { FileData, Project, ProjectFolder } from '../../types';
import './FileUploader.css';

interface FileUploaderProps {
  files: FileData[];
  folders?: ProjectFolder[];
  isUploading: boolean;
  error: string | null;
  onFileUpload: (files: FileList) => void;
  onFileRemove: (fileId: string) => void;
  onFileSelect: (file: FileData) => void;
  onFolderCreate?: (folderName: string, parentId?: string) => Promise<FolderResponse>;
  onFolderDelete?: (folderId: string) => Promise<void>;
  onRefresh?: () => Promise<void>; // Add refresh callback for immediate UI updates
  selectedFileId?: string;
  currentProject?: Project | null;
}

export const FileUploader: React.FC<FileUploaderProps> = ({
  files,
  folders = [],
  isUploading,
  error,
  onFileUpload,
  onFileRemove,
  onFileSelect,
  onFolderCreate,
  onFolderDelete,
  onRefresh,
  selectedFileId,
  currentProject,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Debug: Log props received by FileUploader
  useEffect(() => {
    console.log('📋 FileUploader received props:', {
      filesCount: files.length,
      foldersCount: folders?.length || 0,
      isUploading,
      error,
      selectedFileId,
      currentProject: currentProject?.name,
      fileDetails: files.map(f => ({ id: f.id, name: f.name, url: f.url })),
      folderDetails: folders?.map(f => ({ id: f.id, name: f.name })) || []
    });
  }, [files, folders, isUploading, error, selectedFileId, currentProject]);
  
  // Component state
  const [showDropdown, setShowDropdown] = useState<string | null>(null);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  
  // Remove FileSystem storage usage - now using API-based file management only
  // File system storage hook
  // const {
  //   isLoading: isStorageLoading,
  //   error: storageError,
  //   addFile: addFileToStorage
  // } = useFileSystemStorage();

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) {
      onFileUpload(droppedFiles);
      // Removed localStorage storage - now using API-based file management only
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileUpload(e.target.files);
      // Removed localStorage storage - now using API-based file management only
    }
  };

  // Removed handleFileSystemUpload - no longer needed with API-based file management

  // File icon helper
  const getFileIcon = (type: string) => {
    if (type === 'application/pdf') {
      return <FileText className="file-icon pdf" />;
    }
    return <File className="file-icon" />;
  };

  const [showDropZone, setShowDropZone] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<{ [id: string]: boolean }>(() => {
    // By default, all folders are collapsed (not expanded) for the current project
    if (currentProject?.id) {
      const savedFolders = localStorage.getItem(`fileUploader-folders-${currentProject.id}`);
      if (savedFolders) {
        const folders = JSON.parse(savedFolders);
        const collapsed: { [id: string]: boolean } = {};
        folders.forEach((folder: ProjectFolder) => {
          collapsed[folder.id] = true; // Default to collapsed
        });
        return collapsed;
      }
    }
    return {};
  });

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !currentProject?.id) {
      return;
    }

    try {
      // Use the onFolderCreate callback to create folder via API
      if (onFolderCreate) {
        await onFolderCreate(newFolderName.trim());
        console.log('✅ Folder created via API:', newFolderName.trim());
      } else {
        console.warn('⚠️ onFolderCreate callback not provided');
      }
      
      setNewFolderName('');
      setShowCreateFolder(false);
    } catch (error) {
      console.error('❌ Failed to create folder:', error);
      // Don't close the dialog on error so user can retry
    }
  };

  const handleUploadToFolder = async (folderId: string, fileList: FileList) => {
    try {
      console.log('📁 Starting folder upload process...');
      console.log('📁 Upload details:', {
        folderId,
        fileCount: fileList.length,
        currentProject: currentProject?.id,
        hasOnFileUpload: !!onFileUpload
      });
      
      if (!currentProject) {
        console.error('❌ No project selected for folder upload');
        throw new Error('No project selected for folder upload');
      }

      if (fileList.length === 0) {
        console.warn('⚠️ No files to upload');
        return;
      }

      console.log('📤 Files to upload:', Array.from(fileList).map(f => ({ name: f.name, size: f.size, type: f.type })));

      // Upload each file to the folder via API
      const uploadPromises = Array.from(fileList).map(async (file) => {
        try {
          console.log('📤 Starting upload for file:', file.name, 'to folder:', folderId);
          const response = await FileApiService.uploadFileToFolder(folderId, file);
          console.log('✅ File uploaded successfully:', { fileName: file.name, response });
          return response;
        } catch (error) {
          console.error('❌ Failed to upload file to folder:', { fileName: file.name, folderId, error });
          throw error;
        }
      });

      // Wait for all uploads to complete
      console.log('⏳ Waiting for all uploads to complete...');
      const uploadResults = await Promise.all(uploadPromises);
      
      console.log('✅ All files uploaded to folder successfully:', {
        count: uploadResults.length,
        folderId,
        uploadResults: uploadResults.map(r => ({ id: r.id, name: r.name }))
      });
      
      // FIXED: Refresh UI immediately to show uploaded files in folders
      if (onRefresh) {
        console.log('🔄 Refreshing UI to show uploaded files...');
        await onRefresh();
        console.log('✅ UI refresh completed');
      } else {
        console.warn('⚠️ No refresh callback available - files may not appear until page refresh');
      }
      
    } catch (error) {
      console.error('❌ Failed to upload files to folder via API:', error);
      throw error;
    }
  };

  const handleFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    try {
      console.log('📁 Starting folder upload process...');
      
      // Extract all files from the folder
      const files = extractFilesFromFolder(fileList);
      console.log(`📁 Extracted ${files.length} files from folder`);

      if (files.length === 0) {
        console.warn('⚠️ No files found in the selected folder');
        return;
      }

      // Use enhanced folder upload that preserves folder structure
      await handleEnhancedFolderUploadWithRelativePath(files);
      
    } catch (error) {
      console.error('❌ Failed to process folder upload:', error);
      alert('Failed to upload folder: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      // Clear the input
      if (folderInputRef.current) {
        folderInputRef.current.value = '';
      }
    }
  };

  // Enhanced folder upload with relative path support 
  const handleEnhancedFolderUploadWithRelativePath = async (files: File[]) => {
    if (!currentProject) {
      console.error('❌ No current project for folder upload');
      alert('Cannot upload folder: No project selected');
      return;
    }

    // Validate folder contents
    const validation = validateFolderContents(files, {
      maxTotalFiles: 100,
      allowedExtensions: ['.pdf', '.json', '.docx', '.txt', '.xlsx', '.md', '.js', '.ts', '.tsx', '.css', '.html', '.xml', '.log', '.csv', '.png', '.jpg', '.jpeg', '.gif', '.svg'],
      maxFileSize: 500 * 1024 * 1024
    });

    if (!validation.valid && validation.errors.length > 0) {
      console.error('❌ Folder validation failed:', validation.errors);
      alert(`Folder upload validation failed:\n${validation.errors.join('\n')}`);
      return;
    }

    if (validation.validFiles.length === 0) {
      console.warn('⚠️ No valid files found in the folder after validation');
      alert('No valid files found in the selected folder');
      return;
    }

    try {
      console.log(`📁 Starting parallel folder upload: ${validation.validFiles.length} files`);
      
      // Use FileApiService to upload files with relative paths
      const results = await FileApiService.uploadFolderWithRelativePaths(
        currentProject.id,
        validation.validFiles,
        {
          concurrency: 3,
          onProgress: (current, total) => {
            console.log(`📁 Upload progress: ${current}/${total} files completed`);
          },
          onFileComplete: (file, response) => {
            console.log(`✅ File completed: ${file.name} → ${response.name}`);
          },
          onError: (file, error) => {
            console.error(`❌ File failed: ${file.name}`, error);
          }
        }
      );

      console.log(`✅ Folder upload completed: ${results.length} files uploaded successfully`);
      alert(`Successfully uploaded folder with ${results.length} files`);
      
      // Refresh the UI to show new files and folders
      if (onRefresh) {
        await onRefresh();
      }
      
    } catch (error) {
      console.error('❌ Enhanced folder upload failed:', error);
      alert(`Folder upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Recursive folder rendering function to support nested folders
  const renderFolderItem = (folder: ProjectFolder, depth: number = 0) => {
    const indentStyle = { marginLeft: `${depth * 0.8}rem` };
    const hasSubfolders = folder.children && folder.children.length > 0;
    const hasFiles = folder.files && folder.files.length > 0;
    const hasContent = hasSubfolders || hasFiles;
    
    return (
      <div key={folder.id} className="folder-item" style={{ marginBottom: '0.25rem' }}>
        {/* Folder Header */}
        <div style={{ ...indentStyle, display: 'flex', alignItems: 'center' }}>
          <button
            className="folder-toggle-btn"
            title={collapsedFolders[folder.id] ? 'Expand' : 'Collapse'}
            onClick={e => {
              e.stopPropagation();
              setCollapsedFolders(prev => ({ ...prev, [folder.id]: !prev[folder.id] }));
            }}
            style={{ 
              marginRight: 4, 
              background: 'none', 
              border: 'none', 
              padding: 0, 
              cursor: 'pointer', 
              display: 'flex', 
              alignItems: 'center',
              opacity: hasContent ? 1 : 0.3
            }}
            disabled={!hasContent}
          >
            {hasContent ? (collapsedFolders[folder.id] ? <Plus size={13} /> : <Minus size={13} />) : <span style={{ width: 13, height: 13 }} />}
          </button>
          <span className="folder-icon">📁</span>
          <span className="folder-name">{folder.name}</span>
          <span className="folder-path" style={{ fontSize: '0.7rem', color: '#666', marginLeft: '0.5rem' }}>
            {folder.relativePath && `(${folder.relativePath})`}
          </span>
          <button
            className="folder-actions-btn"
            title="Folder actions"
            onClick={(e) => {
              e.stopPropagation();
              setShowDropdown(showDropdown === folder.id ? null : folder.id);
            }}
            style={{ marginLeft: 'auto' }}
          >
            <MoreVertical size={12} />
          </button>
          {showDropdown === folder.id && (
            <div className="dropdown-menu">
              <button 
                className="dropdown-item"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDropdown(null);
                  // Trigger file input click
                  setTimeout(() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.multiple = true;
                    input.accept = '.pdf,.json,application/pdf,application/json';
                    input.onchange = (event) => {
                      const target = event.target as HTMLInputElement;
                      if (target.files) {
                        handleUploadToFolder(folder.id, target.files);
                      }
                    };
                    input.click();
                  }, 100);
                }}
              >
                <Upload size={12} />
                Upload Files
              </button>
              <button 
                className="dropdown-item delete"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onFolderDelete) {
                    onFolderDelete(folder.id);
                  }
                  setShowDropdown(null);
                }}
              >
                <X size={12} />
                Delete Folder
              </button>
            </div>
          )}
        </div>

        {/* Folder Contents (when expanded) */}
        {!collapsedFolders[folder.id] && (
          <div className="folder-contents">
            {/* Render Subfolders */}
            {hasSubfolders && (
              <div className="subfolders-section">
                {folder.children!.map(subfolder => renderFolderItem(subfolder, depth + 1))}
              </div>
            )}

            {/* Render Files */}
            {hasFiles && (
              <div className="folder-files-tree" style={{ marginLeft: `${(depth + 1) * 0.8}rem`, marginTop: '0.2rem' }}>
                {folder.files!.map(folderFile => {
                  return (
                    <div key={folderFile.id} className="folder-file-item" 
                         onClick={async () => {
                           try {
                             console.log('📁 Loading folder file:', folderFile.name, 'from folder:', folder.id);
                             // Load the file directly from IndexedDB using folder association
                             const folderFiles = await IndexedDBService.getFolderFiles(currentProject?.id || '', folder.id);
                             const actualFile = folderFiles.find(f => f.id === folderFile.id);
                             
                             if (actualFile) {
                               console.log('✅ Found folder file in IndexedDB:', actualFile.name);
                               onFileSelect(actualFile);
                             } else {
                               console.warn('❌ Folder file not found in IndexedDB, using local reference');
                               onFileSelect(folderFile);
                             }
                           } catch (error) {
                             console.error('❌ Failed to load folder file:', error);
                             // Fallback to local file reference
                             onFileSelect(folderFile);
                           }
                         }} 
                         style={{ cursor: 'pointer' }}>
                      {getFileIcon(folderFile.type)}
                      <span className="folder-file-name" title={folderFile.name}>{folderFile.name}</span>
                      <span className="folder-file-size">({Math.round(folderFile.size / 1024)}KB)</span>
                      <button
                        className="folder-file-actions"
                        title="File actions"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowDropdown(showDropdown === `file-${folderFile.id}` ? null : `file-${folderFile.id}`);
                        }}
                        style={{ marginLeft: 'auto', background: 'none', border: 'none', padding: '2px', cursor: 'pointer' }}
                      >
                        <MoreVertical size={10} />
                      </button>
                      {showDropdown === `file-${folderFile.id}` && (
                        <div className="dropdown-menu" style={{ fontSize: '0.7rem', minWidth: '100px' }}>
                          <button 
                            className="dropdown-item delete"
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                console.log('🗑️ Deleting file from folder:', folderFile.name, 'from folder:', folder.id);
                                
                                // Delete from backend API
                                onFileRemove(folderFile.id);
                                
                                // Also delete from IndexedDB folder association
                                await IndexedDBService.removeFileFromFolder(currentProject?.id || '', folder.id, folderFile.id);
                                
                                // Refresh UI
                                if (onRefresh) {
                                  await onRefresh();
                                }
                                
                                setShowDropdown(null);
                                console.log('✅ File deleted successfully from folder');
                              } catch (error) {
                                console.error('❌ Failed to delete file from folder:', error);
                              }
                            }}
                          >
                            <X size={10} />
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };



  const handleFileAction = (fileId: string, action: 'delete') => {
    if (action === 'delete') {
      onFileRemove(fileId);
    }
    setShowDropdown(null);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setShowDropdown(null);
    };
    
    if (showDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showDropdown]);

  // Save folders to localStorage whenever they change (project-specific)
  useEffect(() => {
    try {
      if (currentProject?.id) {
        localStorage.setItem(`fileUploader-folders-${currentProject.id}`, JSON.stringify(folders));
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        console.warn('⚠️ FileUploader localStorage quota exceeded, continuing without cache');
      } else {
        console.error('Failed to save folders to localStorage:', error);
      }
    }
  }, [folders, currentProject?.id]);

  // Load folders when project changes
  useEffect(() => {
    try {
      if (currentProject?.id) {
        const savedFolders = localStorage.getItem(`fileUploader-folders-${currentProject.id}`);
        const projectFolders = savedFolders ? JSON.parse(savedFolders) : [];
        // Note: We no longer manage local folder state - parent manages via API
        
        // Set collapsed state for the new project's folders  
        const collapsed: { [id: string]: boolean } = {};
        projectFolders.forEach((folder: ProjectFolder) => {
          collapsed[folder.id] = true; // Default to collapsed
        });
        setCollapsedFolders(collapsed);
      } else {
        // No project selected, clear folders
        // Note: We no longer manage local folder state - parent manages via API
        setCollapsedFolders({});
      }
    } catch (error) {
      console.error('Failed to load project folders:', error);
    }
  }, [currentProject?.id]);

  return (
    <div className="file-uploader">
      {/* Compact Header with Project Name */}
      <div className="storage-header">
        <div className="storage-info">
          <h3 className="files-title">
            {currentProject ? currentProject.name : 'Files'}
          </h3>
          {currentProject && (
            <span className={`project-type-badge ${currentProject.type.toLowerCase()}`}>
              {currentProject.type}
            </span>
          )}
        </div>
        <div className="storage-actions">
          <button
            className="upload-button"
            onClick={() => setShowDropZone(true)}
            title="Upload file"
          >
            <Upload size={14} />
          </button>
          <div className="folder-button-container">
            <button
              className="storage-button"
              onClick={() => setShowCreateFolder(true)}
              title="Create folder"
            >
              <FolderPlus size={14} />
            </button>
            {supportsFolderUpload() && (
              <button
                className="storage-button"
                onClick={() => folderInputRef.current?.click()}
                title="Upload folder"
              >
                <Folder size={14} />
              </button>
            )}
            {/* Small Create Folder Popup */}
            {showCreateFolder && (
              <div className="create-folder-popup">
                <div className="popup-header">
                  <span className="popup-title">New Folder</span>
                  <button className="popup-close" onClick={() => setShowCreateFolder(false)}>×</button>
                </div>
                <form onSubmit={e => { e.preventDefault(); handleCreateFolder(); }}>
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={e => setNewFolderName(e.target.value)}
                    placeholder="Folder name"
                    autoFocus
                    className="popup-input"
                  />
                  <div className="popup-actions">
                    <button type="button" className="popup-cancel" onClick={() => setShowCreateFolder(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="popup-create" disabled={!newFolderName.trim()}>
                      Create
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Folder List with Nested Support */}
      {folders && folders.length > 0 && (
        <div className="folders-section">
          <div className="folders-list">
            {/* Only render root-level folders (no parentId) */}
            {folders
              .filter(folder => !folder.parentId)
              .map(folder => renderFolderItem(folder, 0))
            }
          </div>
        </div>
      )} 
              alignItems: 'center',
              opacity: hasContent ? 1 : 0.3
            }}
            disabled={!hasContent}
          >
            {hasContent ? (collapsedFolders[folder.id] ? <Plus size={13} /> : <Minus size={13} />) : <span style={{ width: 13, height: 13 }} />}
          </button>
          <span className="folder-icon">📁</span>
          <span className="folder-name">{folder.name}</span>
          <span className="folder-path" style={{ fontSize: '0.7rem', color: '#666', marginLeft: '0.5rem' }}>
            {folder.relativePath && `(${folder.relativePath})`}
          </span>
          <button
            className="folder-actions-btn"
            title="Folder actions"
            onClick={(e) => {
              e.stopPropagation();
              setShowDropdown(showDropdown === folder.id ? null : folder.id);
            }}
            style={{ marginLeft: 'auto' }}
          >
            <MoreVertical size={12} />
          </button>
          {showDropdown === folder.id && (
            <div className="dropdown-menu">
              <button 
                className="dropdown-item"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDropdown(null);
                  // Trigger file input click
                  setTimeout(() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.multiple = true;
                    input.accept = '.pdf,.json,application/pdf,application/json';
                    input.onchange = (event) => {
                      const target = event.target as HTMLInputElement;
                      if (target.files) {
                        handleUploadToFolder(folder.id, target.files);
                      }
                    };
                    input.click();
                  }, 100);
                }}
              >
                <Upload size={12} />
                Upload Files
              </button>
              <button 
                className="dropdown-item delete"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onFolderDelete) {
                    onFolderDelete(folder.id);
                  }
                  setShowDropdown(null);
                }}
              >
                <X size={12} />
                Delete Folder
              </button>
            </div>
          )}
        </div>

        {/* Folder Contents (when expanded) */}
        {!collapsedFolders[folder.id] && (
          <div className="folder-contents">
            {/* Render Subfolders */}
            {hasSubfolders && (
              <div className="subfolders-section">
                {folder.children!.map(subfolder => renderFolderItem(subfolder, depth + 1))}
              </div>
            )}

            {/* Render Files */}
            {hasFiles && (
              <div className="folder-files-tree" style={{ marginLeft: `${(depth + 1) * 0.8}rem`, marginTop: '0.2rem' }}>
                {folder.files!.map(folderFile => {
                  return (
                    <div key={folderFile.id} className="folder-file-item" 
                         onClick={async () => {
                           try {
                             console.log('📁 Loading folder file:', folderFile.name, 'from folder:', folder.id);
                             // Load the file directly from IndexedDB using folder association
                             const folderFiles = await IndexedDBService.getFolderFiles(currentProject?.id || '', folder.id);
                             const actualFile = folderFiles.find(f => f.id === folderFile.id);
                             
                             if (actualFile) {
                               console.log('✅ Found folder file in IndexedDB:', actualFile.name);
                               onFileSelect(actualFile);
                             } else {
                               console.warn('❌ Folder file not found in IndexedDB, using local reference');
                               onFileSelect(folderFile);
                             }
                           } catch (error) {
                             console.error('❌ Failed to load folder file:', error);
                             // Fallback to local file reference
                             onFileSelect(folderFile);
                           }
                         }} 
                         style={{ cursor: 'pointer' }}>
                      {getFileIcon(folderFile.type)}
                      <span className="folder-file-name" title={folderFile.name}>{folderFile.name}</span>
                      <span className="folder-file-size">({Math.round(folderFile.size / 1024)}KB)</span>
                      <button
                        className="folder-file-actions"
                        title="File actions"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowDropdown(showDropdown === `file-${folderFile.id}` ? null : `file-${folderFile.id}`);
                        }}
                        style={{ marginLeft: 'auto', background: 'none', border: 'none', padding: '2px', cursor: 'pointer' }}
                      >
                        <MoreVertical size={10} />
                      </button>
                      {showDropdown === `file-${folderFile.id}` && (
                        <div className="dropdown-menu" style={{ fontSize: '0.7rem', minWidth: '100px' }}>
                          <button 
                            className="dropdown-item delete"
                            onClick={async (e) => {
                              e.stopPropagation();
                                  try {
                                    // Note: We no longer manage local folder state - parent manages via API
                                    // The parent should handle file deletion and refresh the folder files
                                    
                                    // Remove from IndexedDB
                                    const folderFiles = await IndexedDBService.getFolderFiles(currentProject?.id || '', folder.id);
                                    const fileToDelete = folderFiles.find(f => f.id === folderFile.id);
                                    if (fileToDelete) {
                                      await IndexedDBService.removeFile(fileToDelete.id);
                                      console.log('✅ Deleted folder file from IndexedDB:', folderFile.name);
                                    }
                                  } catch (error) {
                                    console.error('❌ Failed to delete folder file:', error);
                                  }
                                  setShowDropdown(null);
                                }}
                              >
                                <X size={10} />
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}



      {/* File Upload Dialog */}
      {showDropZone && (
        <div className="dialog-overlay">
          <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-header">
              <h3>Upload Files</h3>
              <button 
                className="close-button"
                onClick={() => setShowDropZone(false)}
                title="Close"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="dialog-body">
              <div
                className="dropzone"
                onDragOver={handleDragOver}
                onDrop={(e) => {
                  handleDrop(e);
                  setShowDropZone(false);
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={32} className="upload-icon" />
                <h4>Drop files here</h4>
                <p>or click to select files</p>
                <span className="file-types">Supported: PDF, JSON</span>
              </div>
            </div>
          </div>
          
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.json,application/pdf,application/json"
            onChange={(e) => {
              handleFileInputChange(e);
              setShowDropZone(false);
            }}
            style={{ display: 'none' }}
          />
        </div>
      )}

      {/* Messages */}
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {isUploading && (
        <div className="loading-message">
          {isUploading ? 'Uploading files...' : 'Processing...'}
        </div>
      )}

      {/* File List */}
      <div className="file-list">
        {files.length === 0 ? (
          <div className="no-files-message" style={{ padding: '1rem', textAlign: 'center', color: '#666' }}>
            {isUploading ? 'Loading files...' : 'No files in this project'}
          </div>
        ) : null}
        {/* Double-check: only show files that don't belong to any folder (should be filtered at App level) */}
        {files.filter(file => !file.folderId).map((file) => (
          <div
            key={file.id}
            className={`file-item ${selectedFileId === file.id ? 'selected' : ''}`}
            onClick={() => onFileSelect(file)}
            title={file.name}
          >
            <div className="file-info">
              {getFileIcon(file.type)}
              <div className="file-details">
                <div className="file-name">
                  {file.name}
                </div>
              </div>
            </div>
            
            <div className="file-actions">
              <button
                className="actions-button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDropdown(showDropdown === file.id ? null : file.id);
                }}
                title="File actions"
              >
                <MoreVertical size={12} />
              </button>
              
              {showDropdown === file.id && (
                <div className="dropdown-menu">
                  <div 
                    className="dropdown-item delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleFileAction(file.id, 'delete');
                    }}
                  >
                    <X size={12} />
                    Delete
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      
      {/* Hidden folder input for folder upload */}
      {supportsFolderUpload() && (
        <input
          ref={folderInputRef}
          type="file"
          {...({ webkitdirectory: '' } as React.InputHTMLAttributes<HTMLInputElement> & { webkitdirectory?: string })}
          multiple
          style={{ display: 'none' }}
          onChange={handleFolderUpload}
          accept=".pdf,.json,.docx,.txt,.xlsx,.md,.js,.ts,.tsx,.css,.html,.xml,.log,.csv,.png,.jpg,.jpeg,.gif,.svg"
        />
      )}
    </div>
  );
};