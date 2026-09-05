// Share pending decodes between background warmup and an active generation.
const imageLoads = new Map<string, Promise<void>>();

export function preloadImage(url: string): Promise<void> {
  const cached = imageLoads.get(url);
  if (cached) return cached;

  const image = new Image();
  image.src = url;
  const ready = image.decode().catch((error: unknown) => {
    // Failed images remain retryable and must not leave generation permanently busy.
    imageLoads.delete(url);
    console.warn(`Unable to load image: ${url}`, error);
  });
  imageLoads.set(url, ready);
  return ready;
}

export function warmImages(urls: string[]): () => void {
  let cancelled = false;
  let next = 0;
  const loadNext = async () => {
    while (!cancelled && next < urls.length) {
      await preloadImage(urls[next++]);
    }
  };

  void Promise.all(Array.from({ length: 4 }, loadNext));
  return () => {
    // Stop scheduling; in-flight requests may still be needed by the next generation.
    cancelled = true;
  };
}
