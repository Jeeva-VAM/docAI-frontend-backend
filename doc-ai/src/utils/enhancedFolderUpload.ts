/**
 * Enhanced Folder Upload Handler
 * Supports subfolder hierarchy creation and organization
 */

export interface EnhancedFolderUploadOptions {
  files: File[];
  onFileUpload: (file: File, relativePath: string, batchId: string) => Promise<void>;
  onProgress?: (progress: number) => void;
}

export class EnhancedFolderUploadHandler {
  /**
   * Handles folder upload with subfolder hierarchy support using individual file uploads
   */
  static async uploadFolderWithSubfolders(options: EnhancedFolderUploadOptions): Promise<void> {
    const { files, onFileUpload, onProgress } = options;
    
    console.log(`📁 Starting enhanced folder upload for ${files.length} files`);
    
    // Generate a unique batch ID for this upload session
    const batchId = this.generateUniqueId();
    console.log(`📁 Generated batch ID: ${batchId}`);
    
    // Prepare files with their relative paths
    const filesWithPaths: { file: File; path: string }[] = [];
    files.forEach(file => {
      const fileWithPath = file as File & { webkitRelativePath?: string };
      const relativePath = fileWithPath.webkitRelativePath || file.name;
      filesWithPaths.push({ file, path: relativePath });
    });
    
    console.log(`📁 Prepared ${filesWithPaths.length} files with paths:`, filesWithPaths.map(f => f.path));
    
    // Upload each file individually
    let uploadedCount = 0;
    for (const { file, path } of filesWithPaths) {
      try {
        console.log(`� Uploading file: ${file.name} with path: ${path}`);
        await onFileUpload(file, path, batchId);
        console.log(`✅ Uploaded file: ${file.name}`);
        
        uploadedCount++;
        if (onProgress) {
          onProgress(Math.round((uploadedCount / filesWithPaths.length) * 100));
        }
      } catch (error) {
        console.error(`❌ Failed to upload file: ${file.name}`, error);
        throw new Error(`Failed to upload file: ${file.name} - ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    console.log('✅ Enhanced folder upload completed successfully');
  }
  
  /**
   * Generates a unique ID for batch uploads
   */
  private static generateUniqueId(): string {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
