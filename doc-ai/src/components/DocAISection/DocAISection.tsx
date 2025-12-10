import React, { useState } from 'react';
import { Upload, MoreVertical, X } from 'lucide-react';
import './DocAISection.css';

interface Folder {
  id: string;
  name: string;
  files: File[];
}

interface DocAISectionProps {
  // Add props as needed
}

export const DocAISection: React.FC<DocAISectionProps> = () => {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [showFolderMenu, setShowFolderMenu] = useState<string | null>(null);
  const [showFileMenu, setShowFileMenu] = useState<string | null>(null);

  // Create folder
  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      setFolders([
        ...folders,
        {
          id: Math.random().toString(36).slice(2),
          name: newFolderName,
          files: [],
        },
      ]);
      setNewFolderName('');
      setShowCreateFolder(false);
    }
  };

  // Upload files to folder
  const handleUploadFiles = (folderId: string, files: FileList) => {
    setFolders(folders =>
      folders.map(folder =>
        folder.id === folderId
          ? { ...folder, files: [...folder.files, ...Array.from(files)] }
          : folder
      )
    );
  };

  // Delete folder
  const handleDeleteFolder = (folderId: string) => {
    setFolders(folders => folders.filter(folder => folder.id !== folderId));
    setShowFolderMenu(null);
  };

  // Delete file
  const handleDeleteFile = (folderId: string, fileIndex: number) => {
    setFolders(folders =>
      folders.map(folder =>
        folder.id === folderId
          ? { ...folder, files: folder.files.filter((_, idx) => idx !== fileIndex) }
          : folder
      )
    );
    setShowFileMenu(null);
  };

  return (
    <div className="docai-section">
      <div className="docai-folders">
        {folders.map(folder => (
          <div key={folder.id} className="docai-folder">
            <div className="docai-folder-header">
              <span className="docai-folder-name">{folder.name}</span>
              <button className="docai-folder-menu" onClick={() => setShowFolderMenu(folder.id)} style={{ marginLeft: 'auto' }}>
                <MoreVertical size={12} />
              </button>
              {showFolderMenu === folder.id && (
                <div className="docai-dropdown-menu" style={{ fontSize: '0.8rem', minWidth: '120px' }}>
                  <button className="docai-dropdown-item" onClick={() => { setActiveFolderId(folder.id); setShowFolderMenu(null); }}>
                    <Upload size={11} /> Upload Files
                  </button>
                  <button className="docai-dropdown-item delete" onClick={() => handleDeleteFolder(folder.id)}>
                    <X size={11} /> Delete Folder
                  </button>
                </div>
              )}
            </div>
            <div className="docai-files">
              {folder.files.map((file, idx) => (
                <div key={idx} className="docai-file">
                  <span className="docai-file-name">{file.name}</span>
                  <button className="docai-file-menu" onClick={() => setShowFileMenu(folder.id + '-' + idx)}>
                    <MoreVertical size={13} />
                  </button>
                  {showFileMenu === folder.id + '-' + idx && (
                    <div className="docai-dropdown-menu">
                      <button className="docai-dropdown-item delete" onClick={() => handleDeleteFile(folder.id, idx)}>
                        <X size={12} /> Delete File
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {/* Hidden file input for folder upload */}
            {activeFolderId === folder.id && (
              <input
                type="file"
                multiple
                autoFocus
                style={{ position: 'absolute', left: '-9999px' }}
                onChange={e => {
                  if (e.target.files) {
                    handleUploadFiles(folder.id, e.target.files);
                    setActiveFolderId(null);
                  }
                }}
                onBlur={() => setActiveFolderId(null)}
              />
            )}
          </div>
        ))}
      </div>
      {/* Create Folder Dialog */}
      {showCreateFolder && (
        <form
          className="docai-create-folder-dialog"
          onSubmit={e => {
            e.preventDefault();
            handleCreateFolder();
          }}
        >
          <input
            type="text"
            className="docai-folder-input"
            placeholder="Folder name"
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            autoFocus
            style={{ fontSize: '0.9rem', marginBottom: '0.5rem', width: '120px' }}
          />
          <button
            type="submit"
            className="docai-create-btn"
            disabled={!newFolderName.trim()}
          >
            Create
          </button>
          <button
            type="button"
            className="docai-create-close"
            onClick={() => setShowCreateFolder(false)}
          >
            <X size={12} />
          </button>
        </form>
      )}
    </div>
  );
};
