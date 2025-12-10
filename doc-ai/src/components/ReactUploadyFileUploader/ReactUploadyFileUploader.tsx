import React, { useState, useCallback, useRef } from 'react';
import Uploady, { 
  useItemProgressListener, 
  useItemFinishListener, 
  useItemErrorListener,
  useItemCancelListener,
  useItemStartListener,
  useAbortItem,
  useUploady,
  type BatchItem 
} from '@rpldy/uploady';
import UploadButton from '@rpldy/upload-button';
import { 
  Upload, 
  File, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Loader2, 
  X, 
  RotateCcw, 
  Clock, 
  Pause,
  Folder
} from 'lucide-react';
import './ReactUploadyFileUploader.css';
import {
  extractFilesFromFolder,
  extractFilesFromDataTransfer,
  supportsFolderUpload,
  validateFolderContents,
  type FolderValidationOptions
} from '../../utils/folderUpload';
import { 
  chunkedUploadService, 
  type ChunkUploadProgress,
  type ChunkUploadOptions 
} from '../../services/chunkedUploadService';

type UploadStatus = 'queued' | 'uploading' | 'done' | 'error' | 'canceled' | 'paused';

interface UploadItem {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: UploadStatus;
  errorMessage?: string;
  uploadSpeed?: number;
  timeRemaining?: number;
  startTime?: number;
  file?: File;
  canRetry?: boolean;
  canCancel?: boolean;
  isChunked?: boolean;
  currentChunk?: number;
  total_chunks?: number;
  chunkUploadId?: string;
}

interface UploadResult {
  id: string;
  name: string;
  response?: unknown;
  status: UploadStatus;
}

export interface ReactUploadyFileUploaderProps {
  destination: string;
  multiple?: boolean;
  accept?: string;
  maxFileSize?: number;
  onUploadSuccess?: (items: UploadResult[]) => void;
  onUploadError?: (error: Error) => void;
  className?: string;
  // Folder upload options
  allowFolderUpload?: boolean;
  folderValidationOptions?: FolderValidationOptions;
}

interface UploadTrackerProps {
  onUploadSuccess?: (items: UploadResult[]) => void;
  onUploadError?: (error: Error) => void;
  onRetryUpload?: (file: File) => void;
  onFolderUploadTrigger?: (files: File[]) => void;
}

