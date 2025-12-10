export interface FileData {
  id: string;
  name: string;
  type: string;
  size: number;
  content?: string | ArrayBuffer;
  lastModified: number;
  file?: File; // Original file object for operations that need fresh content
  projectId?: string; // Project association for filtering
  folderId?: string; // Folder association for organizing files within projects
  url?: string; // Backend URL for downloading/viewing the file
}

export interface JsonData {
  [key: string]: any;
}

export interface PdfViewerState {
  scale: number;
  pageNumber: number;
  totalPages: number;
  isLoading: boolean;
  error?: string;
}

export interface AppState {
  uploadedFiles: FileData[];
  selectedFile?: FileData;
  jsonData?: JsonData;
  pdfPages: string[];
  isLeftPanelVisible: boolean;
  jsonViewMode: 'json' | 'form';
}

export interface StoredFileData extends FileData {
  storedPath: string;
  createdAt: string;
  hasImages?: boolean;
  hasAssociatedJson?: boolean;
  projectId?: string;
  folderId?: string; // For files stored in folders
}

export interface ProjectStorage {
  files: StoredFileData[];
  lastModified: string;
  version: string;
}

export interface PdfAnnotation {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  pageNumber: number;
  timestamp: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface AnnotatedDocument {
  fileId: string;
  fileName: string;
  annotations: PdfAnnotation[];
  createdAt: string;
  lastModified: string;
}

export interface Project {
  id: string;
  name: string;
  type: 'QA' | 'BA';
  description: string;
  specificationInstructions?: string;
  createdAt: string;
  lastModified: string;
  files: StoredFileData[];
  folders: ProjectFolder[];
}

export interface ProjectFolder {
  id: string;
  name: string;
  projectId: string;
  createdAt: string;
  files: StoredFileData[];
  // Subfolder support
  parentId?: string | null; // null = root level folder
  children?: ProjectFolder[]; // Nested subfolders
  isExpanded?: boolean; // For UI display
  relativePath?: string; // Full path from root for folder hierarchy (e.g., "documents/invoices")
  subfolderCount?: number; // Number of direct subfolders
}