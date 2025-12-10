import * as pdfjsLib from 'pdfjs-dist';
import type { Annotation } from '../components/PdfAnnotationCanvas';
import { PdfService } from './pdfService';
import { FileUtils } from '../utils/fileUtils';
import { sortByReadingOrder } from '../utils/boundingBoxUtils';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

export interface ExtractedText {
  text: string;
  confidence: number;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface AnnotationWithText extends Annotation {
  extractedText?: ExtractedText;
}

export class PdfTextExtractionService {
  static async extractTextFromAnnotations(
    pdfContent: ArrayBuffer | File,
    annotations: Annotation[],
    onProgress?: (current: number, total: number) => void
  ): Promise<AnnotationWithText[]> {
    try {
      // Always create a fresh ArrayBuffer to avoid detached buffer issues
      let arrayBuffer: ArrayBuffer;
      if (pdfContent instanceof File) {
        arrayBuffer = await pdfContent.arrayBuffer();
      } else {
        // Use FileUtils to safely handle the ArrayBuffer
        try {
          arrayBuffer = FileUtils.getSafeArrayBuffer(pdfContent);
        } catch (error) {
          console.error('ArrayBuffer is detached, cannot proceed:', error);
          throw new Error('PDF data is no longer available. Please reload the PDF file.');
        }
      }
      
      const pdfDocument = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const results: AnnotationWithText[] = [];
      
      for (let i = 0; i < annotations.length; i++) {
        const annotation = annotations[i];
        onProgress?.(i + 1, annotations.length);
        
        try {
          const extractedText = await this.extractTextFromRegion(pdfDocument, annotation);
          results.push({ ...annotation, extractedText });
        } catch (error) {
          console.warn('Failed to extract text from annotation:', error);
          results.push({
            ...annotation,
            extractedText: {
              text: '',
              confidence: 0,
              bbox: { x: annotation.x, y: annotation.y, width: annotation.width, height: annotation.height }
            }
          });
        }
      }
      
      return results;
      } catch (error) {
        console.error('Failed to extract text from PDF:', error);
        
        // Provide specific error messages based on the error type
        if (error instanceof TypeError && error.message.includes('detached ArrayBuffer')) {
          throw new Error('PDF data is no longer available. Please reload the PDF file and try again.');
        } else if (error instanceof Error) {
          throw new Error(`Failed to extract text from PDF: ${error.message}`);
        } else {
          throw new Error('Failed to extract text from PDF. Please try again.');
        }
      }
  }

