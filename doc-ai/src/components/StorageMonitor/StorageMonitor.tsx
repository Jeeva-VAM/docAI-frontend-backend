import React, { useState, useEffect } from 'react';
import { StorageService } from '../../services/storageService';
import './StorageMonitor.css';

interface StorageMonitorProps {
  isOpen: boolean;
  onClose: () => void;
}

interface StorageBreakdown {
  [category: string]: {
    size: number;
    percentage: number;
  };
}

export const StorageMonitor: React.FC<StorageMonitorProps> = ({ isOpen, onClose }) => {
  const [storageUsage, setStorageUsage] = useState({ used: 0, total: 0, percentage: 0 });
  const [breakdown, setBreakdown] = useState<StorageBreakdown>({});
  const [refreshing, setRefreshing] = useState(false);

  const refreshStorageInfo = () => {
    setRefreshing(true);
    try {
      const usage = StorageService.getStorageUsage();
      const storageBreakdown = StorageService.getStorageBreakdown();
      setStorageUsage(usage);
      setBreakdown(storageBreakdown);
    } catch (error) {
      console.error('Failed to refresh storage info:', error);
    }
    setRefreshing(false);
  };

  useEffect(() => {
    if (isOpen) {
      refreshStorageInfo();
    }
  }, [isOpen]);

  const handleCleanup = () => {
    if (confirm('This will remove old cached files to free up storage space. Continue?')) {
      StorageService.cleanupOldEntries();
      refreshStorageInfo();
    }
  };

  const handleClearAll = () => {
    if (confirm('This will remove ALL cached files and data. You will need to re-upload files. Continue?')) {
      StorageService.clearAllStorage();
      refreshStorageInfo();
    }
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const getUsageColor = (percentage: number): string => {
    if (percentage < 50) return '#4CAF50'; // Green
    if (percentage < 80) return '#FF9800'; // Orange
    return '#F44336'; // Red
  };

  if (!isOpen) return null;

  return (
    <div className="storage-monitor-overlay">
      <div className="storage-monitor">
        <div className="storage-monitor-header">
          <h2>📊 Storage Monitor</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="storage-monitor-content">
          {/* Overall Usage */}
          <div className="usage-overview">
            <h3>Overall Usage</h3>
            <div className="usage-bar-container">
              <div 
                className="usage-bar"
                style={{ 
                  width: `${Math.min(storageUsage.percentage, 100)}%`,
                  backgroundColor: getUsageColor(storageUsage.percentage)
                }}
              />
            </div>
            <div className="usage-details">
              <span>{formatSize(storageUsage.used)} / {formatSize(storageUsage.total)} used</span>
              <span className="percentage" style={{ color: getUsageColor(storageUsage.percentage) }}>
                {storageUsage.percentage.toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Category Breakdown */}
          <div className="breakdown-section">
            <h3>Storage Breakdown</h3>
            {Object.keys(breakdown).length > 0 ? (
              <div className="breakdown-list">
                {Object.entries(breakdown)
                  .sort(([,a], [,b]) => b.size - a.size)
                  .map(([category, data]) => (
                    <div key={category} className="breakdown-item">
                      <div className="breakdown-label">
                        <span className="category-name">{category}</span>
                        <span className="category-size">{formatSize(data.size)}</span>
                      </div>
                      <div className="breakdown-bar-container">
                        <div 
                          className="breakdown-bar"
                          style={{ 
                            width: `${data.percentage}%`,
                            backgroundColor: getUsageColor(data.percentage)
                          }}
                        />
                      </div>
                      <span className="breakdown-percentage">{data.percentage.toFixed(1)}%</span>
                    </div>
                  ))
                }
              </div>
            ) : (
              <p className="no-data">No storage data found</p>
            )}
          </div>

          {/* Storage Actions */}
          <div className="storage-actions">
            <h3>Storage Actions</h3>
            <div className="action-buttons">
              <button 
                className="action-button refresh" 
                onClick={refreshStorageInfo}
                disabled={refreshing}
              >
                🔄 {refreshing ? 'Refreshing...' : 'Refresh'}
              </button>
              
              <button 
                className="action-button cleanup"
                onClick={handleCleanup}
                disabled={storageUsage.percentage < 70}
              >
                🧹 Cleanup Old Files
              </button>
              
              <button 
                className="action-button clear-all"
                onClick={handleClearAll}
              >
                🗑️ Clear All Data
              </button>
            </div>
            
            <div className="action-descriptions">
              <p><strong>Refresh:</strong> Update storage usage information</p>
              <p><strong>Cleanup:</strong> Remove oldest cached files (enabled when usage &gt; 70%)</p>
              <p><strong>Clear All:</strong> Remove all cached data (files will need to be re-uploaded)</p>
            </div>
          </div>

          {/* Storage Tips */}
          <div className="storage-tips">
            <h3>💡 Storage Tips</h3>
            <ul>
              <li>Files are cached locally to improve performance</li>
              <li>Large PDF files may not be cached due to space constraints</li>
              <li>Storage is automatically cleaned when quota is exceeded</li>
              <li>Your files are safely stored on the server regardless of local cache</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
