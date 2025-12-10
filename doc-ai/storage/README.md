# Storage Directory

This directory is intended for file storage, but due to browser security limitations, the web application cannot directly write files here.

## How File Storage Works:

1. **Upload**: Files are processed in memory
2. **Download**: Files are saved to your browser's Downloads folder
3. **Manifest**: A project manifest file tracks all uploaded files

## Alternative Solutions:

- Use the download-based storage system
- Run a local Node.js server for file operations
- Use Electron for desktop app with file system access

## Files in this directory:
- `project-manifest.json` - Tracks uploaded files and their metadata
- Any manually moved files from Downloads folder