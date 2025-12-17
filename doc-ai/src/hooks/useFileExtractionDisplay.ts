import { useState, useCallback, useEffect } from 'react';
import { websocketService, type ExtractionCompletedEvent } from '../services/websocketService';

interface FileExtractionState {
  fileId: string | null;
  status: 'idle' | 'loading' | 'completed' | 'failed';
  filename?: string;
  error?: string;
  extractionData?: {
    structured_output: Record<string, unknown>;
    total_fields: number;
    filled_fields: number;
    empty_fields: number;
  };
}

interface UseFileExtractionDisplayOptions {
  onExtractionDataReceived?: (data: Record<string, unknown>) => void;
}

export const useFileExtractionDisplay = (options: UseFileExtractionDisplayOptions = {}) => {
  const { onExtractionDataReceived } = options;
  const [fileState, setFileState] = useState<FileExtractionState>({
    fileId: null,
    status: 'idle'
  });

  // Helper function to safely parse JSON response
  const safeJsonParse = useCallback(async (response: Response, endpoint: string) => {
    const contentType = response.headers.get("content-type") ?? "";
    
    if (!response.ok) {
      const text = await response.text();
      console.error(`❌ [ExtractionDisplay] ${endpoint} returned ${response.status}:`, text);
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }
    
    if (!contentType.includes("application/json")) {
      const text = await response.text();
      console.error(`❌ [ExtractionDisplay] ${endpoint} returned non-JSON (${contentType}):`, text.substring(0, 200));
      throw new Error(`API returned HTML instead of JSON - likely a backend error`);
    }
    
    return await response.json();
  }, []);

  // Handle file click - show loading state and check status
  const handleFileClick = useCallback(async (fileId: string, filename: string) => {
    console.log('🎯 [ExtractionDisplay] File clicked:', fileId, filename);
    
    // Set loading state immediately
    setFileState({
      fileId,
      status: 'loading',
      filename
    });

    try {
      // Check if file already has completed extraction
      console.log('🔍 [ExtractionDisplay] Making API call to:', `/api/${fileId}/structured-output`);
      const response = await fetch(`/api/${fileId}/structured-output`);
      
      try {
        const result = await safeJsonParse(response, 'structured-output');
        if (result.structured_output) {
          console.log('✅ [ExtractionDisplay] Found existing extraction data');
          setFileState({
            fileId,
            status: 'completed',
            filename,
            extractionData: {
              structured_output: result.structured_output,
              total_fields: Object.keys(result.structured_output).length,
              filled_fields: Object.values(result.structured_output).filter(v => v && v !== '').length,
              empty_fields: Object.values(result.structured_output).filter(v => !v || v === '').length
            }
          });

          // Notify parent component
          if (onExtractionDataReceived) {
            onExtractionDataReceived(result.structured_output);
          }
          return;
        }
      } catch (parseError) {
        console.warn('⚠️ [ExtractionDisplay] structured-output not available yet:', parseError);
        // Continue to status check
      }

      // If no existing data, check status via MongoDB service
      console.log('🔍 [ExtractionDisplay] Making API call to:', `/api/${fileId}/status`);
      const statusResponse = await fetch(`/api/${fileId}/status`);
      
      try {
        const statusResult = await safeJsonParse(statusResponse, 'status');
        if (statusResult.status === 'completed') {
          // Try to load extraction again
          console.log('🔍 [ExtractionDisplay] Making API call to:', `/api/files/${fileId}/extraction`);
          const extractionResponse = await fetch(`/api/files/${fileId}/extraction`);
          
          try {
            const extractionResult = await safeJsonParse(extractionResponse, 'extraction');
            if (extractionResult.structured_output) {
              console.log('✅ [ExtractionDisplay] Loaded extraction from MongoDB');
              setFileState({
                fileId,
                status: 'completed',
                filename,
                extractionData: {
                  structured_output: extractionResult.structured_output,
                  total_fields: Object.keys(extractionResult.structured_output).length,
                  filled_fields: Object.values(extractionResult.structured_output).filter(v => v && v !== '').length,
                  empty_fields: Object.values(extractionResult.structured_output).filter(v => !v || v === '').length
                }
              });

              // Notify parent component
              if (onExtractionDataReceived) {
                onExtractionDataReceived(extractionResult.structured_output);
              }
              return;
            }
          } catch (extractionError) {
            console.warn('⚠️ [ExtractionDisplay] extraction endpoint failed:', extractionError);
            // Continue to WebSocket waiting
          }
        }
      } catch (statusError) {
        console.warn('⚠️ [ExtractionDisplay] status endpoint failed:', statusError);
        // Continue to WebSocket waiting
      }

      // If we get here, keep loading state - WebSocket will update when ready
      console.log('⏳ [ExtractionDisplay] No existing data, waiting for WebSocket updates');
      
    } catch (error) {
      console.error('❌ [ExtractionDisplay] Error checking file status:', error);
      setFileState({
        fileId,
        status: 'failed',
        filename,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }, [onExtractionDataReceived, safeJsonParse]);

  // Handle WebSocket extraction completion
  const handleExtractionCompleted = useCallback(async (data: ExtractionCompletedEvent) => {
    console.log('🎉 [ExtractionDisplay] Received WebSocket extraction completion:', data);
    
    // Only update if this is for the current file
    if (fileState.fileId === data.file_id && data.has_structured_output) {
      try {
        // Fetch the actual structured_output from the provided URL
        const response = await fetch(data.structured_output_url);
        const result = await safeJsonParse(response, 'WebSocket structured_output_url');
        
        setFileState(prev => ({
          ...prev,
          status: 'completed',
          extractionData: {
            structured_output: result.structured_output || {},
            total_fields: data.total_fields || 0,
            filled_fields: data.filled_fields || 0,
            empty_fields: data.empty_fields || 0
          }
        }));

        // Notify parent component
        if (onExtractionDataReceived && result.structured_output) {
          onExtractionDataReceived(result.structured_output);
        }
      } catch (error) {
        console.error('❌ [ExtractionDisplay] Error fetching WebSocket structured output:', error);
        setFileState(prev => ({
          ...prev,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Failed to fetch extraction data'
        }));
      }
    }
  }, [fileState.fileId, onExtractionDataReceived, safeJsonParse]);

  // Clear state
  const clearFileState = useCallback(() => {
    setFileState({
      fileId: null,
      status: 'idle'
    });
  }, []);

  // Set up WebSocket listeners
  useEffect(() => {
    websocketService.on('extraction_completed', handleExtractionCompleted);
    
    return () => {
      websocketService.off('extraction_completed', handleExtractionCompleted);
    };
  }, [handleExtractionCompleted]);

  return {
    fileState,
    handleFileClick,
    clearFileState
  };
};
