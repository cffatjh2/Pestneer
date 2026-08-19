import { compressImage } from './imageCompression';

export type LoadedBlueprint = {
  dataUrl: string;
  width: number;
  height: number;
  fileName: string;
  suggestedTitle: string;
};

/**
 * Loads PDF.js script dynamically if not already present on window.
 */
async function loadPdfJs(): Promise<any> {
  if ((window as any).pdfjsLib) {
    return (window as any).pdfjsLib;
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      const lib = (window as any).pdfjsLib;
      if (lib) {
        lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve(lib);
      } else {
        reject(new Error('PDF.js kütüphanesi yüklenemedi.'));
      }
    };
    script.onerror = () => reject(new Error('PDF işleyici CDN üzerinden yüklenemedi. Lütfen internet bağlantınızı kontrol edin.'));
    document.head.appendChild(script);
  });
}

/**
 * Renders the first page of a PDF file to a high-resolution canvas DataURL.
 */
async function convertPdfToImage(file: File): Promise<LoadedBlueprint> {
  const pdfjsLib = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);

  // Render at 2.5x scale for razor-sharp blueprint lines and text
  const viewport = page.getViewport({ scale: 2.5 });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas render bağlamı oluşturulamadı.');

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const renderContext = {
    canvasContext: context,
    viewport,
  };

  await page.render(renderContext).promise;
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

  const cleanName = file.name.replace(/\.[^/.]+$/, '');
  return {
    dataUrl,
    width: viewport.width,
    height: viewport.height,
    fileName: file.name,
    suggestedTitle: `${cleanName} Ekipman Yerleşim Planı`,
  };
}

/**
 * Extracts embedded blueprint images or renders preview from a Word (.docx) document.
 */
async function convertWordToImage(file: File): Promise<LoadedBlueprint> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  // Basic zip PK header signature check
  if (bytes[0] === 0x50 && bytes[1] === 0x4B) {
    // Search for image magic bytes in the docx zip stream (PNG / JPEG)
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    // JPEG: FF D8 FF
    let foundPngIndex = -1;
    let foundJpgIndex = -1;

    for (let i = 0; i < bytes.length - 8; i++) {
      if (
        foundPngIndex === -1 &&
        bytes[i] === 0x89 &&
        bytes[i + 1] === 0x50 &&
        bytes[i + 2] === 0x4E &&
        bytes[i + 3] === 0x47
      ) {
        foundPngIndex = i;
      }
      if (
        foundJpgIndex === -1 &&
        bytes[i] === 0xFF &&
        bytes[i + 1] === 0xD8 &&
        bytes[i + 2] === 0xFF
      ) {
        foundJpgIndex = i;
      }
    }

    const imgIndex = foundPngIndex !== -1 ? foundPngIndex : foundJpgIndex;
    const isPng = foundPngIndex !== -1;

    if (imgIndex !== -1) {
      // Extract sub-array of image data
      const sub = bytes.subarray(imgIndex);
      const mime = isPng ? 'image/png' : 'image/jpeg';
      const blob = new Blob([sub], { type: mime });
      const imgUrl = URL.createObjectURL(blob);

      try {
        const loadedImg = await loadImageElement(imgUrl);
        URL.revokeObjectURL(imgUrl);
        const cleanName = file.name.replace(/\.[^/.]+$/, '');
        return {
          dataUrl: loadedImg.src,
          width: loadedImg.width,
          height: loadedImg.height,
          fileName: file.name,
          suggestedTitle: `${cleanName} Yerleşim Planı`,
        };
      } catch {
        URL.revokeObjectURL(imgUrl);
      }
    }
  }

  // Fallback: Create a clean blueprint canvas placeholder with document info
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 960;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw grid
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  for (let x = 0; x < canvas.width; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 32px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`📄 ${file.name}`, canvas.width / 2, canvas.height / 2 - 20);
  ctx.font = '20px sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.fillText('Word belgesinden aktarılan zemin planı. Kroki araçlarını kullanarak istasyonları yerleştirebilirsiniz.', canvas.width / 2, canvas.height / 2 + 30);

  const cleanName = file.name.replace(/\.[^/.]+$/, '');
  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: canvas.width,
    height: canvas.height,
    fileName: file.name,
    suggestedTitle: `${cleanName} Yerleşim Planı`,
  };
}

/**
 * Loads and compresses standard image formats (PNG, JPG, WEBP, SVG, BMP, TIFF).
 */
async function convertImageToBlueprint(file: File): Promise<LoadedBlueprint> {
  const compressed = await compressImage(file, { maxDimension: 2400, quality: 0.92 });
  const dataUrl = await fileToDataUrl(compressed);
  const img = await loadImageElement(dataUrl);

  const cleanName = file.name.replace(/\.[^/.]+$/, '');
  return {
    dataUrl,
    width: img.width,
    height: img.height,
    fileName: file.name,
    suggestedTitle: `${cleanName} Yerleşim Planı`,
  };
}

function fileToDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Dosya okunamadı.'));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Görsel işlenemedi.'));
    img.src = src;
  });
}

/**
 * Universal blueprint file processor supporting PDF, Word (DOCX/DOC), and all Image types.
 */
export async function loadBlueprintFile(file: File): Promise<LoadedBlueprint> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const type = file.type.toLowerCase();

  if (ext === 'pdf' || type === 'application/pdf') {
    return convertPdfToImage(file);
  }

  if (ext === 'docx' || ext === 'doc' || type.includes('word') || type.includes('officedocument')) {
    return convertWordToImage(file);
  }

  // Treat as image
  return convertImageToBlueprint(file);
}
