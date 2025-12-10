import * as pdfjsLib from 'pdfjs-dist';
import type { FileData } from '../types';
import { FileUtils } from '../utils/fileUtils';

// Use local worker file served from public directory (no CORS issues)
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

export class PdfService {
  // Store the scale factor used for PDF to image conversion
  static readonly PDF_TO_IMAGE_SCALE = 1.5;

  /**
   * Convert PDF from backend URL to images
   * This method loads PDF from the backend static file server
   */
  static async convertPdfUrlToImages(fileUrl: string, onSaveImages?: (images: string[]) => void): Promise<string[]> {
    if (!fileUrl) {
      throw new Error('No PDF URL provided');
    }

    try {
      console.log(`📄 Loading PDF from backend URL: ${fileUrl}`);
      
      // Normalize URL path separators (convert backslashes to forward slashes)
      const normalizedUrl = fileUrl.replace(/\\/g, '/');
      
      // Construct full URL if it's a relative path
      const fullUrl = normalizedUrl.startsWith('http') 
        ? normalizedUrl 
        : `http://localhost:8000/${normalizedUrl.replace(/^\//, '')}`;

      console.log(`📄 Full PDF URL: ${fullUrl}`);

      const loadingTask = pdfjsLib.getDocument({ 
        url: fullUrl,
        verbosity: 0 // Reduce console output
      });
      
      // Add error handling for worker issues
      loadingTask.onProgress = (progress: any) => {
        console.log('Loading progress:', Math.round((progress.loaded / progress.total) * 100) + '%');
      };
      
      const pdf = await loadingTask.promise;
      const images: string[] = [];

      console.log(`📄 PDF loaded successfully, pages: ${pdf.numPages}`);

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: this.PDF_TO_IMAGE_SCALE });
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        if (!context) {
          throw new Error('Could not get canvas context');
        }

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
          canvas: canvas,
        };

        await page.render(renderContext).promise;
        images.push(canvas.toDataURL());
      }

      console.log(`✅ PDF converted to ${images.length} images`);

      // Save images if callback provided
      if (onSaveImages) {
        onSaveImages(images);
      }

      return images;
    } catch (error) {
      console.error('❌ Error loading PDF from URL:', error);
      throw new Error(`Failed to load PDF from ${fileUrl}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Smart PDF converter that handles both URL and content-based PDFs
   * Prioritizes backend URL over local content for database-driven files
   */
  static async convertPdfFileToImages(fileData: FileData, onSaveImages?: (images: string[]) => void): Promise<string[]> {
    console.log(`📄 Converting PDF file: ${fileData.name}`, {
      hasUrl: !!fileData.url,
      hasContent: !!fileData.content,
      fileType: fileData.type,
      url: fileData.url,
      contentType: typeof fileData.content
    });

    // Prefer backend URL over local content for database-driven display
    if (fileData.url) {
      console.log(`🔗 Using backend URL for PDF: ${fileData.name} -> ${fileData.url}`);
      return this.convertPdfUrlToImages(fileData.url, onSaveImages);
    } else if (fileData.content && fileData.content instanceof ArrayBuffer) {
      console.log(`💾 Using local content for PDF: ${fileData.name} (size: ${fileData.content.byteLength} bytes)`);
      return this.convertPdfToImages(fileData, onSaveImages);
    } else {
      console.error(`❌ No valid PDF source for ${fileData.name}:`, {
        hasUrl: !!fileData.url,
        hasContent: !!fileData.content,
        contentType: fileData.content ? Object.prototype.toString.call(fileData.content) : 'undefined',
        url: fileData.url
      });
      throw new Error(`File content not available. Please re-upload the file. (${fileData.name})`);
    }
  }
  
  static async convertPdfToImages(fileData: FileData, onSaveImages?: (images: string[]) => void): Promise<string[]> {
    if (!fileData.content || !(fileData.content instanceof ArrayBuffer)) {
      throw new Error('Invalid PDF data');
    }

    try {
      // Create a safe copy of the ArrayBuffer to prevent detachment issues
      const safeArrayBuffer = FileUtils.getSafeArrayBuffer(fileData.content);
      
      const loadingTask = pdfjsLib.getDocument({ 
        data: safeArrayBuffer,
        verbosity: 0 // Reduce console output
      });
      
      // Add error handling for worker issues
      loadingTask.onProgress = (progress: any) => {
        console.log('Loading progress:', Math.round((progress.loaded / progress.total) * 100) + '%');
      };
      
      const pdf = await loadingTask.promise;
      const images: string[] = [];

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: this.PDF_TO_IMAGE_SCALE });
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        if (!context) {
          throw new Error('Could not get canvas context');
        }

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
          canvas: canvas,
        };

        await page.render(renderContext).promise;
        images.push(canvas.toDataURL());
      }

      // Save images if callback provided
      if (onSaveImages) {
        onSaveImages(images);
      }

      return images;
    } catch (error) {
      console.error('Error converting PDF to images:', error);
      throw new Error('Failed to convert PDF to images');
    }
  }

  // Extract text content from PDF and convert to structured JSON
  static async extractJsonFromPdf(fileData: FileData): Promise<any> {
    if (!fileData.content || !(fileData.content instanceof ArrayBuffer)) {
      throw new Error('Invalid PDF data');
    }

    try {
      console.log('🔍 Starting PDF text extraction...');
      
      // Create a separate safe copy of the ArrayBuffer for text extraction
      const safeArrayBuffer = FileUtils.getSafeArrayBuffer(fileData.content);
      
      const loadingTask = pdfjsLib.getDocument({ 
        data: safeArrayBuffer,
        verbosity: 0
      });
      
      const pdf = await loadingTask.promise;
      const extractedData: any = {
        document: {
          title: fileData.name,
          totalPages: pdf.numPages,
          extractedAt: new Date().toISOString(),
          type: 'pdf_extraction'
        },
        pages: [],
        metadata: {
          textItems: 0,
          totalCharacters: 0,
          extractionMethod: 'pdfjs-text-layer'
        }
      };

      console.log(`📄 Processing ${pdf.numPages} pages...`);

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        
        const pageData = {
          pageNumber: pageNum,
          textItems: [] as any[],
          rawText: '',
          fields: [] as any[]
        };

        let fullPageText = '';
        
        textContent.items.forEach((item: any, index: number) => {
          if (item.str && item.str.trim()) {
            const textItem = {
              id: index,
              text: item.str.trim(),
              x: Math.round(item.transform[4]),
              y: Math.round(item.transform[5]),
              width: Math.round(item.width),
              height: Math.round(item.height),
              fontName: item.fontName || 'unknown',
              fontSize: Math.round(item.transform[0] || 12)
            };
            
            pageData.textItems.push(textItem);
            fullPageText += item.str + ' ';
            
            // Try to identify form fields based on patterns
            if (this.isLikelyFormField(item.str)) {
              pageData.fields.push({
                label: item.str.trim(),
                bbox: [
                  Math.round(item.transform[4]),
                  Math.round(item.transform[5]),
                  Math.round(item.transform[4] + item.width),
                  Math.round(item.transform[5] + item.height)
                ],
                page: pageNum,
                type: this.detectFieldType(item.str),
                confidence: this.calculateConfidence(item.str)
              });
            }
          }
        });

        pageData.rawText = fullPageText.trim();
        extractedData.pages.push(pageData);
        extractedData.metadata.textItems += pageData.textItems.length;
        extractedData.metadata.totalCharacters += fullPageText.length;
      }

      // Add summary and analysis
      extractedData.summary = this.generateSummary(extractedData);
      
      console.log('✅ PDF extraction completed:', {
        pages: extractedData.pages.length,
        textItems: extractedData.metadata.textItems,
        fields: extractedData.pages.reduce((sum: number, page: any) => sum + page.fields.length, 0)
      });

      return extractedData;
    } catch (error) {
      console.error('❌ Error extracting JSON from PDF:', error);
      throw new Error('Failed to extract text from PDF');
    }
  }

  // Helper method to detect if text looks like a form field
  private static isLikelyFormField(text: string): boolean {
    const fieldPatterns = [
      /.*:\s*$/,           // Ends with colon
      /.*\?\s*$/,          // Ends with question mark
      /_+/,                // Contains underscores
      /\[\s*\]/,           // Contains empty brackets
      /\(\s*\)/,           // Contains empty parentheses
      /Name|Date|Address|Phone|Email|Number/i,  // Common field labels
      /Policy|Account|ID|Reference/i            // Insurance/document specific
    ];
    
    return fieldPatterns.some(pattern => pattern.test(text.trim()));
  }

  // Helper method to detect field type
  private static detectFieldType(text: string): string {
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('date') || lowerText.includes('time')) return 'date_field';
    if (lowerText.includes('name')) return 'text_field';
    if (lowerText.includes('phone') || lowerText.includes('mobile')) return 'phone_field';
    if (lowerText.includes('email')) return 'email_field';
    if (lowerText.includes('address')) return 'address_field';
    if (lowerText.includes('number') || lowerText.includes('id')) return 'number_field';
    if (lowerText.includes('amount') || lowerText.includes('price')) return 'currency_field';
    
    return 'text_field';
  }

  // Helper method to calculate field confidence
  private static calculateConfidence(text: string): number {
    let confidence = 0.5; // Base confidence
    
    if (text.includes(':')) confidence += 0.2;
    if (text.includes('?')) confidence += 0.1;
    if (/[A-Z]/.test(text)) confidence += 0.1;
    if (text.length > 3) confidence += 0.1;
    
    return Math.min(confidence, 1.0);
  }

  // Helper method to generate summary
  private static generateSummary(extractedData: any): any {
    const totalFields = extractedData.pages.reduce((sum: number, page: any) => sum + page.fields.length, 0);
    const fieldTypes = new Set();
    
    extractedData.pages.forEach((page: any) => {
      page.fields.forEach((field: any) => {
        fieldTypes.add(field.type);
      });
    });

    return {
      totalFields,
      fieldTypes: Array.from(fieldTypes),
      averageFieldsPerPage: Math.round(totalFields / extractedData.pages.length),
      documentComplexity: totalFields > 50 ? 'high' : totalFields > 20 ? 'medium' : 'low',
      extractionQuality: extractedData.metadata.textItems > 100 ? 'good' : 'fair'
    };
  }

  // Get the scale factor used for PDF to image conversion
  static getPdfToImageScale(): number {
    return this.PDF_TO_IMAGE_SCALE;
  }

  // Get viewport parameters that match the image generation with optional display scale
  static getImageViewport(page: any, displayScale: number = 1.0): any {
    // Combine PDF-to-image scale with display scale
    const combinedScale = this.PDF_TO_IMAGE_SCALE * displayScale;
    return page.getViewport({ scale: combinedScale });
  }

  // Convert PDF coordinates (points) to image pixels using both PDF and display scales
  static pdfPointsToImagePixels(pdfPoints: number, displayScale: number = 1.0): number {
    const pdfDpi = 72; // PDF standard DPI
    const imageDpi = pdfDpi * this.PDF_TO_IMAGE_SCALE * displayScale;
    return (pdfPoints / pdfDpi) * imageDpi;
  }

  // Convert image pixels back to PDF points with display scale consideration
  static imagePixelsToPdfPoints(imagePixels: number, displayScale: number = 1.0): number {
    const pdfDpi = 72; // PDF standard DPI
    const imageDpi = pdfDpi * this.PDF_TO_IMAGE_SCALE * displayScale;
    return (imagePixels / imageDpi) * pdfDpi;
  }

  // Helper method to calculate the effective scale for coordinate transformations
  static getEffectiveScale(displayScale: number = 1.0): number {
    return this.PDF_TO_IMAGE_SCALE * displayScale;
  }

  // Load cached images if available
  static loadCachedImages(fileId: string, loadImages: (fileId: string) => string[] | null): string[] | null {
    return loadImages(fileId);
  }
}