  private static async extractTextFromRegion(
    pdfDocument: pdfjsLib.PDFDocumentProxy,
    annotation: Annotation
  ): Promise<ExtractedText> {
    try {
      const pageNumber = Math.max(1, annotation.pageNumber);
      const page = await pdfDocument.getPage(pageNumber);
      
      // CRITICAL FIX: Use PDF bbox coordinates directly if available (for manual annotations)
      // This matches the exact coordinate system used by the JSON data highlighting
      let pdfX: number, pdfY: number, pdfWidth: number, pdfHeight: number;
      
      if (annotation.bbox && annotation.bbox.length === 4) {
        // Manual annotation with PDF bbox coordinates [x1, y1, x2, y2]
        const [x1, y1, x2, y2] = annotation.bbox;
        pdfX = x1;
        pdfY = y1;
        pdfWidth = x2 - x1;
        pdfHeight = y2 - y1;
        
        console.log('Using direct PDF bbox coordinates:', {
          bbox: annotation.bbox,
          calculated: { x: pdfX, y: pdfY, width: pdfWidth, height: pdfHeight }
        });
      } else {
        // Convert percentage-based coordinates (relative to scaled image) to PDF coordinates
        const pdfToImageScale = PdfService.getPdfToImageScale(); // 1.5
        const viewport = page.getViewport({ scale: pdfToImageScale });

        // CRITICAL FIX: Annotation percentages are relative to the scaled image (1.5x scale)
        // First, convert percentages to image pixel coordinates
        const imageX = (annotation.x / 100) * viewport.width;
        const imageY = (annotation.y / 100) * viewport.height;
        const imageWidth = (annotation.width / 100) * viewport.width;
        const imageHeight = (annotation.height / 100) * viewport.height;

        // Now convert image pixels back to PDF points
        // The image is scaled by PDF_TO_IMAGE_SCALE, so we need to scale back
        pdfX = imageX / pdfToImageScale;
        pdfY = (viewport.height - imageY - imageHeight) / pdfToImageScale; // Convert to PDF bottom-left origin
        pdfWidth = imageWidth / pdfToImageScale;
        pdfHeight = imageHeight / pdfToImageScale;

        console.log('[DEBUG] Percentage-based to PDF coordinates (CORRECTED):', {
          annotationPercentages: { x: annotation.x, y: annotation.y, width: annotation.width, height: annotation.height },
          viewport: { width: viewport.width, height: viewport.height, scale: pdfToImageScale },
          imageCoords: { x: imageX, y: imageY, width: imageWidth, height: imageHeight },
          pdfCoords: { x: pdfX, y: pdfY, width: pdfWidth, height: pdfHeight },
          scaleReversion: `Divided by ${pdfToImageScale} to convert back to PDF points`
        });
      }
      
      console.log('Text extraction coordinate transformation (CORRECTED FOR MANUAL ANNOTATIONS):', {
        annotation: { 
          x: annotation.x, 
          y: annotation.y, 
          width: annotation.width, 
          height: annotation.height,
          hasBbox: !!annotation.bbox 
        },
        finalCoordinates: { x: pdfX, y: pdfY, width: pdfWidth, height: pdfHeight },
        coordinateSystem: annotation.bbox ? 'Direct PDF bbox' : 'Converted from percentage'
      });
      
      const textContent = await page.getTextContent();
      const relevantText: string[] = [];
      const seenText = new Set<string>(); // Track seen text to avoid duplicates
      
      console.log(`[DEBUG] Text extraction region: x=${pdfX.toFixed(2)}, y=${pdfY.toFixed(2)}, w=${pdfWidth.toFixed(2)}, h=${pdfHeight.toFixed(2)}`);
      console.log(`[DEBUG] Found ${textContent.items.length} text items on page ${pageNumber}`);
      
      textContent.items.forEach((item: any, index: number) => {
        if (item.str && item.transform) {
          const itemX = item.transform[4];
          const itemY = item.transform[5];
          const itemWidth = item.width || 0;
          const itemHeight = item.height || 12;
          
          // Debug first few items to understand coordinate system
          if (index < 3) {
            console.log(`[DEBUG] Text item ${index}: "${item.str}" at (${itemX.toFixed(2)}, ${itemY.toFixed(2)}) size (${itemWidth.toFixed(2)} x ${itemHeight.toFixed(2)})`);
          }
          
          // Calculate the center point of the text item
          const itemCenterX = itemX + (itemWidth / 2);
          const itemCenterY = itemY + (itemHeight / 2);
          
          // Check if the center point of the text is within our coordinate bounds
          const isWithinBounds = 
            itemCenterX >= pdfX && 
            itemCenterX <= (pdfX + pdfWidth) &&
            itemCenterY >= pdfY && 
            itemCenterY <= (pdfY + pdfHeight);
          
          // Additional check: At least 70% of the text must be within the bounds
          const leftOverlap = Math.max(0, Math.min(itemX + itemWidth, pdfX + pdfWidth) - Math.max(itemX, pdfX));
          const topOverlap = Math.max(0, Math.min(itemY + itemHeight, pdfY + pdfHeight) - Math.max(itemY, pdfY));
          const overlapArea = leftOverlap * topOverlap;
          const textArea = itemWidth * itemHeight;
          const overlapPercentage = textArea > 0 ? (overlapArea / textArea) : 0;
          
          if (isWithinBounds && overlapPercentage >= 0.7) {
            const text = item.str.trim();
            // Only add if we haven't seen this exact text before
            if (text && !seenText.has(text)) {
              relevantText.push(text);
              seenText.add(text);
              console.log('Text item found (precise coordinates):', {
                text: text,
                itemCoords: { x: itemX, y: itemY, width: itemWidth, height: itemHeight },
                itemCenter: { x: itemCenterX, y: itemCenterY },
                regionCoords: { x: pdfX, y: pdfY, width: pdfWidth, height: pdfHeight },
                overlapPercentage: Math.round(overlapPercentage * 100) + '%',
                withinBounds: isWithinBounds
              });
            }
          } else if (overlapPercentage > 0.3) {
            // For partial matches, try to extract only the portion within bounds
            const text = item.str.trim();
            if (text && text.length > 3) { // Only for longer text
              // Calculate which characters might be within the bounds
              const charWidth = itemWidth / text.length;
              const startChar = Math.max(0, Math.floor((pdfX - itemX) / charWidth));
              const endChar = Math.min(text.length, Math.ceil((pdfX + pdfWidth - itemX) / charWidth));
              
              if (endChar > startChar) {
                const partialText = text.substring(startChar, endChar).trim();
                if (partialText && !seenText.has(partialText)) {
                  relevantText.push(partialText);
                  seenText.add(partialText);
                  console.log('Partial text extracted:', {
                    originalText: text,
                    extractedText: partialText,
                    charRange: `${startChar}-${endChar}`,
                    overlapPercentage: Math.round(overlapPercentage * 100) + '%'
                  });
                }
              }
            }
          }
        }
      });
      
      const extractedText = relevantText.join(' ').trim();
      
      return {
        text: extractedText,
        confidence: extractedText ? 0.95 : 0,
        // Use the original annotation coordinates for bbox (legacy behavior)
        bbox: { x: annotation.x, y: annotation.y, width: annotation.width, height: annotation.height }
      };
    } catch (error) {
      console.error('Error extracting text from region:', error);
      // Return the original annotation coordinates if extraction fails
      return {
        text: '',
        confidence: 0,
        bbox: { x: annotation.x, y: annotation.y, width: annotation.width, height: annotation.height }
      };
    }
  }

