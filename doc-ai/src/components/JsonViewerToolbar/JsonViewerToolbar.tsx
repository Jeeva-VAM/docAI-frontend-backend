import React from 'react';
import { ToggleLeft, ToggleRight, Code, FormInput, Filter } from 'lucide-react';
import './JsonViewerToolbar.css';

interface JsonViewerToolbarProps {
  viewMode: 'json' | 'form';
  onToggleViewMode: () => void;
  showAllAnnotations: boolean;
  onToggleShowAll: () => void;
}

export const JsonViewerToolbar: React.FC<JsonViewerToolbarProps> = ({
  viewMode,
  onToggleViewMode,
  showAllAnnotations,
  onToggleShowAll
}) => {
  return (
    <div className="json-viewer-toolbar">
      <div className="toolbar-section">
        <span className="toolbar-label">Filters:</span>
        <button
          className="tool-button"
          title="Filter options (coming soon)"
          disabled
        >
          <Filter size={16} />
        </button>
      </div>

      <div className="toolbar-divider"></div>

      <div className="toolbar-section">
        <button
          className={`toggle-button ${viewMode === 'json' ? 'active' : ''}`}
          onClick={onToggleViewMode}
          title="Toggle view mode"
        >
          {viewMode === 'json' ? (
            <>
              <Code size={14} />
              JSON
              <ToggleLeft size={16} />
            </>
          ) : (
            <>
              <FormInput size={14} />
              Form
              <ToggleRight size={16} />
            </>
          )}
        </button>
        
        {/* Show All toggle - only visible in form mode */}
        {viewMode === 'form' && (
          <button
            className={`toggle-button show-all-toggle ${showAllAnnotations ? 'active' : ''}`}
            onClick={onToggleShowAll}
            title="Toggle show all annotations"
          >
            {showAllAnnotations ? (
              <>
                <ToggleRight size={14} />
                Hide All
              </>
            ) : (
              <>
                <ToggleLeft size={14} />
                Show All
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};