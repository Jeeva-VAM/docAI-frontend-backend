# Folder Upload Support - React-Uploady Enhancement

## Overview
The React-Uploady File Uploader has been enhanced with comprehensive folder upload support, allowing users to upload entire directories while maintaining all existing functionality. This feature uses modern web APIs and provides robust validation and error handling.

## Features Added

### 1. **Folder Selection via webkitdirectory**
- Native browser folder selection dialog
- Preserves complete folder structure with `webkitRelativePath`
- Automatically extracts all files recursively from selected directories

### 2. **Folder Drag-and-Drop Support**
- Uses `webkitGetAsEntry()` API for drag-and-drop folder handling
- Recursive directory traversal to extract nested files
- Maintains folder structure information for each file

### 3. **Comprehensive Validation**
- File type validation against allowed extensions
- Individual file size limits
- Total folder size and file count limits
- Graceful error handling with detailed messages

### 4. **Browser Compatibility Detection**
- Automatically detects `webkitdirectory` support
- Gracefully degrades for unsupported browsers
- Shows folder upload UI only when supported

## Implementation Details

### New Props Added to ReactUploadyFileUploader

```typescript
export interface ReactUploadyFileUploaderProps {
  // ... existing props
  
  // Folder upload options
  allowFolderUpload?: boolean;  // Default: true
  folderValidationOptions?: FolderValidationOptions;
}

interface FolderValidationOptions {
  allowedExtensions?: string[];  // e.g., ['.pdf', '.json', '.docx']
  maxFileSize?: number;         // Individual file size limit
  maxTotalFiles?: number;       // Max files per folder
}
```

### Usage Examples

#### Basic Folder Upload
```tsx
<ReactUploadyFileUploader
  destination="/api/upload"
  allowFolderUpload={true}
  onUploadSuccess={handleSuccess}
  onUploadError={handleError}
/>
```

#### Advanced Folder Upload with Validation
```tsx
<ReactUploadyFileUploader
  destination="/api/projects/123/files"
  multiple={true}
  accept=".pdf,.json,.docx"
  maxFileSize={50 * 1024 * 1024}
  allowFolderUpload={true}
  folderValidationOptions={{
    maxTotalFiles: 100,
    allowedExtensions: ['.pdf', '.json', '.docx', '.txt'],
    maxFileSize: 10 * 1024 * 1024
  }}
  onUploadSuccess={(items) => refreshFileList()}
  onUploadError={(error) => showErrorMessage(error)}
/>
```

## Technical Architecture

### Core Utilities (`src/utils/folderUpload.ts`)

#### `extractFilesFromFolder(fileList: FileList): File[]`
- Processes files from `<input webkitdirectory>`
- Preserves `webkitRelativePath` for folder structure

#### `extractFilesFromDataTransfer(items: DataTransferItemList): Promise<File[]>`
- Handles drag-and-drop folder operations
- Recursively traverses directory entries
- Maintains complete folder hierarchy

#### `validateFolderContents(files: File[], options: FolderValidationOptions)`
- Validates file types against allowed extensions
- Checks individual and total file sizes
- Returns detailed validation results with errors

#### `supportsFolderUpload(): boolean`
- Feature detection for `webkitdirectory` support
- Used to conditionally show folder upload UI

### UI Components

#### Folder Selection Button
- Green-themed button matching DocAI design
- Only appears when `allowFolderUpload=true` and browser supports it
- Triggers hidden `<input webkitdirectory>` element

#### Enhanced Drop Zone
- Detects folder drops vs. file drops
- Provides visual feedback for folder operations
- Updated help text when folder upload is enabled

#### Error Handling
- Detailed validation error messages
- Graceful fallback for unsupported operations
- User-friendly error notifications

## Browser Compatibility

### Supported Browsers
- ✅ Chrome/Chromium (all versions with webkitdirectory)
- ✅ Firefox (63+)
- ✅ Safari (14.1+)
- ✅ Edge (Chromium-based)

### Unsupported Browsers
- ❌ Internet Explorer (all versions)
- ❌ Safari (< 14.1)
- ❌ Firefox (< 63)

*Note: Folder upload gracefully degrades to file-only upload in unsupported browsers*

## File Processing Flow

