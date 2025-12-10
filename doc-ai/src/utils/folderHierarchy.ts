/**
 * Folder Hierarchy Utilities
 * Handles subfolder management and hierarchy operations
 */

import type { ProjectFolder } from '../types';

/**
 * Builds a hierarchical folder tree from flat folder list
 */
export const buildFolderHierarchy = (folders: ProjectFolder[]): ProjectFolder[] => {
  const folderMap = new Map<string, ProjectFolder>();
  const rootFolders: ProjectFolder[] = [];

  // First pass: Create all folders and add them to map
  folders.forEach(folder => {
    folderMap.set(folder.id, { ...folder, children: [] });
  });

  // Second pass: Build hierarchy
  folders.forEach(folder => {
    const folderWithChildren = folderMap.get(folder.id)!;
    
    if (folder.parentId) {
      // Add to parent's children
      const parent = folderMap.get(folder.parentId);
      if (parent && parent.children) {
        parent.children.push(folderWithChildren);
      }
    } else {
      // Root level folder
      rootFolders.push(folderWithChildren);
    }
  });

  return rootFolders;
};

/**
 * Flattens a folder hierarchy into a flat array
 */
export const flattenFolderHierarchy = (folders: ProjectFolder[]): ProjectFolder[] => {
  const result: ProjectFolder[] = [];
  
  const traverse = (folder: ProjectFolder) => {
    result.push(folder);
    if (folder.children) {
      folder.children.forEach(traverse);
    }
  };
  
  folders.forEach(traverse);
  return result;
};

/**
 * Creates folder hierarchy from webkitRelativePath
 * Returns array of folder paths that need to be created
 */
export const extractFolderPathsFromRelativePath = (relativePath: string): string[] => {
  if (!relativePath) return [];
  
  const parts = relativePath.split('/').filter(part => part.length > 0);
  // Remove the filename (last part)
  parts.pop();
  
  const paths: string[] = [];
  let currentPath = '';
  
  parts.forEach(part => {
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    paths.push(currentPath);
  });
  
  return paths;
};

/**
 * Gets the folder name from relativePath
 */
export const getFolderNameFromPath = (folderPath: string): string => {
  const parts = folderPath.split('/');
  return parts[parts.length - 1] || folderPath;
};

/**
 * Gets the parent path from a folder path
 */
export const getParentPath = (folderPath: string): string | null => {
  const parts = folderPath.split('/');
  if (parts.length <= 1) return null;
  
  parts.pop();
  return parts.join('/');
};

/**
 * Finds folder by relativePath in the hierarchy
 */
export const findFolderByPath = (folders: ProjectFolder[], targetPath: string): ProjectFolder | null => {
  const traverse = (folder: ProjectFolder): ProjectFolder | null => {
    if (folder.relativePath === targetPath) {
      return folder;
    }
    
    if (folder.children) {
      for (const child of folder.children) {
        const found = traverse(child);
        if (found) return found;
      }
    }
    
    return null;
  };
  
  for (const folder of folders) {
    const found = traverse(folder);
    if (found) return found;
  }
  
  return null;
};

/**
 * Creates a new folder structure for a given relativePath
 */
export const createFolderStructure = (
  projectId: string,
  relativePath: string,
  existingFolders: ProjectFolder[]
): ProjectFolder[] => {
  const paths = extractFolderPathsFromRelativePath(relativePath);
  const newFolders: ProjectFolder[] = [];
  
  paths.forEach((path, index) => {
    // Check if folder already exists
    const existing = findFolderByPath(existingFolders, path);
    if (existing) return;
    
    const folderName = getFolderNameFromPath(path);
    const parentPath = getParentPath(path);
    
    // Find parent folder ID
    let parentId: string | null = null;
    if (parentPath) {
      const parent = findFolderByPath([...existingFolders, ...newFolders], parentPath);
      parentId = parent?.id || null;
    }
    
    const newFolder: ProjectFolder = {
      id: `temp-${Date.now()}-${index}`, // Temporary ID - will be replaced by backend
      name: folderName,
      projectId,
      createdAt: new Date().toISOString(),
      files: [],
      parentId,
      children: [],
      relativePath: path,
      isExpanded: false
    };
    
    newFolders.push(newFolder);
  });
  
  return newFolders;
};

/**
 * Groups files by their folder path for batch upload organization
 */
export const groupFilesByFolderPath = (files: File[]): Map<string, File[]> => {
  const folderMap = new Map<string, File[]>();
  
  files.forEach(file => {
    const relativePath = 'webkitRelativePath' in file ? (file as File & { webkitRelativePath: string }).webkitRelativePath : '';
    
    if (relativePath) {
      const folderPaths = extractFolderPathsFromRelativePath(relativePath);
      // Use the deepest folder path as the file's folder
      const fileFolderPath = folderPaths.length > 0 ? folderPaths[folderPaths.length - 1] : 'root';
      
      if (!folderMap.has(fileFolderPath)) {
        folderMap.set(fileFolderPath, []);
      }
      folderMap.get(fileFolderPath)!.push(file);
    } else {
      // File without relativePath goes to root
      if (!folderMap.has('root')) {
        folderMap.set('root', []);
      }
      folderMap.get('root')!.push(file);
    }
  });
  
  return folderMap;
};
