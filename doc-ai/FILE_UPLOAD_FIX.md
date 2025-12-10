# File Upload Duplication Fix

## Problem
When uploading files to a folder, the files appeared both inside the folder and outside the folder as duplicates.

## Root Cause
The `handleUploadToFolder` function in `FileUploader.tsx` was:
1. Uploading files to the specific folder via `FileApiService.uploadFileToFolder(folderId, file)`
2. Then calling `onFileUpload(fileList)` which uploaded the same files again to the project root

This caused duplication because files were being uploaded twice - once to the folder and once to the project root.

## Fixes Applied

### 1. Fixed File Upload Duplication
**File:** `src/components/FileUploader/FileUploader.tsx`
- Removed the `onFileUpload(fileList)` call from `handleUploadToFolder` function
- Files uploaded to folders now only go to the folder, not duplicated to project root

### 2. Enhanced Root File Filtering
**File:** `src/services/fileApiService.ts`
- Updated `listFilesInProject` to explicitly filter out files with `folder_id`
- Only returns files that don't belong to any folder (folder_id is null/undefined)

### 3. Added Double-Check Filtering
**File:** `src/hooks/useApiFiles.ts`  
- Added additional client-side filtering to ensure no folder files leak into the main files array
- Only root-level files (without folderId) are shown in the main file list

### 4. Clarified Project Root Upload Context
**File:** `src/App.tsx`
- Explicitly configured `useApiFileUpload` hook with `targetFolderId: null` for project root uploads
- Added comments to clarify that this hook is for project root uploads only

## Result
- Files uploaded to folders now only appear in that folder
- Files uploaded to project root only appear in the root file list  
- No more duplication
- File list properly shows only files with `folderId` null as requested

## File Upload Flow (After Fix)

### Project Root Upload
1. User drags/drops files or uses main upload button
2. `handleDrop` or `handleFileInputChange` calls `onFileUpload()`
3. Files are uploaded via `FileApiService.uploadFileToProject()`
4. Files appear only in root file list

### Folder Upload  
1. User clicks "Upload Files" button in a folder
2. `handleUploadToFolder` is called
3. Files are uploaded via `FileApiService.uploadFileToFolder(folderId, file)`
4. Files appear only in that specific folder
5. No duplicate upload to project root
