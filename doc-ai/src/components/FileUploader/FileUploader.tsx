import React, { useRef, useState, useEffect } from 'react';
import { Upload, X, FileText, File, MoreVertical, FolderPlus, Plus, Minus, Folder, Clock, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { 
  extractFilesFromFolder, 
  validateFolderContents, 
  supportsFolderUpload
} from '../../utils/folderUpload';
import { EnhancedFolderUploadHandler } from '../../utils/enhancedFolderUpload';
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
      fileDetails: files.map(f => ({ 
        id: f.id, 
        name: f.name, 
        url: f.url,
        nameLength: f.name?.length,
        isIdAsName: f.id === f.name
      })),
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

  // Processing status icon helper
  const getProcessingStatusIcon = (status?: string) => {
    switch (status) {
      case 'pending':
        return <div title="Processing Pending"><Clock size={12} className="status-icon pending" /></div>;
      case 'processing':
        return <div title="Processing..."><Loader2 size={12} className="status-icon processing spin" /></div>;
      case 'completed':
        return <div title="Processing Completed"><CheckCircle size={12} className="status-icon completed" /></div>;
      case 'failed':
        return <div title="Processing Failed"><AlertCircle size={12} className="status-icon failed" /></div>;
      default:
        return null;
    }
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
  
  // Recursive function to render folders hierarchically
  const renderFolderHierarchy = (folder: ProjectFolder, depth: number = 0): React.ReactElement => {
    const isCollapsed = collapsedFolders[folder.id];
    const hasChildren = folder.children && folder.children.length > 0;
    const hasFiles = folder.files && folder.files.length > 0;
    const indentStyle = { marginLeft: `${depth * 1.2}rem` };

    return (
      <div key={folder.id} className="folder-item" onClick={(e) => e.stopPropagation()} style={{ display: 'block', marginBottom: '0.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', ...indentStyle }}>
          {(hasChildren || hasFiles) && (
            <button
              className="folder-toggle-btn"
              title={isCollapsed ? 'Expand' : 'Collapse'}
              onClick={e => {
                e.stopPropagation();
                setCollapsedFolders(prev => ({ ...prev, [folder.id]: !prev[folder.id] }));
              }}
              style={{ marginRight: 4, background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              {isCollapsed ? <Plus size={13} /> : <Minus size={13} />}
            </button>
          )}
          <span className="folder-icon">📁</span>
          <span className="folder-name">{folder.name}</span>
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
        
        {/* Render subfolders and files when expanded */}
        {!isCollapsed && (hasChildren || hasFiles) && (
          <div className="folder-contents" style={{ marginLeft: `${(depth + 1) * 1.2}rem`, marginTop: '0.2rem' }}>
            {/* Render subfolders first */}
            {hasChildren && folder.children!.map(childFolder => 
              renderFolderHierarchy(childFolder, depth + 1)
            )}
            
            {/* Then render files */}
            {hasFiles && folder.files!.map(folderFile => (
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
                   style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px 0' }}>
                {getFileIcon(folderFile.type)}
                <span className="folder-file-name" title={folderFile.name.replace(/^[a-f0-9-]+_/, '')} style={{ marginLeft: '4px' }}>{folderFile.name.replace(/^[a-f0-9-]+_/, '')}</span>
                <span className="folder-file-size" style={{ marginLeft: '4px', fontSize: '0.8em', color: '#666' }}>
                  ({Math.round(folderFile.size / 1024)}KB)
                </span>
                {getProcessingStatusIcon(folderFile.processingStatus)}
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
            ))}
          </div>
        )}
      </div>
    );
  };

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

      // Generate batch_id for this upload action
      const batchId = crypto.randomUUID();
      console.log('📦 Generated batch_id for folder upload:', batchId);

      // Upload each file to the folder via API
      const uploadPromises = Array.from(fileList).map(async (file) => {
        try {
          console.log('📤 Starting upload for file:', file.name, 'to folder:', folderId, 'with batch_id:', batchId);
          const response = await FileApiService.uploadFileToFolder(folderId, file, batchId);
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

      // Check if any files have webkitRelativePath with subfolders
      const hasSubfolders = files.some((file: File) => {
        const relativePath = 'webkitRelativePath' in file ? (file as File & { webkitRelativePath: string }).webkitRelativePath : '';
        return relativePath.includes('/') && relativePath.split('/').length > 2; // More than just folder/file
      });

      if (hasSubfolders) {
        console.log('📁 Detected subfolders - using enhanced folder upload');
        await handleEnhancedFolderUpload(files);
      } else {
        console.log('📁 Simple folder structure - using standard folder upload');
        await handleSimpleFolderUpload(files);
      }
      
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

  // Enhanced folder upload handler for subfolders
  const handleEnhancedFolderUpload = async (files: File[]) => {
    if (!onFolderCreate || !currentProject) {
      console.error('❌ Missing required callbacks for enhanced folder upload');
      alert('Cannot create folders: Missing folder creation handler or project not selected');
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
      await EnhancedFolderUploadHandler.uploadFolderWithSubfolders({
        files: validation.validFiles,
        onFileUpload: async (file: File, relativePath: string, batchId: string) => {
          await FileApiService.uploadFileWithBatch(currentProject.id, file, relativePath, batchId);
        },
        onProgress: (progress) => {
          console.log(`📁 Enhanced folder upload progress: ${progress}%`);
        }
      });

      console.log('✅ Enhanced folder upload completed successfully');
      alert(`Successfully uploaded folder with subfolders (${validation.validFiles.length} files)`);
      
      // Refresh the folder list and file list
      if (onRefresh) {
        onRefresh();
      }
      
    } catch (error) {
      console.error('❌ Enhanced folder upload failed:', error);
      throw error;
    }
  };

  // Simple folder upload handler (original logic)
  const handleSimpleFolderUpload = async (files: File[]) => {
    // Get folder name from the first file's webkitRelativePath
    let folderName = 'UploadedFolder';
    if (files.length > 0 && files[0].webkitRelativePath) {
      const pathParts = files[0].webkitRelativePath.split('/');
      if (pathParts.length > 0) {
        folderName = pathParts[0]; // Get the root folder name
      }
    }

    console.log(`📁 Detected folder name: ${folderName}`);

    // Validate folder contents
    const validation = validateFolderContents(files, {
      maxTotalFiles: 100,
      allowedExtensions: ['.pdf', '.json', '.docx', '.txt', '.xlsx', '.md', '.js', '.ts', '.tsx', '.css', '.html', '.xml', '.log', '.csv', '.png', '.jpg', '.jpeg', '.gif', '.svg'],
      maxFileSize: 500 * 1024 * 1024 // 500MB per file - chunked upload for large files
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

    console.log(`📁 Creating folder "${folderName}" and uploading ${validation.validFiles.length} files`);

    // Step 1: Create the folder first
    if (!onFolderCreate) {
      console.error('❌ onFolderCreate callback not provided');
      alert('Cannot create folder: Missing folder creation handler');
      return;
    }

    if (!currentProject) {
      console.error('❌ No project selected for folder creation');
      alert('Cannot create folder: No project selected');
      return;
    }

    // Create the folder and get the response with folder ID
    const createdFolder = await onFolderCreate(folderName);
    console.log(`✅ Folder "${folderName}" created successfully with ID: ${createdFolder.id}`);

    // Step 2: Upload all files to the newly created folder
    try {
      const dt = new DataTransfer();
      validation.validFiles.forEach((file: File) => dt.items.add(file));
      
      await handleUploadToFolder(createdFolder.id, dt.files);
      console.log(`✅ Successfully uploaded ${validation.validFiles.length} files to folder "${folderName}"`);
      
      // Optional: Show success message
      if (validation.validFiles.length > 0) {
        alert(`Successfully uploaded ${validation.validFiles.length} files to folder "${folderName}"`);
      }
      
    } catch (uploadError) {
      console.error('❌ Failed to upload files to the created folder:', uploadError);
      alert(`Failed to upload files to folder "${folderName}": ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`);
    }
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
      
      {/* Folder List and File List in a scrollable container */}
      <div className="scrollable-content">
        {/* Folder List */}
        {folders && folders.length > 0 && (
          <div className="folders-section">
            <div className="folders-list">
              {/* Only render root level folders (those without parentId or with parentId = null) */}
              {folders
                .filter(folder => !folder.parentId)
                .map(folder => renderFolderHierarchy(folder, 0))
              }
            </div>
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
                  <div className="file-name" title={file.name}>
                    {file.name.replace(/^[a-f0-9-]+_/, '')}
                  </div>
                </div>
                {getProcessingStatusIcon(file.processingStatus)}
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
      </div>
      
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