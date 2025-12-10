export interface BoundingBox {
  x1: number;
  y1: number;
  width: number;
  height: number;
}

export interface BoundingBoxElement {
  boundingBox?: BoundingBox;
  x1?: number;
  y1?: number;
  x?: number;  // Alternative format used in textItems
  y?: number;  // Alternative format used in textItems
  width?: number;
  height?: number;
  [key: string]: any;
}

/**
 * Calculate Intersection over Union (IoU) between two bounding boxes
 */
export function calculateIOU(box1: BoundingBox, box2: BoundingBox): number {
  // Calculate intersection coordinates
  const x1 = Math.max(box1.x1, box2.x1);
  const y1 = Math.max(box1.y1, box2.y1);
  const x2 = Math.min(box1.x1 + box1.width, box2.x1 + box2.width);
  const y2 = Math.min(box1.y1 + box1.height, box2.y1 + box2.height);

  // Calculate intersection area
  const intersectionWidth = Math.max(0, x2 - x1);
  const intersectionHeight = Math.max(0, y2 - y1);
  const intersectionArea = intersectionWidth * intersectionHeight;

  // Calculate union area
  const box1Area = box1.width * box1.height;
  const box2Area = box2.width * box2.height;
  const unionArea = box1Area + box2Area - intersectionArea;

  // Return IoU (avoid division by zero)
  return unionArea > 0 ? intersectionArea / unionArea : 0;
}

/**
 * Extract bounding box from element (supports multiple formats)
 */
export function extractBoundingBox(element: BoundingBoxElement): BoundingBox | null {
  // Direct properties (x1, y1, width, height)
  if (typeof element.x1 === 'number' && typeof element.y1 === 'number' && 
      typeof element.width === 'number' && typeof element.height === 'number') {
    return {
      x1: element.x1,
      y1: element.y1,
      width: element.width,
      height: element.height
    };
  }

  // Alternative format (x, y, width, height) - common in textItems
  if (typeof element.x === 'number' && typeof element.y === 'number' && 
      typeof element.width === 'number' && typeof element.height === 'number') {
    return {
      x1: element.x,
      y1: element.y,
      width: element.width,
      height: element.height
    };
  }

  // Nested boundingBox object
  if (element.boundingBox && typeof element.boundingBox === 'object') {
    const bbox = element.boundingBox;
    if (typeof bbox.x1 === 'number' && typeof bbox.y1 === 'number' && 
        typeof bbox.width === 'number' && typeof bbox.height === 'number') {
      return bbox;
    }
  }

  return null;
}

/**
 * Sort elements by reading order using spatial positioning
 * Primary sort: top-to-bottom (y1)
 * Secondary sort: left-to-right (x1) for elements on same line
 */
export function sortByReadingOrder(elements: BoundingBoxElement[]): BoundingBoxElement[] {
  const elementsWithBoxes = elements
    .map(element => ({
      element,
      boundingBox: extractBoundingBox(element)
    }))
    .filter(item => item.boundingBox !== null);

  // Group elements by approximate horizontal lines (using y-tolerance)
  const lineHeight = calculateAverageLineHeight(elementsWithBoxes.map(item => item.boundingBox!));
  const yTolerance = lineHeight * 0.3; // 30% of average line height

  const lines: Array<{ y: number; elements: typeof elementsWithBoxes }> = [];
  
  elementsWithBoxes.forEach(item => {
    const bbox = item.boundingBox!;
    const centerY = bbox.y1 + bbox.height / 2;
    
    // Find existing line within tolerance
    let targetLine = lines.find(line => Math.abs(line.y - centerY) <= yTolerance);
    
    if (!targetLine) {
      targetLine = { y: centerY, elements: [] };
      lines.push(targetLine);
    }
    
    targetLine.elements.push(item);
  });

  // Sort lines by Y position (bottom to top, DESC)
  lines.sort((a, b) => b.y - a.y);

  // Sort elements within each line by X position (right to left, DESC)
  lines.forEach(line => {
    line.elements.sort((a, b) => b.boundingBox!.x1 - a.boundingBox!.x1);
  });

  // Flatten back to single array
  const sortedElements = lines.flatMap(line => line.elements.map(item => item.element));
  
  // Add elements without bounding boxes at the end
  const elementsWithoutBoxes = elements.filter(element => extractBoundingBox(element) === null);
  
  return [...sortedElements, ...elementsWithoutBoxes];
}

/**
 * Calculate average line height from bounding boxes
 */
function calculateAverageLineHeight(boundingBoxes: BoundingBox[]): number {
  if (boundingBoxes.length === 0) return 20; // Default fallback
  
  const heights = boundingBoxes.map(box => box.height);
  const totalHeight = heights.reduce((sum, height) => sum + height, 0);
  return totalHeight / heights.length;
}

/**
 * Sort elements using IoU-based clustering and reading order
 */
export function sortByIOUAndReadingOrder(elements: BoundingBoxElement[], iouThreshold = 0.1): BoundingBoxElement[] {
  const elementsWithBoxes = elements
    .map(element => ({
      element,
      boundingBox: extractBoundingBox(element)
    }))
    .filter(item => item.boundingBox !== null);

  if (elementsWithBoxes.length === 0) {
    return elements;
  }

  // Create clusters based on IoU similarity
  const clusters: Array<typeof elementsWithBoxes> = [];
  
  elementsWithBoxes.forEach(item => {
    let addedToCluster = false;
    
    for (const cluster of clusters) {
      // Check if item has significant IoU with any element in cluster
      const hasOverlap = cluster.some(clusterItem => 
        calculateIOU(item.boundingBox!, clusterItem.boundingBox!) > iouThreshold
      );
      
      if (hasOverlap) {
        cluster.push(item);
        addedToCluster = true;
        break;
      }
    }
    
    if (!addedToCluster) {
      clusters.push([item]);
    }
  });

  // Sort clusters by their average Y position
  clusters.sort((a, b) => {
    const avgYA = a.reduce((sum, item) => sum + item.boundingBox!.y1, 0) / a.length;
    const avgYB = b.reduce((sum, item) => sum + item.boundingBox!.y1, 0) / b.length;
    return avgYA - avgYB;
  });

  // Sort elements within each cluster by reading order
  const sortedElements = clusters.flatMap(cluster => 
    sortByReadingOrder(cluster.map(item => item.element))
  );

  // Add elements without bounding boxes at the end
  const elementsWithoutBoxes = elements.filter(element => extractBoundingBox(element) === null);
  
  return [...sortedElements, ...elementsWithoutBoxes];
}

/**
 * Recursively sort JSON data that contains bounding box information
 */
export function sortJsonByBoundingBoxes(data: any): any {
  if (Array.isArray(data)) {
    // Check if this array contains elements with bounding boxes
    const hasBoxElements = data.some(item => 
      typeof item === 'object' && item !== null && extractBoundingBox(item) !== null
    );
    
    if (hasBoxElements) {
      // Sort this array by reading order
      const sorted = sortByReadingOrder(data);
      // Recursively process each element
      return sorted.map(item => sortJsonByBoundingBoxes(item));
    } else {
      // Just recursively process without sorting
      return data.map(item => sortJsonByBoundingBoxes(item));
    }
  } else if (typeof data === 'object' && data !== null) {
    // Recursively process object properties
    const result: any = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = sortJsonByBoundingBoxes(value);
    }
    return result;
  }
  
  return data;
}