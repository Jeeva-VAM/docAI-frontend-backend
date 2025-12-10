/**
 * Folder Upload Utilities
 * Handles folder selection, drag-and-drop, and file extraction
 */

/**
 * Extracts all files from a folder using webkitdirectory
 */
export const extractFilesFromFolder = (fileList: FileList): File[] => {
  const files: File[] = [];
  
  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    // webkitdirectory provides relativePath which includes folder structure
    files.push(file);
  }
  
  return files;
};

/**
 * Recursively extracts files from directory entries (drag-and-drop)
 */
export const extractFilesFromDirectoryEntry = async (entry: FileSystemDirectoryEntry): Promise<File[]> => {
  const files: File[] = [];
  
  return new Promise((resolve, reject) => {
    const reader = entry.createReader();
    
    const readEntries = () => {
      reader.readEntries(async (entries) => {
        if (entries.length === 0) {
          resolve(files);
          return;
        }
        
        for (const entry of entries) {
          try {
            if (entry.isFile) {
              const file = await getFileFromEntry(entry as FileSystemFileEntry);
              files.push(file);
            } else if (entry.isDirectory) {
              const subFiles = await extractFilesFromDirectoryEntry(entry as FileSystemDirectoryEntry);
              files.push(...subFiles);
            }
          } catch (error) {
            console.warn(`Failed to process entry: ${entry.name}`, error);
          }
        }
        
        // Continue reading if there might be more entries
        readEntries();
      }, reject);
    };
    
    readEntries();
  });
};

/**
 * Converts FileSystemFileEntry to File object
 */
const getFileFromEntry = (entry: FileSystemFileEntry): Promise<File> => {
  return new Promise((resolve, reject) => {
    entry.file((file) => {
      // Preserve the full path for folder structure
      const fileWithPath = new File([file], file.name, {
        type: file.type,
        lastModified: file.lastModified
      });
      
      // Add the relativePath property to maintain folder structure
      Object.defineProperty(fileWithPath, 'webkitRelativePath', {
        value: entry.fullPath.substring(1), // Remove leading slash
        writable: false
      });
      
      resolve(fileWithPath);
    }, reject);
  });
};

/**
 * Extracts files from DataTransferItem list (handles both files and folders)
 */
export const extractFilesFromDataTransfer = async (items: DataTransferItemList): Promise<File[]> => {
  const files: File[] = [];
  const entries: FileSystemEntry[] = [];
  
  // Collect all entries
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === 'file') {
      const entry = item.webkitGetAsEntry();
      if (entry) {
        entries.push(entry);
      }
    }
  }
  
  // Process entries
  for (const entry of entries) {
    try {
      if (entry.isFile) {
        const file = await getFileFromEntry(entry as FileSystemFileEntry);
        files.push(file);
      } else if (entry.isDirectory) {
        const folderFiles = await extractFilesFromDirectoryEntry(entry as FileSystemDirectoryEntry);
        files.push(...folderFiles);
      }
    } catch (error) {
      console.warn(`Failed to process entry: ${entry.name}`, error);
    }
  }
  
  return files;
};

/**
 * Checks if the browser supports folder upload
 */
export const supportsFolderUpload = (): boolean => {
  const input = document.createElement('input');
  return 'webkitdirectory' in input;
};

/**
 * Groups files by their folder path for organized display
 */
export const groupFilesByFolder = (files: File[]): Map<string, File[]> => {
  const folderMap = new Map<string, File[]>();
  
  files.forEach(file => {
    const relativePath = (file as any).webkitRelativePath || '';
    const folderPath = relativePath ? relativePath.substring(0, relativePath.lastIndexOf('/')) : '';
    const key = folderPath || 'root';
    
    if (!folderMap.has(key)) {
      folderMap.set(key, []);
    }
    folderMap.get(key)!.push(file);
  });
  
  return folderMap;
};

/**
 * Validates folder contents (file types, sizes, etc.)
 */
export interface FolderValidationOptions {
  allowedExtensions?: string[];
  maxFileSize?: number;
  maxTotalFiles?: number;
}

export const validateFolderContents = (files: File[], options: FolderValidationOptions = {}): {
  valid: boolean;
  errors: string[];
  validFiles: File[];
} => {
  const {
    allowedExtensions,
    maxFileSize,
    maxTotalFiles
  } = options;
  
  const errors: string[] = [];
  const validFiles: File[] = [];
  
  // Check total file count
  if (maxTotalFiles && files.length > maxTotalFiles) {
    errors.push(`Too many files: ${files.length}. Maximum allowed: ${maxTotalFiles}`);
  }
  
  files.forEach((file, index) => {
    let isValid = true;
    
    console.log(`Validating file ${index + 1}/${files.length}: "${file.name}", size: ${file.size}, type: "${file.type}"`);
    
    // Skip system files and hidden files
    if (file.name.startsWith('.') || file.name === 'Thumbs.db' || file.name === 'desktop.ini') {
      console.log(`Skipping system file: ${file.name}`);
      return; // Skip without adding to valid or invalid
    }
    
    // Check if file is actually readable (not a directory or special file)
    if (file.size === 0 && file.type === '' && !file.name.includes('.')) {
      console.warn(`Skipping potentially invalid file (likely directory): ${file.name}`);
      return; // Skip without adding to valid or invalid
    }
    
    // Check file extension only if allowedExtensions is specified
    if (allowedExtensions && allowedExtensions.length > 0) {
      const nameParts = file.name.split('.');
      const extension = nameParts.length > 1 ? '.' + nameParts.pop()?.toLowerCase().trim() : '';
      
      console.log(`File extension detected: "${extension}" for file: ${file.name}`);
      
      if (!extension) {
        // For files without extensions, check if they have a MIME type we can work with
        if (file.type) {
          console.log(`File "${file.name}" has no extension but has MIME type: ${file.type}, allowing`);
        } else {
          console.warn(`File "${file.name}" has no extension and no MIME type, allowing with warning`);
        }
      } else if (!allowedExtensions.some(allowed => allowed.toLowerCase().trim() === extension)) {
        console.error(`Extension "${extension}" not in allowed list: ${allowedExtensions.join(', ')}`);
        errors.push(`File type "${extension}" is not allowed for file: ${file.name}. Allowed: ${allowedExtensions.join(', ')}`);
        isValid = false;
      }
    }
    
    // Check file size
    if (maxFileSize && file.size > maxFileSize) {
      const sizeMB = Math.round(maxFileSize / (1024 * 1024));
      errors.push(`File too large: ${file.name} (${Math.round(file.size / (1024 * 1024))}MB). Maximum size: ${sizeMB}MB`);
      isValid = false;
    }
    
    if (isValid) {
      validFiles.push(file);
      console.log(`✓ File validated: ${file.name}`);
    } else {
      console.log(`✗ File rejected: ${file.name}`);
    }
  });
  
  return {
    valid: errors.length === 0,
    errors,
    validFiles
  };
};
