/**
 * WebSocket service for real-time project updates
 */

interface FileProcessedEvent {
  event: 'file_processed';
  file_id: string;
  batch_id: string;
  status: string;
  has_extraction: boolean;
}

interface ExtractionCompletedEvent {
  event: 'extraction_completed';
  file_id: string;
  filename: string;
  status: 'completed';
  has_structured_output: boolean;
  json_url: string | null;
  structured_output_url: string;
  summary: {
    total_fields: number;
    filled_fields: number;
    empty_fields: number;
  };
  total_fields: number;
  filled_fields: number;
  empty_fields: number;
  timestamp: string;
  project_id: string;
}

type WebSocketMessage = FileProcessedEvent | ExtractionCompletedEvent;

class WebSocketService {
  private ws: WebSocket | null = null;
  private projectId: string | null = null;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second

  connect(projectId: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.projectId === projectId) {
      return; // Already connected to this project
    }

    this.disconnect();
    this.projectId = projectId;
    
    const wsUrl = `ws://localhost:8000/ws/projects/${projectId}`;
    console.log(`🔌 Connecting to WebSocket: ${wsUrl}`);
    
    try {
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log(`✅ WebSocket connected to project ${projectId}`);
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000;
      };
      
      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.warn('🔥 Failed to parse WebSocket message:', event.data);
        }
      };
      
      this.ws.onclose = (event) => {
        console.log(`🔌 WebSocket disconnected from project ${projectId}`, event.code, event.reason);
        this.attemptReconnect();
      };
      
      this.ws.onerror = (error) => {
        console.error('🔥 WebSocket error:', error);
      };
      
    } catch (error) {
      console.error('🔥 Failed to create WebSocket connection:', error);
    }
  }

  disconnect(): void {
    if (this.ws) {
      console.log(`🔌 Disconnecting WebSocket from project ${this.projectId}`);
      this.ws.close();
      this.ws = null;
    }
    this.projectId = null;
    this.reconnectAttempts = 0;
  }

  private attemptReconnect(): void {
    if (!this.projectId || this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('🔌 Max reconnection attempts reached or no project ID');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff
    
    console.log(`🔄 Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      if (this.projectId) {
        this.connect(this.projectId);
      }
    }, delay);
  }

  private handleMessage(message: WebSocketMessage): void {
    console.log('📨 WebSocket message received:', message);
    
    if (message.event === 'file_processed') {
      this.notifyListeners('file_processed', message);
    } else if (message.event === 'extraction_completed') {
      console.log('🎉 Extraction completed for file:', message.file_id);
      this.notifyListeners('extraction_completed', message);
      // Also trigger file_processed for backward compatibility
      this.notifyListeners('file_processed', {
        ...message,
        event: 'file_processed',
        batch_id: '',
        has_extraction: message.has_structured_output
      });
    }
  }

  // Event listener management
  on(event: string, callback: (data: any) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: (data: any) => void): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.delete(callback);
    }
  }

  private notifyListeners(event: string, data: any): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('🔥 Error in WebSocket event listener:', error);
        }
      });
    }
  }

  // Utility methods
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  getProjectId(): string | null {
    return this.projectId;
  }
}

// Export singleton instance
export const websocketService = new WebSocketService();

// Types for external use
export type { FileProcessedEvent, ExtractionCompletedEvent, WebSocketMessage };
