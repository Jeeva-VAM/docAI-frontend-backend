import { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, X, CheckCircle, AlertCircle, XCircle, Type, Hash, Palette } from 'lucide-react';
import type { FileData, Project, JsonData } from '../types';
import './QAPage.css';

interface QAPageProps {
  currentProject?: Project | null;
  identifiedJsonData?: JsonData | null;
}

interface QAField {
  label: string;
  value: any;
  font: string;
  format: string;
  path: string;
  confidence?: number;
  regex?: string;
}

interface ComparisonResult {
  labels: MatchResult;
  values: MatchResult;
  format: MatchResult;
  font: MatchResult;
}

interface MatchResult {
  status: 'exact' | 'partial' | 'none' | 'empty';
  confidence: number;
  sourceValue: any;
  targetValue: any;
  details?: string;
}

export function QAPage({ currentProject, identifiedJsonData }: QAPageProps) {
  const [comparisonFile, setComparisonFile] = useState<FileData | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [sourceFields, setSourceFields] = useState<QAField[]>([]);
  const [targetFields, setTargetFields] = useState<QAField[]>([]);
  const [comparisonResults, setComparisonResults] = useState<{ [key: string]: ComparisonResult }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Detect value format (date, number, email, etc.)
  const detectFormat = (value: string): string => {
    if (!value || typeof value !== 'string') return 'text';
    
    // Date patterns
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date-iso';
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return 'date-us';
    if (/^\d{2}-\d{2}-\d{4}$/.test(value)) return 'date-eu';
    
    // Number patterns
    if (/^\d+$/.test(value)) return 'integer';
    if (/^\d+\.\d+$/.test(value)) return 'decimal';
    if (/^\$[\d,]+\.?\d*$/.test(value)) return 'currency';
    
    // Contact patterns
    if (/^[\w.-]+@[\w.-]+\.\w+$/.test(value)) return 'email';
    if (/^\(\d{3}\)\s?\d{3}-\d{4}$/.test(value) || /^\d{3}-\d{3}-\d{4}$/.test(value)) return 'phone';
    
    // Text patterns
    if (/^[A-Z\s]+$/.test(value)) return 'uppercase';
    if (/^[a-z\s]+$/.test(value)) return 'lowercase';
    if (/^[A-Z][a-z\s]*$/.test(value)) return 'titlecase';
    
    return 'text';
  };

  // Dynamic recursive field extraction function
  const extractFieldsRecursively = useCallback((obj: any, path: string = '', fields: QAField[] = []): QAField[] => {
    if (!obj || typeof obj !== 'object') {
      return fields;
    }

    // Handle arrays (like children, textItems)
    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        extractFieldsRecursively(item, `${path}[${index}]`, fields);
      });
      return fields;
    }

    // Handle objects
    Object.entries(obj).forEach(([key, value]) => {
      const currentPath = path ? `${path}.${key}` : key;
      
      // Check if this is a field object (has value property)
      if (value && typeof value === 'object' && 'value' in value) {
        const valueObj = value as any; // Cast to access properties
        const fieldObj: QAField = {
          label: key,
          value: valueObj.value,
          font: valueObj.font || 'Arial',
          format: valueObj.format || detectFormat(String(valueObj.value)),
          path: currentPath,
          confidence: valueObj.confidence || 0,
          regex: valueObj.regex
        };
        
        fields.push(fieldObj);
        console.log(`✅ Added field: ${fieldObj.label} = "${fieldObj.value}" (path: ${currentPath})`);
      }
      // Handle special array cases like "children"
      else if (key === 'children' && Array.isArray(value)) {
        extractFieldsRecursively(value, currentPath, fields);
      }
      // Continue recursion for nested objects (but avoid infinite loops)
      else if (value && typeof value === 'object' && key !== 'value') {
        extractFieldsRecursively(value, currentPath, fields);
      }
    });

    return fields;
  }, []);

  // Extract fields from IndexedDB data (identifiedJsonData - textItems format or dynamic structure)
  const extractSourceFields = useCallback((jsonData: any): QAField[] => {
    console.log('🔍 Extracting source fields from identifiedJsonData:', jsonData);
    const fields: QAField[] = [];
    
    // Handle traditional textItems format (pages -> textItems)
    if (jsonData && Array.isArray(jsonData.pages)) {
      jsonData.pages.forEach((page: any, pageIndex: number) => {
        if (Array.isArray(page.textItems)) {
          console.log(`📄 Page ${pageIndex + 1} has ${page.textItems.length} text items`);
          
          page.textItems.forEach((item: any, itemIndex: number) => {
            if (item.text && item.value) {
              // Clean the field label (remove colons, normalize)
              const cleanLabel = item.text.replace(/[:]/g, '').trim();
              
              const fieldObj: QAField = {
                label: cleanLabel,
                value: item.value,
                font: item.font || 'Arial',
                format: detectFormat(item.value),
                path: `page_${pageIndex + 1}.item_${itemIndex}`,
                confidence: item.confi_score || 0
              };
              
              fields.push(fieldObj);
              console.log(`✅ Added source field: ${fieldObj.label} = "${fieldObj.value}"`);
            }
          });
        }
      });
    }
    // Handle dynamic nested structures using recursive extraction
    else if (jsonData && typeof jsonData === 'object') {
      console.log('📄 Processing source data with dynamic nested structure');
      extractFieldsRecursively(jsonData, '', fields);
    }
    
    console.log('🔍 Final source fields:', fields);
    return fields;
  }, [extractFieldsRecursively]);

  // Extract fields from uploaded QA JSON file (dynamic structure)
  const extractTargetFields = useCallback((jsonData: any): QAField[] => {
    console.log('🔍 Extracting target fields from uploaded QA file:', jsonData);
    const fields: QAField[] = [];
    
    // First check if it's the traditional textItems format (pages -> textItems with label/value)
    if (jsonData && Array.isArray(jsonData.pages)) {
      let hasLabelValueFormat = false;
      
      // Check if any page has textItems with label/value format
      jsonData.pages.forEach((page: any) => {
        if (Array.isArray(page.textItems) && page.textItems.some((item: any) => item.label && item.value)) {
          hasLabelValueFormat = true;
        }
      });
      
      if (hasLabelValueFormat) {
        jsonData.pages.forEach((page: any, pageIndex: number) => {
          if (Array.isArray(page.textItems)) {
            console.log(`📄 Target Page ${pageIndex + 1} has ${page.textItems.length} text items`);
            
            page.textItems.forEach((item: any, itemIndex: number) => {
              if (item.label && item.value) {
                const fieldObj: QAField = {
                  label: item.label,
                  value: item.value,
                  font: item.font || 'Arial',
                  format: item.format || detectFormat(item.value),
                  path: `page_${pageIndex + 1}.item_${itemIndex}`,
                  regex: item.regex
                };
                
                fields.push(fieldObj);
                console.log(`✅ Added target field: ${fieldObj.label} = "${fieldObj.value}"`);
              }
            });
          }
        });
      }
      // Handle text/value format in textItems
      else {
        jsonData.pages.forEach((page: any, pageIndex: number) => {
          if (Array.isArray(page.textItems)) {
            console.log(`📄 Target Page ${pageIndex + 1} has ${page.textItems.length} text items (text/value format)`);
            
            page.textItems.forEach((item: any, itemIndex: number) => {
              if (item.text && item.value) {
                // Clean the field label (remove colons, normalize)
                const cleanLabel = item.text.replace(/[:]/g, '').trim();
                
                const fieldObj: QAField = {
                  label: cleanLabel,
                  value: item.value,
                  font: item.font || 'Arial',
                  format: item.format || detectFormat(item.value),
                  path: `page_${pageIndex + 1}.item_${itemIndex}`,
                  confidence: item.confi_score || 0
                };
                
                fields.push(fieldObj);
                console.log(`✅ Added target field (text/value): ${fieldObj.label} = "${fieldObj.value}"`);
              }
            });
          }
        });
      }
    }
    // Check if it's a flat array format
    else if (Array.isArray(jsonData)) {
      console.log(`📄 Processing flat array format with ${jsonData.length} items`);
      jsonData.forEach((item: any, itemIndex: number) => {
        if ((item.label && item.value) || (item.text && item.value)) {
          const label = item.label || item.text;
          const cleanLabel = String(label).replace(/[:]/g, '').trim();
          
          const fieldObj: QAField = {
            label: cleanLabel,
            value: item.value,
            font: item.font || 'Arial',
            format: item.format || detectFormat(item.value),
            path: `item_${itemIndex}`,
            confidence: item.confi_score || item.confidence || 0
          };
          
          fields.push(fieldObj);
          console.log(`✅ Added target field (flat): ${fieldObj.label} = "${fieldObj.value}"`);
        }
      });
    }
    // NEW: Handle dynamic nested structures using recursive extraction
    else if (jsonData && typeof jsonData === 'object') {
      console.log('📄 Processing dynamic nested structure using recursive extraction');
      extractFieldsRecursively(jsonData, '', fields);
    }
    
    console.log('🔍 Final target fields:', fields);
    return fields;
  }, [extractFieldsRecursively]);

  // Enhanced label comparison with smart matching
  const compareLabels = (source: string, target: string): MatchResult => {
    const sourceVal = String(source || '').trim();
    const targetVal = String(target || '').trim();

    if (!targetVal) {
      return { status: 'empty', confidence: 0, sourceValue: sourceVal, targetValue: targetVal };
    }

    // Normalize for comparison - remove punctuation, convert to lowercase
    const normalizeLabel = (str: string) => str.replace(/[:\s.,!?]/g, '').toLowerCase();
    const sourceNorm = normalizeLabel(sourceVal);
    const targetNorm = normalizeLabel(targetVal);

    // Exact match after normalization
    if (sourceNorm === targetNorm) {
      return { status: 'exact', confidence: 100, sourceValue: sourceVal, targetValue: targetVal };
    }

    // Partial match - check if one contains the other
    if (sourceNorm.includes(targetNorm) || targetNorm.includes(sourceNorm)) {
      return { status: 'partial', confidence: 80, sourceValue: sourceVal, targetValue: targetVal };
    }

    // Check word overlap for multi-word labels
    const sourceWords = sourceVal.toLowerCase().split(/\s+/);
    const targetWords = targetVal.toLowerCase().split(/\s+/);
    const commonWords = sourceWords.filter(word => targetWords.includes(word));
    
    if (commonWords.length > 0 && commonWords.length >= Math.min(sourceWords.length, targetWords.length) * 0.5) {
      return { status: 'partial', confidence: 60, sourceValue: sourceVal, targetValue: targetVal };
    }

    return { status: 'none', confidence: 0, sourceValue: sourceVal, targetValue: targetVal };
  };

  const compareValues = (source: any, target: any): MatchResult => {
    const sourceVal = String(source || '').trim();
    const targetVal = String(target || '').trim();

    if (!targetVal) {
      return { status: 'empty', confidence: 0, sourceValue: sourceVal, targetValue: targetVal };
    }

    // Exact match
    if (sourceVal === targetVal) {
      return { status: 'exact', confidence: 100, sourceValue: sourceVal, targetValue: targetVal };
    }

    // Case-insensitive match
    if (sourceVal.toLowerCase() === targetVal.toLowerCase()) {
      return { status: 'exact', confidence: 95, sourceValue: sourceVal, targetValue: targetVal };
    }

    // Partial match for similar values
    if (sourceVal.toLowerCase().includes(targetVal.toLowerCase()) || 
        targetVal.toLowerCase().includes(sourceVal.toLowerCase())) {
      return { status: 'partial', confidence: 70, sourceValue: sourceVal, targetValue: targetVal };
    }

    // Numeric comparison for numbers
    const sourceNum = parseFloat(sourceVal.replace(/[,$\s]/g, ''));
    const targetNum = parseFloat(targetVal.replace(/[,$\s]/g, ''));
    if (!isNaN(sourceNum) && !isNaN(targetNum) && sourceNum === targetNum) {
      return { status: 'exact', confidence: 100, sourceValue: sourceVal, targetValue: targetVal };
    }

    return { status: 'none', confidence: 0, sourceValue: sourceVal, targetValue: targetVal };
  };

  const compareFormats = (source: string, target: string): MatchResult => {
    if (!target) {
      return { status: 'empty', confidence: 0, sourceValue: source, targetValue: target };
    }

    // Exact match
    if (source === target) {
      return { status: 'exact', confidence: 100, sourceValue: source, targetValue: target };
    }

    // Format compatibility mapping
    const formatGroups = {
      text: ['string', 'text', 'alphanumeric', 'alphabetic', 'alpha', 'varchar'],
      numeric: ['number', 'integer', 'decimal', 'float', 'numeric', 'int'],
      currency: ['currency', 'money', 'dollar', 'amount'],
      date: ['date', 'datetime', 'timestamp', 'date-iso', 'date-us', 'date-eu']
    };

    // Check if both formats belong to the same group
    for (const formats of Object.values(formatGroups)) {
      const sourceInGroup = formats.includes(source.toLowerCase());
      const targetInGroup = formats.includes(target.toLowerCase());
      
      if (sourceInGroup && targetInGroup) {
        return { status: 'partial', confidence: 85, sourceValue: source, targetValue: target };
      }
    }

    // Check partial string matches
    if (source.toLowerCase().includes(target.toLowerCase()) || 
        target.toLowerCase().includes(source.toLowerCase())) {
      return { status: 'partial', confidence: 70, sourceValue: source, targetValue: target };
    }

    return { status: 'none', confidence: 0, sourceValue: source, targetValue: target };
  };

  const compareFonts = (source: string, target: string): MatchResult => {
    const sourceFont = String(source || '').trim();
    const targetFont = String(target || '').trim();

    if (!targetFont) {
      return { status: 'empty', confidence: 0, sourceValue: sourceFont, targetValue: targetFont };
    }

    // Normalize font names - remove spaces, convert to lowercase
    const normalizeFontName = (font: string) => font.replace(/[\s,]/g, '').toLowerCase();
    const sourceNorm = normalizeFontName(sourceFont);
    const targetNorm = normalizeFontName(targetFont);

    // Exact match
    if (sourceNorm === targetNorm) {
      return { status: 'exact', confidence: 100, sourceValue: sourceFont, targetValue: targetFont };
    }

    // Extract base font family (before comma or style indicators)
    const getBaseFontFamily = (font: string) => {
      return font.split(/[,]/)[0].replace(/(bold|italic|light|regular|medium)/gi, '').trim().toLowerCase();
    };

    const sourceBase = getBaseFontFamily(sourceFont);
    const targetBase = getBaseFontFamily(targetFont);

    // Same font family, different styles (Arial vs Arial,Bold)
    if (sourceBase === targetBase) {
      return { status: 'partial', confidence: 85, sourceValue: sourceFont, targetValue: targetFont };
    }

    // Check if one font contains the other (partial match)
    if (sourceNorm.includes(targetNorm) || targetNorm.includes(sourceNorm)) {
      return { status: 'partial', confidence: 75, sourceValue: sourceFont, targetValue: targetFont };
    }

    // Font family similarity (Arial vs Helvetica, Times vs serif, etc.)
    const fontFamilyGroups = {
      sans: ['arial', 'helvetica', 'verdana', 'tahoma', 'calibri', 'opensans'],
      serif: ['times', 'timesnewroman', 'georgia', 'garamond', 'bookantiqua'],
      mono: ['courier', 'couriernew', 'consolas', 'monaco', 'lucidaconsole']
    };

    for (const fonts of Object.values(fontFamilyGroups)) {
      const sourceInGroup = fonts.some(font => sourceBase.includes(font) || font.includes(sourceBase));
      const targetInGroup = fonts.some(font => targetBase.includes(font) || font.includes(targetBase));
      
      if (sourceInGroup && targetInGroup) {
        return { status: 'partial', confidence: 60, sourceValue: sourceFont, targetValue: targetFont };
      }
    }

    return { status: 'none', confidence: 0, sourceValue: sourceFont, targetValue: targetFont };
  };

  // Extract source fields from IndexedDB data (identifiedJsonData)
  useEffect(() => {
    console.log('🔄 QAPage: identifiedJsonData changed:', identifiedJsonData);
    if (identifiedJsonData) {
      const fields = extractSourceFields(identifiedJsonData);
      setSourceFields(fields);
    } else {
      setSourceFields([]);
    }
  }, [identifiedJsonData]);

  // Parse uploaded QA JSON file and extract target fields
  useEffect(() => {
    console.log('🔄 QAPage: comparisonFile changed:', comparisonFile);
    if (comparisonFile && comparisonFile.content) {
      try {
        const jsonContent = typeof comparisonFile.content === 'string' 
          ? JSON.parse(comparisonFile.content)
          : comparisonFile.content;
        
        console.log('🔄 QAPage: Parsing uploaded QA file:', jsonContent);
        console.log('🔄 QAPage: JSON content type:', typeof jsonContent);
        console.log('🔄 QAPage: Has pages?', Array.isArray(jsonContent?.pages));
        
        const fields = extractTargetFields(jsonContent);
        console.log('🔄 QAPage: Extracted target fields count:', fields.length);
        setTargetFields(fields);
      } catch (error) {
        console.error('❌ Failed to parse QA comparison JSON:', error);
        console.error('❌ File content:', comparisonFile.content);
        setTargetFields([]);
      }
    } else {
      console.log('🔄 QAPage: No comparison file, clearing target fields');
      setTargetFields([]);
    }
  }, [comparisonFile]);

  // Process comparison results - compare source (IndexedDB) vs target (uploaded QA file)
  useEffect(() => {
    console.log('🔄 Processing comparison results...');
    console.log('📊 Source fields count:', sourceFields.length);
    console.log('📊 Target fields count:', targetFields.length);
    console.log('📋 Source fields:', sourceFields);
    console.log('📋 Target fields:', targetFields);
    
    const results: { [key: string]: ComparisonResult } = {};
    
    if (sourceFields.length === 0) {
      console.log('⚠️ No source fields available for comparison');
      setComparisonResults({});
      return;
    }
    
    if (targetFields.length === 0) {
      console.log('⚠️ No target fields available for comparison - creating empty matches');
      sourceFields.forEach(sourceField => {
        results[sourceField.path] = {
          labels: { status: 'none', confidence: 0, sourceValue: sourceField.label, targetValue: '' },
          values: { status: 'none', confidence: 0, sourceValue: sourceField.value, targetValue: '' },
          format: { status: 'none', confidence: 0, sourceValue: sourceField.format || 'text', targetValue: '' },
          font: { status: 'none', confidence: 0, sourceValue: sourceField.font || 'Arial', targetValue: '' }
        };
      });
      setComparisonResults(results);
      return;
    }
    
    sourceFields.forEach(sourceField => {
      let bestMatch: QAField | null = null;
      let bestSimilarity = 0;

      // Find the best matching target field based on label similarity
      targetFields.forEach(targetField => {
        const labelMatch = compareLabels(sourceField.label, targetField.label);
        console.log(`🔍 Comparing "${sourceField.label}" vs "${targetField.label}" = ${labelMatch.confidence}%`);
        if (labelMatch.confidence > bestSimilarity) {
          bestSimilarity = labelMatch.confidence;
          bestMatch = targetField;
        }
      });

      if (bestMatch !== null && bestSimilarity > 0) {
        const matchedField = bestMatch as QAField;
        results[sourceField.path] = {
          labels: compareLabels(sourceField.label, matchedField.label),
          values: compareValues(sourceField.value, matchedField.value),
          format: compareFormats(sourceField.format || 'text', matchedField.format || 'text'),
          font: compareFonts(sourceField.font || 'Arial', matchedField.font || 'Arial')
        };
        console.log(`✅ Matched: "${sourceField.label}" -> "${matchedField.label}" (${bestSimilarity}%)`);
      } else {
        results[sourceField.path] = {
          labels: { status: 'none', confidence: 0, sourceValue: sourceField.label, targetValue: '' },
          values: { status: 'none', confidence: 0, sourceValue: sourceField.value, targetValue: '' },
          format: { status: 'none', confidence: 0, sourceValue: sourceField.format || 'text', targetValue: '' },
          font: { status: 'none', confidence: 0, sourceValue: sourceField.font || 'Arial', targetValue: '' }
        };
        console.log(`❌ No match found for: "${sourceField.label}" (best similarity: ${bestSimilarity}%)`);
      }
    });
    
    setComparisonResults(results);
    console.log('🔍 Final comparison results:', results);
    console.log('📈 Results summary:', {
      totalComparisons: Object.keys(results).length,
      exactMatches: Object.values(results).filter(r => r.labels.status === 'exact').length,
      partialMatches: Object.values(results).filter(r => r.labels.status === 'partial').length,
      noMatches: Object.values(results).filter(r => r.labels.status === 'none').length
    });
  }, [sourceFields, targetFields]);

  // File upload handler
  const handleFileUpload = async (files: FileList) => {
    if (files.length === 0 || !currentProject) return;
    
    setIsUploading(true);
    const file = files[0];
    
    try {
      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsText(file);
      });

      const fileData: FileData = {
        id: Math.random().toString(36).slice(2),
        name: file.name,
        type: file.type,
        size: file.size,
        lastModified: file.lastModified,
        content,
      };

      setComparisonFile(fileData);
    } catch (error) {
      console.error('Error uploading file:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveFile = () => {
    setComparisonFile(null);
  };

  // Render match icon
  const renderMatchIcon = (result: MatchResult) => {
    switch (result.status) {
      case 'exact':
        return <CheckCircle size={14} className="match-icon exact" />;
      case 'partial':
        return <AlertCircle size={14} className="match-icon partial" />;
      case 'none':
      case 'empty':
      default:
        return <XCircle size={14} className="match-icon none" />;
    }
  };

  const getMatchStatusText = (result: MatchResult) => {
    switch (result.status) {
      case 'exact':
        return 'Exact Match';
      case 'partial':
        return 'Partial Match';
      case 'none':
      case 'empty':
      default:
        return 'No Match';
    }
  };

  return (
    <div className="qa-page">
      {/* Main Content */}
      <div className="qa-page-content">
        <div className="qa-comparison-container">
          {/* Quality Assurance Header with Statistics */}
          <div className="qa-header-stats-section">
            <div className="qa-header">
              <div className="qa-header-content">
                <div className="qa-title-section">
                  <div>
                    <h3>Quality Assurance</h3>
                    <p className="panel-subtitle">Comprehensive field validation with four-way comparison</p>
                  </div>
                </div>
                <div className="qa-upload-section">
                  {comparisonFile ? (
                    <div className="uploaded-file-compact">
                      <span className="file-name-compact">{comparisonFile.name}</span>
                      <button
                        className="remove-btn-compact"
                        onClick={handleRemoveFile}
                        title="Remove file"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ) : (
                    <button
                      className="upload-btn-compact"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                    >
                      <Upload size={12} />
                      {isUploading ? 'Uploading...' : 'Upload JSON'}
                    </button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={(e) => {
                      if (e.target.files) {
                        handleFileUpload(e.target.files);
                      }
                    }}
                    className="file-input-hidden"
                    title="Upload JSON file for QA comparison"
                  />
                </div>
              </div>
            </div>
            
            <div className="qa-stats-bar">
              <div className="stats-section">
                <div className="stat-group">
                  <h4>Labels</h4>
                  <div className="stat-items">
                    <div className="stat-item exact">
                      <span className="stat-number">{Object.values(comparisonResults).filter(r => r.labels.status === 'exact').length}</span>
                      <span className="stat-label">Exact</span>
                    </div>
                    <div className="stat-item partial">
                      <span className="stat-number">{Object.values(comparisonResults).filter(r => r.labels.status === 'partial').length}</span>
                      <span className="stat-label">Partial</span>
                    </div>
                    <div className="stat-item not-found">
                      <span className="stat-number">{Object.values(comparisonResults).filter(r => r.labels.status === 'none').length}</span>
                      <span className="stat-label">None</span>
                    </div>
                  </div>
                </div>
                
                <div className="stat-group">
                  <h4>Values</h4>
                  <div className="stat-items">
                    <div className="stat-item exact">
                      <span className="stat-number">{Object.values(comparisonResults).filter(r => r.values.status === 'exact').length}</span>
                      <span className="stat-label">Exact</span>
                    </div>
                    <div className="stat-item partial">
                      <span className="stat-number">{Object.values(comparisonResults).filter(r => r.values.status === 'partial').length}</span>
                      <span className="stat-label">Partial</span>
                    </div>
                    <div className="stat-item not-found">
                      <span className="stat-number">{Object.values(comparisonResults).filter(r => r.values.status === 'none').length}</span>
                      <span className="stat-label">None</span>
                    </div>
                  </div>
                </div>
                
                <div className="stat-group">
                  <h4>Format</h4>
                  <div className="stat-items">
                    <div className="stat-item exact">
                      <span className="stat-number">{Object.values(comparisonResults).filter(r => r.format.status === 'exact').length}</span>
                      <span className="stat-label">Exact</span>
                    </div>
                    <div className="stat-item partial">
                      <span className="stat-number">{Object.values(comparisonResults).filter(r => r.format.status === 'partial').length}</span>
                      <span className="stat-label">Partial</span>
                    </div>
                    <div className="stat-item not-found">
                      <span className="stat-number">{Object.values(comparisonResults).filter(r => r.format.status === 'none').length}</span>
                      <span className="stat-label">None</span>
                    </div>
                  </div>
                </div>
                
                <div className="stat-group">
                  <h4>Font</h4>
                  <div className="stat-items">
                    <div className="stat-item exact">
                      <span className="stat-number">{Object.values(comparisonResults).filter(r => r.font.status === 'exact').length}</span>
                      <span className="stat-label">Exact</span>
                    </div>
                    <div className="stat-item partial">
                      <span className="stat-number">{Object.values(comparisonResults).filter(r => r.font.status === 'partial').length}</span>
                      <span className="stat-label">Partial</span>
                    </div>
                    <div className="stat-item not-found">
                      <span className="stat-number">{Object.values(comparisonResults).filter(r => r.font.status === 'none').length}</span>
                      <span className="stat-label">None</span>
                    </div>
                  </div>
                </div>

                <div className="stat-group total">
                  <h4>Total</h4>
                  <div className="stat-items">
                    <div className="stat-item">
                      <span className="stat-number">{sourceFields.length}</span>
                      <span className="stat-label">Fields</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Fields Comparison */}
          <div className="qa-fields-comparison-list">
            {/* Comparison Headers - Always Visible */}
            <div className="qa-comparison-headers sticky">
              <div className="qa-source-header">Source Field</div>
              <div className="qa-target-headers">
                <div className="target-header labels">
                  <Type size={14} />
                  <span>Labels</span>
                </div>
                <div className="target-header values">
                  <Hash size={14} />
                  <span>Values</span>
                </div>
                <div className="target-header format">
                  <Hash size={14} />
                  <span>Format</span>
                </div>
                <div className="target-header font">
                  <Palette size={14} />
                  <span>Font</span>
                </div>
              </div>
            </div>

            {/* Comparison Rows */}
            {sourceFields.length > 0 || targetFields.length > 0 ? (
              <div className="qa-comparison-rows">
                {(() => {
                // Get the maximum count to show all fields from both sides
                const maxFields = Math.max(sourceFields.length, targetFields.length);
                
                // Create rows for all fields
                const allRows = [];
                for (let i = 0; i < maxFields; i++) {
                  const sourceField = i < sourceFields.length ? sourceFields[i] : null;
                  const targetField = i < targetFields.length ? targetFields[i] : null;
                  
                  // Get comparison result for source field (if it exists)
                  const result = sourceField && comparisonResults[sourceField.path] 
                    ? comparisonResults[sourceField.path]
                    : {
                        labels: { status: 'empty' as const, confidence: 0, sourceValue: sourceField?.label || '', targetValue: targetField?.label || '' },
                        values: { status: 'empty' as const, confidence: 0, sourceValue: sourceField?.value || '', targetValue: targetField?.value || '' },
                        format: { status: 'empty' as const, confidence: 0, sourceValue: sourceField?.format || '', targetValue: targetField?.format || '' },
                        font: { status: 'empty' as const, confidence: 0, sourceValue: sourceField?.font || '', targetValue: targetField?.font || '' }
                      };

                  allRows.push({
                    key: `row_${i}`,
                    sourceField,
                    targetField,
                    result
                  });
                }

                return allRows.map((row) => (
                  <div key={row.key} className="qa-field-comparison-row">
                    {/* Source Field */}
                    <div className="qa-source-field">
                      {row.sourceField ? (
                        <>
                          <div className="field-header">
                            <span className="field-name">{row.sourceField.label}</span>
                            <span 
                              className="field-value" 
                              data-full-text={String(row.sourceField.value)}
                              title={String(row.sourceField.value)}
                            >
                              {row.sourceField.value}
                            </span>
                          </div>
                          <div className="field-meta">
                            <span className="field-format">{row.sourceField.format}</span>
                            <span className="field-font">{row.sourceField.font}</span>
                          </div>
                        </>
                      ) : (
                        <div className="field-header">
                          <span className="field-name empty">—</span>
                          <span className="field-value"></span>
                        </div>
                      )}
                    </div>

                    {/* Comparison Sections */}
                    <div className="qa-comparison-sections">
                      <div className="comparison-section labels">
                        <div className="comparison-result">
                          <div className="match-status-wrapper">
                            {row.sourceField ? renderMatchIcon(row.result.labels) : <div className="empty-icon-space"></div>}
                            <div className="match-status-text-section">
                              {row.result.labels.confidence > 0 && (
                                <span className="confidence">{row.result.labels.confidence}%</span>
                              )}
                              {row.sourceField && (
                                <span className="match-status-text">{getMatchStatusText(row.result.labels)}</span>
                              )}
                            </div>
                          </div>
                          <span 
                            className="target-value"
                            data-full-text={String(row.result.labels.targetValue || (row.targetField?.label || ''))}
                            title={String(row.result.labels.targetValue || (row.targetField?.label || ''))}
                          >
                            {row.result.labels.targetValue || (row.targetField?.label || '')}
                          </span>
                        </div>
                      </div>

                      <div className="comparison-section values">
                        <div className="comparison-result">
                          <div className="match-status-wrapper">
                            {row.sourceField ? renderMatchIcon(row.result.values) : <div className="empty-icon-space"></div>}
                            <div className="match-status-text-section">
                              {row.result.values.confidence > 0 && (
                                <span className="confidence">{row.result.values.confidence}%</span>
                              )}
                              {row.sourceField && (
                                <span className="match-status-text">{getMatchStatusText(row.result.values)}</span>
                              )}
                            </div>
                          </div>
                          <span 
                            className="target-value"
                            data-full-text={String(row.result.values.targetValue || (row.targetField?.value || ''))}
                            title={String(row.result.values.targetValue || (row.targetField?.value || ''))}
                          >
                            {row.result.values.targetValue || (row.targetField?.value || '')}
                          </span>
                        </div>
                      </div>

                      <div className="comparison-section format">
                        <div className="comparison-result">
                          <div className="match-status-wrapper">
                            {row.sourceField ? renderMatchIcon(row.result.format) : <div className="empty-icon-space"></div>}
                            <div className="match-status-text-section">
                              {row.result.format.confidence > 0 && (
                                <span className="confidence">{row.result.format.confidence}%</span>
                              )}
                              {row.sourceField && (
                                <span className="match-status-text">{getMatchStatusText(row.result.format)}</span>
                              )}
                            </div>
                          </div>
                          <span 
                            className="target-value"
                            data-full-text={String(row.result.format.targetValue || (row.targetField?.format || ''))}
                            title={String(row.result.format.targetValue || (row.targetField?.format || ''))}
                          >
                            {row.result.format.targetValue || (row.targetField?.format || '')}
                          </span>
                        </div>
                      </div>

                      <div className="comparison-section font">
                        <div className="comparison-result">
                          <div className="match-status-wrapper">
                            {row.sourceField ? renderMatchIcon(row.result.font) : <div className="empty-icon-space"></div>}
                            <div className="match-status-text-section">
                              {row.result.font.confidence > 0 && (
                                <span className="confidence">{row.result.font.confidence}%</span>
                              )}
                              {row.sourceField && (
                                <span className="match-status-text">{getMatchStatusText(row.result.font)}</span>
                              )}
                            </div>
                          </div>
                          <span 
                            className="target-value"
                            data-full-text={String(row.targetField?.font || '')}
                            title={String(row.targetField?.font || '')}
                          >
                            {row.targetField?.font || ''}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ));
                })()}
              </div>
            ) : (
              <div className="empty-state">
                <Upload size={32} className="empty-icon" />
                <p>Upload a JSON file to start quality assurance comparison</p>
                <p className="empty-state-subtitle">
                  Expected format: JSON with 'pages' array containing 'textItems' arrays
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}