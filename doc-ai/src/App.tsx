import { useState, useCallback, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react';
import { FileUploader } from './components/FileUploader';
import { DocAISection } from './components/DocAISection';
import { ToastContainer } from './components/Toast';
import { ExtractPage, BAPage, QAPage, ProjectLanding } from './pages';
import { useApiFileUpload } from './hooks/useApiFileUpload';
import { useApiFiles } from './hooks/useApiFiles';
import { useJsonViewer } from './hooks/useJsonViewer';
import { usePdfViewer } from './hooks/usePdfViewer';
import { useStorage } from './hooks/useStorage';
import { useIndexedDBStorage } from './hooks/useIndexedDBStorage';
import { useProjects } from './hooks/useProjects';
import { useToast } from './hooks/useToast';
import { PdfService } from './services/pdfService';
import { JsonService } from './services/jsonService';
import { PublicJsonLoaderService } from './services/publicJsonLoaderService';
import { FolderApiService } from './services/folderApiService';
import { FileApiService } from './services/fileApiService';
import { StorageMonitor } from './components/StorageMonitor/StorageMonitor';
import { websocketService } from './services/websocketService';
import type { FileData, Project, JsonData } from './types';
import './App.css';

function App() {
  const [selectedFile, setSelectedFile] = useState<FileData | null>(null);
  const [isLeftPanelVisible, setIsLeftPanelVisible] = useState(true);
  const [activeTab, setActiveTab] = useState<'extract' | 'ba'>('extract');
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [currentView, setCurrentView] = useState<'projects' | 'files'>('projects');
  const [isStorageReady, setIsStorageReady] = useState(false);
  const [hasRestoredProject, setHasRestoredProject] = useState(false);
  const [isStorageMonitorOpen, setIsStorageMonitorOpen] = useState(false);
  const loadedFilesRef = useRef(new Set<string>());
  
  // Persist currentProject to localStorage with quota handling
  const setCurrentProjectWithPersistence = useCallback((project: Project | null) => {
    setCurrentProject(project);
    if (project) {
      try {
        localStorage.setItem('docai-current-project', JSON.stringify(project));
        setCurrentView('files'); // Switch to files view when project is selected
      } catch (error) {
        console.warn('⚠️ Failed to save current project to localStorage:', error);
        
        // Try to clear some space and retry
        if (error instanceof Error && error.name === 'QuotaExceededError') {
          console.log('🧹 Attempting to clear localStorage to free space...');
          
          // Clear non-essential items from localStorage
          const keysToRemove = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (
              key.startsWith('fileUploader-') || 
              key.startsWith('pdf-images-') ||
              key.startsWith('temp-') ||
              key.includes('cache')
            )) {
              keysToRemove.push(key);
            }
          }
          
          keysToRemove.forEach(key => {
            try {
              localStorage.removeItem(key);
              console.log(`🗑️ Removed localStorage key: ${key}`);
            } catch (e) {
              console.warn(`Failed to remove key ${key}:`, e);
            }
          });
          
          // Retry saving the current project
          try {
            localStorage.setItem('docai-current-project', JSON.stringify(project));
            console.log('✅ Successfully saved project after cleanup');
          } catch (retryError) {
            console.error('❌ Still failed to save project after cleanup:', retryError);
            // Continue anyway, the app can work without localStorage persistence
          }
        }
        
        setCurrentView('files'); // Switch to files view regardless
      }
    } else {
      try {
        localStorage.removeItem('docai-current-project');
      } catch (error) {
        console.warn('Failed to remove current project from localStorage:', error);
      }
      setCurrentView('projects'); // Switch back to projects view
    }
  }, []);
  
  // Persist selected file ID to localStorage
  const setSelectedFileWithPersistence = useCallback((file: FileData | null) => {
    setSelectedFile(file);
    if (file && currentProject) {
      localStorage.setItem(`docai-selected-file-${currentProject.id}`, file.id);
    } else if (currentProject) {
      localStorage.removeItem(`docai-selected-file-${currentProject.id}`);
    }
  }, [currentProject]);

  // Project management hook
  const {
    projects,
    createProject,
    deleteProject,
    refreshProjects
  } = useProjects();

  // Debug projects state changes
  useEffect(() => {
    console.log('📊 App.tsx: Projects state updated, count:', projects.length);
    if (projects.length > 0) {
      console.log('📋 Current projects:', projects.map(p => ({ id: p.id, name: p.name })));
    }
  }, [projects]);



  // IndexedDB storage hook
  const indexedDBStorage = useIndexedDBStorage();

  // Toast notifications hook
  const { toasts, removeToast, showError, showWarning } = useToast();

  // Monitor IndexedDB initialization with fallback
  useEffect(() => {
    if (indexedDBStorage.isInitialized) {
      setIsStorageReady(true);
      console.log('✅ IndexedDB storage is ready');
    } else if (indexedDBStorage.error) {
      // If IndexedDB failed, use fallback mode immediately
      console.log('⚠️ IndexedDB failed, enabling fallback mode:', indexedDBStorage.error);
      setIsStorageReady(true);
    } else if (!isStorageReady && !indexedDBStorage.isLoading) {
      // If not loading and not initialized, something went wrong
      console.log('⚠️ IndexedDB not loading and not initialized, enabling fallback mode');
      setIsStorageReady(true);
    } else if (!isStorageReady) {
      // Fallback: If IndexedDB takes too long, allow the app to work without it
      const fallbackTimer = setTimeout(() => {
        console.log('⚠️ IndexedDB taking too long, enabling fallback mode');
        setIsStorageReady(true);
      }, 3000); // 3 second timeout
      
      return () => clearTimeout(fallbackTimer);
    }
  }, [indexedDBStorage.isInitialized, indexedDBStorage.error, indexedDBStorage.isLoading, isStorageReady]);

  // Restore currentProject from localStorage on app startup - ONLY ONCE
  useEffect(() => {
    if (hasRestoredProject) {
      return; // Already restored, don't do it again
    }
    
    const restoreProject = () => {
      try {
        const storedProject = localStorage.getItem('docai-current-project');
        if (storedProject) {
          const project = JSON.parse(storedProject) as Project;
          console.log('🔄 Restoring project from localStorage:', project.name);
          setCurrentProject(project);
          setCurrentView('files');
        } else {
          console.log('📝 No stored project found, showing projects view');
          setCurrentView('projects');
        }
      } catch (error) {
        console.error('Failed to restore project from localStorage:', error);
        setCurrentView('projects');
      } finally {
        setHasRestoredProject(true); // Mark as completed
      }
    };

    // Only restore once on initial mount
    restoreProject();
  }, [hasRestoredProject]); // Only depend on the flag

  // File upload hook - configured for project root uploads only
  // Folder uploads are handled separately in FileUploader component
  const {
    files,
    isUploading,
    error: uploadError,
    uploadFiles: originalUploadFiles,
    removeFile: originalRemoveFile,
    restoreFiles,
  } = useApiFileUpload({ currentProject, targetFolderId: null }); // Explicitly set to null for project root

  // API-based file management for database-only file display
  const {
    files: apiFiles,
    folders,
    isLoading: apiFilesLoading,
    error: apiFilesError,
    refreshFiles: refreshApiFiles,
  } = useApiFiles({ currentProject });

  // Debug logging for folders
  useEffect(() => {
    console.log('🔍 App.tsx - Folders from API:', folders);
    console.log('🔍 App.tsx - Folders length:', folders?.length);
    console.log('🔍 App.tsx - Current project:', currentProject?.id);
  }, [folders, currentProject]);

  const {
    storedFiles,
    saveFile,
    loadFileContent,
    savePdfImages,
    loadPdfImages,
    findJsonForPdf,
  } = useStorage();

  const {
    jsonData,
    viewMode,
    error: jsonError,
    updateJsonData,
    toggleViewMode,
    clearJsonData,
    setJsonError,
  } = useJsonViewer();

  const {
    pdfPages,
    currentPage,
    isLoading: pdfLoading,
    error: pdfError,
    totalPages,
    updatePdfPages,
    goToPage,
    nextPage,
    previousPage,
    zoomIn,
    zoomOut,
    resetZoom,
    setLoading: setPdfLoading,
    setPdfError,
    clearPdf,
  } = usePdfViewer();

  // Use only API files from database - no local storage files
  let allFiles: FileData[] = [];
  if (currentProject) {
    const projectId = currentProject.id;
    
    // Debug: Log all API files and their project IDs
    console.log('🔍 All API files:', apiFiles.map(f => ({
      id: f.id,
      name: f.name,
      projectId: f.projectId,
      url: f.url
    })));
    
    // Debug: Log all files to see their folder assignments
    console.log('🔍 API files from useApiFiles (should only be project-level files):', apiFiles.map(f => ({
      id: f.id,
      name: f.name,
      projectId: f.projectId,
      folderId: f.folderId,
      hasFolder: !!f.folderId
    })));
    
    // useApiFiles hook should only return project-level files, but filter as safety measure
    // ONLY show files that belong to this project AND have folderId = null
    allFiles = apiFiles.filter(f => f.projectId === projectId && f.folderId == null);
    
    console.log('🔍 Final file list for project', projectId + ':', {
      finalFileCount: allFiles.length,
      totalApiFiles: apiFiles.length,
      filesWithFolders: apiFiles.filter(f => f.projectId === projectId && f.folderId != null).length,
      filesWithFolderId: allFiles.filter(f => f.folderId).length,
      apiLoading: apiFilesLoading,
      apiError: apiFilesError,
      currentProjectId: projectId
    });
  } else {
    allFiles = [];
  }

  // Enhanced file upload that saves to backend API
  const uploadFiles = useCallback(async (fileList: FileList) => {
    if (!currentProject) {
      throw new Error('No project selected for file upload');
    }
    
    // Use API upload functionality to ensure files reach the database
    await originalUploadFiles(fileList);
    
    // Refresh API files to get updated file list from database
    await refreshApiFiles();
    
    // Refresh project statistics after uploading
    setTimeout(() => {
      refreshProjects();
    }, 500); // Small delay to ensure API operations complete
  }, [originalUploadFiles, currentProject, refreshProjects, refreshApiFiles]);

  // Enhanced file removal that removes from backend API
  const removeFile = useCallback(async (fileId: string) => {
    if (!currentProject) {
      throw new Error('No project selected for file removal');
    }
    
    // Use API remove functionality to ensure files are removed from database
    await originalRemoveFile(fileId, currentProject.id);
    
    // Refresh API files to get updated file list from database
    await refreshApiFiles();
    
    // Refresh project statistics after removing
    setTimeout(() => {
      refreshProjects();
    }, 500); // Small delay to ensure API operations complete
  }, [originalRemoveFile, currentProject, refreshProjects, refreshApiFiles]);

  // Folder management functions
  const handleFolderCreate = useCallback(async (folderName: string, parentId?: string, relativePath?: string) => {
    if (!currentProject) {
      throw new Error('No project selected for folder creation');
    }
    
    try {
      console.log('📁 Creating folder:', folderName, 'in project:', currentProject.id, 'parent:', parentId || 'root', 'relativePath:', relativePath || 'none');
      const folderResponse = await FolderApiService.createFolder(currentProject.id, folderName, parentId, relativePath);
      console.log('📁 API Response for folder creation:', folderResponse);
      
      // Refresh API files to get updated folder list
      await refreshApiFiles();
      
      // Refresh projects to update folder counts in project cards
      await refreshProjects();
      
      console.log('✅ Folder created successfully:', folderResponse);
      return folderResponse; // Return the created folder information
    } catch (error) {
      console.error('❌ Failed to create folder:', error);
      throw error;
    }
  }, [currentProject, refreshApiFiles, refreshProjects]);

  const handleFolderDelete = useCallback(async (folderId: string) => {
    try {
      console.log('🗑️ Deleting folder:', folderId);
      await FolderApiService.deleteFolder(folderId);
      
      // Refresh API files to get updated folder list
      await refreshApiFiles();
      
      // Refresh projects to update folder counts in project cards
      await refreshProjects();
      
      console.log('✅ Folder deleted successfully');
    } catch (error) {
      console.error('❌ Failed to delete folder:', error);
      throw error;
    }
  }, [refreshApiFiles, refreshProjects]);

  // Utility to check localStorage usage
  const getLocalStorageUsage = useCallback(() => {
    try {
      let totalSize = 0;
      let itemCount = 0;
      const items: { key: string; size: number }[] = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          const value = localStorage.getItem(key);
          if (value) {
            const size = value.length;
            totalSize += size;
            itemCount++;
            items.push({ key, size });
          }
        }
      }
      
      return {
        totalSize,
        totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
        itemCount,
        items: items.sort((a, b) => b.size - a.size)
      };
    } catch (error) {
      console.warn('Failed to analyze localStorage usage:', error);
      return { totalSize: 0, totalSizeMB: '0.00', itemCount: 0, items: [] };
    }
  }, []);

  // Monitor localStorage usage on component mount
  useEffect(() => {
    const usage = getLocalStorageUsage();
    console.log('📊 LocalStorage usage:', usage);
    
    // Warn if usage is high (approaching 5MB limit)
    if (usage.totalSize > 4 * 1024 * 1024) { // 4MB threshold
      console.warn('⚠️ LocalStorage usage is high:', usage.totalSizeMB, 'MB');
      console.log('📋 Largest items:', usage.items.slice(0, 5));
    }
  }, [getLocalStorageUsage]);

  // Load project files from IndexedDB when project changes
  useEffect(() => {
    let mounted = true;
    
    const loadProjectFiles = async () => {
      if (!currentProject || !isStorageReady) {
        console.log('⏳ Skipping file load - project:', !!currentProject, 'storageReady:', isStorageReady);
        return;
      }

      // If IndexedDB is not initialized, skip IndexedDB operations but continue with localStorage
      if (!indexedDBStorage.isInitialized) {
        console.log('📝 IndexedDB not ready, using localStorage fallback');
        
        // Try to restore from localStorage if available
        const storedSelectedFileId = localStorage.getItem(`docai-selected-file-${currentProject.id}`);
        if (storedSelectedFileId && mounted) {
          console.log('🔍 Found stored selected file ID in localStorage:', storedSelectedFileId);
          // We'll handle this in the existing storage systems
        }
        return;
      }

      try {
        console.log('🔄 Loading files from IndexedDB for project:', currentProject.name);
        
        // First check all files for this project
        const allProjectFiles = await indexedDBStorage.getProjectFiles(currentProject.id);
        console.log('📁 Found', allProjectFiles.length, 'total files in IndexedDB for project:', currentProject.id);
        
        // Then get only root files (files without folderId)
        const projectFiles = await indexedDBStorage.getProjectRootFiles(currentProject.id);
        console.log('📁 Found', projectFiles.length, 'root files in IndexedDB for project:', currentProject.id);
        
        // Log some details about the files for debugging
        if (allProjectFiles.length > 0) {
          console.log('📋 All files details:', allProjectFiles.map(f => ({ 
            name: f.name, 
            folderId: f.folderId || 'root',
            projectId: f.projectId 
          })));
        }
        
        // Convert stored files to FileData format for compatibility
        // Use all project files (both root and folder files) for now
        const filesToProcess = allProjectFiles.length > 0 ? allProjectFiles : projectFiles;
        
        // Filter files by current project and deduplicate by file ID
        const filteredFiles = filesToProcess.filter(f => f.projectId === currentProject.id);
        console.log('🔍 Processing', filteredFiles.length, 'files after project filtering');
        
        const dedupedFilesMap = new Map();
        filteredFiles.forEach(f => {
          if (!dedupedFilesMap.has(f.id)) {
            dedupedFilesMap.set(f.id, {
              id: f.id,
              name: f.name,
              type: f.type,
              size: f.size,
              lastModified: f.lastModified,
              content: f.content,
              projectId: f.projectId
            });
          }
        });
        const dedupedFiles = Array.from(dedupedFilesMap.values());

        // Update the file hooks with deduplicated, project-filtered files
        if (mounted && dedupedFiles.length > 0) {
          console.log('✅ Restoring project files to UI:', dedupedFiles.length);
          restoreFiles(dedupedFiles);
          // Only use IndexedDB as the source of truth
          // Restore selected file if we have a stored selection
          const storedSelectedFileId = localStorage.getItem(`docai-selected-file-${currentProject.id}`);
          console.log('🔍 Looking for stored selected file ID:', storedSelectedFileId);
          if (storedSelectedFileId) {
            const selectedFileData = dedupedFiles.find(f => f.id === storedSelectedFileId);
            if (selectedFileData) {
              console.log('🎯 Restoring selected file:', selectedFileData.name, 'has content:', !!selectedFileData.content);
              setSelectedFile(selectedFileData);
            } else {
              console.warn('❌ Selected file ID not found in restored files');
              // Clear invalid selection
              localStorage.removeItem(`docai-selected-file-${currentProject.id}`);
            }
          }
        } else if (dedupedFiles.length === 0) {
          console.log('📝 No files found in IndexedDB for this project');
        }
      } catch (error) {
        console.error('❌ Failed to load project files from IndexedDB:', error);
      }
    };

    loadProjectFiles();
    
    return () => {
      mounted = false;
    };
  }, [currentProject?.id, isStorageReady, indexedDBStorage.isInitialized]);

  // Save uploaded files to storage when they're added (keep old storage for compatibility)
  useEffect(() => {
    if (!currentProject) {
      if (files.length > 0) {
        console.warn('⚠️ Files detected but no project is selected. Please open a project first from the Project Landing page.');
      }
      return;
    }
    
    console.log('💾 Checking files for storage:', files.length, 'files, current project:', currentProject?.id);
    files.forEach(file => {
      const existing = storedFiles.find(sf => sf.id === file.id);
      if (!existing) {
        // Ensure projectId is assigned if we have a current project
        const fileToSave = currentProject && !file.projectId 
          ? { ...file, projectId: currentProject.id }
          : file;
        console.log('💾 Saving file to IndexedDB:', fileToSave.name, 'with projectId:', fileToSave.projectId);
        saveFile(fileToSave);
      } else {
        console.log('💾 File already exists in storage:', file.name);
      }
    });
  }, [files, saveFile, currentProject, storedFiles]);

  const handleFileSelect = useCallback(async (file: FileData, isManualClick = false, isNewUpload = false) => {
    console.log('🔍 File selected:', file.name, 'Type:', file.type, 'Manual click:', isManualClick, 'New upload:', isNewUpload);
    setSelectedFileWithPersistence(file);
    
    // Clear previous state immediately
    clearJsonData();
    clearPdf(); // This already clears PDF error
    setPdfLoading(false); // Ensure no lingering loading state

    // If this is a manual click, remove any existing tracking to allow reprocessing
    if (isManualClick && currentProject) {
      const fileKey = `${currentProject.id}-${file.id}`;
      loadedFilesRef.current.delete(fileKey);
      console.log('🔄 Manual click detected, allowing reprocessing of:', file.name);
    }

    // Try to load file content if not available (but skip if file has URL - API files)
    let fileContent = file.content;
    const hasApiUrl = file.url && (file.url.startsWith('http') || file.url.startsWith('static/'));
    
    if (!fileContent && !hasApiUrl) {
      console.log('📁 Loading file content from storage for:', file.id);
      
      // Try IndexedDB first if available
      if (indexedDBStorage.isInitialized && currentProject) {
        try {
          const storedFiles = await indexedDBStorage.getProjectFiles(currentProject.id);
          const storedFile = storedFiles.find(sf => sf.id === file.id);
          if (storedFile && storedFile.content) {
            fileContent = storedFile.content;
            file.content = fileContent; // Update the file object
            console.log('✅ Content loaded from IndexedDB, type:', typeof fileContent, 'length:', 
              fileContent instanceof ArrayBuffer ? fileContent.byteLength : fileContent.length);
          }
        } catch (dbError) {
          console.warn('Failed to load from IndexedDB, trying localStorage:', dbError);
        }
      }
      
      // Fallback to localStorage if IndexedDB didn't work
      if (!fileContent) {
        const loadedContent = loadFileContent(file.id);
        if (loadedContent) {
          file.content = loadedContent;
          fileContent = loadedContent;
          console.log('✅ Content loaded from localStorage, type:', typeof loadedContent, 'length:', 
            loadedContent instanceof ArrayBuffer ? loadedContent.byteLength : loadedContent.length);
        } else {
          console.log('❌ No content found in any storage for file:', file.id);
        }
      }
    } else if (hasApiUrl) {
      console.log('✅ File has API URL, will use URL-based rendering:', file.url);
    } else {
      console.log('✅ File already has content, type:', typeof fileContent);
    }

    // Check content/URL availability
    if (!fileContent && !hasApiUrl) {
      console.error('❌ Cannot process file - no content or URL available:', file.name);
      if (file.type === 'application/json') {
        setJsonError('File content not available. Please re-upload the file.');
      } else if (file.type === 'application/pdf') {
        setPdfError('File content not available. Please re-upload the file.');
      }
      return;
    }

    // For API files with URLs, we can proceed without content for PDF processing
    if (hasApiUrl && file.type === 'application/pdf') {
      console.log('📄 Processing API PDF file with URL:', file.url);
    }

    // Check if it's a JSON file
    const isJsonFile = file.type === 'application/json' || 
                      file.name.toLowerCase().endsWith('.json') ||
                      file.type.includes('json');

    if (isJsonFile) {
      console.log('🔄 Processing JSON file...');
      console.log('📊 JSON file details:', {
        name: file.name,
        type: file.type,
        hasContent: !!fileContent,
        hasUrl: !!hasApiUrl,
        contentType: fileContent ? typeof fileContent : 'none',
        isArrayBuffer: fileContent instanceof ArrayBuffer
      });
      
      if (fileContent) {
        // Process local content
        try {
          let jsonContent: string;
          if (typeof fileContent === 'string') {
            jsonContent = fileContent;
          } else if (fileContent instanceof ArrayBuffer) {
            // Convert ArrayBuffer to string for JSON files
            const decoder = new TextDecoder('utf-8');
            jsonContent = decoder.decode(fileContent);
          } else {
            throw new Error(`Unsupported file content format: ${typeof fileContent}`);
          }

          console.log('📄 JSON content preview:', jsonContent.substring(0, 100) + '...');
          
          // Use enhanced JsonService with IOU sorting
          const parsedJson = JsonService.parseJsonFromString(jsonContent, true);
          console.log('✅ JSON parsed and sorted successfully, keys:', Object.keys(parsedJson));
          
          updateJsonData(parsedJson);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Failed to parse JSON';
          console.error('❌ JSON parsing error:', errorMsg);
          setJsonError(errorMsg);
        }
      } else if (hasApiUrl) {
        // Load JSON from API URL
        try {
          console.log('📄 Loading JSON from API URL:', file.url);
          
          const fileUrl = file.url!;
          const fullUrl = fileUrl.startsWith('http') 
            ? fileUrl 
            : `http://localhost:8000/${fileUrl.replace(/^\//, '')}`;
          
          const response = await fetch(fullUrl);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          const jsonContent = await response.text();
          console.log('📄 JSON content loaded from URL, preview:', jsonContent.substring(0, 100) + '...');
          
          // Use enhanced JsonService with IOU sorting
          const parsedJson = JsonService.parseJsonFromString(jsonContent, true);
          console.log('✅ JSON parsed and sorted successfully from URL, keys:', Object.keys(parsedJson));
          
          updateJsonData(parsedJson);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Failed to load JSON from URL';
          console.error('❌ JSON URL loading error:', errorMsg);
          setJsonError(errorMsg);
        }
      } else {
        setJsonError('JSON file content not available. Please re-upload the file.');
      }
    } else if (file.type === 'application/pdf') {
      console.log('🔄 Processing PDF file...');
      console.log('📊 File info:', {
        name: file.name,
        size: file.size,
        hasContent: !!fileContent,
        contentType: fileContent ? typeof fileContent : 'none',
        isArrayBuffer: fileContent instanceof ArrayBuffer,
        bufferSize: fileContent instanceof ArrayBuffer ? fileContent.byteLength : 'N/A'
      });

      try {
        setPdfLoading(true);

        // Fetch PDF content from backend API if not available locally
        if (!fileContent && file.id) {
          console.log('📥 Fetching PDF content from backend for file:', file.id, 'using URL:', file.url);
          try {
            // Use the file's URL property to construct the full URL
            const fileUrl = file.url!;
            const fullUrl = fileUrl.startsWith('http')
              ? fileUrl
              : `http://localhost:8000/${fileUrl.replace(/^\//, '')}`;

            console.log('🌐 Full PDF URL:', fullUrl);
            const response = await fetch(fullUrl);
            if (response.ok) {
              const blob = await response.blob();
              fileContent = await blob.arrayBuffer();
              file.content = fileContent;
              console.log('✅ PDF content loaded from backend, size:', blob.size);
            } else {
              throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
            }
          } catch (apiError) {
            console.error('❌ Failed to fetch PDF from backend:', apiError);
            setPdfError('Failed to load PDF from server. Please check your connection.');
            setPdfLoading(false);
            return;
          }
        }

        // First, try to load JSON data from IndexedDB (only for existing files, not new uploads)
        try {
          let jsonData: JsonData | null = null;

          // Skip storage loading for new uploads - always generate fresh content
          if (!isNewUpload) {
            // Try to load from IndexedDB first
            if (indexedDBStorage.isInitialized) {
              try {
                // First try by file ID
                jsonData = await indexedDBStorage.getJsonData(file.id);
                if (jsonData) {
                  console.log('✅ JSON data loaded from IndexedDB by file ID');
                } else {
                  // If not found by file ID, try by content hash (same file with new ID)
                  jsonData = await indexedDBStorage.getJsonDataByContent(file.name, file.size, file.lastModified);
                  if (jsonData) {
                    console.log('✅ JSON data loaded from IndexedDB by content hash (existing file with new ID)');
                  }
                }
              } catch (dbError) {
                console.warn('Failed to load JSON from IndexedDB:', dbError);
              }
            }
          } else {
            console.log('🆕 New upload detected - skipping storage lookup, will generate fresh content');
          }

          // If no data in IndexedDB, try to load from public folder, then extract from PDF
          if (!jsonData) {
            console.log('� Trying to load JSON from public folder for PDF:', file.name);
            jsonData = await PublicJsonLoaderService.loadJsonForPdf(file.name);

            if (jsonData) {
              console.log('✅ JSON data loaded from public folder');
              // Store in IndexedDB for future use
              if (indexedDBStorage.isInitialized && currentProject && jsonData) {
                try {
                  await indexedDBStorage.storeJsonData(file.id, currentProject.id, jsonData, file.name, file.size, file.lastModified);
                  console.log('✅ Public JSON stored in IndexedDB for future lookup');
                } catch (dbError) {
                  console.warn('Failed to store public JSON in IndexedDB:', dbError);
                }
              }
            } else {
              console.log('📝 No matching JSON in public folder, extracting from PDF...');
              // Create a File object from the ArrayBuffer for PDF processing
              const pdfFile = fileContent ? new File([fileContent], file.name, { type: 'application/pdf' }) : null;
              if (pdfFile) {
                // Create a proper FileData object for the PDF service
                const pdfFileData: FileData = {
                  id: file.id,
                  name: file.name,
                  type: file.type,
                  size: file.size,
                  lastModified: file.lastModified,
                  content: fileContent,
                  file: pdfFile
                };
                jsonData = await PdfService.extractJsonFromPdf(pdfFileData);
                console.log('✅ PDF text extracted and converted to JSON');

                // Store the extracted JSON in IndexedDB if we have a current project
                if (indexedDBStorage.isInitialized && currentProject && jsonData) {
                  try {
                    await indexedDBStorage.storeJsonData(file.id, currentProject.id, jsonData, file.name, file.size, file.lastModified);
                    console.log('✅ Extracted JSON stored in IndexedDB with content hash for future lookup');
                  } catch (dbError) {
                    console.warn('Failed to store JSON in IndexedDB:', dbError);
                  }
                }
              } else {
                console.log('❌ Cannot extract JSON - no PDF content available');
              }
            }
          }

          if (jsonData) {
            updateJsonData(jsonData);
          }
        } catch (extractError) {
          console.warn('⚠️ Failed to extract text from PDF:', extractError);

          // Fallback: Check for auto-loading JSON file with same name
          const associatedJson = findJsonForPdf(file.name);
          if (associatedJson) {
            console.log('🔗 Using associated JSON file instead');
            updateJsonData(associatedJson);
          } else {
            console.log('ℹ️ No associated JSON found, will show PDF images only');
          }
        }

        // Then, convert PDF to images for display (separate operation)
        try {
          // Skip image storage loading for new uploads - always generate fresh images
          let images: string[] | null = null;

          if (!isNewUpload) {
            // First try to load from IndexedDB for existing files
            if (indexedDBStorage.isInitialized) {
              try {
                images = await indexedDBStorage.getPdfImages(file.id);
                if (images) {
                  console.log('✅ PDF images loaded from IndexedDB');
                }
              } catch (dbError) {
                console.warn('Failed to load images from IndexedDB, falling back to localStorage:', dbError);
              }
            }

            // Fallback to localStorage for existing files
            if (!images) {
              images = loadPdfImages(file.id);
              if (images) {
                console.log('✅ PDF images loaded from localStorage');
              }
            }
          } else {
            console.log('🆕 New upload detected - skipping image storage lookup, will generate fresh images');
          }

          if (!images && fileContent) {
            console.log('🖼️ Converting PDF to images...');
            // Create a File object from the ArrayBuffer for PDF processing
            const pdfFile = new File([fileContent], file.name, { type: 'application/pdf' });
            // Create a proper FileData object for the PDF service
            const pdfFileData: FileData = {
              id: file.id,
              name: file.name,
              type: file.type,
              size: file.size,
              lastModified: file.lastModified,
              content: fileContent,
              file: pdfFile
            };
            images = await PdfService.convertPdfFileToImages(pdfFileData, async (imgs) => {
              // Save to localStorage (existing functionality)
              savePdfImages(file.id, imgs);

              // Also save to IndexedDB if available and we have a current project
              if (indexedDBStorage.isInitialized && currentProject) {
                try {
                  await indexedDBStorage.storePdfImages(file.id, currentProject.id, imgs);
                  console.log('✅ PDF images stored in IndexedDB');
                } catch (dbError) {
                  console.warn('Failed to store images in IndexedDB:', dbError);
                }
              }
            });
          }

          if (images) {
            updatePdfPages(images);
            console.log('✅ PDF images loaded, total pages:', images.length);
          } else {
            console.log('❌ No images to display - this should not happen if file content is available');
            setPdfError('Could not load or generate PDF images');
          }
        } catch (imageError) {
          console.warn('⚠️ Failed to convert PDF to images:', imageError);
          setPdfError('Could not display PDF images, but text extraction may have succeeded');
        }

      } catch (error) {
        console.error('❌ PDF processing error:', error);
        setPdfError(error instanceof Error ? error.message : 'Failed to process PDF');
      } finally {
        setPdfLoading(false);
      }
    } else {
      console.log('❓ Unknown file type:', file.type);
    }
  }, [
    updateJsonData, 
    updatePdfPages, 
    clearJsonData, 
    clearPdf, 
    setJsonError, 
    setPdfError, 
    setPdfLoading,
    loadFileContent,
    loadPdfImages,
    savePdfImages,
    findJsonForPdf,
    setSelectedFileWithPersistence,
    currentProject,
    indexedDBStorage
  ]);

  // Function to reload JSON data from IndexedDB for the current selected file
  const reloadJsonData = useCallback(async () => {
    if (!selectedFile || !currentProject || !indexedDBStorage.isInitialized) {
      console.warn('Cannot reload JSON data: missing selectedFile, currentProject, or IndexedDB not initialized');
      return;
    }

    try {
      console.log('🔄 Reloading JSON data for file:', selectedFile.name);
      
      // First, try to load from extraction endpoint if file has extraction
      if (selectedFile.hasExtraction) {
        try {
          console.log('🔍 Checking extraction endpoint for file:', selectedFile.id);
          const extraction = await FileApiService.getFileExtraction(selectedFile.id);
          if (extraction && extraction.status === 'completed' && extraction.extraction_json) {
            console.log('✅ JSON data loaded from extraction endpoint');
            updateJsonData(extraction.extraction_json);
            return;
          }
        } catch (extractionError) {
          console.warn('⚠️ Failed to load from extraction endpoint, trying IndexedDB:', extractionError);
        }
      }
      
      // Try to load from IndexedDB
      let jsonData = await indexedDBStorage.getJsonData(selectedFile.id);
      if (jsonData) {
        console.log('✅ JSON data reloaded from IndexedDB');
        updateJsonData(jsonData);
      } else {
        // If not found by file ID, try by content hash
        jsonData = await indexedDBStorage.getJsonDataByContent(selectedFile.name, selectedFile.size, selectedFile.lastModified);
        if (jsonData) {
          console.log('✅ JSON data reloaded from IndexedDB by content hash');
          updateJsonData(jsonData);
        } else {
          console.warn('❌ No JSON data found in IndexedDB for file:', selectedFile.name);
          clearJsonData();
        }
      }
    } catch (error) {
      console.error('❌ Failed to reload JSON data:', error);
      clearJsonData();
    }
  }, [selectedFile, currentProject, indexedDBStorage, updateJsonData, clearJsonData]);

  // WebSocket connection management for real-time updates
  useEffect(() => {
    if (currentProject?.id) {
      console.log(`🔌 Connecting to WebSocket for project: ${currentProject.id}`);
      
      // Connect to project WebSocket
      websocketService.connect(currentProject.id);
      
      // Listen for file processing updates
      const handleFileProcessed = (data: { file_id: string; batch_id: string; status: string; has_extraction: boolean }) => {
        console.log('📨 File processed event received:', data);
        // Refresh project data and files to get latest processing status
        refreshProjects();
        refreshApiFiles();
        
        // If the processed file is currently selected and processing completed with extraction,
        // reload JSON data to show the latest extraction results
        if (selectedFile?.id === data.file_id && data.status === 'completed' && data.has_extraction) {
          console.log('🔄 Reloading JSON data for completed extraction');
          setTimeout(() => reloadJsonData(), 1000); // Small delay to ensure backend is updated
        }
      };
      
      websocketService.on('file_processed', handleFileProcessed);
      
      return () => {
        console.log(`🔌 Cleaning up WebSocket for project: ${currentProject.id}`);
        websocketService.off('file_processed', handleFileProcessed);
        websocketService.disconnect();
      };
    } else {
      // No current project, ensure WebSocket is disconnected
      websocketService.disconnect();
    }
  }, [currentProject?.id, refreshProjects, refreshApiFiles, reloadJsonData, selectedFile?.id]);

  // Auto-load content when selectedFile is restored (after refresh) - but only once per file
  useEffect(() => {
    if (selectedFile && currentProject && isStorageReady) {
      const fileKey = `${currentProject.id}-${selectedFile.id}`;
      
      // Check if we've already auto-loaded this file (but allow manual clicks to override)
      if (loadedFilesRef.current.has(fileKey)) {
        console.log('📝 File already auto-loaded, skipping auto-load:', selectedFile.name);
        return;
      }
      
      // Add a delay to ensure all storage systems are ready
      const loadTimeout = setTimeout(() => {
        const isJsonFile = selectedFile.type === 'application/json' || 
                          selectedFile.name.toLowerCase().endsWith('.json');
        const isPdfFile = selectedFile.type === 'application/pdf';
        
        // Check if we need to load content
        const needsJsonContent = isJsonFile && !jsonData;
        const needsPdfContent = isPdfFile && (!jsonData && !pdfPages.length);
        const hasNoContent = !selectedFile.content;
        
        if ((needsJsonContent || needsPdfContent) || hasNoContent) {
          console.log('🔄 Auto-loading content for restored file:', selectedFile.name, 'in project:', currentProject.name);
          console.log('Reasons: Needs JSON:', needsJsonContent, 'Needs PDF:', needsPdfContent, 'No content:', hasNoContent);
          
          // Mark this file as being auto-loaded to prevent loops (but manual clicks will clear this)
          loadedFilesRef.current.add(fileKey);
          
          // Call handleFileSelect to process the file
          handleFileSelect(selectedFile, false, false); // isManualClick=false, isNewUpload=false (existing file)
        } else {
          console.log('📝 Content already loaded for file:', selectedFile.name);
          // Still mark as processed to prevent future auto-loads
          loadedFilesRef.current.add(fileKey);
        }
      }, 200); // Small delay to allow storage to settle
      
      return () => clearTimeout(loadTimeout);
    }
  }, [selectedFile?.id, currentProject?.id, isStorageReady]);

  const toggleLeftPanel = () => {
    setIsLeftPanelVisible(!isLeftPanelVisible);
  };

  // Wrapper for manual file selection (when user clicks on file)
  const handleManualFileSelect = useCallback((file: FileData) => {
    console.log('👆 Manual file selection triggered for:', file.name, 'in project:', currentProject?.name);
    handleFileSelect(file, true, false); // isManualClick=true, isNewUpload=false (existing file selection)
  }, [handleFileSelect, currentProject]);

  // Storage cleanup function
  const clearAllStorage = useCallback(async () => {
    const confirmMessage = 'This will permanently delete all stored data including:\n\n' +
      '• All projects and uploaded files\n' +
      '• All PDF images and extracted JSON data\n' +
      '• All settings and preferences\n\n' +
      'This action cannot be undone. Are you sure you want to continue?';
    
    if (window.confirm(confirmMessage)) {
      try {
        console.log('🧹 Starting complete storage cleanup...');
        
        // Clear IndexedDB
        if (indexedDBStorage.isInitialized) {
          try {
            await indexedDBStorage.clearAllData();
            console.log('✅ IndexedDB cleared successfully');
          } catch (error) {
            console.error('❌ Failed to clear IndexedDB:', error);
          }
        }
        
        // Clear localStorage
        try {
          const keysToRemove = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (
              key.startsWith('docai-') || 
              key.startsWith('pdf-images-') ||
              key.startsWith('project-') ||
              key.includes('file-')
            )) {
              keysToRemove.push(key);
            }
          }
          
          keysToRemove.forEach(key => localStorage.removeItem(key));
          console.log('✅ localStorage cleared successfully, removed keys:', keysToRemove.length);
        } catch (error) {
          console.error('❌ Failed to clear localStorage:', error);
        }
        
        // Reset application state
        setSelectedFile(null);
        setCurrentProject(null);
        setCurrentView('projects');
        clearJsonData();
        clearPdf();
        loadedFilesRef.current.clear();
        
        showError('Storage Cleared', 'All storage data has been cleared successfully. The page will now reload.');
        
        // Reload the page to ensure clean state
        setTimeout(() => window.location.reload(), 2000);
        
      } catch (error) {
        console.error('❌ Storage cleanup failed:', error);
        showError('Storage Clear Failed', 'Failed to clear all storage data. Please check the console for details.');
      }
    }
  }, [indexedDBStorage, clearJsonData, clearPdf]);

  // Keyboard shortcut handler
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check for Ctrl+Shift+~ (or Ctrl+Shift+`)
      if (event.ctrlKey && event.shiftKey && (event.code === 'Backquote' || event.key === '~' || event.key === '`')) {
        event.preventDefault();
        console.log('🔥 Storage cleanup shortcut triggered (Ctrl+Shift+~)');
        clearAllStorage();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [clearAllStorage]);

  // Project handling functions
  const handleOpenProject = (project: Project) => {
    setCurrentProjectWithPersistence(project);
    // Set active tab based on project type - BA projects go to BA tab, QA projects go to QA tab
    setActiveTab(project.type === 'BA' ? 'ba' : 'extract');
    // Clear loaded files tracking when switching projects
    loadedFilesRef.current.clear();
  };

  const handleBackToProjects = () => {
    setCurrentProjectWithPersistence(null);
    setSelectedFileWithPersistence(null);
    clearJsonData();
    clearPdf();
    setPdfLoading(false); // Ensure no lingering loading state
    // Clear the loaded files tracking when leaving project
    loadedFilesRef.current.clear();
  };

  const handleCreateProject = async (projectData: Omit<Project, 'id' | 'createdAt' | 'lastModified' | 'files' | 'folders'>) => {
    await createProject(projectData);
  };

  const handleDeleteProject = async (projectId: string) => {
    console.log('🔄 App.tsx: Starting delete for project:', projectId);
    try {
      await deleteProject(projectId);
      console.log('✅ App.tsx: Delete completed successfully for project:', projectId);
    } catch (error) {
      console.error('❌ App.tsx: Delete failed for project:', projectId, error);
      throw error; // Re-throw to let ProjectLanding handle the error
    }
  };

  const renderTabContent = () => {
    // Show appropriate page based on project type when on validator tab
    if (activeTab === 'ba') {
      if (currentProject?.type === 'QA') {
        return (
          <QAPage 
            currentProject={currentProject}
            identifiedJsonData={jsonData}
          />
        );
      } else {
        return (
          <BAPage 
            currentProject={currentProject}
            identifiedJsonData={jsonData}
          />
        );
      }
    }

    switch (activeTab) {
      case 'extract':
        return (
          <ExtractPage
            jsonData={jsonData}
            viewMode={viewMode}
            jsonError={jsonError}
            onToggleViewMode={toggleViewMode}
            onUpdateJsonData={updateJsonData}
            onReloadJsonData={reloadJsonData}
            pdfPages={pdfPages}
            currentPage={currentPage}
            isLoading={pdfLoading}
            pdfError={pdfError}
            totalPages={totalPages}
            onPageChange={goToPage}
            onNextPage={nextPage}
            onPreviousPage={previousPage}
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            onResetZoom={resetZoom}
            selectedFile={selectedFile}
            indexedDBService={indexedDBStorage}
            showError={showError}
            showWarning={showWarning}
          />
        );
      default:
        return null;
    }
  };

  // Show project landing page if no project is selected
  if (currentView === 'projects') {
    return (
      <ProjectLanding
        projects={projects}
        onCreateProject={handleCreateProject}
        onDeleteProject={handleDeleteProject}
        onOpenProject={handleOpenProject}
      />
    );
  }

  // Show loading state while IndexedDB is initializing
  if (!isStorageReady) {
    return (
      <div className="app">
        <div className="app-layout">
          <div className="loading-state">
            <h2>Initializing Storage...</h2>
            <p>Please wait while the application loads your data.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="app-layout">
        {/* Left Panel - FileUploader at top, then DocAISection */}
        <div className={`left-panel ${isLeftPanelVisible ? '' : 'hidden'}`}>
          <div className="app-header">
            <div className="header-with-owl">
              <svg 
                className="app-owl-icon"
                width="32" 
                height="38" 
                viewBox="0 0 64 64" 
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* Document body (compact version) */}
                <rect x="16" y="24" width="32" height="26" rx="2" fill="white" stroke="#E0E0E0" strokeWidth="1"/>
                <rect x="14" y="22" width="32" height="26" rx="2" fill="#F8F8F8" stroke="#D0D0D0" strokeWidth="1"/>
                
                {/* Document lines */}
                <line x1="18" y1="28" x2="42" y2="28" stroke="#4CBB17" strokeWidth="1.5" strokeLinecap="round"/>
                <line x1="18" y1="32" x2="38" y2="32" stroke="#1E88E5" strokeWidth="1" strokeLinecap="round"/>
                <line x1="18" y1="36" x2="40" y2="36" stroke="#1E88E5" strokeWidth="1" strokeLinecap="round"/>
                <line x1="18" y1="40" x2="36" y2="40" stroke="#1E88E5" strokeWidth="1" strokeLinecap="round"/>
                
                {/* Owl face */}
                <circle cx="32" cy="16" r="10" fill="#4CBB17" stroke="white" strokeWidth="1.5"/>
                
                {/* Ears */}
                <path d="M24 10 L27 5 L30 12 Z" fill="#1E88E5" stroke="white" strokeWidth="0.5"/>
                <path d="M40 10 L37 5 L34 12 Z" fill="#1E88E5" stroke="white" strokeWidth="0.5"/>
                
                {/* Eyes */}
                <circle cx="28" cy="14" r="3" fill="white"/>
                <circle cx="36" cy="14" r="3" fill="white"/>
                <circle cx="28" cy="14" r="2" fill="#2E2E2E"/>
                <circle cx="36" cy="14" r="2" fill="#2E2E2E"/>
                
                {/* Eye highlights */}
                <circle cx="29" cy="13" r="0.8" fill="white"/>
                <circle cx="37" cy="13" r="0.8" fill="white"/>
                
                {/* Beak */}
                <path d="M32 18 L30 21 L34 21 Z" fill="#FF8C00"/>
                
                {/* Document corner fold */}
                <path d="M42 24 L42 28 L46 28 Z" fill="#E8E8E8" stroke="#D0D0D0" strokeWidth="0.5"/>
              </svg>
              <div className="header-text">
                <h1>DocAI</h1>
                <p>Document Analysis & Intelligence</p>
              </div>
              <button 
                className="storage-monitor-button"
                onClick={() => setIsStorageMonitorOpen(true)}
                title="View Storage Usage"
              >
                📊
              </button>
            </div>
          </div>
          <FileUploader
            files={allFiles}
            folders={folders}
            isUploading={isUploading || apiFilesLoading}
            error={uploadError || apiFilesError}
            onFileUpload={uploadFiles}
            onFileRemove={removeFile}
            onFileSelect={handleManualFileSelect}
            onFolderCreate={handleFolderCreate}
            onFolderDelete={handleFolderDelete}
            onRefresh={refreshApiFiles}
            selectedFileId={selectedFile?.id}
            currentProject={currentProject}
          />
          {/* Show DocAISection only when a project is open */}
          {currentProject && <DocAISection />}
        </div>

        {/* Panel Toggle Button */}
        <button
          className="panel-toggle"
          onClick={toggleLeftPanel}
          title={isLeftPanelVisible ? 'Hide file panel' : 'Show file panel'}
        >
          {isLeftPanelVisible ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
        </button>

        {/* Main Content Area with Tabs */}
        <div className={`main-content ${activeTab === 'extract' ? 'extractor-theme' : 'validator-theme'}`}>
          {/* Tab Navigation */}
          <div className="tab-navigation">
            <button
              className={`tab-button ${activeTab === 'extract' ? 'active' : ''}`}
              onClick={() => setActiveTab('extract')}
            >
              Extractor
            </button>
            <button
              className={`tab-button ${activeTab === 'ba' ? 'active' : ''}`}
              onClick={() => setActiveTab('ba')}
            >
              {currentProject?.type === 'BA' ? 'Path Matcher' : 'Validator'}
            </button>
          </div>

          {/* Tab Content */}
          <div className={`tab-content-area ${activeTab === 'extract' ? 'extractor-content' : 'validator-content'}`}>
            {renderTabContent()}
          </div>
        </div>

        {/* Back to Projects Button Overlay */}
        {currentProject && (
          <button
            className="back-button-overlay"
            onClick={handleBackToProjects}
            title="Back to Projects"
          >
            <ArrowLeft size={14} />
          </button>
        )}

        {/* Toast Notifications */}
        <ToastContainer toasts={toasts} onRemove={removeToast} />

        {/* Storage Monitor */}
        <StorageMonitor 
          isOpen={isStorageMonitorOpen}
          onClose={() => setIsStorageMonitorOpen(false)}
        />
      </div>
    </div>
  );
}

export default App;
