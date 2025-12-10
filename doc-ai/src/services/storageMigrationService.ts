import { StorageService } from './storageService';
import { IndexedDBService } from './indexedDBService';
import type { Project } from '../types';

export class StorageMigrationService {
  // Migrate data from localStorage to IndexedDB
  static async migrateToIndexedDB(project: Project): Promise<void> {
    try {
      console.log('Starting migration to IndexedDB for project:', project.name);
      
      // Initialize IndexedDB if not already done
      await IndexedDBService.initialize();
      
      // Get all files from localStorage
      const projectStorage = StorageService.getProjectStorage();
      
      for (const storedFile of projectStorage.files) {
        try {
          // Get file content from localStorage
          const content = StorageService.getFileContent(storedFile.id);
          if (!content) {
            console.warn('No content found for file:', storedFile.name);
            continue;
          }
          
          // Convert to FileData format
          const fileData = {
            id: storedFile.id,
            name: storedFile.name,
            type: storedFile.type,
            size: storedFile.size,
            lastModified: storedFile.lastModified,
            content
          };
          
          // Store in IndexedDB
          await IndexedDBService.storeFile(fileData, project.id);
          console.log('Migrated file to IndexedDB:', storedFile.name);
          
          // Migrate PDF images if they exist
          if (storedFile.hasImages) {
            const images = StorageService.getPdfImages(storedFile.id);
            if (images) {
              await IndexedDBService.storePdfImages(storedFile.id, project.id, images);
              console.log('Migrated PDF images for:', storedFile.name);
            }
          }
          
          // Migrate associated JSON if it exists
          if (storedFile.hasAssociatedJson) {
            const jsonData = StorageService.getAssociatedJson(storedFile.id);
            if (jsonData) {
              await IndexedDBService.storeJsonData(
                storedFile.id,
                project.id,
                jsonData,
                storedFile.name,
                storedFile.size,
                storedFile.lastModified
              );
              console.log('Migrated JSON data for:', storedFile.name);
            }
          }
          
        } catch (fileError) {
          console.error('Failed to migrate file:', storedFile.name, fileError);
        }
      }
      
      console.log('Migration to IndexedDB completed for project:', project.name);
      
    } catch (error) {
      console.error('Failed to migrate to IndexedDB:', error);
      throw error;
    }
  }
  
  // Check if there's data in localStorage that needs migration
  static hasLegacyData(): boolean {
    try {
      const storage = StorageService.getProjectStorage();
      return storage.files.length > 0;
    } catch {
      return false;
    }
  }
  
  // Get storage usage information
  static async getStorageInfo(): Promise<{
    localStorage: { used: number; available: number; files: number };
    indexedDB: { totalFiles: number; totalProjects: number; estimatedSize: number };
  }> {
    const localStorageInfo = StorageService.getStorageInfo();
    const indexedDBInfo = await IndexedDBService.getStorageStats();
    
    return {
      localStorage: localStorageInfo,
      indexedDB: indexedDBInfo
    };
  }
  
  // Clear old localStorage data after successful migration
  static clearLegacyStorage(): void {
    try {
      StorageService.clearAllStorage();
      console.log('Legacy localStorage data cleared');
    } catch (error) {
      console.error('Failed to clear legacy storage:', error);
    }
  }
}