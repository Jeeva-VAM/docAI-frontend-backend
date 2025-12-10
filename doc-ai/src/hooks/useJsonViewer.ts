import { useState, useCallback } from 'react';
import type { JsonData } from '../types';

export const useJsonViewer = () => {
  const [jsonData, setJsonData] = useState<JsonData | null>(null);
  const [viewMode, setViewMode] = useState<'json' | 'form'>('form');
  const [error, setError] = useState<string | null>(null);

  const updateJsonData = useCallback((data: JsonData) => {
    setJsonData(data);
    setError(null);
  }, []);

  const toggleViewMode = useCallback(() => {
    setViewMode(prev => prev === 'json' ? 'form' : 'json');
  }, []);

  const clearJsonData = useCallback(() => {
    setJsonData(null);
    setError(null);
  }, []);

  const setJsonError = useCallback((errorMessage: string) => {
    setError(errorMessage);
  }, []);

  return {
    jsonData,
    viewMode,
    error,
    updateJsonData,
    toggleViewMode,
    clearJsonData,
    setJsonError,
  };
};