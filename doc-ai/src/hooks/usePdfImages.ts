import { useEffect, useState } from "react";

export function usePdfImages(fileId: string | undefined) {
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!fileId) return;
    setLoading(true);
    fetch(`/api/files/${fileId}/images`)
      .then(res => res.json())
      .then(data => setImages(data.images || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [fileId]);

  return { images, loading, error };
}
