import { usePdfImages } from "../../hooks/usePdfImages";

export function PdfViewerAsImages({ fileId }: { fileId: string }) {
  const { images, loading, error } = usePdfImages(fileId);

  if (loading) return <div>Loading PDF pages...</div>;
  if (error) return <div>Error loading PDF images: {error}</div>;
  if (!images.length) return <div>No images found for this PDF.</div>;

  return (
    <div className="pdf-image-viewer">
      {images.map((url, idx) => (
        <img
          key={url}
          src={url}
          alt={`PDF page ${idx + 1}`}
          style={{ width: "100%", marginBottom: 16 }}
        />
      ))}
    </div>
  );
}