const UploadTracker: React.FC<UploadTrackerProps> = ({ onUploadSuccess, onUploadError, onRetryUpload, onFolderUploadTrigger }) => {
  const [uploadItems, setUploadItems] = useState<Map<string, UploadItem>>(new Map());
  const [, setChunkUploads] = useState<Map<string, ChunkUploadProgress>>(new Map());
  const abortItem = useAbortItem();
  const uploady = useUploady();

  // Handle programmatic folder uploads
  React.useEffect(() => {
    if (onFolderUploadTrigger && uploady) {
      const handleFolderUpload = (files: File[]) => {
        console.log(`Starting programmatic upload of ${files.length} files`);
        uploady.upload(files);
      };

      // Store the handler for external use
      const globalWindow = window as unknown as Record<string, unknown>;
      globalWindow.__folderUploadHandler = handleFolderUpload;

      // Also listen for the fallback event
      const handleCustomEvent = (e: CustomEvent) => {
        const { files } = e.detail;
        if (files && files.length > 0) {
          console.log('Handling fallback folder upload event');
          handleFolderUpload(files);
        }
      };

      document.addEventListener('manual-folder-upload', handleCustomEvent as EventListener);

      return () => {
        document.removeEventListener('manual-folder-upload', handleCustomEvent as EventListener);
        // Clear the global handler
        globalWindow.__folderUploadHandler = undefined;
      };
    }
  }, [onFolderUploadTrigger, uploady]);

  // Handle chunked uploads for large files
  const handleChunkedUpload = useCallback(async (file: File, itemId: string) => {
    try {
      // For now, assume project destination - this can be enhanced later
      const destination = { type: 'project' as const, id: 'current-project' };
      
      const options: ChunkUploadOptions = {
        onProgress: (progress: ChunkUploadProgress) => {
          setChunkUploads(prev => new Map(prev.set(progress.fileId, progress)));
          
          // Update the upload item with chunk progress
          setUploadItems(prev => {
            const newItems = new Map(prev);
            const existingItem = newItems.get(itemId);
            if (existingItem) {
              newItems.set(itemId, {
                ...existingItem,
                progress: progress.percentage,
                status: progress.status === 'uploading' ? 'uploading' : progress.status as UploadStatus,
                uploadSpeed: progress.uploadSpeed,
                timeRemaining: progress.estimatedTimeRemaining,
                isChunked: true,
                currentChunk: progress.currentChunk,
                total_chunks: progress.total_chunks,
                chunkUploadId: progress.fileId,
                errorMessage: progress.errorMessage
              });
            }
            return newItems;
          });
        },
        onChunkComplete: (chunkIndex: number, total_chunks: number) => {
          console.log(`✅ Chunk ${chunkIndex + 1}/${total_chunks} completed for ${file.name}`);
        },
        onError: (error: Error) => {
          console.error('Chunked upload error:', error);
          if (onUploadError) {
            onUploadError(error);
          }
        }
      };

      const fileId = await chunkedUploadService.uploadFile(file, destination, options);
      
      // Success - simulate the finish listener behavior
      if (onUploadSuccess) {
        onUploadSuccess([{
          id: itemId,
          name: file.name,
          response: { id: fileId },
          status: 'done'
        }]);
      }

    } catch (error) {
      console.error('Chunked upload failed:', error);
      
      setUploadItems(prev => {
        const newItems = new Map(prev);
        const existingItem = newItems.get(itemId);
        if (existingItem) {
          newItems.set(itemId, {
            ...existingItem,
            status: 'error',
            errorMessage: error instanceof Error ? error.message : 'Upload failed',
            canRetry: true,
            canCancel: false
          });
        }
        return newItems;
      });

      if (onUploadError) {
        onUploadError(error instanceof Error ? error : new Error('Upload failed'));
      }
    }
  }, [onUploadSuccess, onUploadError, setChunkUploads]);

  // Track when items are queued
  useItemStartListener((item: BatchItem) => {
    const now = Date.now();
    const file = item.file as File;
    const shouldUseChunked = chunkedUploadService.shouldUseChunkedUpload(file);
    
    setUploadItems(prev => {
      const newItems = new Map(prev);
      newItems.set(item.id, {
        id: item.id,
        name: file.name,
        size: file.size || 0,
        progress: 0,
        status: 'queued' as const,
        startTime: now,
        file: file,
        canRetry: false,
        canCancel: true,
        isChunked: shouldUseChunked
      });
      return newItems;
    });

    // If file is large enough, use chunked upload instead of regular upload
    if (shouldUseChunked) {
      console.log(`🔄 Using chunked upload for large file: ${file.name} (${chunkedUploadService.formatBytes(file.size)})`);
      
      // Cancel the regular upload and handle with chunked service
      abortItem(item.id);
      handleChunkedUpload(file, item.id);
      return false; // Prevent regular upload
    }
  });

  // Track upload progress with speed calculation
  useItemProgressListener((item: BatchItem) => {
    setUploadItems(prev => {
      const newItems = new Map(prev);
      const existingItem = newItems.get(item.id);
      if (!existingItem) return prev;

      const now = Date.now();
      const elapsed = (now - (existingItem.startTime || now)) / 1000; // seconds
      const bytesUploaded = ((item.completed || 0) / 100) * existingItem.size;
      const uploadSpeed = elapsed > 0 ? bytesUploaded / elapsed : 0; // bytes per second
      
      // Calculate time remaining
      const remainingBytes = existingItem.size - bytesUploaded;
      const timeRemaining = uploadSpeed > 0 ? remainingBytes / uploadSpeed : 0;
      
      newItems.set(item.id, {
        ...existingItem,
        progress: item.completed || 0,
        status: 'uploading',
        uploadSpeed,
        timeRemaining: Math.max(0, timeRemaining),
        canCancel: true
      });
      return newItems;
    });
  });

  // Track successful uploads
  useItemFinishListener((item: BatchItem) => {
    setUploadItems(prev => {
      const newItems = new Map(prev);
      const existingItem = newItems.get(item.id);
      if (existingItem) {
        newItems.set(item.id, {
          ...existingItem,
          progress: 100,
          status: 'done',
          canRetry: false,
          canCancel: false
        });
      }
      return newItems;
    });

    const uploadResult: UploadResult = {
      id: item.id,
      name: item.file.name,
      response: item.uploadResponse,
      status: 'done'
    };
    
    if (onUploadSuccess) {
      onUploadSuccess([uploadResult]);
    }
  });

  // Track failed uploads
  useItemErrorListener((item: BatchItem) => {
    setUploadItems(prev => {
      const newItems = new Map(prev);
      const existingItem = newItems.get(item.id);
      if (existingItem) {
        newItems.set(item.id, {
          ...existingItem,
          status: 'error',
          errorMessage: item.uploadResponse?.message || 'Upload failed',
          canRetry: true,
          canCancel: false
        });
      }
      return newItems;
    });

    if (onUploadError) {
      onUploadError(new Error(`Upload failed for file: ${item.file.name}`));
    }
  });

  // Track canceled uploads
  useItemCancelListener((item: BatchItem) => {
    setUploadItems(prev => {
      const newItems = new Map(prev);
      const existingItem = newItems.get(item.id);
      if (existingItem) {
        newItems.set(item.id, {
          ...existingItem,
          status: 'canceled',
          canRetry: true,
          canCancel: false
        });
      }
      return newItems;
    });
  });

  // Action handlers
  const handleCancel = useCallback((itemId: string) => {
    const item = uploadItems.get(itemId);
    
    if (item?.isChunked && item.chunkUploadId) {
      // Cancel chunked upload
      chunkedUploadService.cancelUpload(item.chunkUploadId);
      
      // Update status
      setUploadItems(prev => {
        const newItems = new Map(prev);
        const existingItem = newItems.get(itemId);
        if (existingItem) {
          newItems.set(itemId, {
            ...existingItem,
            status: 'canceled',
            canRetry: true,
            canCancel: false
          });
        }
        return newItems;
      });
    } else {
      // Regular upload cancellation
      abortItem(itemId);
    }
  }, [abortItem, uploadItems]);

  const handleRetry = useCallback((itemId: string) => {
    const item = uploadItems.get(itemId);
    if (item && item.file) {
      // Remove the failed item from our tracking
      setUploadItems(prev => {
        const newItems = new Map(prev);
        newItems.delete(itemId);
        return newItems;
      });
      
      // For chunked uploads, retry directly
      if (item.isChunked) {
        handleChunkedUpload(item.file, itemId);
      } else {
        // Use callback to parent to trigger new upload
        if (onRetryUpload) {
          onRetryUpload(item.file);
        }
      }
    }
  }, [uploadItems, onRetryUpload, handleChunkedUpload]);

  const handleRemove = useCallback((itemId: string) => {
    setUploadItems(prev => {
      const newItems = new Map(prev);
      newItems.delete(itemId);
      return newItems;
    });
  }, []);

  const handleClearCompleted = useCallback(() => {
    setUploadItems(prev => {
      const newItems = new Map(prev);
      Array.from(newItems.entries()).forEach(([id, item]) => {
        if (item.status === 'done' || item.status === 'canceled') {
          newItems.delete(id);
        }
      });
      return newItems;
    });
  }, []);

  const handleRetryAll = useCallback(() => {
    Array.from(uploadItems.entries()).forEach(([id, item]) => {
      if (item.status === 'error') {
        handleRetry(id);
      }
    });
  }, [uploadItems, handleRetry]);

  const handleCancelAll = useCallback(() => {
    Array.from(uploadItems.entries()).forEach(([id, item]) => {
      if (item.canCancel && (item.status === 'uploading' || item.status === 'queued')) {
        handleCancel(id);
      }
    });
  }, [uploadItems, handleCancel]);

  const getStatusIcon = (status: UploadItem['status']) => {
    switch (status) {
      case 'queued':
        return <Clock className="status-icon status-icon--queued" />;
      case 'uploading':
        return <Loader2 className="status-icon status-icon--uploading animate-spin" />;
      case 'done':
        return <CheckCircle className="status-icon status-icon--done" />;
      case 'error':
        return <XCircle className="status-icon status-icon--error" />;
      case 'canceled':
        return <X className="status-icon status-icon--canceled" />;
      case 'paused':
        return <Pause className="status-icon status-icon--paused" />;
      default:
        return <AlertCircle className="status-icon status-icon--default" />;
    }
  };

  const getStatusText = (item: UploadItem): string => {
    switch (item.status) {
      case 'queued':
        return item.isChunked ? 'Preparing chunks...' : 'Queued';
      case 'uploading':
        if (item.isChunked && item.total_chunks) {
          return `${Math.round(item.progress)}% (${item.currentChunk || 0}/${item.total_chunks})`;
        }
        return `${Math.round(item.progress)}%`;
      case 'done':
        return item.isChunked ? 'All chunks uploaded' : 'Completed';
      case 'error':
        return 'Failed';
      case 'canceled':
        return 'Canceled';
      case 'paused':
        return 'Paused';
      default:
        return 'Unknown';
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatSpeed = (bytesPerSecond: number): string => {
    if (bytesPerSecond === 0) return '';
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
    return parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatTime = (seconds: number): string => {
    if (seconds === 0 || !isFinite(seconds)) return '';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h`;
  };

  const uploadItemsArray = Array.from(uploadItems.values());
  const hasAnyUploads = uploadItemsArray.length > 0;
  const hasErrors = uploadItemsArray.some(item => item.status === 'error');
  const hasCompleted = uploadItemsArray.some(item => item.status === 'done' || item.status === 'canceled');
  const hasActive = uploadItemsArray.some(item => item.status === 'uploading' || item.status === 'queued');

  if (!hasAnyUploads) {
    return null;
  }

  return (
    <div className="react-uploady-tracker">
      <div className="tracker-header">
        <h3 className="tracker-title">Upload Progress ({uploadItemsArray.length} files)</h3>
        <div className="tracker-actions">
          {hasErrors && (
            <button 
              onClick={handleRetryAll}
              className="tracker-action-btn tracker-action-btn--retry"
              title="Retry all failed uploads"
            >
              <RotateCcw className="w-4 h-4" />
              Retry All
            </button>
          )}
          {hasActive && (
            <button 
              onClick={handleCancelAll}
              className="tracker-action-btn tracker-action-btn--cancel"
              title="Cancel all active uploads"
            >
              <X className="w-4 h-4" />
              Cancel All
            </button>
          )}
          {hasCompleted && (
            <button 
              onClick={handleClearCompleted}
              className="tracker-action-btn tracker-action-btn--clear"
              title="Clear completed uploads"
            >
              Clear Completed
            </button>
          )}
        </div>
      </div>
      
      <div className="upload-items">
        {uploadItemsArray.map((item) => (
          <div key={item.id} className={`upload-item upload-item--${item.status}`}>
            <div className="upload-item-header">
              <div className="upload-item-info">
                {getStatusIcon(item.status)}
                <div className="upload-item-details">
                  <span className="upload-item-name" title={item.name}>
                    {item.name}
                  </span>
                  <div className="upload-item-meta">
                    <span className="upload-item-size">
                      {formatFileSize(item.size)}
                    </span>
                    {item.uploadSpeed && item.uploadSpeed > 0 && item.status === 'uploading' && (
                      <>
                        <span className="upload-meta-separator">•</span>
                        <span className="upload-item-speed">
                          {formatSpeed(item.uploadSpeed)}
                        </span>
                      </>
                    )}
                    {item.timeRemaining && item.timeRemaining > 0 && item.status === 'uploading' && (
                      <>
                        <span className="upload-meta-separator">•</span>
                        <span className="upload-item-time">
                          {formatTime(item.timeRemaining)} left
                        </span>
                      </>
                    )}
                    {item.isChunked && item.total_chunks && item.currentChunk && (
                      <>
                        <span className="upload-meta-separator">•</span>
                        <span className="upload-item-chunks">
                          Chunk {item.currentChunk}/{item.total_chunks}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="upload-item-status">
                <span className={`upload-status-text upload-status-text--${item.status}`}>
                  {getStatusText(item)}
                </span>
                
                <div className="upload-item-actions">
                  {item.canRetry && (
                    <button
                      onClick={() => handleRetry(item.id)}
                      className="upload-action-btn upload-action-btn--retry"
                      title="Retry upload"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  )}
                  {item.canCancel && (
                    <button
                      onClick={() => handleCancel(item.id)}
                      className="upload-action-btn upload-action-btn--cancel"
                      title="Cancel upload"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                  {(item.status === 'done' || item.status === 'error' || item.status === 'canceled') && (
                    <button
                      onClick={() => handleRemove(item.id)}
                      className="upload-action-btn upload-action-btn--remove"
                      title="Remove from list"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
            
            {item.status === 'uploading' && (
              <div className="upload-progress-bar">
                <div 
                  className="upload-progress-fill"
                  style={{ width: `${item.progress}%` }}
                />
              </div>
            )}
            
            {item.errorMessage && (
              <div className="upload-error-message">
                <AlertCircle className="w-4 h-4" />
                <span>{item.errorMessage}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const ReactUploadyFileUploader: React.FC<ReactUploadyFileUploaderProps> = ({
  destination,
  multiple = true,
  accept = '.pdf,.json',
  maxFileSize = 10 * 1024 * 1024, // 10MB default
  onUploadSuccess,
  onUploadError,
  className = '',
  allowFolderUpload = true,
  folderValidationOptions = {}
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [retryQueue, setRetryQueue] = useState<File[]>([]);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = useCallback(() => {
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleRetryUpload = useCallback((file: File) => {
    setRetryQueue(prev => [...prev, file]);
  }, []);

  // Handle folder upload by calling the programmatic upload handler
  const triggerFolderUpload = useCallback((files: File[]) => {
    if (files.length === 0) return;
    
    console.log(`Triggering upload for ${files.length} files`);
    
    // Use the global handler set up by UploadTracker
    const globalWindow = window as unknown as Record<string, unknown>;
    const handler = globalWindow.__folderUploadHandler as ((files: File[]) => void) | undefined;
    if (handler) {
      handler(files);
    } else {
      console.error('Folder upload handler not ready');
      // Fallback: dispatch custom event
      const event = new CustomEvent('manual-folder-upload', { detail: { files } });
      document.dispatchEvent(event);
    }
  }, []);

  const handleFolderSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    try {
      const files = extractFilesFromFolder(fileList);
      
      // Validate folder contents
      const validation = validateFolderContents(files, {
        ...folderValidationOptions,
        maxFileSize,
        allowedExtensions: accept ? accept.split(',').map(ext => ext.trim()) : undefined
      });

      if (!validation.valid && validation.errors.length > 0) {
        if (onUploadError) {
          onUploadError(new Error(`Folder validation failed: ${validation.errors.join(', ')}`));
        }
        return;
      }

      // Process valid files through Uploady
      if (validation.validFiles.length > 0) {
        const dt = new DataTransfer();
        validation.validFiles.forEach(file => dt.items.add(file));
        
        // Trigger Uploady upload programmatically
        const event = new CustomEvent('folder-upload', { detail: { files: dt.files } });
        document.dispatchEvent(event);
      }
    } catch (error) {
      console.error('Error processing folder selection:', error);
      if (onUploadError) {
        onUploadError(error instanceof Error ? error : new Error('Failed to process folder'));
      }
    }

    // Clear input
    if (folderInputRef.current) {
      folderInputRef.current.value = '';
    }
  }, [accept, maxFileSize, folderValidationOptions, onUploadError]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    
    console.log('Drop event triggered');
    
    const items = e.dataTransfer.items;
    const files = e.dataTransfer.files;
    
    if (!items && !files) return;
    
    let allFiles: File[] = [];
    
    // Check if we have DataTransferItemList (modern browsers)
    if (items && items.length > 0) {
      console.log(`Processing ${items.length} dropped items`);
      
      // Check for folders using webkitGetAsEntry
      let hasDirectories = false;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry();
          if (entry && entry.isDirectory) {
            hasDirectories = true;
            break;
          }
        }
      }
      
      if (hasDirectories && allowFolderUpload) {
        console.log('Folders detected, processing with folder handler');
        try {
          const folderFiles = await extractFilesFromDataTransfer(items);
          allFiles = folderFiles;
        } catch (error) {
          console.error('Error extracting files from folders:', error);
          if (onUploadError) {
            onUploadError(error instanceof Error ? error : new Error('Failed to process dropped folders'));
          }
          return;
        }
      } else {
        // Regular files
        console.log('Regular files detected, processing normally');
        allFiles = Array.from(files);
      }
    } else if (files) {
      // Fallback for older browsers
      console.log('Fallback: processing files directly');
      allFiles = Array.from(files);
    }
    
    if (allFiles.length === 0) {
      console.log('No files to process');
      return;
    }
    
    console.log(`Processing ${allFiles.length} files for upload`);
    
    // Validate files if needed
    if (allowFolderUpload && folderValidationOptions) {
      const validation = validateFolderContents(allFiles, {
        ...folderValidationOptions,
        maxFileSize,
        allowedExtensions: accept ? accept.split(',').map(ext => ext.trim()) : undefined
      });
      
      if (!validation.valid && validation.errors.length > 0) {
        console.error('Validation failed:', validation.errors);
        if (onUploadError) {
          onUploadError(new Error(`Upload validation failed: ${validation.errors.join(', ')}`));
        }
        return;
      }
      
      allFiles = validation.validFiles;
    }
    
    // Process files through Uploady
    triggerFolderUpload(allFiles);
    
  }, [allowFolderUpload, folderValidationOptions, accept, maxFileSize, onUploadError, triggerFolderUpload]);

  // Process retry queue
  React.useEffect(() => {
    if (retryQueue.length > 0) {
      // Simulate file selection for retry
      const files = retryQueue;
      setRetryQueue([]);
      
      // This would trigger the Uploady to process the files
      setTimeout(() => {
        const dt = new DataTransfer();
        files.forEach(file => dt.items.add(file));
        
        // Dispatch a custom event that Uploady can pick up
        const event = new CustomEvent('retry-upload', { detail: { files: dt.files } });
        document.dispatchEvent(event);
      }, 100);
    }
  }, [retryQueue]);



  const uploadyProps = {
    destination: { url: destination },
    multiple,
    accept,
    maxFileSize,
    concurrent: true,
    maxConcurrent: 3,
    grouped: false,
    autoUpload: true,
  };

  return (
    <div className={`react-uploady-container ${className}`}>
      <Uploady {...uploadyProps}>
        <div
          className={`upload-drop-zone ${isDragOver ? 'drag-over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleDragEnter();
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleDragLeave();
          }}
          onDrop={handleDrop}
        >
          <div className="upload-zone-content">
            <Upload className="upload-icon" size={48} />
            <h3 className="upload-zone-title">
              Drop files here or click to browse
            </h3>
            <p className="upload-zone-subtitle">
              Supports parallel uploads{allowFolderUpload && supportsFolderUpload() ? ' and folder uploads' : ''} for faster processing
            </p>
            <p className="upload-zone-info">
              Accepted formats: PDF, JSON (max {Math.round(maxFileSize / (1024 * 1024))}MB each)
              {allowFolderUpload && supportsFolderUpload() && (
                <>
                  <br />
                  Drag folders here or use the folder button to upload entire directories
                </>
              )}
            </p>
            
            <div className="upload-buttons">
              <UploadButton className="upload-browse-button">
                <span style={{ display: 'flex', alignItems: 'center' }}>
                  <File className="w-4 h-4 mr-2" />
                  Browse Files
                </span>
              </UploadButton>
              
              {allowFolderUpload && supportsFolderUpload() && (
                <button 
                  className="upload-browse-button upload-folder-button"
                  onClick={() => folderInputRef.current?.click()}
                  type="button"
                >
                  <span style={{ display: 'flex', alignItems: 'center' }}>
                    <Folder className="w-4 h-4 mr-2" />
                    Browse Folder
                  </span>
                </button>
              )}
            </div>
            
            {/* Hidden folder input */}
            {allowFolderUpload && supportsFolderUpload() && (
              <input
                ref={folderInputRef}
                type="file"
                {...({ webkitdirectory: '' } as React.InputHTMLAttributes<HTMLInputElement> & { webkitdirectory?: string })}
                multiple
                style={{ display: 'none' }}
                onChange={handleFolderSelect}
                accept={accept}
              />
            )}
          </div>
        </div>
        
        <UploadTracker 
          onUploadSuccess={onUploadSuccess}
          onUploadError={onUploadError}
          onRetryUpload={handleRetryUpload}
          onFolderUploadTrigger={triggerFolderUpload}
        />
      </Uploady>
    </div>
  );
};

export default ReactUploadyFileUploader;
