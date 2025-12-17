import React, { useEffect, useState } from 'react';
import { websocketService, type ExtractionCompletedEvent } from '../services/websocketService';
import styles from './ExtractionListener.module.css';

interface ExtractionListenerProps {
  projectId: string;
  onExtractionCompleted?: (data: ExtractionCompletedEvent) => void;
}

interface ExtractionResult {
  file_id: string;
  filename: string;
  status: string;
  total_fields: number;
  filled_fields: number;
  empty_fields: number;
  json_url: string | null;
  timestamp: string;
  structured_output?: Record<string, unknown>;
}

const ExtractionListener: React.FC<ExtractionListenerProps> = ({ 
  projectId, 
  onExtractionCompleted 
}) => {
  const [extractions, setExtractions] = useState<ExtractionResult[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Connect to WebSocket for this project
    websocketService.connect(projectId);
    
    // Listen for extraction completed events
    const handleExtractionCompleted = async (data: ExtractionCompletedEvent) => {
      console.log('🎉 Extraction completed:', data);
      
      // Fetch the full structured output
      let structuredOutput = null;
      if (data.structured_output_url) {
        try {
          const response = await fetch(`http://localhost:8000${data.structured_output_url}`);
          const result = await response.json();
          if (result.success) {
            structuredOutput = result.structured_output;
          }
        } catch (error) {
          console.error('Error fetching structured output:', error);
        }
      }
      
      const extractionResult: ExtractionResult = {
        file_id: data.file_id,
        filename: data.filename,
        status: data.status,
        total_fields: data.total_fields,
        filled_fields: data.filled_fields,
        empty_fields: data.empty_fields,
        json_url: data.json_url,
        timestamp: data.timestamp,
        structured_output: structuredOutput
      };
      
      // Add to local state
      setExtractions(prev => [extractionResult, ...prev]);
      
      // Call parent callback if provided
      if (onExtractionCompleted) {
        onExtractionCompleted(data);
      }
    };
    
    // Register the event listener
    websocketService.on('extraction_completed', handleExtractionCompleted);
    
    // Check connection status
    const checkConnection = () => {
      setIsConnected(websocketService.isConnected());
    };
    
    // Check connection immediately and then every 2 seconds
    checkConnection();
    const connectionInterval = setInterval(checkConnection, 2000);
    
    // Cleanup on unmount
    return () => {
      websocketService.off('extraction_completed', handleExtractionCompleted);
      clearInterval(connectionInterval);
    };
  }, [projectId, onExtractionCompleted]);

  const downloadJSON = async (fileId: string, filename: string) => {
    try {
      const response = await fetch(`http://localhost:8000/api/${fileId}/json`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}_extraction.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        alert('Failed to download JSON file');
      }
    } catch (error) {
      console.error('Error downloading JSON:', error);
      alert('Error downloading JSON file');
    }
  };

  return (
    <div className={styles.extractionListener}>
      <div className={styles.connectionStatus}>
        <div className={`${styles.statusDot} ${isConnected ? styles.connected : styles.disconnected}`}></div>
        <span>WebSocket: {isConnected ? 'Connected' : 'Disconnected'}</span>
      </div>
      
      {extractions.length > 0 && (
        <div className={styles.extractionResults}>
          <h3>📋 Extraction Results</h3>
          {extractions.map((extraction) => (
            <div key={extraction.file_id} className={styles.extractionCard}>
              <div className={styles.extractionHeader}>
                <h4>📄 {extraction.filename}</h4>
                <span className={styles.statusBadge}>{extraction.status}</span>
              </div>
              
              <div className={styles.extractionStats}>
                <div className={styles.stat}>
                  <span className="label">Total Fields:</span>
                  <span className="value">{extraction.total_fields}</span>
                </div>
                <div className={styles.stat}>
                  <span className="label">Filled Fields:</span>
                  <span className="value">{extraction.filled_fields}</span>
                </div>
                <div className={styles.stat}>
                  <span className="label">Empty Fields:</span>
                  <span className="value">{extraction.empty_fields}</span>
                </div>
              </div>
              
              <div className={styles.extractionActions}>
                {extraction.json_url && (
                  <button 
                    onClick={() => downloadJSON(extraction.file_id, extraction.filename)}
                    className={styles.downloadBtn}
                  >
                    📥 Download JSON
                  </button>
                )}
                
                {extraction.structured_output && (
                  <details className={styles.structuredOutput}>
                    <summary>🔍 View Structured Output</summary>
                    <pre className={styles.jsonViewer}>
                      {JSON.stringify(extraction.structured_output, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
              
              <div className={styles.extractionTimestamp}>
                ⏰ {new Date(extraction.timestamp).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
};

export default ExtractionListener;
