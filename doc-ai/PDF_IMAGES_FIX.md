# PDF Images API Fix

## Problem
The frontend was showing "No images found for this PDF" even though the backend API was successfully returning image URLs. The issue occurred when calling `/api/projects/{project_id}/files/{file_id}/images`.

## Root Causes

1. **Missing `projectId` prop**: The `PdfViewerAsImages` component required both `projectId` and `fileId`, but only `fileId` was being passed from `ExtractPage.tsx`.

2. **Incorrect API URL**: The `usePdfImages` hook was using a relative URL (`/api/projects/...`) instead of the full backend URL (`http://localhost:8000/api/projects/...`).

3. **Relative image URLs**: The backend was returning relative URLs like `/static/uploads/...` which needed to be converted to absolute URLs for the frontend to load them.

## Changes Made

### 1. Updated `usePdfImages.ts` Hook
**File**: `DocAI-V4 2/src/hooks/usePdfImages.ts`

- Added `API_BASE_URL` constant pointing to `http://localhost:8000`
- Updated fetch URL to use absolute path: `${API_BASE_URL}/api/projects/${projectId}/files/${fileId}/images`
- Added URL conversion logic to transform relative URLs to absolute URLs
- Added comprehensive logging for debugging
- Added proper error handling with status code checking

### 2. Updated `ExtractPage.tsx` Component
**File**: `DocAI-V4 2/src/pages/ExtractPage.tsx`

- Added `currentProject` to the `ExtractPageProps` interface
- Added `Project` type import
- Updated component to receive `currentProject` prop
- Modified `PdfViewerAsImages` usage to pass both `projectId` and `fileId`:
  ```tsx
  <PdfViewerAsImages 
    projectId={currentProject.id} 
    fileId={selectedFile.id} 
  />
  ```
- Added conditional rendering to show error message if no project is selected

### 3. Updated `App.tsx`
**File**: `DocAI-V4 2/src/App.tsx`

- Added `currentProject={currentProject}` prop when rendering `ExtractPage` component

## How It Works Now

1. User selects a PDF file in a project
2. `ExtractPage` receives both `selectedFile` and `currentProject` props
3. `PdfViewerAsImages` is called with both `projectId` and `fileId`
4. `usePdfImages` hook constructs the full API URL: `http://localhost:8000/api/projects/{projectId}/files/{fileId}/images`
5. Backend returns JSON with relative image URLs: `["/static/uploads/.../page_1.png", ...]`
6. Hook converts relative URLs to absolute: `["http://localhost:8000/static/uploads/.../page_1.png", ...]`
7. Images are displayed in the PDF viewer

## Testing

To verify the fix works:

1. Open a project
2. Upload a PDF file (or select an existing one)
3. The PDF should now display as images in the right panel
4. Check browser console for logs:
   - `📸 Fetching PDF images from: http://localhost:8000/api/projects/.../files/.../images`
   - `📸 Response status: 200`
   - `📸 Received image data: {images: [...]}`
   - `📸 Setting images: [...]`

## Backend Verification

The backend is working correctly as confirmed by PowerShell test:
```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:8000/api/projects/{project_id}/files/{file_id}/images"
# Returns: StatusCode 200 with JSON containing image URLs
```

## Additional Fix: Multiple Pages Display

### Problem
After the initial fix, only one page was showing even though multiple pages were being loaded.

### Root Cause
The `.extract-right-panel` container had `height: 100%` but no `overflow` property, causing pages beyond the viewport to be hidden.

### Solution
1. Added `overflow-y: auto` and `overflow-x: hidden` to `.extract-right-panel` in `ExtractPage.css`
2. Created `PdfViewerAsImages.css` with proper styling for the PDF viewer
3. Added visual indicators showing "Page X of Y" for each page
4. Added console logging to track image loading success/failure

### Files Modified
- `DocAI-V4 2/src/pages/ExtractPage.css` - Added overflow properties
- `DocAI-V4 2/src/components/PdfViewer/PdfViewerAsImages.tsx` - Enhanced with page labels and logging
- `DocAI-V4 2/src/components/PdfViewer/PdfViewerAsImages.css` - New file with styling

## Notes

- The fix assumes the backend is running on `http://localhost:8000`
- If deploying to production, you may want to make `API_BASE_URL` configurable via environment variables
- The same pattern should be applied to other API calls if they have similar issues
- All PDF pages should now be scrollable in the right panel
- Check browser console for detailed logs about image loading
