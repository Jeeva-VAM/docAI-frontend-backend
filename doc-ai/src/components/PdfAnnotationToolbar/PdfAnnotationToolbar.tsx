import React from 'react';
import { Square, MousePointer, Trash2, Download, Zap } from 'lucide-react';
import './PdfAnnotationToolbar.css';

export type ToolMode = 'select' | 'rectangle';

interface PdfAnnotationToolbarProps {
  currentTool: ToolMode;
  onToolChange: (tool: ToolMode) => void;
  onClearAnnotations: () => void;
  onExportAnnotations: () => void;
  onGenerateText: () => void;
  annotationCount: number;
  isGenerating?: boolean;
  hasTextExtracted?: boolean;
}

export const PdfAnnotationToolbar: React.FC<PdfAnnotationToolbarProps> = ({
  currentTool,
  onToolChange,
  onClearAnnotations,
  onExportAnnotations,
  onGenerateText,
  annotationCount,
  isGenerating = false,
  hasTextExtracted = false
}) => {
  return (
    <div className="pdf-annotation-toolbar">
      <div className="toolbar-section">
        <span className="toolbar-label">Tools:</span>
        <button
          className={`tool-button ${currentTool === 'select' ? 'active' : ''}`}
          onClick={() => onToolChange('select')}
          title="Select tool"
        >
          <MousePointer size={16} />
        </button>
        <button
          className={`tool-button ${currentTool === 'rectangle' ? 'active' : ''}`}
          onClick={() => onToolChange('rectangle')}
          title="Draw rectangle"
        >
          <Square size={16} />
        </button>
      </div>

      <div className="toolbar-divider"></div>

      <div className="toolbar-section">
        <span className="annotation-count">
          {annotationCount} annotation{annotationCount !== 1 ? 's' : ''}
        </span>
      </div>

        <button
          className="action-button clear-button"
          onClick={onClearAnnotations}
          disabled={annotationCount === 0}
          title="Clear all annotations"
        >
          <Trash2 size={16} />
        </button>
        <button
          className="action-button generate-button"
          onClick={onGenerateText}
          disabled={annotationCount === 0 || isGenerating}
          title="Generate text extraction using Syncfusion PDF"
        >
          <Zap size={16} />
          {isGenerating ? 'Generating...' : 'Generate'}
        </button>
        <button
          className="action-button export-button"
          onClick={onExportAnnotations}
          disabled={annotationCount === 0 || !hasTextExtracted}
          title="Export annotations to JSON"
        >
          <Download size={16} />
        </button>
      {/* </div> */}
    </div>
  );
};