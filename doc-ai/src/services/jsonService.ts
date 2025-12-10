import type { JsonData, FileData } from '../types';
import { sortJsonByBoundingBoxes } from '../utils/boundingBoxUtils';

export class JsonService {
  static parseJsonFromFile(fileData: FileData, sortByBoundingBoxes = true): JsonData {
    try {
      if (typeof fileData.content === 'string') {
        const parsedJson = JSON.parse(fileData.content);
        
        // Apply bounding box sorting if enabled
        if (sortByBoundingBoxes) {
          return sortJsonByBoundingBoxes(parsedJson);
        }
        
        return parsedJson;
      }
      throw new Error('Invalid file content type for JSON');
    } catch (error) {
      console.error('Error parsing JSON:', error);
      throw new Error('Invalid JSON format');
    }
  }

  static parseJsonFromString(jsonString: string, sortByBoundingBoxes = true): JsonData {
    try {
      const parsedJson = JSON.parse(jsonString);
      
      // Apply bounding box sorting if enabled
      if (sortByBoundingBoxes) {
        return sortJsonByBoundingBoxes(parsedJson);
      }
      
      return parsedJson;
    } catch (error) {
      console.error('Error parsing JSON:', error);
      throw new Error('Invalid JSON format');
    }
  }

  static validateJson(jsonString: string): { isValid: boolean; error?: string } {
    try {
      JSON.parse(jsonString);
      return { isValid: true };
    } catch (error) {
      return { 
        isValid: false, 
        error: error instanceof Error ? error.message : 'Invalid JSON format' 
      };
    }
  }

  static formatJsonString(data: JsonData): string {
    return JSON.stringify(data, null, 2);
  }

  static flattenObject(obj: JsonData, prefix = ''): Record<string, any> {
    const flattened: Record<string, any> = {};
    
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const newKey = prefix ? `${prefix}.${key}` : key;
        
        if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
          Object.assign(flattened, this.flattenObject(obj[key], newKey));
        } else {
          flattened[newKey] = obj[key];
        }
      }
    }
    
    return flattened;
  }
}