  static generateAnnotationJson(annotationsWithText: AnnotationWithText[]): string {
    const output = {
      metadata: {
        timestamp: new Date().toISOString(),
        extractionMethod: 'pdfjs-text-extraction',
        totalAnnotations: annotationsWithText.length,
        successfulExtractions: annotationsWithText.filter(a => a.extractedText?.text).length
      },
      annotations: annotationsWithText.map(annotation => ({
        id: annotation.id,
        pageNumber: annotation.pageNumber,
        coordinates: { x: annotation.x, y: annotation.y, width: annotation.width, height: annotation.height },
        // Include PDF bbox coordinates if available
        pdfBbox: annotation.bbox ? {
          coordinates: annotation.bbox, // [x1, y1, x2, y2] in PDF points
          format: 'pdf_points',
          description: 'PDF coordinate system with bottom-left origin'
        } : undefined,
        extractedText: {
          text: annotation.extractedText?.text || '',
          confidence: annotation.extractedText?.confidence || 0
        },
        timestamp: annotation.timestamp
      }))
    };
    
    return JSON.stringify(output, null, 2);
  }

    /**
   * Convert manual annotation to structured JSON and merge with existing data
   */
  static async convertToJsonWithIOU(
    annotation: any, 
    extractedText: string, 
    selectedFile: any, 
    jsonData: any, 
    onUpdateJsonData?: (newJsonData: any) => void,
    indexedDBService?: any
  ): Promise<void> {
    console.log('📝 Converting manual annotation to JSON format with IOU sorting...');
    
    // Create the new field with unique ID based on coordinates and timestamp
    const uniqueId = `manual_${Math.round(annotation.x)}_${Math.round(annotation.y)}_${Date.now()}`;
    
    // CRITICAL: Convert bbox coordinates to x,y,width,height format (consistent with original JSON structure)
    let finalCoords;
    if (annotation.bbox && annotation.bbox.length === 4) {
      // Use PDF bbox coordinates and convert to x,y,width,height format
      const [x1, y1, x2, y2] = annotation.bbox;
      finalCoords = {
        x: Math.round(x1 * 100) / 100,           // PDF x coordinate
        y: Math.round(y1 * 100) / 100,           // PDF y coordinate  
        width: Math.round((x2 - x1) * 100) / 100,  // PDF width
        height: Math.round((y2 - y1) * 100) / 100  // PDF height
      };
      console.log(`📍 Converting bbox to x1,y1,width,height format for field: bbox[${annotation.bbox.map((v: number) => v.toFixed(2)).join(', ')}] → coords(${finalCoords.x}, ${finalCoords.y}, ${finalCoords.width}, ${finalCoords.height})`);
    } else {
      // Fallback to percentage coordinates (this shouldn't happen with new code)
      finalCoords = {
        x: Math.round(annotation.x),
        y: Math.round(annotation.y),
        width: Math.round(annotation.width),
        height: Math.round(annotation.height)
      };
      console.warn(`⚠️ No PDF bbox found for annotation, using percentage coordinates: coords(${finalCoords.x}, ${finalCoords.y}, ${finalCoords.width}, ${finalCoords.height})`);
    }
    
    const newField = {
      id: uniqueId,
      label: `Manual Annotation ${Date.now()}`,
      value: extractedText.trim(),
      x1: finalCoords.x,
      y1: finalCoords.y,
      width: finalCoords.width,
      height: finalCoords.height,
      page: annotation.pageNumber || 1,
      type: 'manual_extraction',
      timestamp: new Date().toISOString()
      // bbox field is NOT included - coordinates are now in x1,y1,width,height
    };
    
    console.log('✨ Created new field:', newField);
    
    let updatedJsonData;
    
    if (jsonData && jsonData.form) {
      // Merge with existing form data
      console.log('🔄 Merging with existing JSON data...');
      
      // Add the new field to the existing form array
      const updatedFormData = [...jsonData.form, newField];
      
      // Sort the combined array using IOU-based reading order
      const sortedFormData = sortByReadingOrder(updatedFormData);
      
      updatedJsonData = {
        ...jsonData,
        form: sortedFormData,
        metadata: {
          ...jsonData.metadata,
          lastUpdated: new Date().toISOString(),
          manualAnnotations: (jsonData.metadata?.manualAnnotations || 0) + 1
        }
      };
      
      console.log('✅ Successfully merged and sorted JSON data');
    } else {
      // Create new JSON structure with single field
      console.log('🆕 Creating new JSON structure...');
      
      updatedJsonData = {
        form: [newField],
        metadata: {
          sourceFile: selectedFile.name,
          extractionDate: new Date().toISOString(),
          manualAnnotations: 1,
          totalFields: 1
        }
      };
    }
    
    // Update the parent component state
    if (onUpdateJsonData) {
      onUpdateJsonData(updatedJsonData);
    }
    
    // Save the updated JSON
    await PdfTextExtractionService.saveExtractedJson(updatedJsonData, selectedFile, indexedDBService);
    
    console.log('🎉 JSON update completed with IOU-based sorting');
  }

