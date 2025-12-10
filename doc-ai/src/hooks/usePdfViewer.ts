import { useState, useCallback } from 'react';

export const usePdfViewer = () => {
  const [pdfPages, setPdfPages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updatePdfPages = useCallback((pages: string[]) => {
    setPdfPages(pages);
    setCurrentPage(1);
    setError(null);
  }, []);

  const goToPage = useCallback((pageNumber: number) => {
    if (pageNumber >= 1 && pageNumber <= pdfPages.length) {
      setCurrentPage(pageNumber);
    }
  }, [pdfPages.length]);

  const nextPage = useCallback(() => {
    setCurrentPage(prev => Math.min(prev + 1, pdfPages.length));
  }, [pdfPages.length]);

  const previousPage = useCallback(() => {
    setCurrentPage(prev => Math.max(prev - 1, 1));
  }, []);

  // Zoom functions are now handled internally by PdfViewer
  const zoomIn = useCallback(() => {
    // No-op, handled by PdfViewer component
  }, []);

  const zoomOut = useCallback(() => {
    // No-op, handled by PdfViewer component
  }, []);

  const resetZoom = useCallback(() => {
    // No-op, handled by PdfViewer component
  }, []);

  const setLoading = useCallback((loading: boolean) => {
    setIsLoading(loading);
  }, []);

  const setPdfError = useCallback((errorMessage: string) => {
    setError(errorMessage);
  }, []);

  const clearPdf = useCallback(() => {
    setPdfPages([]);
    setCurrentPage(1);
    setError(null);
  }, []);

  return {
    pdfPages,
    currentPage,
    isLoading,
    error,
    totalPages: pdfPages.length,
    updatePdfPages,
    goToPage,
    nextPage,
    previousPage,
    zoomIn,
    zoomOut,
    resetZoom,
    setLoading,
    setPdfError,
    clearPdf,
  };
};