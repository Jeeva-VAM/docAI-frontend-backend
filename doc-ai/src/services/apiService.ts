/**
 * Core API Service for DocAI application
 * Handles all HTTP communication with the backend API
 */

const API_BASE_URL = 'http://localhost:8000/api';

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
  error?: string;
}

export interface ApiError {
  message: string;
  status?: number;
  code?: string;
}

class ApiServiceClass {
  private baseUrl: string;

  constructor() {
    this.baseUrl = API_BASE_URL;
  }

  /**
   * Generic HTTP request method with error handling
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    // Default headers
    const defaultHeaders: Record<string, string> = {
      'Accept': 'application/json',
    };

    // Add Content-Type for non-FormData requests
    if (!(options.body instanceof FormData) && options.body) {
      defaultHeaders['Content-Type'] = 'application/json';
    }

    const config: RequestInit = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    };

    try {
      console.log(`🌐 API Request: ${options.method || 'GET'} ${url}`, {
        headers: config.headers,
        body: config.body instanceof FormData ? 'FormData' : config.body,
      });

      const response = await fetch(url, config);
      
      // Handle HTTP errors
      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage: string;
        
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.message || errorJson.error || `HTTP ${response.status}`;
        } catch {
          errorMessage = errorText || `HTTP Error ${response.status}`;
        }

        throw new Error(errorMessage);
      }

      // Handle empty responses
      const contentType = response.headers.get('content-type');
      console.log(`🔍 Response details: status=${response.status}, content-type='${contentType}'`);
      
      if (!contentType || !contentType.includes('application/json')) {
        // For successful requests with no JSON content (like DELETE)
        if (response.status === 204 || response.status === 200) {
          console.log(`✅ Empty response handled for ${options.method || 'GET'} ${url}`);
          return {} as T;
        }
        throw new Error('Invalid response format');
      }

      // Try to parse JSON, but handle empty responses gracefully
      try {
        const data = await response.json();
        console.log(`✅ API Response: ${options.method || 'GET'} ${url}`, data);
        return data;
      } catch (jsonError) {
        // If JSON parsing fails, check if it's because of empty response
        if (response.status === 204 || response.status === 200) {
          console.log(`✅ Empty JSON response handled for ${options.method || 'GET'} ${url}`);
          return {} as T;
        }
        throw jsonError;
      }
    } catch (error) {
      console.error(`❌ API Error: ${options.method || 'GET'} ${url}`, error);
      
      if (error instanceof Error) {
        throw error;
      }
      
      throw new Error('Network error occurred');
    }
  }

  /**
   * GET request
   */
  async get<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const searchParams = params 
      ? '?' + new URLSearchParams(params).toString() 
      : '';
    
    return this.request<T>(`${endpoint}${searchParams}`, {
      method: 'GET',
    });
  }

  /**
   * POST request with JSON body
   */
  async post<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * POST request with FormData (for file uploads)
   */
  async postFormData<T>(endpoint: string, formData: FormData): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: formData,
    });
  }

  /**
   * PUT request
   */
  async put<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * DELETE request
   */
  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'DELETE',
    });
  }

  /**
   * Health check endpoint
   */
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    try {
      return await this.get('/health');
    } catch (error) {
      console.warn('Health check failed, testing basic connectivity:', error);
      // Fallback: try to get projects to test if API is actually working
      try {
        await this.get('/projects');
        console.log('✅ API is working (projects endpoint accessible)');
        return { status: 'ok', timestamp: new Date().toISOString() };
      } catch (projectError) {
        console.error('❌ API is completely unavailable:', projectError);
        throw new Error('Backend API is not available');
      }
    }
  }

  /**
   * Get API base URL
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Set API base URL (for testing or different environments)
   */
  setBaseUrl(url: string): void {
    this.baseUrl = url;
  }
}

// Export singleton instance
export const ApiService = new ApiServiceClass();
