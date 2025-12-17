/**
 * MongoDB-Gated Extraction Hook
 * Enforces MongoDB status as the ONLY gatekeeper for extraction rendering
 */

import { useState, useCallback } from 'react';
import { FileApiService } from '../services/fileApiService';

interface ExtractionStatus {
  status: 'processing_extractions' | 'processing_to_ai' | 'completed' | 'failed' | 'unknown';
  message: string;
  isLoading: boolean;
}

interface ExtractionData {
  structured_output?: Record<string, unknown>;
  isLoading: boolean;
  error?: string;
}

interface UseMongoDBExtractionOptions {
  onExtractionLoaded?: (data: Record<string, unknown>) => void;
}

interface UseMongoDBExtractionReturn {
  // Status management
  extractionStatus: ExtractionStatus;
  checkStatus: (fileId: string) => Promise<string>;
  
  // Data management  
  extractionData: ExtractionData;
  loadExtraction: (fileId: string) => Promise<void>;
  clearExtraction: () => void;
  
  // Combined flow - the main method to use
  handleFileClick: (fileId: string) => Promise<void>;
}

export const useMongoDBExtraction = (options: UseMongoDBExtractionOptions = {}): UseMongoDBExtractionReturn => {
  const { onExtractionLoaded } = options;
  const [extractionStatus, setExtractionStatus] = useState<ExtractionStatus>({
    status: 'unknown',
    message: 'Not started',
    isLoading: false
  });

  const [extractionData, setExtractionData] = useState<ExtractionData>({
    isLoading: false
  });

  // Check MongoDB status
  const checkStatus = useCallback(async (fileId: string) => {
    console.log('🔍 [MongoDB] Checking status for file:', fileId);
    
    setExtractionStatus({
      status: 'unknown',
      message: 'Checking status...',
      isLoading: true
    });

    try {
      const statusResponse = await FileApiService.getFileStatus(fileId);
      const { status, message } = statusResponse;
      
      console.log('✅ [MongoDB] Status retrieved:', { status, message });
      
      setExtractionStatus({
        status: status as 'processing_extractions' | 'processing_to_ai' | 'completed' | 'failed' | 'unknown',
        message: message,
        isLoading: false
      });
      
      return status;
    } catch (error) {
      console.error('❌ [MongoDB] Status check failed:', error);
      
      setExtractionStatus({
        status: 'unknown',
        message: 'Status check failed',
        isLoading: false
      });
      
      throw error;
    }
  }, []);

  // Load extraction data (only if status === 'completed')
  const loadExtraction = useCallback(async (fileId: string) => {
    console.log('📋 [MongoDB] Loading extraction for file:', fileId);
    
    setExtractionData({
      isLoading: true
    });

    try {
      // Note: Backend returns {structured_output} but we treat it as extraction_json for compatibility
      const extractionResponse = await FileApiService.getFileExtraction(fileId) as unknown as { structured_output: Record<string, unknown> };
      const { structured_output } = extractionResponse;
      
      if (!structured_output) {
        throw new Error('No structured_output found in extraction results');
      }
      
      console.log('✅ [MongoDB] Extraction loaded successfully');
      
      setExtractionData({
        structured_output,
        isLoading: false
      });

      // Notify parent component to update JSON state
      if (onExtractionLoaded) {
        onExtractionLoaded(structured_output);
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load extraction';
      console.error('❌ [MongoDB] Extraction loading failed:', errorMessage);
      
      setExtractionData({
        isLoading: false,
        error: errorMessage
      });
      
      throw error;
    }
  }, [onExtractionLoaded]);

  // Clear extraction state
  const clearExtraction = useCallback(() => {
    console.log('🧹 [MongoDB] Clearing extraction state');
    
    setExtractionStatus({
      status: 'unknown',
      message: 'Ready to check status',
      isLoading: false
    });
    
    setExtractionData({
      isLoading: false
    });
  }, []);

  // Main method: MongoDB-gated file click handler
  const handleFileClick = useCallback(async (fileId: string) => {
    console.log('🎯 [MongoDB] File clicked:', fileId);
    
    // Step 1: Clear any existing state immediately
    clearExtraction();
    
    try {
      // Step 2: Check MongoDB status
      const status = await checkStatus(fileId);
      
      // Step 3: Only load extraction if completed
      if (status === 'completed') {
        console.log('✅ [MongoDB] Status is completed, loading extraction');
        await loadExtraction(fileId);
      } else {
        console.log('⏳ [MongoDB] Status is not completed, showing spinner');
        // Spinner and status message are already shown by checkStatus
      }
      
    } catch (error) {
      console.error('❌ [MongoDB] File click handler failed:', error);
      // Error states are already set by individual methods
    }
  }, [checkStatus, loadExtraction, clearExtraction]);

  return {
    extractionStatus,
    checkStatus,
    extractionData,
    loadExtraction,
    clearExtraction,
    handleFileClick
  };
};
