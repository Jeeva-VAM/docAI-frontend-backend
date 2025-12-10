import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Stage, Layer, Image, Rect } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import Konva from 'konva';
import useImage from 'use-image';
import { PdfService } from '../../services/pdfService';
import './PdfAnnotationCanvas.css';

/**
 * PDF Annotation Canvas - Complete Coordinate System Documentation
 * 
 * This component handles multiple coordinate systems with comprehensive transformations:
 * 
 * 1. PDF Coordinate System (PDF.js):
 *    - Origin: Bottom-left corner (0,0)
 *    - Units: Points (1/72 inch)
 *    - Y-axis: Increases upward
 *    - Used by: PDF.js text extraction, bbox data from JSON
 * 
 * 2. Image Coordinate System (Canvas/Image):
 *    - Origin: Top-left corner (0,0)
 *    - Units: Pixels (scaled by PDF_TO_IMAGE_SCALE = 1.5)
 *    - Y-axis: Increases downward
 *    - Used by: PDF-to-image conversion, Konva canvas base
 * 
 * 3. Display Coordinate System (Screen):
 *    - Origin: Top-left corner (0,0)
 *    - Units: CSS pixels (scaled by display scaling factors)
 *    - Y-axis: Increases downward
 *    - Used by: UI rendering, user interactions, canvas drawing
 * 
 * 4. Storage Coordinate System (Annotations):
 *    - Origin: Top-left corner (0,0)
 *    - Units: Percentages (0-100% of image dimensions)
 *    - Y-axis: Increases downward
 *    - Used by: Annotation storage for resolution independence
 * 
 * Complete Transformation Pipeline:
 * 
 * BBOX HIGHLIGHTING (JSON → Display):
 *   PDF Points → Image Pixels → Display Coordinates
 *   1. PdfService.pdfPointsToImagePixels(pdfPoints) // Applies PDF_TO_IMAGE_SCALE
 *   2. Y-axis inversion: imageY = image.height - pdfPointsToPixels(y2)
 *   3. Display scaling: displayX = imageX * (canvasWidth / image.width)
 * 
 * ANNOTATION CREATION (User Interaction → Storage):
 *   Canvas Coordinates → Image Coordinates → Percentages
 *   1. Canvas to image: imageX = canvasX / displayScaleX
 *   2. Image to percentage: percentageX = (imageX / image.width) * 100
 * 
 * ANNOTATION DISPLAY (Storage → Display):
 *   Percentages → Image Coordinates → Display Coordinates
 *   1. Percentage to image: imageX = (percentageX / 100) * image.width
 *   2. Image to display: displayX = imageX * displayScaleX
 * 
 * TEXT EXTRACTION (Storage → PDF Coordinates):
 *   Percentages → Image Coordinates → PDF Coordinates
 *   1. Percentage to image: imageX = (percentageX / 100) * viewport.width
 *   2. Y-axis inversion: pdfY = viewport.height - (imageY + imageHeight)
 * 
 * Key Scaling Factors:
 * - PDF_TO_IMAGE_SCALE = 1.5 (PdfService constant)
 * - displayScaleX = canvasWidth / image.width
 * - displayScaleY = canvasHeight / image.height
 * - effectiveScale = PDF_TO_IMAGE_SCALE * displayScale
 * 
 * Overlay Mode Considerations:
 * - Canvas dimensions match the displayed image size exactly
 * - Position: absolute with top: 0, left: 0
 * - Size: 100% width and height of parent container
 * - Transforms are applied consistently across overlay and standalone modes
 */
