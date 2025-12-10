import { useState, useRef, useEffect } from 'react';
import { Upload, X, CheckCircle, AlertCircle, XCircle } from 'lucide-react';
import { useIndexedDBStorage } from '../hooks/useIndexedDBStorage';
import type { FileData, Project, JsonData } from '../types';
import './BAPage.css';

interface BAPageProps {
  currentProject?: Project | null;
  identifiedJsonData?: JsonData | null;
}

interface ExtractedField {
  key: string;
  value: any;
  confidence?: number;
  path: string;
  position?: { x: number; y: number };
}

interface GrammarField {
  key: string;
  xpath: string;
  path: string;
  isSection?: boolean;
  children?: GrammarField[];
  parentSection?: string;
  isEditable?: boolean;
}

interface GrammarSection {
  name: string;
  xpath: string;
  fields: GrammarField[];
}

interface MatchResult {
  status: 'exact' | 'partial' | 'none' | 'empty';
  confidence: number;
  extractedField: string;
  grammarField: string;
  extractedPath: string;
  grammarPath: string;
}



export function BAPage({ currentProject, identifiedJsonData }: BAPageProps) {
  const [grammarFile, setGrammarFile] = useState<FileData | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [grammarFields, setGrammarFields] = useState<GrammarField[]>([]);
  const [extractedFields, setExtractedFields] = useState<ExtractedField[]>([]);
  const [matchResults, setMatchResults] = useState<{ [key: string]: MatchResult }>({});
  const [editingXPath, setEditingXPath] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  const [validatingField, setValidatingField] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const indexedDBStorage = useIndexedDBStorage();

  // Determine if this is a BA project for dynamic labeling
  const isBAProject = currentProject?.type === 'BA';
  
  // Dynamic labels based on project type
  const labels = {
    pageTitle: isBAProject ? 'Field Path Matcher' : 'Extracted Field Comparison',
    uploadButton: isBAProject ? 'Upload BOM Structure' : 'Upload Structure JSON',
    //waitingMessage: isBAProject ? 'Upload BOM file to compare' : 'Upload structure file to compare',
    waitingStatus: isBAProject ? '⏳ Waiting for Path' : '⏳ Waiting for comparison'
  };

  // Construct xpath from object hierarchy path
  const constructXPath = (path: string): string => {
    // Convert object path like "InsurancePolicy.PolicyInformation.Policy Number" 
    // to xpath like "/InsurancePolicy/PolicyInformation/Policy Number"
    return '/' + path.replace(/\./g, '/');
  };

  // Parse grammar file structure to extract field definitions and sections
  const parseGrammarFile = (grammarData: any): { fields: GrammarField[], sections: GrammarSection[] } => {
    console.log('🔍 Parsing structure file:', grammarData);
    const fields: GrammarField[] = [];
    const sections: GrammarSection[] = [];
    
    const traverseObject = (obj: any, currentPath: string = '', parentSection: string = '') => {
      for (const [key, value] of Object.entries(obj)) {
        const fullPath = currentPath ? `${currentPath}.${key}` : key;
        const constructedXPath = constructXPath(fullPath);
        
        if (value && typeof value === 'object') {
          if (Array.isArray(value)) {
            // Handle array case - not supported in this structure
            continue;
          }
          
          const typedValue = value as { children?: any[] };
          
          // Check if this object has children array (new structure)
          if (typedValue.children && Array.isArray(typedValue.children)) {
            // This is a section with children array
            console.log(`📁 Found section with children array: ${key} at path: ${fullPath}`);
            const sectionFields: GrammarField[] = [];
            
            // Add the container/list field itself to show it's an array
            const containerField: GrammarField = {
              key: `${key} (Array)`,
              xpath: `${constructedXPath}[]`,
              path: fullPath,
              parentSection: parentSection,
              isSection: true,
              isEditable: true
            };
            fields.push(containerField);
            
            // Parse children array
            typedValue.children.forEach((child: any, index: number) => {
              if (child && typeof child === 'object') {
                for (const childKey of Object.keys(child)) {
                  const childPath = `${fullPath}.children[${index}].${childKey}`;
                  const childXPath = constructXPath(`${fullPath}[${index}].${childKey}`);
                  
                  const childField: GrammarField = {
                    key: `${childKey}`,
                    xpath: childXPath,
                    path: childPath,
                    parentSection: `${key} (Array)[${index}]`,
                    isEditable: true
                  };
                  sectionFields.push(childField);
                  fields.push(childField);
                  console.log(`✅ Found field in array: ${childKey}[${index}] (parent: ${key}), xpath: ${childXPath}`);
                }
              }
            });
            
            // Add the section
            sections.push({
              name: `${key} (Array)`,
              xpath: `${constructedXPath}[]`,
              fields: sectionFields
            });
            
          } else if (Object.keys(value).length === 0) {
            // This is an empty field object {}
            const field: GrammarField = {
              key: key,
              xpath: constructedXPath,
              path: fullPath,
              parentSection: parentSection,
              isEditable: true
            };
            fields.push(field);
            console.log(`✅ Found field: ${key} at path: ${fullPath}, xpath: ${constructedXPath}`);
            
          } else {
            // Continue traversing (container object)
            traverseObject(value, fullPath, parentSection);
          }
        }
      }
    };
    
    traverseObject(grammarData);
    console.log('📋 Parsed structure fields:', fields);
    console.log('📁 Parsed structure sections:', sections);
    return { fields, sections };
  };

  // Extract fields from identified JSON data (textItems format)
  const extractIdentifiedFields = (jsonData: any): ExtractedField[] => {
    console.log('🔍 Extracting identified fields from:', jsonData);
    const fields: ExtractedField[] = [];
    
    try {
      // Handle different JSON data structures
      if (!jsonData) {
        console.log('⚠️ No JSON data provided');
        return fields;
      }

      // Check if data has pages structure (textItems format)
      if (jsonData.pages && Array.isArray(jsonData.pages)) {
        console.log(`📄 Processing pages structure with ${jsonData.pages.length} pages`);
        
        jsonData.pages.forEach((page: any, pageIndex: number) => {
          if (!page) {
            console.log(`⚠️ Page ${pageIndex + 1} is null or undefined`);
            return;
          }
          
          if (Array.isArray(page.textItems)) {
            console.log(`📄 Page ${pageIndex + 1} has ${page.textItems.length} text items`);
            
            page.textItems.forEach((item: any, itemIndex: number) => {
              if (!item) {
                console.log(`⚠️ Item ${itemIndex} on page ${pageIndex + 1} is null`);
                return;
              }
              
              // More flexible field extraction - handle various property names
              const text = item.text || item.label || item.fieldName || item.key || '';
              const value = item.value || item.content || item.extractedText || '';
              
              if (text || value) {
                // Clean the field name (remove colons, normalize)
                const cleanFieldName = text.replace(/[:]/g, '').trim() || `Field_${itemIndex}`;
                
                const fieldObj: ExtractedField = {
                  key: cleanFieldName,
                  value: value,
                  confidence: item.confi_score || item.confidence || item.score || 0,
                  path: `page_${pageIndex + 1}.item_${itemIndex}`,
                  position: { 
                    x: item.x || item.left || 0, 
                    y: item.y || item.top || 0 
                  }
                };
                
                fields.push(fieldObj);
                console.log(`✅ Added extracted field: ${fieldObj.key} = "${fieldObj.value}" (confidence: ${fieldObj.confidence})`);
              } else {
                console.log(`⚠️ Item ${itemIndex} on page ${pageIndex + 1} has no text or value:`, item);
              }
            });
          } else {
            console.log(`⚠️ Page ${pageIndex + 1} has no textItems array or invalid format:`, page);
          }
        });
      }
      // Handle flat array structure (manual annotations)
      else if (Array.isArray(jsonData)) {
        console.log(`📄 Processing flat array structure with ${jsonData.length} items`);
        
        jsonData.forEach((item: any, itemIndex: number) => {
          if (!item) return;
          
          const text = item.text || item.label || item.fieldName || item.key || '';
          const value = item.value || item.content || item.extractedText || '';
          
          if (text || value) {
            const cleanFieldName = text.replace(/[:]/g, '').trim() || `Field_${itemIndex}`;
            
            const fieldObj: ExtractedField = {
              key: cleanFieldName,
              value: value,
              confidence: item.confi_score || item.confidence || item.score || 0,
              path: `item_${itemIndex}`,
              position: { 
                x: item.x || item.left || 0, 
                y: item.y || item.top || 0 
              }
            };
            
            fields.push(fieldObj);
            console.log(`✅ Added extracted field from array: ${fieldObj.key} = "${fieldObj.value}"`);
          }
        });
      }
      // Handle nested object structure
      else if (typeof jsonData === 'object') {
        console.log('📄 Processing nested object structure');
        
        const extractFromObject = (obj: any, path: string = '') => {
          Object.entries(obj).forEach(([key, value]) => {
            const currentPath = path ? `${path}.${key}` : key;
            
            if (value && typeof value === 'object' && !Array.isArray(value)) {
              // Check if this object has text extraction properties
              if (value.hasOwnProperty('text') || value.hasOwnProperty('value')) {
                const text = (value as any).text || key;
                const val = (value as any).value || (value as any).content || '';
                
                if (text || val) {
                  const cleanFieldName = text.replace(/[:]/g, '').trim() || key;
                  
                  const fieldObj: ExtractedField = {
                    key: cleanFieldName,
                    value: val,
                    confidence: (value as any).confi_score || (value as any).confidence || 0,
                    path: currentPath,
                    position: { 
                      x: (value as any).x || (value as any).left || 0, 
                      y: (value as any).y || (value as any).top || 0 
                    }
                  };
                  
                  fields.push(fieldObj);
                  console.log(`✅ Added extracted field from object: ${fieldObj.key} = "${fieldObj.value}"`);
                }
              } else {
                // Recursively process nested objects
                extractFromObject(value, currentPath);
              }
            } else if (typeof value === 'string' || typeof value === 'number') {
              // Direct key-value pairs
              const fieldObj: ExtractedField = {
                key: key.replace(/[:]/g, '').trim(),
                value: String(value),
                confidence: 0,
                path: currentPath,
                position: { x: 0, y: 0 }
              };
              
              fields.push(fieldObj);
              console.log(`✅ Added direct field: ${fieldObj.key} = "${fieldObj.value}"`);
            }
          });
        };
        
        extractFromObject(jsonData);
      } else {
        console.log('⚠️ Unsupported JSON data format:', typeof jsonData);
      }
      
    } catch (error) {
      console.error('❌ Error extracting identified fields:', error);
      console.error('JSON data that caused error:', jsonData);
    }
    
    console.log('🔍 Final extracted fields:', fields);
    return fields;
  };

  // Advanced field matching algorithm - preserves ALL fields from BOTH sides regardless of count differences
  const performFieldMatching = (extractedFields: ExtractedField[], grammarFields: GrammarField[]): { [key: string]: MatchResult } => {
    console.log('🔄 Performing comprehensive field matching...');
    console.log('🔍 Input for matching:', {
      extractedFieldsCount: extractedFields.length,
      grammarFieldsCount: grammarFields.length,
      extractedFieldSample: extractedFields.slice(0, 3).map(f => ({ key: f.key, value: f.value })),
      grammarFieldSample: grammarFields.slice(0, 3).map(f => ({ key: f.key, xpath: f.xpath, isSection: f.isSection }))
    });
    
    const results: { [key: string]: MatchResult } = {};
    const usedGrammarFields = new Set<string>(); // Track which grammar fields have been used
    const usedExtractedFields = new Set<string>(); // Track which extracted fields have been used
    
    // Filter out sections from grammar fields for matching
    const nonSectionGrammarFields = grammarFields.filter(grammarField => !grammarField.isSection);
    
    console.log(`🔍 Processing ${extractedFields.length} extracted fields against ${nonSectionGrammarFields.length} grammar fields`);
    
    // Step 1: Find the best possible matches first (highest confidence)
    // Create all possible match combinations and sort by quality
    const allPossibleMatches: Array<{
      extractedField: ExtractedField;
      grammarField: GrammarField;
      confidence: number;
      status: string;
    }> = [];
    
    extractedFields.forEach(extractedField => {
      nonSectionGrammarFields.forEach(grammarField => {
        const comparison = compareFieldNames(extractedField.key, grammarField.key);
        if (comparison.confidence > 0) { // Any potential match
          allPossibleMatches.push({
            extractedField,
            grammarField,
            confidence: comparison.confidence,
            status: comparison.status
          });
        }
      });
    });
    
    // Sort by confidence (best matches first)
    allPossibleMatches.sort((a, b) => b.confidence - a.confidence);
    
    console.log(`🔍 Found ${allPossibleMatches.length} possible field combinations`);
    
    // Step 2: Assign the best matches first, avoiding conflicts
    allPossibleMatches.forEach(match => {
      const extractedAlreadyUsed = usedExtractedFields.has(match.extractedField.path);
      const grammarAlreadyUsed = usedGrammarFields.has(match.grammarField.path);
      
      // Only use this match if both fields are still available
      if (!extractedAlreadyUsed && !grammarAlreadyUsed) {
        // Mark both fields as used
        usedExtractedFields.add(match.extractedField.path);
        usedGrammarFields.add(match.grammarField.path);
        
        const matchResult: MatchResult = {
          status: match.status as 'exact' | 'partial' | 'none' | 'empty',
          confidence: match.confidence,
          extractedField: match.extractedField.key,
          grammarField: match.grammarField.key,
          extractedPath: match.extractedField.path,
          grammarPath: match.grammarField.path
        };
        
        results[match.extractedField.path] = matchResult;
        console.log(`✅ Matched "${match.extractedField.key}" -> "${match.grammarField.key}": ${match.confidence}% (${match.status})`);
      }
    });
    
    // Step 3: Add ALL remaining unmatched extracted fields (left side)
    extractedFields.forEach(extractedField => {
      if (!usedExtractedFields.has(extractedField.path)) {
        const matchResult: MatchResult = {
          status: 'none',
          confidence: 0,
          extractedField: extractedField.key,
          grammarField: '', // Will show "Unmapped Field"
          extractedPath: extractedField.path,
          grammarPath: extractedField.path // Use extracted path as unique key
        };
        
        results[extractedField.path] = matchResult;
        console.log(`⚠️ Unmatched extracted field: "${extractedField.key}"`);
      }
    });
    
    // Step 4: Add ALL remaining unmatched grammar fields (right side)
    nonSectionGrammarFields.forEach(grammarField => {
      if (!usedGrammarFields.has(grammarField.path)) {
        const matchResult: MatchResult = {
          status: 'none',
          confidence: 0,
          extractedField: '', // Will show "No extracted field"
          grammarField: grammarField.key,
          extractedPath: '',
          grammarPath: grammarField.path
        };
        
        results[grammarField.path] = matchResult;
        console.log(`⚠️ Unmatched grammar field: "${grammarField.key}"`);
      }
    });
    
    const totalExtracted = extractedFields.length;
    const totalGrammar = nonSectionGrammarFields.length;
    const totalMatched = allPossibleMatches.filter(m => 
      usedExtractedFields.has(m.extractedField.path) && usedGrammarFields.has(m.grammarField.path)
    ).length;
    const unmatchedExtracted = totalExtracted - usedExtractedFields.size;
    const unmatchedGrammar = totalGrammar - usedGrammarFields.size;
    
    console.log('🔄 Field matching completed. Results summary:', {
      totalResults: Object.keys(results).length,
      inputCounts: { extracted: totalExtracted, grammar: totalGrammar },
      matchedPairs: totalMatched,
      unmatchedExtracted: unmatchedExtracted,
      unmatchedGrammar: unmatchedGrammar,
      exactMatches: Object.values(results).filter(r => r.status === 'exact').length,
      partialMatches: Object.values(results).filter(r => r.status === 'partial').length,
      noMatches: Object.values(results).filter(r => r.status === 'none').length,
      preservation: `${totalExtracted} extracted + ${totalGrammar} grammar = ${totalExtracted + totalGrammar} total fields, showing ${Object.keys(results).length} results`
    });
    
    return results;
  };

  // Compare field names with intelligent semantic matching
  const compareFieldNames = (grammarName: string, extractedName: string) => {
    console.log(`🔍 Comparing: "${grammarName}" vs "${extractedName}"`);
    
    const grammar = normalizeFieldName(grammarName);
    const extracted = normalizeFieldName(extractedName);
    
    console.log(`🔍 Normalized: "${grammar}" vs "${extracted}"`);
    
    // Empty check
    if (!extracted.trim()) {
      console.log(`❌ Empty extracted field`);
      return { status: 'empty' as const, confidence: 0 };
    }
    
    // Exact match after normalization
    if (grammar === extracted) {
      console.log(`✅ Exact match after normalization`);
      return { status: 'exact' as const, confidence: 100 };
    }
    
    // Semantic similarity calculation using multiple advanced methods
    const semanticScore = calculateSemanticSimilarity(grammar, extracted);
    const tokenScore = calculateAdvancedTokenSimilarity(grammar, extracted);
    const substringScore = calculateSmartSubstringSimilarity(grammar, extracted);
    const stemScore = calculateStemSimilarity(grammar, extracted);
    
    console.log(`📊 Individual scores:`, {
      semantic: semanticScore,
      token: tokenScore,
      substring: substringScore,
      stem: stemScore
    });
    
    // Use weighted combination of all similarity methods - but also consider max score
    const weightedScore = (
      semanticScore * 0.4 +    // Semantic similarity gets highest weight
      tokenScore * 0.3 +       // Token matching is important
      substringScore * 0.2 +   // Substring matching
      stemScore * 0.1          // Stem matching for root words
    );
    
    // Take the maximum of weighted score and any individual high score
    const combinedScore = Math.max(
      weightedScore,
      semanticScore,  // Don't dilute high semantic scores
      tokenScore,     // Don't dilute high token scores
      substringScore  // Don't dilute high substring scores
    );
    
    console.log(`🎯 Final combined score: ${combinedScore}`);
    
    // More nuanced thresholds for better matching
    if (combinedScore >= 90) {
      console.log(`✅ EXACT MATCH: ${combinedScore}%`);
      return { status: 'exact' as const, confidence: Math.round(combinedScore) };
    } else if (combinedScore >= 65) {  // Lowered threshold for semantic matches
      console.log(`⚡ PARTIAL MATCH: ${combinedScore}%`);
      return { status: 'partial' as const, confidence: Math.round(combinedScore) };
    } else {
      console.log(`❌ NO MATCH: ${combinedScore}%`);
      return { status: 'none' as const, confidence: Math.round(combinedScore) };
    }
  };

  // Enhanced normalization for semantic matching
  const normalizeFieldName = (fieldName: string): string => {
    return fieldName
      .toLowerCase()
      .replace(/[-_]/g, ' ')     // Convert hyphens and underscores to spaces
      .replace(/[^\w\s]/g, '')   // Remove special characters
      .replace(/\s+/g, ' ')      // Normalize spaces
      .trim();
  };

  // Advanced semantic similarity with dynamic pattern recognition
  const calculateSemanticSimilarity = (str1: string, str2: string): number => {
    // Dynamic semantic analysis without hard-coded patterns
    
    // 1. Check for common word roots and stems
    const stemScore = calculateDynamicStemSimilarity(str1, str2);
    if (stemScore > 80) return stemScore;
    
    // 2. Analyze word containment and relationships
    const containmentScore = calculateDynamicContainment(str1, str2);
    if (containmentScore > 80) return containmentScore;
    
    // 3. Check for semantic word relationships
    const relationshipScore = calculateWordRelationships(str1, str2);
    if (relationshipScore > 70) return relationshipScore;
    
    // 4. Fall back to enhanced Levenshtein
    return calculateEnhancedLevenshtein(str1, str2);
  };

  // Dynamic stem similarity without hard-coded rules
  const calculateDynamicStemSimilarity = (str1: string, str2: string): number => {
    const words1 = str1.split(/\s+/);
    const words2 = str2.split(/\s+/);
    
    let totalSimilarity = 0;
    const maxComparisons = Math.max(words1.length, words2.length);
    
    for (let i = 0; i < maxComparisons; i++) {
      const word1 = words1[i] || '';
      const word2 = words2[i] || '';
      
      if (word1 && word2) {
        // Dynamic stem extraction (remove common suffixes)
        const stem1 = extractDynamicStem(word1);
        const stem2 = extractDynamicStem(word2);
        
        if (stem1 === stem2) {
          totalSimilarity += 90; // High score for same stem
        } else if (stem1.includes(stem2) || stem2.includes(stem1)) {
          totalSimilarity += 75; // Good score for stem containment
        }
      }
    }
    
    return maxComparisons > 0 ? totalSimilarity / maxComparisons : 0;
  };

  // Dynamic containment analysis
  const calculateDynamicContainment = (str1: string, str2: string): number => {
    const words1 = str1.split(/\s+/).filter(w => w.length > 2); // Filter out short words
    const words2 = str2.split(/\s+/).filter(w => w.length > 2);
    
    if (words1.length === 0 || words2.length === 0) return 0;
    
    // Check if one field is a subset/superset of another
    let containedWords = 0;
    const totalWords = Math.min(words1.length, words2.length);
    
    for (const word1 of words1) {
      for (const word2 of words2) {
        // Check various containment patterns
        if (word1 === word2) {
          containedWords += 1.0; // Exact match
        } else if (word1.includes(word2) || word2.includes(word1)) {
          const longer = word1.length > word2.length ? word1 : word2;
          const shorter = word1.length > word2.length ? word2 : word1;
          const ratio = shorter.length / longer.length;
          
          if (ratio > 0.6) { // Meaningful containment
            containedWords += 0.8;
          } else if (ratio > 0.4) {
            containedWords += 0.6;
          }
        }
      }
    }
    
    const score = (containedWords / totalWords) * 100;
    
    // Boost score for superset scenarios (e.g., "email" vs "email id")
    if (Math.abs(words1.length - words2.length) === 1 && score > 70) {
      return Math.min(95, score * 1.2);
    }
    
    return score;
  };

  // Analyze word relationships dynamically
  const calculateWordRelationships = (str1: string, str2: string): number => {
    const words1 = str1.split(/\s+/);
    const words2 = str2.split(/\s+/);
    
    // Check for common semantic relationships
    let relationshipScore = 0;
    
    // 1. Abbreviation detection
    const abbreviationScore = checkAbbreviationRelationship(words1, words2);
    relationshipScore = Math.max(relationshipScore, abbreviationScore);
    
    // 2. Compound word analysis
    const compoundScore = checkCompoundWordRelationship(str1, str2);
    relationshipScore = Math.max(relationshipScore, compoundScore);
    
    // 3. Semantic proximity (words that commonly appear together)
    const proximityScore = checkSemanticProximity(words1, words2);
    relationshipScore = Math.max(relationshipScore, proximityScore);
    
    return relationshipScore;
  };

  // Dynamic stem extraction without hard-coded suffixes
  const extractDynamicStem = (word: string): string => {
    if (word.length <= 3) return word;
    
    // Dynamic suffix detection based on word patterns
    const potentialSuffixes = [];
    
    // Extract potential suffixes (2-4 characters from the end)
    for (let len = 2; len <= Math.min(4, word.length - 2); len++) {
      potentialSuffixes.push(word.slice(-len));
    }
    
    // Return the longest meaningful stem
    for (const suffix of potentialSuffixes.sort((a, b) => b.length - a.length)) {
      const stem = word.slice(0, -suffix.length);
      if (stem.length >= 3) { // Ensure meaningful stem length
        return stem;
      }
    }
    
    return word;
  };

  // Check for abbreviation relationships
  const checkAbbreviationRelationship = (words1: string[], words2: string[]): number => {
    // Check if one set contains abbreviations of the other
    for (const word1 of words1) {
      for (const word2 of words2) {
        // Simple abbreviation check (first letters)
        if (word1.length <= 3 && word2.length > 3) {
          const firstLetters = word2.split('').filter((_, i) => i === 0 || word2[i-1] === ' ').join('');
          if (firstLetters.toLowerCase() === word1.toLowerCase()) {
            return 85;
          }
        }
        
        // Reverse check
        if (word2.length <= 3 && word1.length > 3) {
          const firstLetters = word1.split('').filter((_, i) => i === 0 || word1[i-1] === ' ').join('');
          if (firstLetters.toLowerCase() === word2.toLowerCase()) {
            return 85;
          }
        }
      }
    }
    
    return 0;
  };

  // Check compound word relationships
  const checkCompoundWordRelationship = (str1: string, str2: string): number => {
    // Remove common connecting words for compound analysis
    const cleanStr1 = str1.replace(/\b(of|the|and|or|in|on|at|to|for|with)\b/g, ' ').replace(/\s+/g, ' ').trim();
    const cleanStr2 = str2.replace(/\b(of|the|and|or|in|on|at|to|for|with)\b/g, ' ').replace(/\s+/g, ' ').trim();
    
    if (cleanStr1.includes(cleanStr2) || cleanStr2.includes(cleanStr1)) {
      const longer = cleanStr1.length > cleanStr2.length ? cleanStr1 : cleanStr2;
      const shorter = cleanStr1.length > cleanStr2.length ? cleanStr2 : cleanStr1;
      
      return (shorter.length / longer.length) * 85;
    }
    
    return 0;
  };

  // Check semantic proximity of words
  const checkSemanticProximity = (words1: string[], words2: string[]): number => {
    // Words that commonly appear together in document contexts
    const commonPairings = [
      ['name', 'id'], ['date', 'time'], ['start', 'end'], ['first', 'last'],
      ['phone', 'number'], ['email', 'address'], ['zip', 'code'],
      ['policy', 'number'], ['premium', 'amount'], ['effective', 'date']
    ];
    
    for (const [word1, word2] of commonPairings) {
      const hasWord1InFirst = words1.some(w => w.includes(word1) || word1.includes(w));
      const hasWord2InFirst = words1.some(w => w.includes(word2) || word2.includes(w));
      const hasWord1InSecond = words2.some(w => w.includes(word1) || word1.includes(w));
      const hasWord2InSecond = words2.some(w => w.includes(word2) || word2.includes(w));
      
      if ((hasWord1InFirst && hasWord2InSecond) || (hasWord2InFirst && hasWord1InSecond)) {
        return 75;
      }
    }
    
    return 0;
  };

  // Enhanced Levenshtein that considers semantic weight of operations
  const calculateEnhancedLevenshtein = (str1: string, str2: string): number => {
    const len1 = str1.length;
    const len2 = str2.length;
    
    if (len1 === 0) return len2 === 0 ? 100 : 0;
    if (len2 === 0) return 0;
    
    const matrix: number[][] = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(null));

    // Initialize matrix
    for (let i = 0; i <= len1; i++) matrix[0][i] = i;
    for (let j = 0; j <= len2; j++) matrix[j][0] = j;

    for (let j = 1; j <= len2; j++) {
      for (let i = 1; i <= len1; i++) {
        const char1 = str1[i - 1];
        const char2 = str2[j - 1];
        
        // Semantic-aware cost calculation
        let cost = 0;
        if (char1 !== char2) {
          // Lower cost for semantically similar character substitutions
          if ((char1 === ' ' && char2 === '_') || (char1 === '_' && char2 === ' ') ||
              (char1 === '-' && char2 === ' ') || (char1 === ' ' && char2 === '-')) {
            cost = 0.3; // Very low cost for space/underscore/hyphen substitutions
          } else if (char1.toLowerCase() === char2.toLowerCase()) {
            cost = 0.1; // Very low cost for case differences
          } else {
            cost = 1;
          }
        }
        
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,              // deletion
          matrix[j - 1][i] + 1,              // insertion
          matrix[j - 1][i - 1] + cost        // substitution with semantic cost
        );
      }
    }

    const maxLen = Math.max(len1, len2);
    return ((maxLen - matrix[len2][len1]) / maxLen) * 100;
  };

  // Advanced token similarity with semantic understanding
  const calculateAdvancedTokenSimilarity = (str1: string, str2: string): number => {
    const tokens1 = new Set(str1.split(/\s+/).filter(t => t.length > 0));
    const tokens2 = new Set(str2.split(/\s+/).filter(t => t.length > 0));
    
    // Handle single token vs multi-token scenarios
    if (tokens1.size === 1 && tokens2.size > 1) {
      const singleToken = Array.from(tokens1)[0];
      const hasMatch = Array.from(tokens2).some(token => 
        token.includes(singleToken) || singleToken.includes(token)
      );
      return hasMatch ? 85 : 0;
    }
    
    if (tokens2.size === 1 && tokens1.size > 1) {
      const singleToken = Array.from(tokens2)[0];
      const hasMatch = Array.from(tokens1).some(token => 
        token.includes(singleToken) || singleToken.includes(token)
      );
      return hasMatch ? 85 : 0;
    }
    
    // Standard Jaccard similarity for multi-token scenarios
    const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
    const union = new Set([...tokens1, ...tokens2]);
    
    if (union.size === 0) return 0;
    
    const jaccardScore = (intersection.size / union.size) * 100;
    
    // Boost score if there's strong token overlap
    if (intersection.size > 0 && intersection.size >= Math.min(tokens1.size, tokens2.size) * 0.7) {
      return Math.min(95, jaccardScore * 1.3);
    }
    
    return jaccardScore;
  };

  // Smart substring similarity with semantic context
  const calculateSmartSubstringSimilarity = (str1: string, str2: string): number => {
    const shorter = str1.length < str2.length ? str1 : str2;
    const longer = str1.length < str2.length ? str2 : str1;
    
    // Direct substring match
    if (longer.includes(shorter)) {
      const ratio = shorter.length / longer.length;
      // Higher score for meaningful substrings
      return ratio > 0.6 ? ratio * 95 : ratio * 80;
    }
    
    // Check for partial word matches
    const shorterWords = shorter.split(/\s+/);
    const longerWords = longer.split(/\s+/);
    
    let matchingWords = 0;
    for (const shortWord of shorterWords) {
      if (longerWords.some(longWord => longWord.includes(shortWord) || shortWord.includes(longWord))) {
        matchingWords++;
      }
    }
    
    if (matchingWords > 0) {
      const wordRatio = matchingWords / Math.max(shorterWords.length, longerWords.length);
      return wordRatio * 75; // Good score for partial word matches
    }
    
    return 0;
  };

  // Simple stem-based similarity
  const calculateStemSimilarity = (str1: string, str2: string): number => {
    const stem1 = simpleStem(str1);
    const stem2 = simpleStem(str2);
    
    if (stem1 === stem2) return 80;
    
    // Check if one stem is contained in the other
    if (stem1.includes(stem2) || stem2.includes(stem1)) {
      return 60;
    }
    
    return 0;
  };

  // Simple stemming function for common suffixes
  const simpleStem = (word: string): string => {
    const commonSuffixes = ['ing', 'ed', 'er', 'est', 'ly', 'tion', 'sion', 'ness', 'ment', 'able', 'ible'];
    let stemmed = word.toLowerCase();
    
    for (const suffix of commonSuffixes) {
      if (stemmed.endsWith(suffix) && stemmed.length > suffix.length + 2) {
        stemmed = stemmed.slice(0, -suffix.length);
        break;
      }
    }
    
    return stemmed;
  };

  // Update match results ONLY when grammar file is uploaded and we have both fields
  useEffect(() => {
    if (extractedFields.length > 0 && grammarFields.length > 0 && grammarFile) {
      // Only perform comparison if grammar file is actually uploaded
      console.log('🔄 Performing comprehensive field matching...');
      const results = performFieldMatching(extractedFields, grammarFields);
      setMatchResults(results);
    } else {
      // Clear match results if grammar file is not uploaded or no fields available
      setMatchResults({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extractedFields, grammarFields, grammarFile]);

  // Load grammar files on mount or project change - disabled to prevent cache rerendering
  // Users must manually upload grammar files each time
  useEffect(() => {
    // Clear any existing state when project changes
    if (currentProject) {
      setGrammarFile(null);
      setGrammarFields([]);
      setMatchResults({});
      setEditingXPath(null);
      setEditingValue('');
    }
  }, [currentProject]);

  // Fallback: Try to load data from IndexedDB if no identifiedJsonData is provided
  useEffect(() => {
    const loadFallbackData = async () => {
      // Only try fallback if we have no identifiedJsonData and we have IndexedDB access
      if (!identifiedJsonData && currentProject && indexedDBStorage.isInitialized) {
        try {
          console.log('🔄 BAPage: Attempting to load fallback data from IndexedDB');
          
          // Get all JSON data for the current project
          const projectFiles = await indexedDBStorage.getProjectFiles(currentProject.id);
          console.log('📁 Found', projectFiles.length, 'files in project for fallback data');
          
          // Look for JSON files or files with associated JSON data
          for (const file of projectFiles) {
            if (file.type === 'application/json' || file.name.endsWith('.json')) {
              try {
                let jsonContent: any = null;
                
                // Try to parse the content if it's a string
                if (typeof file.content === 'string') {
                  jsonContent = JSON.parse(file.content);
                } else if (file.content instanceof ArrayBuffer) {
                  const decoder = new TextDecoder();
                  const textContent = decoder.decode(file.content);
                  jsonContent = JSON.parse(textContent);
                }
                
                if (jsonContent) {
                  console.log('✅ BAPage: Loaded fallback JSON data from file:', file.name);
                  const fields = extractIdentifiedFields(jsonContent);
                  if (fields.length > 0) {
                    setExtractedFields(fields);
                    console.log('📋 BAPage: Successfully extracted', fields.length, 'fields from fallback data');
                    break; // Use the first valid JSON file found
                  }
                }
              } catch (parseError) {
                console.warn('⚠️ Failed to parse JSON from file:', file.name, parseError);
              }
            } else {
              // Check if this file has associated JSON data in IndexedDB
              try {
                const associatedJson = await indexedDBStorage.getJsonData(file.id);
                if (associatedJson) {
                  console.log('✅ BAPage: Found associated JSON data for file:', file.name);
                  const fields = extractIdentifiedFields(associatedJson);
                  if (fields.length > 0) {
                    setExtractedFields(fields);
                    console.log('📋 BAPage: Successfully extracted', fields.length, 'fields from associated JSON');
                    break;
                  }
                }
              } catch (jsonError) {
                console.log('📝 No associated JSON data for file:', file.name);
              }
            }
          }
        } catch (error) {
          console.error('❌ BAPage: Failed to load fallback data:', error);
        }
      }
    };

    // Only run fallback if we don't have identifiedJsonData after a short delay
    const fallbackTimeout = setTimeout(loadFallbackData, 500);
    
    return () => clearTimeout(fallbackTimeout);
  }, [currentProject, identifiedJsonData, indexedDBStorage.isInitialized]);

  // Extract fields from identified JSON data when it changes
  useEffect(() => {
    console.log('🔍 BAPage: identifiedJsonData received:', identifiedJsonData);
    console.log('🔍 BAPage: identifiedJsonData type:', typeof identifiedJsonData);
    console.log('🔍 BAPage: identifiedJsonData structure:', identifiedJsonData ? Object.keys(identifiedJsonData) : 'null');
    
    try {
      if (identifiedJsonData) {
        // Add more detailed logging
        if (identifiedJsonData.pages) {
          console.log('📄 Found pages structure with', identifiedJsonData.pages.length, 'pages');
          identifiedJsonData.pages.forEach((page: any, index: number) => {
            console.log(`📄 Page ${index + 1}:`, {
              hasTextItems: Array.isArray(page?.textItems),
              textItemsCount: page?.textItems?.length || 0,
              pageStructure: page ? Object.keys(page) : 'null'
            });
          });
        } else if (Array.isArray(identifiedJsonData)) {
          console.log('📄 Found flat array structure with', identifiedJsonData.length, 'items');
        } else {
          console.log('📄 Found object structure with keys:', Object.keys(identifiedJsonData));
        }
        
        const fields = extractIdentifiedFields(identifiedJsonData);
        setExtractedFields(fields);
        console.log('📋 Successfully extracted', fields.length, 'fields from JsonViewer');
        
        // Log first few fields for debugging
        if (fields.length > 0) {
          console.log('📋 Sample extracted fields:', fields.slice(0, 3));
        }
      } else {
        console.log('⚠️ BAPage: No identifiedJsonData provided - clearing extracted fields');
        setExtractedFields([]);
      }
    } catch (error) {
      console.error('❌ BAPage: Error processing identifiedJsonData:', error);
      console.error('❌ BAPage: Problematic data:', identifiedJsonData);
      setExtractedFields([]);
    }
  }, [identifiedJsonData]);

  // Parse grammar file when it changes
  useEffect(() => {
    if (grammarFile && grammarFile.content) {
      try {
        const jsonContent = typeof grammarFile.content === 'string' 
          ? JSON.parse(grammarFile.content)
          : grammarFile.content;
        
        const { fields, sections } = parseGrammarFile(jsonContent);
        setGrammarFields(fields);
        console.log('📋 Parsed structure fields:', fields);
        console.log('📁 Parsed structure sections:', sections);
      } catch (error) {
        console.error('❌ Failed to parse grammar JSON:', error);
        setGrammarFields([]);
      }
    } else {
      setGrammarFields([]);
    }
  }, [grammarFile]);

  // Handle file upload
  const handleFileUpload = async (files: FileList) => {
    if (files.length === 0 || !currentProject) return;
    
    setIsUploading(true);
    const file = files[0];
    
    try {
      const content = await new Promise<string | ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result!);
        reader.onerror = reject;

        if (file.type.startsWith('text') || file.type === 'application/json') {
          reader.readAsText(file);
        } else {
          reader.readAsArrayBuffer(file);
        }
      });

      const fileData: FileData = {
        id: Math.random().toString(36).slice(2),
        name: file.name,
        type: file.type,
        size: file.size,
        lastModified: file.lastModified,
        content,
      };

      // Store in IndexedDB
      if (indexedDBStorage.isInitialized) {
        try {
          await indexedDBStorage.storeComparisonFile(fileData, currentProject.id, 'BA');
          console.log('BA structure file stored in IndexedDB:', file.name);
        } catch (dbError) {
          console.warn('Failed to store grammar file in IndexedDB:', dbError);
        }
      }

      setGrammarFile(fileData);
    } catch (error) {
      console.error('Error uploading file:', error);
    } finally {
      setIsUploading(false);
    }
  };

  // Handle file removal - clear everything to prevent cache rerendering
  const handleRemoveFile = () => {
    setGrammarFile(null);
    setGrammarFields([]);
    setMatchResults({});
    setEditingXPath(null);
    setEditingValue('');
    
    // Reset file input to prevent reloading
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle xpath editing
  const handleXPathDoubleClick = (fieldPath: string, currentXPath: string, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setEditingXPath(fieldPath);
    setEditingValue(currentXPath);
  };

  // Validate a single field with updated XPath against extracted fields
  const validateSingleField = (updatedField: GrammarField): MatchResult | null => {
    console.log('🔄 Validating single field:', updatedField.key, 'with XPath:', updatedField.xpath);
    
    if (!extractedFields || extractedFields.length === 0) {
      console.log('⚠️ No extracted fields available for validation');
      return null;
    }

    // Skip sections in validation
    if (updatedField.isSection) {
      console.log('⏭️ Skipping section field validation:', updatedField.key);
      return null;
    }

    // First check if there's an extracted field with a matching XPath
    const exactXPathMatch = extractedFields.find(extractedField => extractedField.path === updatedField.xpath);
    
    if (exactXPathMatch) {
      console.log(`✅ Found exact XPath match: "${updatedField.xpath}" -> "${exactXPathMatch.key}"`);
      
      // Now check if the field names match too
      const comparison = compareFieldNames(updatedField.key, exactXPathMatch.key);
      
      const result: MatchResult = {
        status: comparison.status,
        confidence: comparison.confidence,
        extractedField: exactXPathMatch.key,
        grammarField: updatedField.key,
        extractedPath: exactXPathMatch.path,
        grammarPath: updatedField.path
      };
      
      console.log(`🔍 XPath validation result for "${updatedField.key}":`, result);
      return result;
    } else {
      console.log(`❌ No extracted field found with XPath: "${updatedField.xpath}"`);
      
      // XPath doesn't match any extracted field - this should show as no match
      const result: MatchResult = {
        status: 'none',
        confidence: 0,
        extractedField: '',
        grammarField: updatedField.key,
        extractedPath: '',
        grammarPath: updatedField.path
      };
      
      console.log(`🔍 XPath validation result for "${updatedField.key}":`, result);
      return result;
    }
  };

  const handleXPathSave = () => {
    if (!editingXPath) return;
    
    // Find the field being edited
    const fieldBeingEdited = grammarFields.find(field => field.path === editingXPath);
    if (!fieldBeingEdited) {
      console.log('⚠️ Could not find field being edited');
      setEditingXPath(null);
      setEditingValue('');
      return;
    }

    // Create updated field with new XPath
    const updatedField: GrammarField = {
      ...fieldBeingEdited,
      xpath: editingValue
    };

    console.log('🔄 XPath updated for field:', updatedField.key, 'New XPath:', editingValue);
    
    // Show validation in progress
    setValidatingField(updatedField.path);
    
    // Update grammar fields
    setGrammarFields(prevFields => 
      prevFields.map(field => 
        field.path === editingXPath 
          ? updatedField
          : field
      )
    );

    // Immediately validate this specific field
    const validationResult = validateSingleField(updatedField);
    
    if (validationResult) {
      console.log('✅ Updating match results for field:', updatedField.path);
      setMatchResults(prevResults => ({
        ...prevResults,
        [validationResult.extractedPath]: validationResult
      }));
    } else {
      console.log('❌ No valid match found, removing from results');
      // Remove this field's match results if no valid match found
      setMatchResults(prevResults => {
        const newResults = { ...prevResults };
        // Find and remove any results that reference this grammar field
        Object.keys(newResults).forEach(key => {
          if (newResults[key].grammarPath === updatedField.path) {
            delete newResults[key];
          }
        });
        return newResults;
      });
    }
    
    // Clear validation state
    setTimeout(() => setValidatingField(null), 500); // Brief delay to show validation happened
    
    setEditingXPath(null);
    setEditingValue('');
  };

  const handleXPathCancel = () => {
    setEditingXPath(null);
    setEditingValue('');
  };

  const handleXPathChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setEditingValue(newValue);
    
    // Optional: Real-time validation while typing (debounced)
    // You can uncomment this if you want validation while typing
    /*
    if (!editingXPath) return;
    
    const fieldBeingEdited = grammarFields.find(field => field.path === editingXPath);
    if (fieldBeingEdited) {
      const updatedField: GrammarField = {
        ...fieldBeingEdited,
        xpath: newValue
      };
      
      // Validate immediately while typing
      const validationResult = validateSingleField(updatedField);
      if (validationResult) {
        setMatchResults(prevResults => ({
          ...prevResults,
          [validationResult.extractedPath]: validationResult
        }));
      }
    }
    */
  };

  const handleXPathKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleXPathSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleXPathCancel();
    }
  };
  // Render match status icon
  const renderMatchIcon = (result: MatchResult) => {
    console.log('🎨 Rendering match icon for result:', result);
    
    switch (result.status) {
      case 'exact':
        return (
          <div title={`Exact match (${result.confidence}%)`} className="match-status-wrapper">
            <CheckCircle size={16} className="match-icon exact" />
          </div>
        );
      case 'partial':
        return (
          <div title={`Partial match (${result.confidence}%)`} className="match-status-wrapper">
            <AlertCircle size={16} className="match-icon partial" />
          </div>
        );
      case 'none':
        return (
          <div title="No match" className="match-status-wrapper">
            <XCircle size={16} className="match-icon none" />
          </div>
        );
      case 'empty':
      default:
        return (
          <div title="Field is empty" className="match-status-wrapper">
            <XCircle size={16} className="match-icon empty" />
          </div>
        );
    }
  };



  return (
    <div className="ba-page">
      {/* Main Content Area */}
      <div className="ba-page-content">
        {/* Single scrollable section with side-by-side fields */}
        <div className="fields-comparison-container">
          <div className="comparison-header">
            <div className="main-header">
              <h3>{labels.pageTitle}</h3>
              <div className="upload-section-compact">
                {grammarFile ? (
                  <div className="uploaded-file-compact">
                    <span className="file-name-compact">{grammarFile.name}</span>
                    <button
                      className="remove-btn-compact"
                      onClick={handleRemoveFile}
                      title="Remove file"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <button
                    className="upload-btn-compact"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    <Upload size={12} />
                    {isUploading ? 'Uploading...' : labels.uploadButton}
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  title="Upload structure file"
                  onChange={(e) => {
                    if (e.target.files) {
                      handleFileUpload(e.target.files);
                    }
                  }}
                  className="file-input-hidden"
                />
              </div>
            </div>
          </div>

          <div className="stats-bar">
            <div className="stats-left">
              <div className="stat-item">
                <span className="stat-number">{Object.keys(matchResults).length}</span>
                <span className="stat-label">Total Fields</span>
              </div>
              <div className="stat-divider">|</div>
              <div className="stat-item exact">
                <span className="stat-number">{Object.values(matchResults).filter(r => r.status === 'exact').length}</span>
                <span className="stat-label">Exact</span>
              </div>
              <div className="stat-divider">|</div>
              <div className="stat-item partial">
                <span className="stat-number">{Object.values(matchResults).filter(r => r.status === 'partial').length}</span>
                <span className="stat-label">Partial</span>
              </div>
              <div className="stat-divider">|</div>
              <div className="stat-item not-found">
                <span className="stat-number">{Object.values(matchResults).filter(r => r.status === 'none').length}</span>
                <span className="stat-label">No Match</span>
              </div>
            </div>
            <div className="stats-right">
              {Object.keys(matchResults).length > 0 && (
                <>
                  <div className="match-rate">
                    <span className="rate-percentage">{Math.round(((Object.values(matchResults).filter(r => r.status === 'exact').length + Object.values(matchResults).filter(r => r.status === 'partial').length) / Object.keys(matchResults).length) * 100)}%</span>
                    <span className="rate-label">Match Rate</span>
                  </div>
                  <div className="progress-bar">
                    <div 
                      className={`progress-fill exact progress-${Math.round((Object.values(matchResults).filter(r => r.status === 'exact').length / Object.keys(matchResults).length) * 10) * 10}`}
                    ></div>
                    <div 
                      className={`progress-fill partial progress-${Math.round((Object.values(matchResults).filter(r => r.status === 'partial').length / Object.keys(matchResults).length) * 10) * 10}`}
                    ></div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Sticky Column Headers */}
          {(extractedFields.length > 0 || grammarFields.length > 0) && (
            <div className="column-headers">
              <div className="extracted-header">Extracted Fields</div>
              <div className="comparison-header-right">Path</div>
            </div>
          )}

          {/* Show All Fields Side by Side */}
          {extractedFields.length > 0 ? (
            <div className="fields-comparison-list">
              {/* If we have match results (comparison done), show them ALL */}
              {Object.keys(matchResults).length > 0 ? (
                Object.entries(matchResults).map(([resultKey, matchResult]) => {
                  // Find the grammar field object for additional details
                  const grammarField = grammarFields.find(gf => 
                    gf.path === matchResult.grammarPath && !gf.isSection
                  );

                  return (
                    <div key={resultKey} className={`field-comparison-row status-${matchResult.status}`}>
                      {/* LEFT SIDE - Extracted Field (1/3 width) */}
                      <div className="extracted-field">
                        <div className="field-info">
                          {matchResult.extractedField ? (
                            <span className="field-name">{matchResult.extractedField}</span>
                          ) : (
                            <span className="field-name empty">— No extracted field</span>
                          )}
                        </div>
                      </div>

                      {/* RIGHT SIDE - Comparison Result (redesigned layout) */}
                      <div className="comparison-result">
                        {/* LEFT: Icon and Percentage */}
                        <div className="field-match">
                          {renderMatchIcon(matchResult)}
                          {matchResult.confidence > 0 && (
                            <span className="confidence">{matchResult.confidence}%</span>
                          )}
                        </div>
                        
                        {/* MIDDLE: Field Name and XPath (Two Column Layout) */}
                        <div className="identified-content">
                          {/* Always show xpath section - create placeholder if no grammarField */}
                          <>
                            {/* Section 1: Field Name + Status Column */}
                            <div className="field-name-row">
                              <div className="field-name-with-status">
                                <span className={`field-name ${grammarField?.isSection ? 'section-name' : ''}`}>
                                  {matchResult.grammarField || 'Unmapped Field'}
                                </span>
                                <div className="match-status">
                                  {matchResult.grammarField ? (
                                    <>
                                      {matchResult.status === 'exact' && '✓ Exact Match'}
                                      {matchResult.status === 'partial' && `≈ ${matchResult.confidence}%`}
                                      {matchResult.status === 'none' && matchResult.extractedField && !matchResult.grammarField && '✗ No field to compare'}
                                      {matchResult.status === 'none' && !matchResult.extractedField && matchResult.grammarField && '✗ No extracted field'}
                                      {matchResult.status === 'none' && !matchResult.extractedField && !matchResult.grammarField && '✗ No Match'}
                                    </>
                                  ) : (
                                    <span className="status-unmapped">⚪ Add XPath to map</span>
                                  )}
                                </div>
                              </div>
                              <span className="field-separator">|</span>
                            </div>
                            
                            {/* Section 2: Field Details Column */}
                            <div className="field-details-column">
                              <div className={`xpath-container ${editingXPath === matchResult.grammarPath ? 'editing' : ''}`}>
                                {editingXPath === matchResult.grammarPath ? (
                                  <div className="xpath-input-container">
                                    <input
                                      type="text"
                                      value={editingValue}
                                      onChange={handleXPathChange}
                                      onKeyDown={handleXPathKeyPress}
                                      onBlur={handleXPathSave}
                                      className={`xpath-editor ${validatingField === matchResult.grammarPath ? 'validating' : ''}`}
                                      title="Edit XPath (Press Enter to save, Escape to cancel)"
                                      placeholder="Enter XPath"
                                      autoFocus
                                    />
                                    {validatingField === matchResult.grammarPath && (
                                      <span className="validation-indicator">🔄</span>
                                    )}
                                  </div>
                                ) : (
                                  <span 
                                    className="target-value editable" 
                                    onDoubleClick={(e) => handleXPathDoubleClick(matchResult.grammarPath, grammarField?.xpath || '', e)}
                                    title={`Full XPath: ${grammarField?.xpath || 'No XPath'}\n\nDouble-click to edit xpath`}
                                  >
                                    <span className="xpath-display">
                                      {grammarField?.xpath || 'No XPath - Click to add'}
                                    </span>
                                  </span>
                                )}
                                {grammarField?.parentSection && (
                                  <span className="field-section">({grammarField.parentSection})</span>
                                )}
                              </div>
                            </div>
                          </>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                /* If no match results yet (no grammar file), show extracted fields only */
                extractedFields.map((field, index) => (
                  <div key={field.path || index} className="field-comparison-row status-none">
                    {/* LEFT SIDE - Extracted Field */}
                    <div className="extracted-field">
                      <div className="field-info">
                        <span className="field-name">{field.key}</span>
                        {field.value && (
                          <div className="field-value" title={`Value: ${field.value}`}>
                            {String(field.value).length > 50 
                              ? `${String(field.value).substring(0, 50)}...` 
                              : String(field.value)
                            }
                          </div>
                        )}
                        {field.confidence !== undefined && field.confidence > 0 && (
                          <div className="field-confidence">Confidence: {field.confidence}%</div>
                        )}
                      </div>
                    </div>

                    {/* RIGHT SIDE - Waiting for grammar file */}
                    <div className="comparison-result">

                      <div className="identified-content">
                        <span className="field-name empty">{labels.waitingStatus}</span>
                      </div>
                      
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="empty-state">
              <Upload size={32} className="empty-icon" />
              <p>Upload a structure JSON file and load extracted data to compare fields</p>
              <p className="empty-subtitle">
                Left panel shows extracted fields, right panel shows structure file
              </p>
              
              {/* Debug Information */}
              {(identifiedJsonData || currentProject) && (
                <div className="debug-info" style={{ 
                  marginTop: '20px', 
                  padding: '15px', 
                  backgroundColor: '#f5f5f5', 
                  borderRadius: '8px',
                  fontSize: '12px',
                  textAlign: 'left',
                  maxWidth: '600px'
                }}>
                  <h4 style={{ margin: '0 0 10px 0' }}>Debug Information:</h4>
                  
                  <div><strong>Project:</strong> {currentProject?.name || 'None'}</div>
                  <div><strong>Project Type:</strong> {currentProject?.type || 'None'}</div>
                  
                  <div style={{ marginTop: '10px' }}>
                    <strong>Identified JSON Data:</strong> {identifiedJsonData ? 'Available' : 'Not Available'}
                  </div>
                  
                  {identifiedJsonData && (
                    <div style={{ marginLeft: '10px' }}>
                      <div>Type: {typeof identifiedJsonData}</div>
                      <div>Is Array: {Array.isArray(identifiedJsonData) ? 'Yes' : 'No'}</div>
                      {typeof identifiedJsonData === 'object' && (
                        <div>Keys: {Object.keys(identifiedJsonData).join(', ')}</div>
                      )}
                      {identifiedJsonData.pages && (
                        <div>Pages: {identifiedJsonData.pages.length}</div>
                      )}
                      {identifiedJsonData.pages?.[0]?.textItems && (
                        <div>Text Items in Page 1: {identifiedJsonData.pages[0].textItems.length}</div>
                      )}
                    </div>
                  )}
                  
                  <div style={{ marginTop: '10px' }}>
                    <strong>Extracted Fields:</strong> {extractedFields.length}
                  </div>
                  
                  <div style={{ marginTop: '10px' }}>
                    <strong>Grammar Fields:</strong> {grammarFields.length}
                  </div>
                  
                  {extractedFields.length === 0 && identifiedJsonData && (
                    <div style={{ marginTop: '10px', color: '#d32f2f' }}>
                      <strong>Issue:</strong> JSON data is available but no fields were extracted. 
                      Check the data structure in the browser console.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>  
    </div>
  );
}