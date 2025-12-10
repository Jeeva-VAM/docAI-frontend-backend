import React, { useRef, useState, useCallback } from 'react';
import { Stage, Layer, Image, Rect } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import Konva from 'konva';
import useImage from 'use-image';
import { PdfService } from '../../services/pdfService';
import './PdfAnnotationCanvas.css';

export interface Annotation {
  id: string;
  x: number; // X position as percentage (0-100) of image width
  y: number; // Y position as percentage (0-100) of image height
  width: number; // Width as percentage (0-100) of image width
  height: number; // Height as percentage (0-100) of image height
  text?: string;
  pageNumber: number;
  timestamp: number;
}

interface PdfAnnotationCanvasProps {
  imageUrl: string;
  pageNumber: number;
  isDrawingMode: boolean;
  onAnnotationCreated: (annotation: Annotation) => void;
  annotations: Annotation[];
  onAnnotationSelect: (annotation: Annotation | null) => void;
  selectedAnnotation: Annotation | null;
  scale: number;
  overlayMode?: boolean; // New prop to indicate if it's an overlay
}

export const PdfAnnotationCanvas: React.FC<PdfAnnotationCanvasProps> = ({
  imageUrl,
  pageNumber,
  isDrawingMode,
  onAnnotationCreated,
  annotations,
  onAnnotationSelect,
  selectedAnnotation,
  scale,
  overlayMode = false
}) => {
  const [image] = useImage(imageUrl);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentRect, setCurrentRect] = useState<Annotation | null>(null);
  const [isProcessingOCR, setIsProcessingOCR] = useState(false);
  const stageRef = useRef<Konva.Stage>(null);

  // Get dimensions - either from image or from parent container
  // Calculate canvas dimensions accounting for global scale
  const canvasWidth = image?.width || 800;
  const canvasHeight = image?.height || 1000;

  const handleMouseDown = useCallback((e: KonvaEventObject<MouseEvent>) => {
    if (!isDrawingMode) return;

    const stage = e.target.getStage();
    if (!stage) return;

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    setIsDrawing(true);
    setStartPos(pointer);
    setCurrentRect({
      id: `temp-${Date.now()}`,
      x: pointer.x,
      y: pointer.y,
      width: 0,
      height: 0,
      pageNumber,
      timestamp: Date.now()
    });
  }, [isDrawingMode, pageNumber]);

  const handleMouseMove = useCallback((e: KonvaEventObject<MouseEvent>) => {
    if (!isDrawing || !isDrawingMode) return;

    const stage = e.target.getStage();
    if (!stage) return;

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    setCurrentRect({
      id: `temp-${Date.now()}`,
      x: Math.min(startPos.x, pointer.x),
      y: Math.min(startPos.y, pointer.y),
      width: Math.abs(pointer.x - startPos.x),
      height: Math.abs(pointer.y - startPos.y),
      pageNumber,
      timestamp: Date.now()
    });
  }, [isDrawing, isDrawingMode, startPos, pageNumber]);

  const handleMouseUp = useCallback(async () => {
    if (!isDrawing || !currentRect || !isDrawingMode || !image) return;

    setIsDrawing(false);

    // Only create annotation if rectangle has meaningful size
    if (currentRect.width > 10 && currentRect.height > 10) {
      setIsProcessingOCR(true);
      
      // Get the PDF-to-image conversion scale factor (declare outside try-catch)
      const pdfToImageScale = PdfService.getPdfToImageScale();
      
        // Calculate display to image scale factors 
        // Note: scale parameter represents the global PDF zoom level applied via CSS transform
        const displayToImageScaleX = image ? image.width / canvasWidth : 1;
        const displayToImageScaleY = image ? image.height / canvasHeight : 1;      try {
        // Get the actual image dimensions (these are already scaled by PDF_TO_IMAGE_SCALE)
        const scaledImageWidth = image.width;
        const scaledImageHeight = image.height;
        
        // Calculate the original PDF dimensions (before scaling)
        const originalPdfWidth = scaledImageWidth / pdfToImageScale;
        const originalPdfHeight = scaledImageHeight / pdfToImageScale;
        
        // Calculate the display dimensions of the image in the canvas
        const displayWidth = canvasWidth;
        const displayHeight = canvasHeight;
        
        console.log('Zoom and coordinate analysis:', {
          globalScale: scale,
          pdfToImageScale,
          scaledImage: { width: scaledImageWidth, height: scaledImageHeight },
          originalPdf: { width: originalPdfWidth, height: originalPdfHeight },
          display: { width: displayWidth, height: displayHeight },
          displayToImageScale: { x: displayToImageScaleX, y: displayToImageScaleY },
          canvasRect: { x: currentRect.x, y: currentRect.y, width: currentRect.width, height: currentRect.height },
          note: 'Global scale is applied via CSS transform on parent container'
        });

        // Transform canvas coordinates to image coordinates (for OCR processing)
        // Note: Since global scale is applied via CSS transform on parent container,
        // the mouse coordinates are already in the scaled space and need no additional scaling
        const imageX = Math.max(0, currentRect.x * displayToImageScaleX);
        const imageY = Math.max(0, currentRect.y * displayToImageScaleY);
        const imageWidth = Math.min(currentRect.width * displayToImageScaleX, scaledImageWidth - imageX);
        const imageHeight = Math.min(currentRect.height * displayToImageScaleY, scaledImageHeight - imageY);

        // Validate coordinates are within image bounds
        if (imageX >= scaledImageWidth || imageY >= scaledImageHeight || 
            imageWidth <= 0 || imageHeight <= 0) {
          throw new Error('Selected region is outside image bounds');
        }

        // Convert to percentages relative to image dimensions for resolution independence
        const percentageX = (imageX / scaledImageWidth) * 100;
        const percentageY = (imageY / scaledImageHeight) * 100;
        const percentageWidth = (imageWidth / scaledImageWidth) * 100;
        const percentageHeight = (imageHeight / scaledImageHeight) * 100;

        console.log('Coordinate transformation:', {
          canvas: { x: currentRect.x, y: currentRect.y, width: currentRect.width, height: currentRect.height },
          image: { x: imageX, y: imageY, width: imageWidth, height: imageHeight },
          percentage: { x: percentageX, y: percentageY, width: percentageWidth, height: percentageHeight },
          imageDimensions: { width: scaledImageWidth, height: scaledImageHeight },
          validation: {
            withinBounds: imageX < scaledImageWidth && imageY < scaledImageHeight,
            positiveSize: imageWidth > 0 && imageHeight > 0
          }
        });

        // Extract text using OCR with image coordinates (not percentages)
        // Note: Text extraction will be done later using Syncfusion PDF library
        const extractedText = undefined; // Text will be populated when user clicks generate

        console.log('Annotation created (text extraction pending)');

        // Create annotation with percentage-based coordinates for storage
        const finalAnnotation: Annotation = {
          id: `annotation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          x: Math.round(percentageX * 100) / 100, // Round to 2 decimal places
          y: Math.round(percentageY * 100) / 100,
          width: Math.round(percentageWidth * 100) / 100,
          height: Math.round(percentageHeight * 100) / 100,
          text: extractedText,
          pageNumber: pageNumber,
          timestamp: Date.now()
        };
        
        onAnnotationCreated(finalAnnotation);
        
      } catch (error) {
        console.error('OCR extraction failed:', error);
        // Calculate error annotation with percentage coordinates
        const errorImageX = currentRect.x * displayToImageScaleX;
        const errorImageY = currentRect.y * displayToImageScaleY;
        const errorImageWidth = currentRect.width * displayToImageScaleX;
        const errorImageHeight = currentRect.height * displayToImageScaleY;
        
        const errorAnnotation: Annotation = {
          id: `annotation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          x: Math.round((errorImageX / (image?.width || 1)) * 10000) / 100, // Convert to percentage
          y: Math.round((errorImageY / (image?.height || 1)) * 10000) / 100,
          width: Math.round((errorImageWidth / (image?.width || 1)) * 10000) / 100,
          height: Math.round((errorImageHeight / (image?.height || 1)) * 10000) / 100,
          text: `OCR failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          pageNumber: pageNumber,
          timestamp: Date.now()
        };
        onAnnotationCreated(errorAnnotation);
      } finally {
        setIsProcessingOCR(false);
      }
    }

    setCurrentRect(null);
  }, [isDrawing, currentRect, isDrawingMode, onAnnotationCreated, imageUrl, scale, image, canvasWidth, canvasHeight, pageNumber]);

  const handleRectClick = useCallback((annotation: Annotation) => {
    if (!isDrawingMode) {
      onAnnotationSelect(annotation);
    }
  }, [isDrawingMode, onAnnotationSelect]);

  const handleStageClick = useCallback((e: KonvaEventObject<MouseEvent>) => {
    // If clicking on empty area, deselect
    if (e.target === e.target.getStage()) {
      onAnnotationSelect(null);
    }
  }, [onAnnotationSelect]);

  // Filter annotations for current page
  const pageAnnotations = annotations.filter(ann => ann.pageNumber === pageNumber);

  return (
    <div className="pdf-annotation-canvas">
      <Stage
        ref={stageRef}
        width={canvasWidth}
        height={canvasHeight}
        scaleX={1} // Don't apply additional scaling here - use CSS transform instead
        scaleY={1} // Don't apply additional scaling here - use CSS transform instead
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleStageClick}
        className={isDrawingMode ? 'drawing-mode' : 'select-mode'}
        style={{
          position: overlayMode ? 'absolute' : 'relative',
          top: 0,
          left: 0,
          pointerEvents: isDrawingMode ? 'all' : 'none'
        }}
      >
        <Layer>
          {/* Only render PDF image if not in overlay mode */}
          {!overlayMode && image && (
            <Image
              image={image}
              width={image.width}
              height={image.height}
            />
          )}

          {/* Existing annotations - transform from percentage coordinates to display coordinates */}
          {/* Note: Annotations inherit zoom scaling from parent CSS transform */}
          {pageAnnotations.map((annotation) => {
            if (!image) return null;
            
            // Convert percentage coordinates back to image coordinates
            const imageX = (annotation.x / 100) * image.width;
            const imageY = (annotation.y / 100) * image.height;
            const imageWidth = (annotation.width / 100) * image.width;
            const imageHeight = (annotation.height / 100) * image.height;
            
            // Convert image coordinates to canvas display coordinates
            // Note: Global zoom scale is handled by CSS transform on parent container
            const displayScaleX = canvasWidth / image.width;
            const displayScaleY = canvasHeight / image.height;
            
            const displayX = imageX * displayScaleX;
            const displayY = imageY * displayScaleY;
            const displayWidth = imageWidth * displayScaleX;
            const displayHeight = imageHeight * displayScaleY;
            
            // Debug logging for zoom alignment
            if (selectedAnnotation?.id === annotation.id) {
              console.log('Selected annotation coordinates:', {
                annotation: { x: annotation.x, y: annotation.y, width: annotation.width, height: annotation.height },
                image: { x: imageX, y: imageY, width: imageWidth, height: imageHeight },
                display: { x: displayX, y: displayY, width: displayWidth, height: displayHeight },
                globalScale: scale
              });
            }
            
            return (
              <Rect
                key={annotation.id}
                x={displayX}
                y={displayY}
                width={displayWidth}
                height={displayHeight}
                stroke={selectedAnnotation?.id === annotation.id ? '#3b82f6' : '#ef4444'}
                strokeWidth={selectedAnnotation?.id === annotation.id ? 3 : 2}
                fill={selectedAnnotation?.id === annotation.id ? 'rgba(59, 130, 246, 0.1)' : 'rgba(239, 68, 68, 0.1)'}
                onClick={() => handleRectClick(annotation)}
                onTap={() => handleRectClick(annotation)}
              />
            );
          })}

          {/* Current drawing rectangle */}
          {currentRect && (
            <Rect
              x={currentRect.x}
              y={currentRect.y}
              width={currentRect.width}
              height={currentRect.height}
              stroke="#10b981"
              strokeWidth={2}
              fill="rgba(16, 185, 129, 0.1)"
              dash={[5, 5]}
            />
          )}

          {/* OCR Processing indicator */}
          {isProcessingOCR && (
            <Rect
              x={10}
              y={10}
              width={150}
              height={30}
              fill="rgba(0, 0, 0, 0.8)"
              cornerRadius={5}
            />
          )}
        </Layer>
        
        {/* OCR Processing text overlay */}
        {isProcessingOCR && (
          <div 
            style={{
              position: 'absolute',
              top: '20px',
              left: '20px',
              background: 'rgba(0, 0, 0, 0.8)',
              color: 'white',
              padding: '8px 16px',
              borderRadius: '4px',
              fontSize: '12px',
              pointerEvents: 'none'
            }}
          >
            🔍 Extracting text...
          </div>
        )}
      </Stage>
    </div>
  );
};