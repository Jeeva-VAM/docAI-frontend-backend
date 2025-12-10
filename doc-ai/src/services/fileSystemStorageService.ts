export interface FileSystemStorage {
  id: string;
  filename: string;
  type: string;
  size: number;
  uploadDate: string;
  downloadPath: string; // Expected path in Downloads folder
  status: 'uploaded' | 'downloaded' | 'moved'; // Track file status
}

export interface ProjectManifest {
  projectName: string;
  created: string;
  lastModified: string;
  files: FileSystemStorage[];
  storageLocation: string;
}

class FileSystemStorageService {
  private readonly MANIFEST_KEY = 'docai_project_manifest';
  private readonly STORAGE_FOLDER = './storage';

  // Get project manifest
  getProjectManifest(): ProjectManifest {
    const stored = localStorage.getItem(this.MANIFEST_KEY);
    if (stored) {
      return JSON.parse(stored);
    }

    // Create default manifest
    const manifest: ProjectManifest = {
      projectName: 'DocAI Project',
      created: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      files: [],
      storageLocation: this.STORAGE_FOLDER
    };

    this.saveProjectManifest(manifest);
    return manifest;
  }

  // Save project manifest
  saveProjectManifest(manifest: ProjectManifest): void {
    manifest.lastModified = new Date().toISOString();
    localStorage.setItem(this.MANIFEST_KEY, JSON.stringify(manifest, null, 2));
    
    // Also download the manifest file
    this.downloadManifestFile(manifest);
  }

  // Add file to manifest
  addFileToManifest(file: File): FileSystemStorage {
    const manifest = this.getProjectManifest();
    
    const fileEntry: FileSystemStorage = {
      id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      filename: file.name,
      type: file.type,
      size: file.size,
      uploadDate: new Date().toISOString(),
      downloadPath: `~/Downloads/${file.name}`,
      status: 'uploaded'
    };

    manifest.files.push(fileEntry);
    this.saveProjectManifest(manifest);

    // Download the file immediately
    this.downloadFile(file, fileEntry.id);

    return fileEntry;
  }

  // Download file to Downloads folder
  private downloadFile(file: File, fileId: string): void {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.style.display = 'none';
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    URL.revokeObjectURL(url);

    // Update file status
    this.updateFileStatus(fileId, 'downloaded');
  }

  // Download manifest file
  private downloadManifestFile(manifest: ProjectManifest): void {
    const manifestJson = JSON.stringify(manifest, null, 2);
    const blob = new Blob([manifestJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'project-manifest.json';
    a.style.display = 'none';
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    URL.revokeObjectURL(url);
  }

  // Update file status
  updateFileStatus(fileId: string, status: FileSystemStorage['status']): void {
    const manifest = this.getProjectManifest();
    const fileIndex = manifest.files.findIndex(f => f.id === fileId);
    
    if (fileIndex !== -1) {
      manifest.files[fileIndex].status = status;
      this.saveProjectManifest(manifest);
    }
  }

  // Get all files
  getAllFiles(): FileSystemStorage[] {
    return this.getProjectManifest().files;
  }

  // Remove file from manifest
  removeFile(fileId: string): void {
    const manifest = this.getProjectManifest();
    manifest.files = manifest.files.filter(f => f.id !== fileId);
    this.saveProjectManifest(manifest);
  }

  // Get file by ID
  getFileById(fileId: string): FileSystemStorage | undefined {
    const manifest = this.getProjectManifest();
    return manifest.files.find(f => f.id === fileId);
  }

  // Export all data
  exportProject(): void {
    const manifest = this.getProjectManifest();
    
    // Create a comprehensive export
    const exportData = {
      ...manifest,
      exportDate: new Date().toISOString(),
      instructions: {
        message: "To restore this project:",
        steps: [
          "1. Move all downloaded files to your desired storage folder",
          "2. Update the 'storageLocation' in this manifest",
          "3. Import this manifest back into the application"
        ]
      }
    };

    const exportJson = JSON.stringify(exportData, null, 2);
    const blob = new Blob([exportJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `docai-project-export-${new Date().toISOString().split('T')[0]}.json`;
    a.style.display = 'none';
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    URL.revokeObjectURL(url);
  }

  // Import project
  importProject(manifestFile: File): Promise<ProjectManifest> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const importedData = JSON.parse(e.target?.result as string);
          
          // Validate imported data
          if (!importedData.files || !Array.isArray(importedData.files)) {
            throw new Error('Invalid project manifest format');
          }

          const manifest: ProjectManifest = {
            projectName: importedData.projectName || 'Imported Project',
            created: importedData.created || new Date().toISOString(),
            lastModified: new Date().toISOString(),
            files: importedData.files,
            storageLocation: importedData.storageLocation || this.STORAGE_FOLDER
          };

          this.saveProjectManifest(manifest);
          resolve(manifest);
        } catch (error) {
          reject(new Error(`Failed to import project: ${error}`));
        }
      };

      reader.onerror = () => reject(new Error('Failed to read manifest file'));
      reader.readAsText(manifestFile);
    });
  }
}

export const fileSystemStorageService = new FileSystemStorageService();