  /**
   * Convert multiple annotations to structured JSON (bulk processing)
   */
  static convertBulkAnnotationsToJson(
    annotationsWithText: any[], 
  _fileName: string, 
    existingJsonData?: any
  ): any {
    console.log('📝 Converting bulk annotations to JSON format with IOU sorting...');
    console.log('📊 Existing JSON data:', existingJsonData ? 'Present' : 'None', 
      existingJsonData?.form ? `(${existingJsonData.form.length} existing fields)` : '(no form data)');
    
        // Convert annotations to textItems for the correct page
        const newTextItems = annotationsWithText.map((annotation, index) => {
          const uniqueId = `manual_${Math.round(annotation.x)}_${Math.round(annotation.y)}_${Date.now()}_${index}`;
          
          // CRITICAL: Convert bbox coordinates to x,y,width,height format (consistent with original JSON structure)
          let finalCoords;
          if (annotation.bbox && annotation.bbox.length === 4) {
            // Use PDF bbox coordinates and convert to x,y,width,height format
            const [x1, y1, x2, y2] = annotation.bbox;
            finalCoords = {
              x: Math.round(x1 * 100) / 100,           // PDF x coordinate
              y: Math.round(y1 * 100) / 100,           // PDF y coordinate  
              width: Math.round((x2 - x1) * 100) / 100,  // PDF width
              height: Math.round((y2 - y1) * 100) / 100  // PDF height
            };
            console.log(`📍 Converting bbox to x,y,width,height format for "${annotation.extractedText?.text?.trim() || 'unknown'}": bbox[${annotation.bbox.map((v: number) => v.toFixed(2)).join(', ')}] → coords(${finalCoords.x}, ${finalCoords.y}, ${finalCoords.width}, ${finalCoords.height})`);
          } else {
            // Fallback to percentage coordinates (this shouldn't happen with new code)
            finalCoords = {
              x: Math.round(annotation.x),
              y: Math.round(annotation.y),
              width: Math.round(annotation.width),
              height: Math.round(annotation.height)
            };
            console.warn(`⚠️ No PDF bbox found for annotation, using percentage coordinates: coords(${finalCoords.x}, ${finalCoords.y}, ${finalCoords.width}, ${finalCoords.height})`);
          }
          
          return {
            id: uniqueId,
            text: annotation.extractedText?.text?.trim() || '',
            // Store PDF coordinates in x,y,width,height format (consistent with original structure)
            x: finalCoords.x,
            y: finalCoords.y,
            width: finalCoords.width,
            height: finalCoords.height,
            annotation_type: 'manual',
            page: annotation.pageNumber || 1
            // bbox field is NOT included - coordinates are now in x,y,width,height
          };
        });

        // Defensive: clone the existing JSON or start new
        let updatedJsonData = existingJsonData ? JSON.parse(JSON.stringify(existingJsonData)) : { pages: [] };

        // For each annotation, insert into the correct page
        newTextItems.forEach((item, idx) => {
          const pageNum = annotationsWithText[idx].pageNumber || 1;
          let page = updatedJsonData.pages.find((p: any) => p.pageNumber === pageNum);
          if (!page) {
            // Create new page if not found
            page = { pageNumber: pageNum, textItems: [] };
            updatedJsonData.pages.push(page);
          }
          if (!Array.isArray(page.textItems)) page.textItems = [];
          page.textItems.push(item);
        });

        // Optionally, sort textItems in each page by reading order (IOU logic)
        updatedJsonData.pages.forEach((page: any) => {
          if (Array.isArray(page.textItems)) {
            page.textItems = sortByReadingOrder(page.textItems);
          }
        });

        return updatedJsonData;
  }



