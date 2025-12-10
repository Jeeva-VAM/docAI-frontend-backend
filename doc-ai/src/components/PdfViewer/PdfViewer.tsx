import React, { useRef, useCallback, useState, useEffect } from 'react';
import { TransformWrapper, TransformComponent, type ReactZoomPanPinchContentRef } from 'react-zoom-pan-pinch';
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  ChevronLeft, 
  ChevronRight,
  FileText
} from 'lucide-react';
import { PdfAnnotationToolbar, type ToolMode } from '../PdfAnnotationToolbar';
import { PdfAnnotationCanvas, type Annotation } from '../PdfAnnotationCanvas';
import { PdfTextExtractionService, type AnnotationWithText } from '../../services/pdfTextExtractionService';
import { PdfService } from '../../services/pdfService';
import type { FileData } from '../../types';
import './PdfViewer.css';

interface PdfViewerProps {
  pdfPages: string[];
  currentPage: number;
  isLoading: boolean;
  error: string | null;
  totalPages: number;
  onPageChange: (page: number) => void;
  onNextPage: () => void;
  onPreviousPage: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  // Annotation props
  onAnnotationCreated?: (annotation: Annotation) => void;
  onAnnotationsExport?: (annotations: Annotation[]) => void;
  // JSON integration
  onUpdateJsonData?: (jsonData: any) => void;
  currentJsonData?: any; // Current JSON data to merge with
  // PDF content for text extraction
  pdfContent?: ArrayBuffer;
  // Original file for text extraction (preferred over ArrayBuffer)
  originalFile?: File;
  // Highlight bbox from JSON viewer
  highlightBbox?: number[] | null;
  // Annotation type for the highlighted field
  highlightAnnotationType?: string;
  // Multiple highlights for "Show All" mode
  allHighlights?: Array<{bbox: number[], page: number, annotation_type?: string}>;
  // Page number where the highlighted field is located
  selectedFieldPage?: number | null;
  // Selected file for enhanced features (like ID-based JSON naming)
  selectedFile?: FileData | null;
  // IndexedDB storage service
  indexedDBService?: any;
  // Toast notifications
  showError?: (title: string, message?: string, duration?: number) => void;
  showWarning?: (title: string, message?: string, duration?: number) => void;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({
  pdfPages,
  currentPage,
  isLoading,
  error,
  totalPages,
  onPageChange,
  onNextPage,
  onPreviousPage,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onAnnotationCreated,
  onAnnotationsExport,
  onUpdateJsonData,
  currentJsonData,
  pdfContent,
  originalFile,
  highlightBbox,
  highlightAnnotationType,
  allHighlights,
  selectedFieldPage,
  selectedFile,
  indexedDBService,
  showError,
  showWarning
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const transformRefs = useRef<(ReactZoomPanPinchContentRef | null)[]>([]);

  // Debug logging for highlightAnnotationType
  console.log('🎯 PdfViewer: Received highlightAnnotationType:', highlightAnnotationType);
  const [globalScale, setGlobalScale] = useState(1);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [fitToWidthScale, setFitToWidthScale] = useState(1);
  const [hasInitializedScale, setHasInitializedScale] = useState(false);
  
  // Annotation state
  const [currentTool, setCurrentTool] = useState<ToolMode>('select');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedAnnotation, setSelectedAnnotation] = useState<Annotation | null>(null);
  
  // Text extraction states
  const [isGenerating, setIsGenerating] = useState(false);
  const [extractedAnnotations, setExtractedAnnotations] = useState<AnnotationWithText[]>([]);
  const [hasTextExtracted, setHasTextExtracted] = useState(false);

  const handleResetZoom = useCallback(() => {
    if (isInitialLoad) {
      setGlobalScale(fitToWidthScale);
    } else {
      setGlobalScale(fitToWidthScale);
    }
    onResetZoom();
  }, [isInitialLoad, fitToWidthScale, onResetZoom]);

  // Annotation handlers
  const handleAnnotationCreated = useCallback((annotation: Annotation) => {
    setAnnotations(prev => [...prev, annotation]);
    onAnnotationCreated?.(annotation);
  }, [onAnnotationCreated]);

  const handleClearAnnotations = useCallback(() => {
    setAnnotations([]);
    setSelectedAnnotation(null);
  }, []);

  const handleExportAnnotations = useCallback(() => {
    // Create structured JSON data with percentage-based coordinates
    const annotationData = {
      fileName: 'PDF Annotations',
      timestamp: new Date().toISOString(),
      totalAnnotations: annotations.length,
      coordinateSystem: 'percentage', // Indicates coordinates are percentages (0-100)
      coordinateDescription: 'Bounding box coordinates are percentages relative to image dimensions for resolution independence',
      annotations: annotations.map(ann => ({
        id: ann.id,
        page: ann.pageNumber,
        boundingBox: {
          x: ann.x, // Percentage (0-100) of image width
          y: ann.y, // Percentage (0-100) of image height
          width: ann.width, // Percentage (0-100) of image width
          height: ann.height, // Percentage (0-100) of image height
          unit: 'percentage'
        },
        // Include extracted bbox in PDF points format for compatibility
        pdfBbox: ann.bbox ? {
          coordinates: ann.bbox, // [x1, y1, x2, y2] in PDF points
          format: 'pdf_points',
          description: 'PDF coordinate system with bottom-left origin'
        } : undefined,
        extractedText: ann.text,
        timestamp: new Date(ann.timestamp).toISOString()
      }))
    };

    // Create and download JSON file
    const jsonString = JSON.stringify(annotationData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `pdf-annotations-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    // Also call the parent handler
    onAnnotationsExport?.(annotations);
  }, [annotations, onAnnotationsExport]);

  const handleGenerateText = useCallback(async () => {
    if ((!pdfContent && !originalFile) || annotations.length === 0) {
      console.warn('No PDF content or annotations available for text extraction');
      showError?.(
        'No Annotations Found',
        'Please draw annotations on the PDF before generating text extraction.'
      );
      return;
    }

    console.log('Starting text extraction from', annotations.length, 'annotations...');
    setIsGenerating(true);
    setHasTextExtracted(false);

    try {
      // Prefer original file over potentially detached ArrayBuffer
      const contentToUse = originalFile || pdfContent;
      if (!contentToUse) {
        throw new Error('No PDF content available for extraction');
      }
      
      console.log('Using content type:', contentToUse instanceof File ? 'File' : 'ArrayBuffer', 
        'size:', contentToUse instanceof File ? contentToUse.size : (contentToUse as ArrayBuffer).byteLength);
      
      // Extract text from annotations using PDF.js
      const annotationsWithText = await PdfTextExtractionService.extractTextFromAnnotations(
        contentToUse,
        annotations,
        (current, total) => {
          console.log(`Extracting text: ${current}/${total}`);
        }
      );

      // Check for empty extractions
      const successfulExtractions = annotationsWithText.filter(a => a.extractedText?.text?.trim());
      const failedExtractions = annotationsWithText.filter(a => !a.extractedText?.text?.trim());

      if (successfulExtractions.length === 0) {
        // All extractions failed
        showError?.(
          'Text Extraction Failed',
          'No text could be extracted from any annotations. Please adjust the annotation positions to cover text content.'
        );
        setIsGenerating(false);
        return;
      }

      if (failedExtractions.length > 0) {
        // Some extractions failed - show warning
        const message = `${failedExtractions.length} out of ${annotationsWithText.length} annotations did not extract any text. Only the ${successfulExtractions.length} successful extractions will be added to the JSON viewer.`;
        showWarning?.(
          'Partial Extraction Warning', 
          message
        );
        console.warn('Failed extractions:', failedExtractions);
      }

      // Always use the latest in-memory JSON for merging, only fall back to IndexedDB if in-memory is empty
      let latestJsonData = currentJsonData;
      if ((!latestJsonData || !latestJsonData.form) && indexedDBService && indexedDBService.isInitialized && selectedFile) {
        try {
          const indexedDbJsonData = await indexedDBService.getJsonData(selectedFile.id);
          if (indexedDbJsonData) {
            latestJsonData = indexedDbJsonData;
            console.log('📥 Using latest JSON data from IndexedDB as fallback', 
              `(${indexedDbJsonData.form?.length || 0} fields)`);
          }
        } catch (dbError) {
          console.warn('Failed to get latest JSON from IndexedDB, using prop data:', dbError);
        }
      }

      // Merge new extractions with the latest JSON
      const extractedJsonData = PdfTextExtractionService.convertBulkAnnotationsToJson(
        successfulExtractions, 
        selectedFile?.name || 'extracted-data', 
        latestJsonData // Use latest data to merge with
      );

      // Save JSON file (IndexedDB and download)
      if (selectedFile) {
        await PdfTextExtractionService.saveExtractedJson(extractedJsonData, selectedFile, indexedDBService);
        console.log('✅ Saved extracted JSON file');
      }

      // Update in-memory state so the next annotation uses the latest merged data
      if (onUpdateJsonData) {
        onUpdateJsonData(extractedJsonData);
        console.log('✅ Updated in-memory JSON after save');
      }

      setExtractedAnnotations(annotationsWithText);
      setHasTextExtracted(true);
      
      console.log('Text extraction completed successfully:', { 
        total: annotationsWithText.length, 
        successful: successfulExtractions.length,
        failed: failedExtractions.length 
      });

      // Show success message
      const successMessage = failedExtractions.length > 0 
        ? `Successfully extracted text from ${successfulExtractions.length} annotations and added to JSON viewer.`
        : `Successfully extracted text from all ${successfulExtractions.length} annotations and added to JSON viewer.`;
      
      // Use a brief success notification instead of alert
      console.log('✅ ' + successMessage);
      
    } catch (error) {
      console.error('Failed to extract text:', error);
      showError?.(
        'Text Extraction Error',
        `Error during text extraction: ${error instanceof Error ? error.message : 'Unknown error occurred'}`
      );
      setHasTextExtracted(false);
    } finally {
      setIsGenerating(false);
    }
  }, [pdfContent, originalFile, annotations, selectedFile, onUpdateJsonData, currentJsonData, indexedDBService, showError, showWarning]);

  const handleExportWithText = useCallback(() => {
    if (hasTextExtracted && extractedAnnotations.length > 0) {
      // Generate filename with PDF file ID and name for easy linking
      let filename = `extracted-text-${new Date().toISOString().split('T')[0]}`;
      
      if (selectedFile) {
        // Use file ID and clean filename
        const cleanName = selectedFile.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9-_]/g, '_');
        filename = `extracted-text-${selectedFile.id}-${cleanName}.json`;
      } else {
        filename += '.json';
      }
      
      console.log('📋 Exporting annotations with enhanced filename:', filename);
      
      // Use PDF text extraction service to download the JSON with extracted text
      PdfTextExtractionService.downloadAnnotationsJson(
        extractedAnnotations,
        filename
      );
    } else {
      // Fall back to regular annotation export
      handleExportAnnotations();
    }
  }, [hasTextExtracted, extractedAnnotations, handleExportAnnotations, selectedFile]);

  // Reset text extraction state when annotations change
  useEffect(() => {
    setHasTextExtracted(false);
    setExtractedAnnotations([]);
  }, [annotations]);

  // Calculate proper auto-fit scale when PDF pages are loaded
  useEffect(() => {
    if (pdfPages.length > 0 && contentRef.current) {
      setIsInitialLoad(true);
      setHasInitializedScale(false); // Reset initialization flag for new PDF
      
      const contentElement = contentRef.current;
      const contentWidth = contentElement.clientWidth;
      const contentHeight = contentElement.clientHeight;
      
      // Create temporary image to get actual PDF dimensions
      const tempImg = new Image();
      tempImg.onload = () => {
        const imageWidth = tempImg.width;
        const imageHeight = tempImg.height;
        
        // SIMPLE DIRECT APPROACH: You said 100% works perfectly
        // Let's just use 100% as the target - no complex calculations
        const targetZoom = 1.0; // 100% scale
        
        // Direct calculation: use 100% zoom on your screen
        const directScale = targetZoom;
        
        // Debug logging for development
        console.log('PDF Auto-fit SIMPLE Calculation (REVERTED):', {
          contentWidth,
          contentHeight,
          imageWidth,
          imageHeight,
          targetZoom: '100%',
          directScale: directScale.toFixed(4),
          resultingZoom: (directScale * 100).toFixed(0) + '%',
          'Note': 'Using simple 100% - auto-calculation was too small at 38%'
        });
        
        setFitToWidthScale(directScale);
        setGlobalScale(directScale);
        setHasInitializedScale(true);
      };
      tempImg.src = pdfPages[0];
    }
  }, [pdfPages]);

  // Recalculate auto-fit when container dimensions change (resizable divider)
  useEffect(() => {
    // TEMPORARILY DISABLED: This was causing immediate resize after 89% load
    // TODO: Re-implement with simple 89% approach if needed for resizable divider
    console.log('ResizeObserver effect: DISABLED to prevent immediate resize');
    
    /*
    if (pdfPages.length > 0 && contentRef.current && hasInitializedScale) {
      const handleResize = () => {
        // Clear any pending timeout
        if (resizeTimeoutRef.current) {
          clearTimeout(resizeTimeoutRef.current);
        }
        
        // Debounce the resize calculation to prevent rapid firing
        resizeTimeoutRef.current = window.setTimeout(() => {
          const contentElement = contentRef.current;
          if (!contentElement) return;
          
          const contentWidth = contentElement.clientWidth;
          const contentHeight = contentElement.clientHeight;
          
          console.log('PDF Resize triggered:', { contentWidth, contentHeight });
          
          // Get original image dimensions from first page
          const tempImg = new Image();
          tempImg.onload = () => {
            const imageWidth = tempImg.width;
            const imageHeight = tempImg.height;
            
            // Use same logic as initial calculation
            const screenWidth = window.screen.width;
            const windowWidth = window.innerWidth;
            const estimatedDPI = Math.sqrt(screenWidth * screenWidth + (screenWidth * 9/16) * (screenWidth * 9/16)) / 14;
            const referenceHDPI = 157;
            
            let utilizationFactor = 0.89;
            if (estimatedDPI > referenceHDPI * 1.5) {
              utilizationFactor = 0.91;
            } else if (estimatedDPI < referenceHDPI * 0.8) {
              utilizationFactor = 0.87;
            }
            
            const panelWidthRatio = contentWidth / windowWidth;
            if (panelWidthRatio < 0.4) {
              utilizationFactor *= 0.95;
            } else if (panelWidthRatio > 0.6) {
              utilizationFactor *= 1.02;
            }
            
            const scaleForWidth = (contentWidth * utilizationFactor) / imageWidth;
            const scaleForHeight = (contentHeight * utilizationFactor) / imageHeight;
            const calculatedScale = Math.min(scaleForWidth, scaleForHeight);
            const finalScale = Math.max(0.1, Math.min(2.0, calculatedScale));
            
            console.log('PDF Auto-fit Resize Calculation:', {
              contentWidth,
              contentHeight,
              utilizationFactor: (utilizationFactor * 100).toFixed(1) + '%',
              panelWidthRatio: (panelWidthRatio * 100).toFixed(1) + '%',
              finalScale: finalScale.toFixed(4),
              resultingZoom: (finalScale * 100).toFixed(0) + '%'
            });
            
            setFitToWidthScale(finalScale);
            // Only update global scale if we're still in initial load state
            if (isInitialLoad) {
              setGlobalScale(finalScale);
            }
          };
          tempImg.src = pdfPages[0];
        }, 150); // 150ms debounce
      };

      // Add resize observer for container dimension changes
      const resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(contentRef.current);
      
      return () => {
        resizeObserver.disconnect();
        if (resizeTimeoutRef.current) {
          clearTimeout(resizeTimeoutRef.current);
        }
      };
    }
    */
  }, [pdfPages, isInitialLoad, hasInitializedScale]);

  // Mark as no longer initial load when user manually zooms
  const handleZoomIn = useCallback(() => {
    setIsInitialLoad(false);
    const newScale = Math.min(globalScale * 1.2, 3);
    setGlobalScale(newScale);
    onZoomIn();
  }, [globalScale, onZoomIn]);

  const handleZoomOut = useCallback(() => {
    setIsInitialLoad(false);
    const newScale = Math.max(globalScale * 0.8, 0.1);
    setGlobalScale(newScale);
    onZoomOut();
  }, [globalScale, onZoomOut]);

  // Scroll to current page
  useEffect(() => {
    if (contentRef.current && pdfPages.length > 0) {
      const pageElements = contentRef.current.querySelectorAll('.pdf-page-container');
      const currentPageElement = pageElements[currentPage - 1];
      if (currentPageElement) {
        currentPageElement.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start',
          inline: 'nearest'
        });
      }
    }
  }, [currentPage, pdfPages.length]);

  // Auto-scroll and focus on selected field
  useEffect(() => {
    if (highlightBbox && selectedFieldPage && selectedFieldPage === currentPage && contentRef.current && pdfPages.length > 0) {
      // Wait a bit for the page navigation to complete and render
      const scrollTimeout = setTimeout(() => {
        try {
          const pageElements = contentRef.current?.querySelectorAll('.pdf-page-container');
          if (!pageElements) return;
          
          const currentPageElement = pageElements[currentPage - 1] as HTMLElement;
          if (!currentPageElement) return;

          const pdfImage = currentPageElement.querySelector('.pdf-page') as HTMLImageElement;
          if (!pdfImage) return;

          // Get the image dimensions and position
          const imageRect = pdfImage.getBoundingClientRect();
          const containerRect = contentRef.current!.getBoundingClientRect();
          
          // Parse the bbox coordinates [x1, y1, x2, y2] (PDF points)
          const [x1, y1, x2, y2] = highlightBbox;
          
          // Convert PDF points to image pixels using the service method
          const imageX = PdfService.pdfPointsToImagePixels(x1);
          const imageY = pdfImage.naturalHeight - PdfService.pdfPointsToImagePixels(y2); // Invert Y-axis
          const imageWidth = PdfService.pdfPointsToImagePixels(x2 - x1);
          const imageHeight = PdfService.pdfPointsToImagePixels(y2 - y1);
          
          // Calculate display scaling factors
          const displayScaleX = imageRect.width / pdfImage.naturalWidth;
          const displayScaleY = imageRect.height / pdfImage.naturalHeight;
          
          // Convert to display coordinates
          const displayX = imageX * displayScaleX;
          const displayY = imageY * displayScaleY;
          const displayWidth = imageWidth * displayScaleX;
          const displayHeight = imageHeight * displayScaleY;
          
          // Calculate the center of the highlighted field
          const fieldCenterX = displayX + displayWidth / 2;
          const fieldCenterY = displayY + displayHeight / 2;
          
          // Calculate absolute position within the page
          const absoluteX = imageRect.left - containerRect.left + fieldCenterX;
          const absoluteY = imageRect.top - containerRect.top + fieldCenterY;
          
          // Calculate scroll positions to center the field
          const scrollLeft = absoluteX - containerRect.width / 2;
          const scrollTop = absoluteY - containerRect.height / 2;
          
          console.log('Auto-scrolling to selected field:', {
            bbox: highlightBbox,
            page: selectedFieldPage,
            imageRect: { width: imageRect.width, height: imageRect.height },
            fieldCenter: { x: fieldCenterX, y: fieldCenterY },
            scrollTo: { left: scrollLeft, top: scrollTop }
          });
          
          // Smooth scroll to the field center
          contentRef.current!.scrollTo({
            left: Math.max(0, scrollLeft),
            top: Math.max(0, scrollTop),
            behavior: 'smooth'
          });
          
        } catch (error) {
          console.error('Error during auto-scroll:', error);
        }
      }, 300); // Wait for page navigation to complete

      return () => clearTimeout(scrollTimeout);
    }
  }, [highlightBbox, selectedFieldPage, currentPage, pdfPages.length, globalScale]);

  // Debug: Track all globalScale changes
  useEffect(() => {
    console.log('🔍 GlobalScale changed to:', {
      scale: globalScale.toFixed(4),
      percentage: (globalScale * 100).toFixed(0) + '%',
      timestamp: new Date().toLocaleTimeString(),
      stackTrace: new Error().stack?.split('\n').slice(1, 4).join('\n')
    });
  }, [globalScale]);

  if (error) {
    return (
      <div className="pdf-viewer">
        <div className="pdf-header">
          <h3>PDF Viewer</h3>
        </div>
        <div className="error-state">
          <FileText size={48} />
          <p>Error: {error}</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="pdf-viewer">
        <div className="pdf-header">
          <h3>PDF Viewer</h3>
        </div>
        <div className="pdf-loading-state">
          <div className="spinner"></div>
          <p>Converting PDF to images...</p>
        </div>
      </div>
    );
  }

  if (pdfPages.length === 0) {
    return (
      <div className="pdf-viewer">
        <div className="pdf-header">
          <h3>PDF Viewer</h3>
        </div>
        <div className="empty-state">
          <FileText size={48} />
          <p>Select a PDF file to view</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pdf-viewer">
      <div className="pdf-header">
        <h3>PDF Viewer</h3>
        <div className="pdf-controls">
          <button
            onClick={onPreviousPage}
            disabled={currentPage <= 1}
            className="control-button"
            title="Previous page"
          >
            <ChevronLeft size={14} />
          </button>
          
          <div className="page-info">
            <select
              value={currentPage}
              onChange={(e) => onPageChange(Number(e.target.value))}
              className="page-select"
            >
              {Array.from({ length: totalPages }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
            <span className="page-total">of {totalPages}</span>
          </div>
          
          <button
            onClick={onNextPage}
            disabled={currentPage >= totalPages}
            className="control-button"
            title="Next page"
          >
            <ChevronRight size={14} />
          </button>

          <div className="divider"></div>

          <button
            onClick={handleZoomOut}
            className="control-button"
            title="Zoom out"
          >
            <ZoomOut size={14} />
          </button>
          
          <span className="zoom-level">{Math.round(globalScale * 100)}%</span>
          
          <button
            onClick={handleZoomIn}
            className="control-button"
            title="Zoom in"
          >
            <ZoomIn size={14} />
          </button>
          
          <button
            onClick={handleResetZoom}
            className="control-button"
            title="Reset zoom"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      {/* Annotation Toolbar */}
      <PdfAnnotationToolbar
        currentTool={currentTool}
        onToolChange={setCurrentTool}
        onClearAnnotations={handleClearAnnotations}
        onExportAnnotations={hasTextExtracted ? handleExportWithText : handleExportAnnotations}
        onGenerateText={handleGenerateText}
        annotationCount={annotations.length}
        isGenerating={isGenerating}
        hasTextExtracted={hasTextExtracted}
      />
      
      <div className="pdf-content" ref={contentRef}>
        <div className="pdf-scroll-wrapper">
          <div 
            className="pdf-pages-container"
            style={{ 
              transform: `scale(${globalScale})`,
              transformOrigin: 'left top'
            }}
          >
          {pdfPages.map((pageImage, index) => (
            <div
              key={index}
              className={`pdf-page-container ${index + 1 === currentPage ? 'current-page' : ''}`}
              onClick={() => onPageChange(index + 1)}
            >
              <div className="page-number">Page {index + 1}</div>
              
              {/* Original TransformWrapper for zoom/pan functionality */}
              <TransformWrapper
                ref={(el) => { transformRefs.current[index] = el; }}
                initialScale={1}
                minScale={1}
                maxScale={1}
                centerOnInit={true}
                wheel={{ disabled: true }}
                doubleClick={{ disabled: true }}
                panning={{ disabled: true }}
                limitToBounds={true}
                centerZoomedOut={true}
                alignmentAnimation={{ disabled: false }}
              >
                <TransformComponent>
                  <div style={{ position: 'relative' }}>
                    {/* Original PDF Image */}
                    <img
                      src={pageImage}
                      alt={`PDF Page ${index + 1}`}
                      className="pdf-page"
                    />
                    
                    {/* Annotation Canvas Overlay - only for current page */}
                    {index + 1 === currentPage && (
                      <div 
                        style={{ 
                          position: 'absolute', 
                          top: 0, 
                          left: 0, 
                          width: '100%', 
                          height: '100%',
                          pointerEvents: currentTool === 'rectangle' ? 'all' : 'none'
                        }}
                      >
                        <PdfAnnotationCanvas
                          imageUrl={pageImage}
                          pageNumber={currentPage}
                          isDrawingMode={currentTool === 'rectangle'}
                          onAnnotationCreated={handleAnnotationCreated}
                          annotations={annotations}
                          onAnnotationSelect={setSelectedAnnotation}
                          selectedAnnotation={selectedAnnotation}
                          scale={globalScale}
                          overlayMode={true}
                          highlightBbox={selectedFieldPage === currentPage ? highlightBbox : null}
                          highlightAnnotationType={highlightAnnotationType}
                          allHighlights={allHighlights}
                        />
                      </div>
                    )}
                  </div>
                </TransformComponent>
              </TransformWrapper>
            </div>
          ))}
          </div>
        </div>
      </div>
    </div>
  );
};