import type { JsonData } from '../types';
import { JsonService } from './jsonService';

export class PublicJsonLoaderService {
  /**
   * Load JSON file from public folder based on PDF file name
   * @param pdfFileName - Name of the PDF file (with or without extension)
   * @returns Promise<JsonData | null> - Loaded JSON data or null if not found
   */
  static async loadJsonForPdf(pdfFileName: string): Promise<JsonData | null> {
    try {
      // Extract base name without extension
      const baseName = pdfFileName.replace(/\.[^/.]+$/, '');
      
      // Try different possible JSON file names
      const possibleNames = [
        `${baseName}.json`,
        `${baseName}-form.json`,
        `${baseName}-data.json`,
        `${baseName}-extracted.json`
      ];

      console.log(`🔍 Looking for JSON files for PDF: ${pdfFileName}`);
      console.log(`📁 Possible JSON names:`, possibleNames);

      for (const jsonFileName of possibleNames) {
        try {
          const response = await fetch(`/${jsonFileName}`);
          if (response.ok) {
            const jsonText = await response.text();
            // Detect if response is HTML (error page) instead of JSON
            if (jsonText.trim().startsWith('<!DOCTYPE') || jsonText.trim().startsWith('<html') || jsonText.trim().startsWith('<')) {
              console.error(`❌ ${jsonFileName} is not valid JSON (received HTML/error page).`);
              continue;
            }
            // Use enhanced JsonService with IOU sorting
            const jsonData = JsonService.parseJsonFromString(jsonText, true);
            console.log(`✅ Found and sorted matching JSON file: ${jsonFileName}`);
            return jsonData;
          }
        } catch (error) {
          // Continue to next possible name
          console.log(`❌ Failed to load ${jsonFileName}:`, error);
        }
      }

      console.log(`⚠️ No matching JSON file found for PDF: ${pdfFileName}`);
      return null;
    } catch {
      // Error loading JSON from public folder
      return null;
    }
  }

  /**
   * Check if a JSON file exists in public folder
   * @param jsonFileName - Name of the JSON file
   * @returns Promise<boolean> - Whether file exists
   */
  static async checkJsonExists(jsonFileName: string): Promise<boolean> {
    try {
      const response = await fetch(`/${jsonFileName}`, { method: 'HEAD' });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * List all available JSON files in public folder
   * @returns Promise<string[]> - Array of JSON file names
   */
  static async listAvailableJsonFiles(): Promise<string[]> {
    // Since we can't directly list files from public folder in browser,
    // we'll try common names and return ones that exist
    const commonJsonFiles = [
      'sample.json',
      'sample-form.json',
      'simple-test.json',
      'test-ba.json'
    ];

    const availableFiles: string[] = [];
    for (const fileName of commonJsonFiles) {
      if (await this.checkJsonExists(fileName)) {
        availableFiles.push(fileName);
      }
    }

    return availableFiles;
  }
}