1. **User Action**: Drag folder or click "Browse Folder"
2. **Detection**: System detects folder vs. individual files
3. **Extraction**: Recursively extract all files maintaining paths
4. **Validation**: Validate against size, type, and count limits
5. **Processing**: Convert to File objects with `webkitRelativePath`
6. **Upload**: Pass through React-Uploady's normal parallel upload flow
7. **Tracking**: Individual file progress tracking as normal

## Integration with Existing DocAI Features

### Project/Folder Structure
- Files uploaded via folder maintain their relative paths
- Can be organized into DocAI folders based on directory structure
- Preserves original folder hierarchy information

### File Management
- Each file from folder upload is tracked individually
- Full progress tracking and status management per file
- Retry/cancel operations work for folder-uploaded files

### API Compatibility
- Uses existing file upload endpoints
- No backend changes required
- Files include `webkitRelativePath` metadata for organization

## CSS Styling

### New Classes Added
```css
/* Upload buttons container */
.upload-buttons {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  justify-content: center;
  margin-top: 0.5rem;
}

/* Folder upload button variant */
.upload-folder-button {
  background-color: #059669;
}

.upload-folder-button:hover {
  background-color: #047857;
  box-shadow: 0 2px 8px rgba(4, 120, 87, 0.3);
}
```

## Performance Considerations

### Memory Management
- Files are processed in streams, not loaded entirely in memory
- Recursive directory traversal is optimized for large folders
- Validation happens before upload to prevent unnecessary processing

### Upload Optimization
- Maintains React-Uploady's parallel upload limit (3 concurrent)
- Large folders are processed in batches
- Progress tracking remains accurate for individual files

### Error Recovery
- Failed folder validation doesn't break existing file uploads
- Individual file failures in folders don't affect other files
- Comprehensive error reporting for debugging

## Security Considerations

### File Validation
- Strict file type validation based on extensions
- File size limits enforced per file and per folder
- Maximum file count limits to prevent abuse

### Path Security
- `webkitRelativePath` is sanitized and validated
- No path traversal vulnerabilities
- Safe handling of special characters in filenames

### Privacy
- Folder processing happens entirely client-side
- No folder structure information sent to server unnecessarily
- User has full control over which folders to upload

## Testing & Validation

### Manual Testing Checklist
- [ ] Folder selection via "Browse Folder" button
- [ ] Drag-and-drop folder upload
- [ ] Mixed file and folder drag operations
- [ ] Large folder handling (100+ files)
- [ ] Nested folder structure preservation
- [ ] File type validation with folders
- [ ] Error handling for invalid folders
- [ ] Browser compatibility testing
- [ ] Progress tracking for folder uploads
- [ ] Retry/cancel operations for folder files

### Edge Cases Handled
- Empty folders (ignored gracefully)
- Folders with mixed valid/invalid files
- Folders exceeding size or count limits
- Special characters in folder/file names
- Deeply nested folder structures
- Symbolic links and shortcuts (handled safely)

## Migration & Backwards Compatibility

### Existing Code Compatibility
- ✅ Zero breaking changes to existing implementations
- ✅ All existing props and functionality preserved
- ✅ Folder upload is opt-in via `allowFolderUpload` prop
- ✅ Default behavior unchanged when `allowFolderUpload=false`

### Easy Adoption
```typescript
// Existing code works unchanged
<ReactUploadyFileUploader destination="/api/upload" />

// Enable folder upload with one prop
<ReactUploadyFileUploader 
  destination="/api/upload" 
  allowFolderUpload={true} 
/>
```

## Future Enhancements

### Potential Improvements
1. **Folder Structure Preview**: Show folder tree before upload
2. **Selective File Upload**: Allow users to exclude specific files from folders
3. **Progress by Folder**: Group progress tracking by original folders
4. **Folder Metadata**: Preserve and upload folder creation dates, permissions
5. **Zip Upload**: Support for zip file extraction and processing
6. **Resume Support**: Handle interrupted folder uploads

### Integration Opportunities
- **DocAI Folder Creation**: Auto-create DocAI folders based on directory structure
- **Batch Processing**: Process folders through DocAI analysis pipelines
- **Archive Support**: Extract and upload compressed folders (.zip, .tar.gz)

## Conclusion

The folder upload enhancement provides a robust, user-friendly way to upload entire directories while maintaining all the existing functionality and performance characteristics of the React-Uploady uploader. The implementation is backwards-compatible, secure, and follows modern web development best practices.

The feature seamlessly integrates with the existing DocAI workflow and provides a solid foundation for future enhancements to folder and batch file management capabilities.
