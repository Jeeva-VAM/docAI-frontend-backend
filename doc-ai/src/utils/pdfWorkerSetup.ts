export const setupPdfWorker = async () => {
  if (typeof window === 'undefined') return;
  
  const pdfjsLib = await import('pdfjs-dist');
  
  // Try different worker configurations
  try {
    // First try: Use local worker from node_modules
    const workerUrl = new URL(
      '../node_modules/pdfjs-dist/build/pdf.worker.min.js', 
      window.location.origin
    ).href;
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  } catch {
    // Fallback: Use CDN
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.js`;
  }
  
  return pdfjsLib;
};