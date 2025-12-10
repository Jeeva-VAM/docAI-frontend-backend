import { useState } from 'react';
import { JsonViewer } from '../components/JsonViewer';
import { PdfViewer } from '../components/PdfViewer';
import { PdfViewerAsImages } from '../components/PdfViewer/PdfViewerAsImages';
import { ResizableDivider } from '../components/ResizableDivider';
import type { FileData } from '../types';
import type { Annotation } from '../components/PdfAnnotationCanvas';
import './ExtractPage.css';

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
  showWarning
}: ExtractPageProps) {
  const [leftPanelWidth, setLeftPanelWidth] = useState(50);

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