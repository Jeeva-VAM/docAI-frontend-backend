import React, { useState } from 'react';
import JsonView from '@uiw/react-json-view';
import { ToggleLeft, ToggleRight, Code, FormInput, ArrowUpDown, Filter, RotateCcw, Circle, X } from 'lucide-react';
import type { JsonData } from '../../types';
import { IndexedDBService } from '../../services/indexedDBService';
import './JsonViewer.css';

interface JsonViewerProps {
  jsonData: JsonData | null;
  viewMode: 'json' | 'form';
  error: string | null;
  onToggleViewMode: () => void;
  onFieldSelect?: (bbox: number[], pageNumber?: number, annotationType?: string) => void;
  // New props for "Show All" functionality
  showAllAnnotations?: boolean;
  onToggleShowAll?: () => void;
  onShowAllFields?: (allFields: Array<{bbox: number[], page: number, annotation_type?: string}>) => void;
  // Props for deletion functionality
  currentFileId?: string;
  onAnnotationDeleted?: () => void;
}

export const JsonViewer: React.FC<JsonViewerProps> = ({
  jsonData,
  viewMode,
  error,
  onToggleViewMode,
  onFieldSelect,
  showAllAnnotations = false,
  onToggleShowAll,
  onShowAllFields,
  currentFileId,
  onAnnotationDeleted,
}) => {
  // State for sorting and filtering
  const [sortOrder, setSortOrder] = useState<'none' | 'asc' | 'desc'>('none');
  const [filterRange, setFilterRange] = useState<{ min: number; max: number }>({ min: 0, max: 100 });
  const [isFilterActive, setIsFilterActive] = useState(false);

  // Remove some debug logging to reduce console spam
  // console.log('🔍 JsonViewer render:', { 
  //   hasJsonData: !!jsonData, 
  //   dataKeys: jsonData ? Object.keys(jsonData) : null,
  //   totalPages: jsonData?.pages?.length || 0,
  //   totalFields: jsonData?.pages?.reduce((sum: number, page: any) => sum + (page.fields?.length || 0), 0) || 0,
  //   totalTextItems: jsonData?.pages?.reduce((sum: number, page: any) => sum + (page.textItems?.length || 0), 0) || 0,
  //   error, 
  //   viewMode 
  // });

  const collectAllFields = () => {
    const allFields: Array<{bbox: number[], page: number, annotation_type?: string}> = [];
    
    // Check for 'extracted_data' array (manual annotation structure)
    if (Array.isArray(jsonData?.extracted_data)) {
      jsonData.extracted_data.forEach((item: any) => {
        if (item.x1 !== undefined && item.y1 !== undefined && item.width !== undefined && item.height !== undefined) {
          const bboxCoords = [item.x1, item.y1, item.x1 + item.width, item.y1 + item.height];
          allFields.push({
            bbox: bboxCoords,
            page: item.pageNumber || 1,
            annotation_type: item.annotation_type || 'manual'
          });
        }
      });
    }
    // Check for direct form_fields array (new structure)
    else if (Array.isArray(jsonData?.form_fields)) {
      jsonData.form_fields.forEach((field: any) => {
        if (field.bbox) {
          allFields.push({
            bbox: [field.bbox.x1, field.bbox.y1, field.bbox.x2, field.bbox.y2],
            page: field.page || 1,
            annotation_type: field.annotation_type || 'original'
          });
        }
      });
    }
    // Fallback to pages structure (old structure)
    else if (Array.isArray(jsonData?.pages)) {
      jsonData.pages.forEach((page: any, pageIndex: number) => {
        // Check for 'fields' array (original structure)
        if (Array.isArray(page.fields)) {
          page.fields.forEach((field: any) => {
            if (field.bbox) {
              allFields.push({
                bbox: field.bbox,
                page: pageIndex + 1,
                annotation_type: field.annotation_type || 'original'
              });
            }
          });
        }
        // Check for 'textItems' array (new structure)
        else if (Array.isArray(page.textItems)) {
          page.textItems.forEach((item: any) => {
            // All items should now have PDF coordinates in x,y,width,height format
            // Convert to bbox format [x1, y1, x2, y2] for highlighting
            const bboxCoords = [item.x, item.y, item.x + item.width, item.y + item.height];
              
            allFields.push({
              bbox: bboxCoords,
              page: pageIndex + 1,
              annotation_type: item.annotation_type || 'original'  // Preserve annotation type from textItem
            });
          });
        }
      });
    }
    // Check if jsonData itself is an array (direct array format)
    else if (Array.isArray(jsonData)) {
      jsonData.forEach((item: any) => {
        if (item.x !== undefined && item.y !== undefined && item.width !== undefined && item.height !== undefined) {
          const bboxCoords = [item.x, item.y, item.x + item.width, item.y + item.height];
          allFields.push({
            bbox: bboxCoords,
            page: item.page || 1,
            annotation_type: item.annotation_type || 'manual'
          });
        }
      });
    }
    
    return allFields;
  };

  const handleShowAllToggle = () => {
    console.log('🔘 Show All toggle clicked, current state:', showAllAnnotations);
    if (onToggleShowAll) {
      onToggleShowAll();
      
      // If turning on "show all", collect and send all fields to parent
      if (!showAllAnnotations && onShowAllFields) {
        const allFields = collectAllFields();
        console.log('📤 Sending all fields to parent:', allFields.length, 'fields');
        onShowAllFields(allFields);
      }
    } else {
      console.warn('⚠️ onToggleShowAll handler not provided');
    }
  };

  const handleSortToggle = () => {
    const nextOrder = sortOrder === 'none' ? 'desc' : sortOrder === 'desc' ? 'asc' : 'none';
    console.log('🔄 Sort toggle clicked, changing from', sortOrder, 'to', nextOrder);
    setSortOrder(nextOrder);
  };

  const handleFilterChange = (min: number, max: number) => {
    console.log('🔍 Filter changed:', { min, max });
    setFilterRange({ min, max });
    setIsFilterActive(min > 0 || max < 100);
  };

  const handleReset = () => {
    console.log('🔄 Reset clicked - clearing all filters and sorting');
    setSortOrder('none');
    setFilterRange({ min: 0, max: 100 });
    setIsFilterActive(false);
    // Also reset show all annotations
    if (showAllAnnotations && onToggleShowAll) {
      console.log('🔄 Also resetting Show All state');
      onToggleShowAll();
    }
  };

  const handleDeleteManualAnnotation = async (annotationId: string | number, fieldLabel: string) => {
    if (!currentFileId) {
      console.error('No current file ID provided for deletion');
      return;
    }

    try {
      await IndexedDBService.deleteAnnotationById(currentFileId, annotationId);
      console.log(`✅ Successfully deleted manual annotation: ${fieldLabel} (ID: ${annotationId})`);
      
      // Call the callback to refresh the data
      if (onAnnotationDeleted) {
        onAnnotationDeleted();
      }
    } catch (error) {
      console.error('Failed to delete annotation:', error);
      alert('Failed to delete annotation. Please try again.');
    }
  };

  const applyFiltersAndSorting = (fields: any[]) => {
    let processedFields = [...fields];

    // Apply confidence filter
    if (isFilterActive) {
      processedFields = processedFields.filter(field => {
        const confidence = typeof field.confidence === 'number' ? field.confidence * 100 : 75;
        return confidence >= filterRange.min && confidence <= filterRange.max;
      });
    }

    // Apply sorting
    if (sortOrder !== 'none') {
      processedFields.sort((a, b) => {
        const confA = typeof a.confidence === 'number' ? a.confidence * 100 : 75;
        const confB = typeof b.confidence === 'number' ? b.confidence * 100 : 75;
        return sortOrder === 'desc' ? confB - confA : confA - confB;
      });
    }

    return processedFields;
  };

  if (error) {
    return (
      <div className="json-viewer">
        <div className="json-header">
          <h3>JSON Viewer</h3>
          <div className="json-view-toggle">
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
          </div>
        </div>
        {/* Compact JSON Toolbar */}
        <div className="json-compact-toolbar">
          <div className="toolbar-section">
            <span className="toolbar-label">Tools:</span>
          </div>
          <div className="toolbar-section">
            {viewMode === 'form' && onToggleShowAll && (
              <button
                className={`compact-toggle ${showAllAnnotations ? 'active' : ''}`}
                onClick={handleShowAllToggle}
                title="Toggle show all field highlights"
              >
                {showAllAnnotations ? (
                  <>
                    Hide All
                    <ToggleRight size={12} />
                  </>
                ) : (
                  <>
                    Show All
                    <ToggleLeft size={12} />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
        <div className="error-state">
          <p>Error: {error}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="error-reload-button"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  if (!jsonData) {
    return (
      <div className="json-viewer">
        <div className="json-header">
          <h3>JSON Viewer</h3>
          <div className="json-view-toggle">
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
          </div>
        </div>
        {/* Compact JSON Toolbar */}
        <div className="json-compact-toolbar">
          <div className="toolbar-section">
            <span className="toolbar-label">Tools:</span>
          </div>
          <div className="toolbar-section">
            {viewMode === 'form' && onToggleShowAll && (
              <button
                className={`compact-toggle ${showAllAnnotations ? 'active' : ''}`}
                onClick={handleShowAllToggle}
                title="Toggle show all field highlights"
              >
                {showAllAnnotations ? (
                  <>
                    Hide All
                    <ToggleRight size={12} />
                  </>
                ) : (
                  <>
                    Show All
                    <ToggleLeft size={12} />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
        <div className="empty-state">
          <p>Select a JSON file to view its content</p>
          <p className="empty-state-text">
            Upload a .json file and click on it to display here
          </p>
        </div>
      </div>
    );
  }

  const renderFormView = () => {
      // Collect fields from all pages
      const allFields: any[] = [];
      
      console.log('🔍 JsonViewer: Analyzing data structure:', {
        hasExtractedData: Array.isArray(jsonData?.extracted_data),
        hasFormFields: Array.isArray(jsonData?.form_fields),
        hasPages: Array.isArray(jsonData?.pages),
        isDirectArray: Array.isArray(jsonData),
        jsonDataKeys: jsonData ? Object.keys(jsonData) : 'no data'
      });
      
      // Check for 'extracted_data' array (manual annotation structure)
      if (Array.isArray(jsonData?.extracted_data)) {
        console.log('🎯 JsonViewer: Using extracted_data path');
        jsonData.extracted_data.forEach((item: any) => {
          // Convert x1, y1, width, height to bbox format [x1, y1, x2, y2]
          if (item.x1 !== undefined && item.y1 !== undefined && item.width !== undefined && item.height !== undefined) {
            const bboxCoords = [item.x1, item.y1, item.x1 + item.width, item.y1 + item.height];
            
            console.log(`📍 JsonViewer: Manual annotation field "${item.label}": coords(${item.x1}, ${item.y1}, ${item.width}, ${item.height}) → bbox[${bboxCoords.map((v: number) => v.toFixed(2)).join(', ')}], type: ${item.annotation_type || 'manual'}`);
            
            allFields.push({
              id: item.id, // Include the ID for deletion functionality
              label: item.label,
              text_content: item.value || '', // Use 'value' field for form-input
              field_type: 'text_input',
              bbox: bboxCoords,
              page: item.pageNumber || 1,
              annotation_type: item.annotation_type || 'manual',
              confidence: item.confi_score || item.confidence || 0.95, // Use 'confi_score' first for form-confidence
              _pageNumber: item.pageNumber || 1,
              _pageTotal: 1
            });
          }
        });
      }
      // Check for pages structure
      else if (Array.isArray(jsonData?.pages)) {
        console.log('🎯 JsonViewer: Using pages path');
        jsonData.pages.forEach((page: any, pageIndex: number) => {
          // Check for 'fields' array (original structure)
          if (Array.isArray(page.fields)) {
            page.fields.forEach((field: any) => {
              allFields.push({
                ...field,
                _pageNumber: pageIndex + 1,
                _pageTotal: jsonData.pages.length
              });
            });
          }
          // Check for 'textItems' array (new structure)
          else if (Array.isArray(page.textItems)) {
            page.textItems.forEach((item: any) => {
              // All items should now have PDF coordinates in x,y,width,height format
              // Convert to bbox format [x1, y1, x2, y2] for highlighting
              const bboxCoords = [item.x, item.y, item.x + item.width, item.y + item.height];
              
              // Preserve annotation_type if it exists in the textItem
              const annotationType = item.annotation_type || 'original';
              
              console.log(`📍 JsonViewer: Using PDF coordinates for "${item.text}": coords(${item.x}, ${item.y}, ${item.width}, ${item.height}) → bbox[${bboxCoords.map((v: number) => v.toFixed(2)).join(', ')}], type: ${annotationType}`);
                
              // Convert textItem to field-like structure
              allFields.push({
                id: item.id, // Include the ID for deletion functionality
                label: item.text,
                text_content: item.value || '', // Use 'value' field if available, fallback to empty string
                field_type: 'text_input',
                bbox: bboxCoords,
                page: pageIndex + 1,
                annotation_type: annotationType,  // Use the preserved annotation type
                confidence: item.confi_score || 0.75, // Use 'confi_score' field if available, fallback to default
                _pageNumber: pageIndex + 1,
                _pageTotal: jsonData.pages.length
              });
            });
          }
        });
      }
      // Check if jsonData itself is an array (direct array format)
      else if (Array.isArray(jsonData)) {
        console.log('🎯 JsonViewer: Using direct array path');
        jsonData.forEach((item: any) => {
          // Convert x, y, width, height to bbox format [x1, y1, x2, y2]
          if (item.x !== undefined && item.y !== undefined && item.width !== undefined && item.height !== undefined) {
            const bboxCoords = [item.x, item.y, item.x + item.width, item.y + item.height];
            
            console.log(`📍 JsonViewer: Direct array field "${item.text}": coords(${item.x}, ${item.y}, ${item.width}, ${item.height}) → bbox[${bboxCoords.map((v: number) => v.toFixed(2)).join(', ')}], type: ${item.annotation_type || 'manual'}`);
            
            allFields.push({
              id: item.id, // Preserve the original ID for deletion
              label: item.text || item.label || item.id,
              text_content: item.value || '', // Use 'value' field if available
              field_type: 'text_input',
              bbox: bboxCoords,
              page: item.page || 1,
              annotation_type: item.annotation_type || 'manual',
              confidence: item.confi_score || item.confidence || 0.95, // Use 'confi_score' first, fallback to 'confidence', then default
              _pageNumber: item.page || 1,
              _pageTotal: 1
            });
          }
        });
      }

      if (!allFields.length) {
        return (
          <div className="form-view-empty">
            <p>No fields found in this JSON.</p>
          </div>
        );
      }

      // Apply filters and sorting
      const processedFields = applyFiltersAndSorting(allFields);

      if (!processedFields.length && isFilterActive) {
        return (
          <div className="form-view-empty">
            <p>No fields match the current filter criteria.</p>
            <button onClick={handleReset} className="filter-button">
              Reset Filters
            </button>
          </div>
        );
      }

      return (
        <div className="form-view">
          {processedFields.map((field: any, idx: number) => {
            let confColorClass = 'form-confidence-default'; // neutral gray
            if (typeof field.confidence === 'number' && !isNaN(field.confidence)) {
              if (field.confidence >= 0.85) confColorClass = 'form-confidence-high'; // vivid green
              else if (field.confidence >= 0.6) confColorClass = 'form-confidence-medium'; // vivid yellow
              else confColorClass = 'form-confidence-low'; // vivid red
            }
            const showTextField = !('type' in field) || field.type === 'number_field';
            const hasNestedFields = field.fields && Array.isArray(field.fields) && field.fields.length > 0;
            
            // Debug logging for manual annotations
            if (field.annotation_type === 'manual') {
              console.log('🔍 Manual annotation found:', { id: field.id, label: field.label, hasId: field.id != null });
            }
            
            return (
              <div key={idx} className={`form-field ${hasNestedFields ? 'nested-field' : ''}`}>
                {/* Page indicator for multi-page documents */}
                {field._pageTotal > 1 && (
                  <div className="page-indicator">
                    Page {field._pageNumber}
                  </div>
                )}
                <div className="field-row">
                  <label 
                    className={field.bbox ? 'form-label-clickable' : 'form-label-non-clickable'}
                    onClick={() => {
                      if (field.bbox) {
                        const annotationType = field.annotation_type || 'original';
                        console.log(`🎯 JsonViewer: Field clicked - "${field.label}", bbox: [${field.bbox.map((v: number) => v.toFixed(2)).join(', ')}], page: ${field.page || field._pageNumber}, type: ${annotationType}`);
                        onFieldSelect?.(field.bbox, field.page || field._pageNumber, annotationType);
                      }
                    }}
                  >
                    <Circle 
                      size={8} 
                      fill={field.annotation_type === 'manual' ? '#ef4444' : '#22c55e'}
                      color={field.annotation_type === 'manual' ? '#ef4444' : '#22c55e'}
                      style={{ flexShrink: 0 }}
                    />
                    <span title={field.annotation_type === 'manual' ? 'Manual annotation' : 'Original data'}>
                      {field.label}:
                    </span>
                  </label>
                  {showTextField && (
                    <input
                      type="text"
                      className="form-input"
                      value={field.text_content || ''}
                      readOnly
                      aria-label={`Content for ${field.label || 'field'}`}
                    />
                  )}
                  {typeof field.confidence === 'number' && !isNaN(field.confidence) && (
                    <div className={`form-confidence ${confColorClass}`}>
                      {Math.round(field.confidence * 100)}%
                    </div>
                  )}
                  {field.annotation_type === 'manual' && field.id != null && (
                    <button
                      className="delete-annotation-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        console.log('🗑️ Delete button clicked for:', { id: field.id, label: field.label, type: field.annotation_type });
                        handleDeleteManualAnnotation(field.id, field.label || 'Unknown field');
                      }}
                      title="Delete manual annotation"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
                {hasNestedFields && (
                  <div className="nested-fields">
                    {field.fields.map((nestedField: any, nestedIdx: number) => (
                      <div key={`${idx}-${nestedIdx}`} className="field-row">
                        <label 
                          className={nestedField.bbox ? 'form-label-clickable' : 'form-label-non-clickable'}
                          onClick={() => {
                            if (nestedField.bbox) {
                              const annotationType = nestedField.annotation_type || 'original';
                              console.log(`🎯 JsonViewer: Nested field clicked - "${nestedField.label}", bbox: [${nestedField.bbox.map((v: number) => v.toFixed(2)).join(', ')}], page: ${nestedField.page || field._pageNumber}, type: ${annotationType}`);
                              onFieldSelect?.(nestedField.bbox, nestedField.page || field._pageNumber, annotationType);
                            }
                          }}
                        >
                          <Circle 
                            size={8} 
                            fill={nestedField.annotation_type === 'manual' ? '#ef4444' : '#22c55e'}
                            color={nestedField.annotation_type === 'manual' ? '#ef4444' : '#22c55e'}
                            style={{ flexShrink: 0 }}
                          />
                          <span title={nestedField.annotation_type === 'manual' ? 'Manual annotation' : 'Original data'}>
                            {nestedField.label}:
                          </span>
                        </label>
                        <input
                          type="text"
                          className="form-input"
                          value={nestedField.text_content || ''}
                          readOnly
                          aria-label={`Content for ${nestedField.label || 'nested field'}`}
                        />
                        {typeof nestedField.confidence === 'number' && !isNaN(nestedField.confidence) && (
                          <div className={`form-confidence ${
                            nestedField.confidence >= 0.85 ? 'form-confidence-high' :
                            nestedField.confidence >= 0.6 ? 'form-confidence-medium' :
                            'form-confidence-low'
                          }`}>
                            {Math.round(nestedField.confidence * 100)}%
                          </div>
                        )}
                        {nestedField.annotation_type === 'manual' && nestedField.id != null && (
                          <button
                            className="delete-annotation-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteManualAnnotation(nestedField.id, nestedField.label || 'Unknown nested field');
                            }}
                            title="Delete manual annotation"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
  };

  return (
    <div className="json-viewer">
      <div className="json-header">
        <h3>JSON Viewer</h3>
        <div className="json-view-toggle">
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
        </div>
      </div>
      
      {/* Compact JSON Toolbar */}
      <div className="json-compact-toolbar">
        <div className="toolbar-section">
          <span className="toolbar-label">Tools:</span>
        </div>
        <div className="toolbar-section">
          {viewMode === 'form' && onToggleShowAll && (
            <>
              <button
                className={`compact-toggle ${showAllAnnotations ? 'active' : ''}`}
                onClick={handleShowAllToggle}
                title="Toggle show all field highlights"
              >
                {showAllAnnotations ? (
                  <>
                    Hide All
                    <ToggleRight size={12} />
                  </>
                ) : (
                  <>
                    Show All
                    <ToggleLeft size={12} />
                  </>
                )}
              </button>
              
              <button
                className={`compact-toggle ${sortOrder !== 'none' ? 'active' : ''}`}
                onClick={handleSortToggle}
                title={`Sort by confidence: ${sortOrder === 'desc' ? 'High to Low' : sortOrder === 'asc' ? 'Low to High' : 'None'}`}
              >
                <ArrowUpDown size={12} />
                {sortOrder === 'desc' ? '↓' : sortOrder === 'asc' ? '↑' : ''}
              </button>

              <div className="filter-controls">
                <Filter size={12} />
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={filterRange.min}
                  onChange={(e) => handleFilterChange(Number(e.target.value), filterRange.max)}
                  className="filter-input"
                  title="Min confidence %"
                  placeholder="Min"
                />
                <span className="filter-separator">-</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={filterRange.max}
                  onChange={(e) => handleFilterChange(filterRange.min, Number(e.target.value))}
                  className="filter-input"
                  title="Max confidence %"
                  placeholder="Max"
                />
              </div>

              <button
                className="compact-toggle"
                onClick={handleReset}
                title="Reset all filters and sorting"
              >
                <RotateCcw size={12} />
                Reset
              </button>
            </>
          )}
        </div>
      </div>
      
      <div className="json-content">
        {viewMode === 'json' ? (
          <div className="json-tree">
            <JsonView 
              value={jsonData}
              indentWidth={2}
              collapsed={false}
              displayObjectSize={true}
              displayDataTypes={true}
              enableClipboard={true}
              style={{
                backgroundColor: 'transparent',
                fontSize: '14px',
              }}
            />
          </div>
        ) : (
          renderFormView()
        )}
      </div>
    </div>
  );
};