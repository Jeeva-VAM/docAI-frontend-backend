export interface FileData {
  id: string;
  filename: string;
  originalName: string;
  size: number;
  uploadDate: string;
  folderId?: string | null;
}

export interface FileUploadResponse {
  success: boolean;
  file?: FileData;
  error?: string;
}