export interface Annotation {
  id: string;
  x: number; // X position as percentage (0-100) of image width
  y: number; // Y position as percentage (0-100) of image height
  width: number; // Width as percentage (0-100) of image width
  height: number; // Height as percentage (0-100) of image height
  text?: string; // Text will be extracted later using Syncfusion
  pageNumber: number;
  timestamp: number;
  bbox?: number[]; // [x1, y1, x2, y2] in PDF points - extracted for compatibility with JSON viewer
  annotation_type?: string; // Optional: for coloring logic
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
  overlayMode?: boolean;
  highlightBbox?: number[] | null;
  highlightAnnotationType?: string;  // Type of the highlighted field ('manual' or 'original')
  allHighlights?: Array<{bbox: number[], page: number, annotation_type?: string}>;
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
  overlayMode = false,
  highlightBbox,
  highlightAnnotationType = 'original',  // Default to original type
  allHighlights,
}) => {
  const [image] = useImage(imageUrl);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentRect, setCurrentRect] = useState<Annotation | null>(null);
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 800, height: 1000 });
  const stageRef = useRef<Konva.Stage>(null);

  // Debug logging for highlightAnnotationType
  console.log('🎯 PdfAnnotationCanvas: Received highlightAnnotationType:', highlightAnnotationType);

  // Calculate canvas dimensions accounting for overlay mode and global scale
  const updateCanvasDimensions = useCallback(() => {
    if (!image) return;
    
    if (overlayMode) {
      // In overlay mode, canvas should match the displayed image size exactly
      const parent = stageRef.current?.container().parentElement;
      if (parent) {
        const rect = parent.getBoundingClientRect();
        setCanvasDimensions({ width: rect.width, height: rect.height });
        return;
      }
    }
    // Fallback: use the image dimensions
    setCanvasDimensions({ width: image.width, height: image.height });
  }, [image, overlayMode]);

  // Update canvas dimensions when image loads or overlay mode changes
  useEffect(() => {
    updateCanvasDimensions();
  }, [updateCanvasDimensions]);

  // Update dimensions when parent container resizes (for overlay mode)
  useEffect(() => {
    if (!overlayMode) return;

    const handleResize = () => {
      updateCanvasDimensions();
    };

    const parent = stageRef.current?.container().parentElement;
    if (parent) {
      const resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(parent);
      return () => resizeObserver.disconnect();
    }
  }, [overlayMode, updateCanvasDimensions]);

  const { width: canvasWidth, height: canvasHeight } = canvasDimensions;

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
      timestamp: Date.now(),
      annotation_type: 'manual'  // Mark as manual for red color while drawing
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
      timestamp: Date.now(),
      annotation_type: 'manual'  // Mark as manual for red color while drawing
    });
  }, [isDrawing, isDrawingMode, startPos, pageNumber]);

  const handleMouseUp = useCallback(() => {
    if (!isDrawing || !currentRect || !isDrawingMode || !image) return;

    setIsDrawing(false);

    // Only create annotation if rectangle has meaningful size
    if (currentRect.width > 10 && currentRect.height > 10) {
      try {
        // Convert canvas coordinates to both percentage and PDF bbox coordinates
        const displayScaleX = canvasWidth / image.width;
        const displayScaleY = canvasHeight / image.height;
        const imageX = Math.max(0, currentRect.x / displayScaleX);
        const imageY = Math.max(0, currentRect.y / displayScaleY);
        const imageWidth = Math.min(currentRect.width / displayScaleX, image.width - imageX);
        const imageHeight = Math.min(currentRect.height / displayScaleY, image.height - imageY);
        
        // Calculate percentage coordinates (for storage and display)
        const percentageX = (imageX / image.width) * 100;
        const percentageY = (imageY / image.height) * 100;
        const percentageWidth = (imageWidth / image.width) * 100;
        const percentageHeight = (imageHeight / image.height) * 100;
        
        // CRITICAL: Also calculate PDF bbox coordinates for text extraction
        // Image coordinates need to be converted back to PDF coordinate system
        const pdfToImageScale = PdfService.getPdfToImageScale(); // 1.5
        
        // Convert image pixels to PDF points
        const pdfX1 = imageX / pdfToImageScale;
        const pdfY2 = (image.height - imageY) / pdfToImageScale; // Bottom coordinate (PDF bottom-left origin)
        const pdfX2 = (imageX + imageWidth) / pdfToImageScale;
        const pdfY1 = (image.height - imageY - imageHeight) / pdfToImageScale; // Top coordinate
        
        const finalAnnotation: Annotation = {
          id: `annotation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          x: Math.round(percentageX * 100) / 100,
          y: Math.round(percentageY * 100) / 100,
          width: Math.round(percentageWidth * 100) / 100,
          height: Math.round(percentageHeight * 100) / 100,
          text: undefined,
          pageNumber: pageNumber,
          timestamp: Date.now(),
          annotation_type: 'manual',  // Mark as manual annotation for red color
          // Store PDF bbox coordinates [x1, y1, x2, y2] for accurate text extraction
          bbox: [
            Math.round(pdfX1 * 100) / 100,
            Math.round(pdfY1 * 100) / 100, 
            Math.round(pdfX2 * 100) / 100,
            Math.round(pdfY2 * 100) / 100
          ]
        };
        onAnnotationCreated(finalAnnotation);
        console.log('Annotation created with both percentage and PDF bbox coordinates:', {
          percentages: { x: percentageX, y: percentageY, width: percentageWidth, height: percentageHeight },
          pdfBbox: finalAnnotation.bbox,
          imageCoords: { x: imageX, y: imageY, width: imageWidth, height: imageHeight }
        });
        
      } catch (error) {
        console.error('❌ Annotation creation failed:', error);
        // Create fallback annotation with basic coordinates and estimated bbox
        const fallbackPercentageX = (currentRect.x / canvasWidth) * 100;
        const fallbackPercentageY = (currentRect.y / canvasHeight) * 100;
        const fallbackPercentageWidth = (currentRect.width / canvasWidth) * 100;
        const fallbackPercentageHeight = (currentRect.height / canvasHeight) * 100;
        
        // Rough estimate for bbox coordinates (may be less accurate)
        const pdfToImageScale = PdfService.getPdfToImageScale();
        const estimatedImageX = (fallbackPercentageX / 100) * image.width;
        const estimatedImageY = (fallbackPercentageY / 100) * image.height;
        const estimatedImageWidth = (fallbackPercentageWidth / 100) * image.width;
        const estimatedImageHeight = (fallbackPercentageHeight / 100) * image.height;
        
        const fallbackAnnotation: Annotation = {
          id: `annotation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          x: Math.round(fallbackPercentageX * 100) / 100,
          y: Math.round(fallbackPercentageY * 100) / 100,
          width: Math.round(fallbackPercentageWidth * 100) / 100,
          height: Math.round(fallbackPercentageHeight * 100) / 100,
          text: undefined,
          pageNumber: pageNumber,
          timestamp: Date.now(),
          annotation_type: 'manual',  // Mark as manual annotation for red color
          // Estimated bbox coordinates
          bbox: [
            Math.round((estimatedImageX / pdfToImageScale) * 100) / 100,
            Math.round(((image.height - estimatedImageY - estimatedImageHeight) / pdfToImageScale) * 100) / 100,
            Math.round(((estimatedImageX + estimatedImageWidth) / pdfToImageScale) * 100) / 100,
            Math.round(((image.height - estimatedImageY) / pdfToImageScale) * 100) / 100
          ]
        };
        onAnnotationCreated(fallbackAnnotation);
      }
    }

    setCurrentRect(null);
  }, [isDrawing, currentRect, isDrawingMode, image, canvasWidth, canvasHeight, pageNumber, onAnnotationCreated]);

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

  // Debug helper function to test coordinate transformation with known bbox
  const testTransformation = useCallback((testBbox: number[]) => {
    if (!image) return;
    
    const [x1, y1, x2, y2] = testBbox;
    const displayScaleX = canvasWidth / image.width;
    const displayScaleY = canvasHeight / image.height;
    
    console.log('🔬 DEBUGGING TRANSFORMATION STEP BY STEP:');
    console.log('Input bbox (PDF points):', { x1, y1, x2, y2 });
    console.log('Image dimensions:', { width: image.width, height: image.height });
    console.log('Canvas dimensions:', { width: canvasWidth, height: canvasHeight });
    console.log('Display scaling:', { x: displayScaleX, y: displayScaleY });
    
    // Forward transformation (highlighting logic) - EXACT COPY
    const baseImageX = PdfService.pdfPointsToImagePixels(x1);
    const baseImageY = image.height - PdfService.pdfPointsToImagePixels(y2);
    const baseImageWidth = PdfService.pdfPointsToImagePixels(x2 - x1);
    const baseImageHeight = PdfService.pdfPointsToImagePixels(y2 - y1);
    
    console.log('Step 1 - PDF points to base image pixels:');
    console.log('  baseImageX =', `pdfPointsToImagePixels(${x1}) =`, baseImageX);
    console.log('  baseImageY =', `${image.height} - pdfPointsToImagePixels(${y2}) =`, `${image.height} - ${PdfService.pdfPointsToImagePixels(y2)} =`, baseImageY);
    console.log('  baseImageWidth =', `pdfPointsToImagePixels(${x2 - x1}) =`, baseImageWidth);
    console.log('  baseImageHeight =', `pdfPointsToImagePixels(${y2 - y1}) =`, baseImageHeight);
    
    const displayX = baseImageX * displayScaleX;
    const displayY = baseImageY * displayScaleY;
    const displayWidth = baseImageWidth * displayScaleX;
    const displayHeight = baseImageHeight * displayScaleY;
    
    console.log('Step 2 - Base image to display coordinates:');
    console.log('  displayX =', `${baseImageX} * ${displayScaleX} =`, displayX);
    console.log('  displayY =', `${baseImageY} * ${displayScaleY} =`, displayY);
    console.log('  displayWidth =', `${baseImageWidth} * ${displayScaleX} =`, displayWidth);
    console.log('  displayHeight =', `${baseImageHeight} * ${displayScaleY} =`, displayHeight);
    
    // Convert back to image coordinates (simulating user drawing)
    const backToImageX = displayX / displayScaleX;
    const backToImageY = displayY / displayScaleY;
    const backToImageWidth = displayWidth / displayScaleX;
    const backToImageHeight = displayHeight / displayScaleY;
    
    console.log('Step 3 - Display back to image coordinates:');
    console.log('  backToImageX =', `${displayX} / ${displayScaleX} =`, backToImageX);
    console.log('  backToImageY =', `${displayY} / ${displayScaleY} =`, backToImageY);
    console.log('  backToImageWidth =', `${displayWidth} / ${displayScaleX} =`, backToImageWidth);
    console.log('  backToImageHeight =', `${displayHeight} / ${displayScaleY} =`, backToImageHeight);
    
    // Reverse transformation - THE CRITICAL PART
    const reversePdfX1 = PdfService.imagePixelsToPdfPoints(backToImageX);
    const reversePdfX2 = PdfService.imagePixelsToPdfPoints(backToImageX + backToImageWidth);
    const reversePdfY2 = PdfService.imagePixelsToPdfPoints(image.height - backToImageY);
    const reversePdfY1 = PdfService.imagePixelsToPdfPoints(image.height - (backToImageY + backToImageHeight));
    
    console.log('Step 4 - Image coordinates back to PDF points:');
    console.log('  reversePdfX1 =', `imagePixelsToPdfPoints(${backToImageX}) =`, reversePdfX1);
    console.log('  reversePdfX2 =', `imagePixelsToPdfPoints(${backToImageX + backToImageWidth}) =`, reversePdfX2);
    console.log('  reversePdfY2 =', `imagePixelsToPdfPoints(${image.height} - ${backToImageY}) =`, `imagePixelsToPdfPoints(${image.height - backToImageY}) =`, reversePdfY2);
    console.log('  reversePdfY1 =', `imagePixelsToPdfPoints(${image.height} - ${backToImageY + backToImageHeight}) =`, `imagePixelsToPdfPoints(${image.height - (backToImageY + backToImageHeight)}) =`, reversePdfY1);
    
    const reversedBbox = [reversePdfX1, reversePdfY1, reversePdfX2, reversePdfY2];
    
    console.log('Final Result:');
    console.log('  Original bbox:', testBbox);
    console.log('  Reversed bbox:', reversedBbox);
    console.log('  Differences:', {
      x1: Math.abs(reversePdfX1 - x1),
      y1: Math.abs(reversePdfY1 - y1),
      x2: Math.abs(reversePdfX2 - x2),
      y2: Math.abs(reversePdfY2 - y2)
    });
    
    return reversedBbox;
  }, [image, canvasWidth, canvasHeight]);

  // Test with a known bbox on component mount (remove this in production)
  useEffect(() => {
    if (image && highlightBbox && isDrawingMode) {
      // Only test when in drawing mode to avoid spam
      try {
        console.log('🎯 Testing with current highlighted bbox:', highlightBbox);
        testTransformation(highlightBbox);
      } catch (error) {
        console.error('❌ Error in test transformation:', error);
      }
    }
  }, [image, highlightBbox, testTransformation, isDrawingMode]);

  // Filter annotations for current page
  const pageAnnotations = annotations.filter(ann => ann.pageNumber === pageNumber);

  return (
    <div className="pdf-annotation-canvas">
      <Stage
        ref={stageRef}
        width={canvasWidth}
        height={canvasHeight}
        scaleX={1} // Canvas scaling handled by coordinate transformations
        scaleY={1} // Canvas scaling handled by coordinate transformations
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleStageClick}
        className={isDrawingMode ? 'drawing-mode' : 'select-mode'}
        style={{
          position: overlayMode ? 'absolute' : 'relative',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
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

          {/* Highlight from JSON viewer */}
          {highlightBbox && image && (() => {
            // Get PDF coordinates (assuming points format: [x1, y1, x2, y2])
            const [x1, y1, x2, y2] = highlightBbox;
            // Calculate actual display scale factors (may be different for X and Y)
            const displayScaleX = canvasWidth / image.width;
            const displayScaleY = canvasHeight / image.height;
            // Convert PDF points to image pixels, then scale to display coordinates
            const baseImageX = PdfService.pdfPointsToImagePixels(x1);
            const baseImageY = image.height - PdfService.pdfPointsToImagePixels(y2); // Invert Y-axis (transformY = height - (y + h))
            const baseImageWidth = PdfService.pdfPointsToImagePixels(x2 - x1);
            const baseImageHeight = PdfService.pdfPointsToImagePixels(y2 - y1);
            // Apply display scaling to get final coordinates
            const displayX = baseImageX * displayScaleX;
            const displayY = baseImageY * displayScaleY;
            const displayWidth = baseImageWidth * displayScaleX;
            const displayHeight = baseImageHeight * displayScaleY;
            // Only log once per highlight bbox change to reduce console spam
            const bboxKey = `${x1}-${y1}-${x2}-${y2}-${canvasWidth}-${canvasHeight}`;
            if (!(window as any).lastBboxLogKey || (window as any).lastBboxLogKey !== bboxKey) {
              (window as any).lastBboxLogKey = bboxKey;
              console.log('📍 Bbox highlight (once per change):', {
                input: { pdf: { x1, y1, x2, y2 }, canvas: { width: canvasWidth, height: canvasHeight } },
                output: { x: displayX, y: displayY, width: displayWidth, height: displayHeight },
                scaling: { pdfToImage: PdfService.getPdfToImageScale(), display: { x: displayScaleX, y: displayScaleY } }
              });
            }
            // Color logic: use the passed annotation type directly
            // Manual: #ef4444 (red), Original: #22c55e (green)
            const isManualHighlight = highlightAnnotationType === 'manual';
            const strokeColor = isManualHighlight ? '#ef4444' : '#22c55e';
            const fillColor = isManualHighlight ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.10)';
            
            console.log('🎯 Single highlight color debug:', {
              highlightBbox,
              annotationType: highlightAnnotationType,
              isManual: isManualHighlight,
              strokeColor: strokeColor,
              fillColor: fillColor,
              expectedColor: isManualHighlight ? 'RED' : 'GREEN'
            });
            return (
              <Rect
                x={displayX}
                y={displayY}
                width={displayWidth}
                height={displayHeight}
                stroke={strokeColor}
                strokeWidth={2}
                fill={fillColor}
                listening={false}
              />
            );
          })()}

          {/* Multiple highlights for "Show All" mode */}
          {allHighlights && image && allHighlights
            .filter(highlight => highlight.page === pageNumber)
            .map((highlight, index) => {
              const [x1, y1, x2, y2] = highlight.bbox;
              // Calculate actual display scale factors
              const displayScaleX = canvasWidth / image.width;
              const displayScaleY = canvasHeight / image.height;
              // Convert PDF points to image pixels, then scale to display coordinates
              const baseImageX = PdfService.pdfPointsToImagePixels(x1);
              const baseImageY = image.height - PdfService.pdfPointsToImagePixels(y2);
              const baseImageWidth = PdfService.pdfPointsToImagePixels(x2 - x1);
              const baseImageHeight = PdfService.pdfPointsToImagePixels(y2 - y1);
              // Apply display scaling to get final coordinates
              const displayX = baseImageX * displayScaleX;
              const displayY = baseImageY * displayScaleY;
              const displayWidth = baseImageWidth * displayScaleX;
              const displayHeight = baseImageHeight * displayScaleY;
              
              // Use annotation type directly from highlight data
              const annotationType = highlight.annotation_type || 'original';
              
              // Debug logging
              console.log('🔍 Show All highlight debug:', {
                highlightIndex: index,
                annotationType: annotationType,
                highlight: highlight,
                expectedColor: annotationType === 'manual' ? 'RED' : 'GREEN'
              });
              
              // Color logic: manual annotations = RED, others = GREEN
              const strokeColor = annotationType === 'manual' ? '#ef4444' : '#22c55e';
              const fillColor = annotationType === 'manual' 
                ? 'rgba(239, 68, 68, 0.1)' 
                : 'rgba(34, 197, 94, 0.10)';
              
              return (
                <Rect
                  key={`highlight-${index}`}
                  x={displayX}
                  y={displayY}
                  width={displayWidth}
                  height={displayHeight}
                  stroke={strokeColor}
                  strokeWidth={1.5}
                  fill={fillColor}
                  listening={false}
                />
              );
            })}

          {/* Currently drawing rectangle - always RED for manual annotations */}
          {currentRect && isDrawing && (
            <Rect
              x={currentRect.x}
              y={currentRect.y}
              width={currentRect.width}
              height={currentRect.height}
              stroke={currentRect.annotation_type === 'manual' ? '#ef4444' : '#22c55e'}  // Red for manual
              strokeWidth={2}
              fill={currentRect.annotation_type === 'manual' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.10)'}
            />
          )}

          {/* Existing annotations - transform from percentage coordinates to display coordinates */}
          {pageAnnotations.map((annotation) => {
            if (!image) return null;
            
            // Calculate actual display scale factors (may be different for X and Y)
            const displayScaleX = canvasWidth / image.width;
            const displayScaleY = canvasHeight / image.height;
            
            // Convert percentage coordinates back to image coordinates, then scale to display
            const baseImageX = (annotation.x / 100) * image.width;
            const baseImageY = (annotation.y / 100) * image.height;
            const baseImageWidth = (annotation.width / 100) * image.width;
            const baseImageHeight = (annotation.height / 100) * image.height;
            
            // Apply display scaling to get final coordinates
            const displayX = baseImageX * displayScaleX;
            const displayY = baseImageY * displayScaleY;
            const displayWidth = baseImageWidth * displayScaleX;
            const displayHeight = baseImageHeight * displayScaleY;
            
            // Debug logging for coordinate verification
            if (selectedAnnotation?.id === annotation.id) {
              console.log('Annotation display coordinates (complete pipeline):', {
                annotation: { x: annotation.x, y: annotation.y, width: annotation.width, height: annotation.height },
                scaling: { 
                  displayScale: { x: displayScaleX, y: displayScaleY },
                  globalScale: scale,
                  overlayMode: overlayMode
                },
                pipeline: {
                  percentageToImage: { x: baseImageX, y: baseImageY, width: baseImageWidth, height: baseImageHeight },
                  imageToDisplay: { x: displayX, y: displayY, width: displayWidth, height: displayHeight }
                }
              });
            }
            
            // Color logic: manual annotations = RED, others = GREEN
            // Manual: #ef4444 (red) with rgba(239, 68, 68, 0.1) fill
            // Other/Original: #22c55e (green) with rgba(34, 197, 94, 0.10) fill
            const isManual = annotation.annotation_type === 'manual';
            const strokeColor = selectedAnnotation?.id === annotation.id
              ? '#3b82f6'  // Blue for selected annotation
              : isManual
                ? '#ef4444'  // Red for manual annotations
                : '#22c55e'; // Green for original/other annotations
            const fillColor = selectedAnnotation?.id === annotation.id
              ? 'rgba(59, 130, 246, 0.1)'      // Blue fill for selected
              : isManual
                ? 'rgba(239, 68, 68, 0.1)'     // Red fill for manual
                : 'rgba(34, 197, 94, 0.10)';   // Green fill for original/other
            
            // Debug log for annotation colors (only log once per annotation type change)
            if (annotation.id.includes('temp') || Math.random() < 0.1) { // Log temporarily or occasionally
              console.log(`🎨 Annotation color: "${annotation.text || annotation.id}" type="${annotation.annotation_type}" → ${isManual ? 'RED' : 'GREEN'}`);
            }
            return (
              <Rect
                key={annotation.id}
                x={displayX}
                y={displayY}
                width={displayWidth}
                height={displayHeight}
                stroke={strokeColor}
                strokeWidth={selectedAnnotation?.id === annotation.id ? 3 : 2}
                fill={fillColor}
                onClick={() => handleRectClick(annotation)}
                onTap={() => handleRectClick(annotation)}
              />
            );
          })}
        </Layer>
      </Stage>
    </div>
  );
};