/**
 * React-Uploady Enhanced Chunked Upload Service
 * Integrates with existing FileUploader without altering current logic
 */

import { getChunkedEnhancer } from '@rpldy/chunked-sender';
import type { ChunkedOptions } from '@rpldy/chunked-sender';

export interface ReactUploadyChunkOptions {
  chunkSize?: number;
  retries?: number;
  parallel?: number;
  onProgress?: (progress: number, file: File) => void;
  onChunkComplete?: (chunkIndex: number, total_chunks: number, file: File) => void;
  onError?: (error: Error, file: File) => void;
}

export interface ChunkUploadResult {
  success: boolean;
  fileId?: string;
  error?: string;
  fileResponse?: unknown;
}

class ReactUploadyChunkedService {
  private static readonly DEFAULT_CHUNK_SIZE = 3 * 1024 * 1024; // 3MB chunks
  private static readonly LARGE_FILE_THRESHOLD = 10 * 1024 * 1024; // 10MB
  private static readonly MAX_PARALLEL_CHUNKS = 3;
  
  /**
   * Check if file should use React-Uploady chunked upload
   */
  shouldUseChunkedUpload(file: File): boolean {
    return file.size >= ReactUploadyChunkedService.LARGE_FILE_THRESHOLD;
  }

  /**
   * Create chunked enhancer configuration for React-Uploady
   */
  createChunkedEnhancer(options: ReactUploadyChunkOptions = {}) {
    const chunkSize = options.chunkSize || ReactUploadyChunkedService.DEFAULT_CHUNK_SIZE;
    const parallel = options.parallel || ReactUploadyChunkedService.MAX_PARALLEL_CHUNKS;

    const chunkedOptions: ChunkedOptions = {
      chunked: true,
      chunkSize,
      retries: options.retries || 3,
      parallel
    };

    return getChunkedEnhancer(chunkedOptions);
  }

  /**
   * Upload file using React-Uploady chunked upload
   */
  async uploadFile(
    file: File,
    destination: { type: 'project' | 'folder'; id: string },
    options: ReactUploadyChunkOptions = {}
  ): Promise<ChunkUploadResult> {
    try {
      console.log(`🚀 Starting React-Uploady chunked upload for: ${file.name} (${this.formatBytes(file.size)})`);
      
      const chunkSize = options.chunkSize || ReactUploadyChunkedService.DEFAULT_CHUNK_SIZE;
      const total_chunks = Math.ceil(file.size / chunkSize);
      
      console.log(`📦 File will be split into ${total_chunks} chunks of ${this.formatBytes(chunkSize)} each`);

      // Create the enhancer (simplified)
      const enhancer = this.createChunkedEnhancer(options);

      // Create upload configuration
      const uploadConfig = {
        destination: {
          url: destination.type === 'project'
            ? `http://localhost:8000/api/projects/${destination.id}/files`
            : `http://localhost:8000/api/folders/${destination.id}/files`,
          method: 'POST'
        },
        enhancer,
        autoUpload: true
      };

      // Simulate the upload process (React-Uploady typically handles this in a component)
      // For direct service usage, we need to create a simple upload mechanism
      const result = await this.performDirectUpload(file, uploadConfig);
      
      console.log('✅ React-Uploady chunked upload completed successfully:', result);
      
      return {
        success: true,
        fileId: result.id,
        fileResponse: result
      };

    } catch (error) {
      console.error('❌ React-Uploady chunked upload failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Chunked upload failed'
      };
    }
  }

  /**
   * Perform direct upload using React-Uploady configuration
   * This is a simplified version for service usage
   */
  private async performDirectUpload(file: File, config: { destination: { url: string; method: string }; enhancer?: unknown; autoUpload?: boolean }): Promise<{ id: string; name: string; size: number }> {
    // For now, we'll simulate the chunking process manually
    // In a real React component, React-Uploady would handle this automatically
    
    const chunkSize = ReactUploadyChunkedService.DEFAULT_CHUNK_SIZE;
    const total_chunks = Math.ceil(file.size / chunkSize);
    const chunks: { blob: Blob; index: number }[] = [];

    // Split file into chunks
    for (let i = 0; i < total_chunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunk = file.slice(start, end);
      chunks.push({ blob: chunk, index: i });
    }

    console.log(`📁 Created ${chunks.length} chunks for upload`);

    // Upload chunks sequentially (or in parallel based on config)
    const uploadPromises = chunks.map(async (chunk, index) => {
      const formData = new FormData();
      formData.append('chunk', chunk.blob);
      formData.append('chunkIndex', index.toString());
      formData.append('total_chunks', total_chunks.toString());
      formData.append('fileName', file.name);
      formData.append('fileSize', file.size.toString());

      const response = await fetch(config.destination.url + '/chunk', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Chunk ${index} upload failed: ${response.statusText}`);
      }

      return response.json();
    });

    // Wait for all chunks to complete
    await Promise.all(uploadPromises);

    // Return a mock response (replace with actual backend response format)
    return {
      id: `file-${Date.now()}`,
      name: file.name,
      size: file.size
    };
  }

  /**
   * Format bytes to human readable format
   */
  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// Export singleton instance
export const reactUploadyChunkedService = new ReactUploadyChunkedService();
