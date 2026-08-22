/**
 * PESTNEER — Universal High-Performance Image & Document Compression Engine
 * Compatible with all mobile (iOS Safari, Android Chrome, WebView) and desktop browsers.
 */

export type ImageCompressionOptions = {
  /** Maximum width or height in pixels (default: 1600 for crisp inspection detail) */
  maxDimension?: number;
  /** Compression quality between 0.1 and 1.0 (default: 0.82) */
  quality?: number;
  /** Preferred mime type ('image/webp' with automatic 'image/jpeg' fallback) */
  mimeType?: 'image/webp' | 'image/jpeg' | 'image/png';
  /** If true and image has transparency, keeps PNG/WebP alpha */
  preserveTransparency?: boolean;
};

const DEFAULT_OPTIONS: Required<ImageCompressionOptions> = {
  maxDimension: 1600,
  quality: 0.82,
  mimeType: 'image/webp',
  preserveTransparency: true,
};

/**
 * Compresses a single image file or blob in-memory with high fidelity.
 * Non-image files (PDF, DOC, etc.) are returned untouched.
 */
export async function compressImage(
  file: File | Blob,
  options?: ImageCompressionOptions
): Promise<File> {
  const isFile = file instanceof File;
  const fileName = isFile ? file.name : 'image.webp';
  const fileType = file.type.toLowerCase();

  // If not an image, return original file without modifying
  if (!fileType.startsWith('image/')) {
    return isFile ? file : new File([file], fileName, { type: file.type });
  }

  // If SVG or small animated GIF, return as is
  if (fileType.includes('svg') || fileType.includes('gif')) {
    return isFile ? file : new File([file], fileName, { type: file.type });
  }

  const opts: Required<ImageCompressionOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  try {
    const bitmap = await loadImageElement(file);
    const { width, height } = calculateDimensions(bitmap.width, bitmap.height, opts.maxDimension);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) {
      return isFile ? file : new File([file], fileName, { type: file.type });
    }

    // High quality scaling
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(bitmap, 0, 0, width, height);

    // Determine target MIME type
    let targetMime = opts.mimeType;
    if (opts.preserveTransparency && fileType.includes('png')) {
      targetMime = 'image/webp'; // WebP supports transparency with 90% better compression than PNG
    }

    let blob = await exportCanvasBlob(canvas, targetMime, opts.quality);

    // Fallback to JPEG if WebP is unsupported or export failed
    if (!blob || blob.size === 0) {
      targetMime = 'image/jpeg';
      blob = await exportCanvasBlob(canvas, targetMime, opts.quality);
    }

    if (!blob || blob.size === 0) {
      return isFile ? file : new File([file], fileName, { type: file.type });
    }

    // If original file is already smaller than compressed result, keep original
    if (isFile && file.size <= blob.size && width === bitmap.width && height === bitmap.height) {
      return file;
    }

    // Format new file name with appropriate extension
    const baseName = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
    const ext = targetMime === 'image/webp' ? '.webp' : targetMime === 'image/jpeg' ? '.jpg' : '.png';
    const outputName = `${baseName}${ext}`;

    return new File([blob], outputName, {
      type: targetMime,
      lastModified: Date.now(),
    });
  } catch (error) {
    console.warn('[Pestneer ImageCompression] Fallback to original file:', error);
    return isFile ? file : new File([file], fileName, { type: file.type });
  }
}

/**
 * Batch compresses images with bounded concurrency to avoid decoding several
 * full-resolution mobile photos into memory at the same time.
 */
export async function compressImages(
  files: File[],
  options?: ImageCompressionOptions
): Promise<File[]> {
  if (!files || files.length === 0) return [];
  const results = new Array<File>(files.length);
  let nextIndex = 0;
  const workerCount = Math.min(2, files.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < files.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await compressImage(files[index], options);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Compresses a base64 or Data URL image.
 */
export async function compressDataUrl(
  dataUrl: string,
  options?: ImageCompressionOptions
): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const compressed = await compressImage(blob, options);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(compressed);
  });
}

function calculateDimensions(
  srcWidth: number,
  srcHeight: number,
  maxDimension: number
): { width: number; height: number } {
  if (srcWidth <= maxDimension && srcHeight <= maxDimension) {
    return { width: srcWidth, height: srcHeight };
  }

  if (srcWidth > srcHeight) {
    const width = maxDimension;
    const height = Math.round((srcHeight * maxDimension) / srcWidth);
    return { width, height };
  } else {
    const height = maxDimension;
    const width = Math.round((srcWidth * maxDimension) / srcHeight);
    return { width, height };
  }
}

function loadImageElement(source: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(source);
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };

    img.src = url;
  });
}

function exportCanvasBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob(
        (blob) => resolve(blob),
        mimeType,
        quality
      );
    } catch {
      resolve(null);
    }
  });
}
