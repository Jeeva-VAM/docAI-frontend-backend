import { useState } from 'react';
import { JsonViewer } from '../components/JsonViewer';
import { PdfViewer } from '../components/PdfViewer';
import { PdfViewerAsImages } from '../components/PdfViewer/PdfViewerAsImages';
import { ResizableDivider } from '../components/ResizableDivider';
import { FileExtractionViewer } from '../components/FileExtractionViewer/FileExtractionViewer';
import type { FileData } from '../types';
import type { Annotation } from '../components/PdfAnnotationCanvas';
import './ExtractPage.css';

// MongoDB extraction status interface
interface ExtractionStatus {
  status: 'processing_extractions' | 'processing_to_ai' | 'completed' | 'failed' | 'unknown';
  message: string;
  isLoading: boolean;
}

interface ExtractPageProps {
  // JSON Viewer Props
  jsonData: any;
  viewMode: 'json' | 'form';
  jsonError: string | null;
  onToggleViewMode: () => void;
  onUpdateJsonData?: (jsonData: any) => void;
  onReloadJsonData?: () => Promise<void>;
  
  // PDF Viewer Props
  pdfPages: string[];
  currentPage: number;
  isLoading: boolean;
  pdfError: string | null;
  totalPages: number;
  onPageChange: (page: number) => void;
  onNextPage: () => void;
  onPreviousPage: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  
  // Selected file context
  selectedFile?: FileData | null;
  
  // Storage service
  indexedDBService?: any;

  // Toast notifications
  showError?: (title: string, message?: string, duration?: number) => void;
  showWarning?: (title: string, message?: string, duration?: number) => void;

  // MongoDB extraction status - CRITICAL for gating
  mongodbStatus?: ExtractionStatus;

  // Manual MongoDB extraction trigger
  onTriggerExtraction?: () => Promise<void>;

  // File extraction display state for real-time updates
  fileExtractionState?: {
    fileId: string | null;
    status: 'idle' | 'loading' | 'completed' | 'failed';
    filename?: string;
    error?: string;
    extractionData?: {
      structured_output: Record<string, unknown>;
      total_fields: number;
      filled_fields: number;
      empty_fields: number;
    };
  };
}

