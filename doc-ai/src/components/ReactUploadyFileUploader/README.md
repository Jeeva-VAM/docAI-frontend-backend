# React-Uploady File Uploader Component

A modern, parallel file upload component built with React-Uploady that provides advanced upload functionality without modifying existing project workflows.

## Features

- **Parallel Uploads**: Upload multiple files simultaneously for faster processing
- **Real-time Progress**: Per-file progress tracking with visual progress bars
- **Drag & Drop**: Intuitive drag-and-drop interface with visual feedback
- **Error Handling**: Comprehensive error handling and user feedback
- **File Validation**: Built-in file type and size validation
- **Responsive Design**: Mobile-friendly interface that adapts to different screen sizes
- **Clean Integration**: Designed to work alongside existing components without conflicts

## Usage

### Basic Implementation

```tsx
import React from 'react';
import ReactUploadyFileUploader from './components/ReactUploadyFileUploader';

function MyComponent() {
  const handleUploadSuccess = (items) => {
    console.log('Upload successful:', items);
    // Handle successful uploads
  };

  const handleUploadError = (error) => {
    console.error('Upload failed:', error);
    // Handle upload errors
  };

  return (
    <ReactUploadyFileUploader
      destination="http://localhost:8000/api/upload"
      multiple={true}
      accept=".pdf,.json"
      maxFileSize={10 * 1024 * 1024} // 10MB
      onUploadSuccess={handleUploadSuccess}
      onUploadError={handleUploadError}
      className="my-uploader"
    />
  );
}
```

### Integration Example

```tsx
import React, { useState } from 'react';
import ReactUploadyFileUploader from './components/ReactUploadyFileUploader';

function UploadPage() {
  const [uploadedFiles, setUploadedFiles] = useState([]);

  const handleUploadSuccess = (items) => {
    setUploadedFiles(prev => [...prev, ...items]);
    // Optionally refresh file list or update UI
  };

  const handleUploadError = (error) => {
    // Show user-friendly error message
    alert(`Upload failed: ${error.message}`);
  };

  return (
    <div className="upload-page">
      <h1>Upload Documents</h1>
      
      <ReactUploadyFileUploader
        destination="http://localhost:8000/api/projects/123/files"
        multiple={true}
        accept=".pdf,.json,.docx"
        maxFileSize={50 * 1024 * 1024} // 50MB
        onUploadSuccess={handleUploadSuccess}
        onUploadError={handleUploadError}
      />
      
      {uploadedFiles.length > 0 && (
        <div className="upload-results">
          <h3>Recently Uploaded:</h3>
          <ul>
            {uploadedFiles.map(file => (
              <li key={file.id}>{file.name}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `destination` | `string` | **Required** | Upload endpoint URL |
| `multiple` | `boolean` | `true` | Allow multiple file selection |
| `accept` | `string` | `".pdf,.json"` | Accepted file types |
| `maxFileSize` | `number` | `10485760` | Maximum file size in bytes (10MB) |
| `onUploadSuccess` | `(items) => void` | `undefined` | Success callback with uploaded file info |
| `onUploadError` | `(error) => void` | `undefined` | Error callback |
| `className` | `string` | `""` | Additional CSS class names |

## Configuration

### Parallel Upload Settings

The component is pre-configured for optimal parallel uploads:
- **Concurrent uploads**: 3 files at once
- **Individual processing**: Each file tracked separately
- **Auto-upload**: Files start uploading immediately when selected

### File Validation

Built-in validation includes:
- File type checking based on `accept` prop
- File size validation using `maxFileSize`
- Automatic error reporting for invalid files

## Styling

The component includes comprehensive CSS styling that can be customized:

```css
/* Override default styles */
.my-uploader .upload-drop-zone {
  border-color: #your-brand-color;
}

.my-uploader .upload-browse-button {
  background-color: #your-button-color;
}
```

## Integration with Existing Project

This component is designed to work alongside the existing DocAI components:

1. **No Conflicts**: Uses separate namespace and doesn't modify existing code
2. **Compatible APIs**: Can work with the same backend endpoints
3. **Consistent Styling**: Matches the project's design patterns
4. **Flexible Usage**: Can be dropped into any page or component

### Example: Adding to ExtractPage

```tsx
// In ExtractPage.tsx
import ReactUploadyFileUploader from '../ReactUploadyFileUploader';

// Add as an alternative upload method
<div className="upload-section">
  <h3>Quick Upload (Parallel)</h3>
  <ReactUploadyFileUploader
    destination={`http://localhost:8000/api/projects/${projectId}/files`}
    onUploadSuccess={(items) => {
      // Refresh file list
      refreshApiFiles();
      showToast('Files uploaded successfully!', 'success');
    }}
    onUploadError={(error) => {
      showToast(`Upload failed: ${error.message}`, 'error');
    }}
  />
</div>
```

## Benefits Over Existing Uploader

1. **Parallel Processing**: Upload multiple files simultaneously
2. **Better UX**: Real-time progress and visual feedback
3. **Modern Libraries**: Built on React-Uploady for reliability
4. **No Breaking Changes**: Works alongside existing upload logic
5. **Enhanced Error Handling**: More detailed error reporting
6. **Mobile Optimized**: Better touch and responsive design

This component provides a modern upload experience while maintaining full compatibility with the existing DocAI project structure.