  /**
   * Save extracted JSON data to IndexedDB and provide download
   */
  static async saveExtractedJson(jsonData: any, selectedFile: any, indexedDBService?: any): Promise<void> {
    try {
      // Generate filename based on PDF name (for future association)
      const pdfBaseName = selectedFile.name.replace(/\.[^/.]+$/, '');
      const jsonFilename = `${pdfBaseName}.json`;
      
      console.log(`💾 Saving updated JSON data for: ${jsonFilename}`);
      
      // Save to IndexedDB if service is available
      if (indexedDBService && indexedDBService.isInitialized && selectedFile.projectId) {
        try {
          await indexedDBService.storeJsonData(
            selectedFile.id, 
            selectedFile.projectId, 
            jsonData, 
            selectedFile.name, 
            selectedFile.size, 
            selectedFile.lastModified
          );
          console.log('✅ Updated JSON saved to IndexedDB');
        } catch (dbError) {
          console.warn('Failed to save JSON to IndexedDB:', dbError);
        }
      }
      
      // Create a FileData-like object for the JSON (backup storage)
      const jsonFileData = {
        id: `json-${selectedFile.id}`,
        name: jsonFilename,
        type: 'application/json',
        size: JSON.stringify(jsonData).length,
        content: JSON.stringify(jsonData, null, 2),
        lastModified: Date.now(),
        projectId: selectedFile.projectId,
        annotation_type: 'updated_with_manual',
        source_pdf: selectedFile.name
      };
      
      // Save to localStorage as additional backup
      try {
        const storageKey = `docai-json-${selectedFile.projectId}-${pdfBaseName}`;
        localStorage.setItem(storageKey, JSON.stringify(jsonFileData));
        console.log(`✅ Backup saved to localStorage: ${storageKey}`);
      } catch (storageError) {
        console.warn('Failed to save to localStorage:', storageError);
      }
      
      // Download the updated file for manual backup
      const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = jsonFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
      
      console.log(`✅ Updated JSON file downloaded: ${jsonFilename}`);
      console.log(`💡 JSON has been saved to IndexedDB and will be used automatically for this file`);
      
    } catch (error) {
      console.error('Failed to save extracted JSON:', error);
      throw error;
    }
  }
  
  static downloadAnnotationsJson(annotationsWithText: AnnotationWithText[], filename: string = 'extracted-annotations.json'): void {
    const jsonContent = this.generateAnnotationJson(annotationsWithText);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
  }
}