export function ExtractPage({
  // JSON Viewer Props
  jsonData,
  viewMode,
  jsonError,
  onToggleViewMode,
  onUpdateJsonData,
  onReloadJsonData,
  
  // PDF Viewer Props
  pdfPages,
  currentPage,
  isLoading,
  pdfError,
  totalPages,
  onPageChange,
  onNextPage,
  onPreviousPage,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  
  // Selected file context
  selectedFile,
  
  // Storage service
  indexedDBService,

  // Toast notifications
  showError,
  showWarning,

  // MongoDB extraction status
  mongodbStatus,

  // Manual extraction trigger
  onTriggerExtraction,

  // File extraction display state
  fileExtractionState
}: ExtractPageProps) {
  const [leftPanelWidth, setLeftPanelWidth] = useState(50);
  // Track if extraction was triggered by user click
  const [extractionTriggered, setExtractionTriggered] = useState(false);

  // Get PDF content for text extraction
  const pdfContent = selectedFile?.type === 'application/pdf' && selectedFile?.content instanceof ArrayBuffer
    ? selectedFile.content
    : undefined;
    
  // Get original file for better text extraction (avoids ArrayBuffer detachment)
  // Note: File objects are not stored in IndexedDB, so this will only be available for newly uploaded files
  const originalFile = selectedFile?.type === 'application/pdf' && selectedFile?.file instanceof File
    ? selectedFile.file
    : undefined;
    
  // Create a fallback File object from ArrayBuffer for stored files
  const fallbackFile = pdfContent && !originalFile && selectedFile?.name 
    ? new File([pdfContent], selectedFile.name, { type: 'application/pdf', lastModified: selectedFile.lastModified })
    : undefined;
    
  // For debugging: Log what content is available
  console.log('📄 PDF content availability:', {
    hasContent: !!pdfContent,
    hasOriginalFile: !!originalFile,
    hasFallbackFile: !!fallbackFile,
    contentType: pdfContent ? 'ArrayBuffer' : 'none',
    fileName: selectedFile?.name,
    fileSource: originalFile ? 'newly uploaded' : fallbackFile ? 'recreated from storage' : 'no content'
  });

  // Handle annotation deletion
  const handleAnnotationDeleted = async () => {
    // Reload JSON data from IndexedDB after deletion
    if (onReloadJsonData) {
      console.log('🗑️ Annotation deleted, reloading JSON data');
      await onReloadJsonData();
    } else {
      console.warn('No reload function provided, clearing JSON data');
      if (onUpdateJsonData) {
        onUpdateJsonData(null);
      }
    }
  };

  // Handle bbox field selection from JSON viewer
  const [highlightBbox, setHighlightBbox] = useState<number[] | null>(null);
  const [selectedFieldPage, setSelectedFieldPage] = useState<number | null>(null);
  const [highlightAnnotationType, setHighlightAnnotationType] = useState<string>('original');
  
  // Handle "Show All" functionality
  const [showAllAnnotations, setShowAllAnnotations] = useState(false);
  const [allFieldsData, setAllFieldsData] = useState<Array<{bbox: number[], page: number, annotation_type?: string}>>([]);

  // Handle annotations
  const handleAnnotationCreated = (annotation: Annotation) => {
    console.log('New annotation created:', annotation);
    // TODO: Add annotation to the JSON data displayed in left panel
  };

  const handleFieldSelect = (bbox: number[], pageNumber?: number, annotationType?: string) => {
    console.log('🎯 ExtractPage: Field selected with bbox:', bbox, 'page:', pageNumber, 'type:', annotationType);
    
    // If "Show All" is active, don't override with single field
    if (!showAllAnnotations) {
      setHighlightBbox(bbox);
      setSelectedFieldPage(pageNumber || null);
      
      // Store the annotation type for highlighting color
      const finalAnnotationType = annotationType || 'original';
      console.log('🎯 ExtractPage: Setting highlightAnnotationType to:', finalAnnotationType);
      setHighlightAnnotationType(finalAnnotationType);
      
      // Auto-navigate to the page where the field is located
      if (pageNumber && pageNumber !== currentPage) {
        console.log('Navigating to page', pageNumber, 'from current page', currentPage);
        onPageChange(pageNumber);
      }
    } else {
      console.log('🎯 ExtractPage: Show All is active, ignoring individual field selection');
    }
  };

  const handleToggleShowAll = () => {
    const newShowAll = !showAllAnnotations;
    setShowAllAnnotations(newShowAll);
    
    if (!newShowAll) {
      // When turning off "Show All", clear highlights
      setHighlightBbox(null);
      setSelectedFieldPage(null);
      setAllFieldsData([]);
    }
  };

  const handleShowAllFields = (allFields: Array<{bbox: number[], page: number, annotation_type?: string}>) => {
    console.log('Show all fields:', allFields.length, 'fields across', 
      [...new Set(allFields.map(f => f.page))].length, 'pages');
    
    setAllFieldsData(allFields);
    
    // Clear single field highlight when showing all
    setHighlightBbox(null);
    setSelectedFieldPage(null);
  };

  const handleAnnotationsExport = (annotations: Annotation[]) => {
    console.log('Exporting annotations:', annotations);
    // Create a structured JSON with annotations
    const annotationData = {
      fileName: 'Document Annotations',
      timestamp: new Date().toISOString(),
      totalAnnotations: annotations.length,
      annotations: annotations.map(ann => ({
        id: ann.id,
        page: ann.pageNumber,
        boundingBox: {
          x: ann.x,
          y: ann.y,
          width: ann.width,
          height: ann.height
        },
        extractedText: ann.text,
        timestamp: new Date(ann.timestamp).toISOString()
      }))
    };
    
    // Display in JSON viewer (this will update the left panel)
    console.log('Annotation data to display:', annotationData);
    // TODO: Integrate with the app's JSON state management
  };

  return (
    <div className="extract-page">
      {/* Middle Panel - JSON Viewer */}
      <div 
        className="extract-middle-panel dynamic-width"
        ref={(el) => {
          if (el) {
            el.style.setProperty('width', `${leftPanelWidth}%`);
          }
        }}
      >
        {/* 🚨 CRITICAL: MongoDB is the ONLY gatekeeper for extraction rendering */}
        {mongodbStatus?.status === 'completed' ? (
          // Only render JsonViewer if MongoDB status is completed
          <JsonViewer
            jsonData={jsonData}
            viewMode={viewMode}
            error={jsonError}
            onToggleViewMode={onToggleViewMode}
            onFieldSelect={handleFieldSelect}
            showAllAnnotations={showAllAnnotations}
            onToggleShowAll={handleToggleShowAll}
            onShowAllFields={handleShowAllFields}
            currentFileId={selectedFile?.id}
            onAnnotationDeleted={handleAnnotationDeleted}
          />
        ) : extractionTriggered && (mongodbStatus?.isLoading || mongodbStatus?.status === 'processing_extractions' || mongodbStatus?.status === 'processing_to_ai') ? (
          // Show spinner only when actively processing AND after user click
          <div className="mongodb-status-container" style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            padding: '2rem',
            textAlign: 'center'
          }}>
            {/* Loading Spinner */}
            <div className="loading-spinner" style={{
              width: '40px',
              height: '40px',
              border: '4px solid #f3f3f3',
              borderTop: '4px solid #3498db',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              marginBottom: '1rem'
            }}></div>
            
            {/* Status Text Below Spinner */}
            <div className="mongodb-status-text" style={{
              fontSize: '16px',
              color: '#666',
              marginBottom: '0.5rem'
            }}>
              {mongodbStatus?.message || 'Processing extraction...'}
            </div>
            
            {/* Raw MongoDB Status */}
            <div className="mongodb-raw-status" style={{
              fontSize: '14px',
              color: '#888',
              fontFamily: 'monospace'
            }}>
              Status: {mongodbStatus?.status || 'unknown'}
            </div>
          </div>
        ) : (
          // Use FileExtractionViewer for all states
          <FileExtractionViewer
            fileState={fileExtractionState || { fileId: null, status: 'idle' }}
            jsonData={jsonData}
            jsonError={jsonError || undefined}
            onToggleViewMode={onToggleViewMode}
            viewMode={viewMode}
          />
        )}
      </div>

      {/* Resizable Divider */}
      <ResizableDivider
        direction="vertical"
        onResize={setLeftPanelWidth}
        defaultPosition={leftPanelWidth}
        minSize={25}
        maxSize={75}
      />

      {/* Right Panel - PDF Viewer */}
      <div 
        className="extract-right-panel dynamic-width"
        ref={(el) => {
          if (el) {
            el.style.setProperty('width', `${100 - leftPanelWidth}%`);
          }
        }}
        onClick={async () => {
          if (onTriggerExtraction && selectedFile?.type === 'application/pdf') {
            setExtractionTriggered(true);
            console.log('🖱️ PDF clicked - triggering MongoDB extraction');
            await onTriggerExtraction();
          }
        }}
        style={{ cursor: selectedFile?.type === 'application/pdf' ? 'pointer' : 'default' }}
      >
        {/* PDF as images */}
        {selectedFile?.type === 'application/pdf' && selectedFile.id && (
          <PdfViewerAsImages fileId={selectedFile.id} />
        )}
        {/* ...existing code for PdfViewer (can be removed if only images are needed) */}
        <PdfViewer
          pdfPages={pdfPages}
          currentPage={currentPage}
          isLoading={isLoading}
          error={pdfError}
          totalPages={totalPages}
          onPageChange={onPageChange}
          onNextPage={onNextPage}
          onPreviousPage={onPreviousPage}
          onZoomIn={onZoomIn}
          onZoomOut={onZoomOut}
          onResetZoom={onResetZoom}
          onAnnotationCreated={handleAnnotationCreated}
          onAnnotationsExport={handleAnnotationsExport}
          onUpdateJsonData={onUpdateJsonData}
          currentJsonData={jsonData}
          pdfContent={pdfContent}
          originalFile={originalFile || fallbackFile}
          highlightBbox={highlightBbox}
          highlightAnnotationType={(() => {
            console.log('🎯 ExtractPage: Passing highlightAnnotationType to PdfViewer:', highlightAnnotationType);
            return highlightAnnotationType;
          })()}
          allHighlights={showAllAnnotations ? allFieldsData : undefined}
          selectedFieldPage={selectedFieldPage}
          selectedFile={selectedFile}
          indexedDBService={indexedDBService}
          showError={showError}
          showWarning={showWarning}
        />
      </div>
    </div>
  );
}