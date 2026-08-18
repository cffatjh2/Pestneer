import { useEffect, useRef, useState, useCallback, type FormEvent } from 'react';
import {
  Camera,
  Check,
  ChevronLeft,
  CopyPlus,
  Crop,
  FileText,
  Image as ImageIcon,
  Layers,
  Maximize2,
  Minus,
  Move,
  Palette,
  Plus,
  RefreshCw,
  RotateCw,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
  Wand2,
  X,
  Zap
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import type { InventoryItem } from '../../services/inventoryApi';
import type { QualityLocation, UploadQualityDocumentInput } from '../../services/qualityApi';
import './documentScanner.css';

export type FilterType = 'magic' | 'document' | 'grayscale' | 'original';

export type Point = { x: number; y: number };

export type ScannedPage = {
  id: string;
  originalCanvas: HTMLCanvasElement;
  warpedCanvas: HTMLCanvasElement;
  processedDataUrl: string;
  corners: [Point, Point, Point, Point]; // TL, TR, BR, BL
  filter: FilterType;
  rotation: number;
};

type Props = {
  locations: QualityLocation[];
  inventoryItems: InventoryItem[];
  defaultCategory?: string;
  onClose: () => void;
  onSubmit: (input: UploadQualityDocumentInput) => Promise<void>;
};

const documentCategories = [
  { value: 'Licenses', label: 'Biyosidal Ürün Ruhsatı' },
  { value: 'SafetyDataSheets', label: 'MSDS / Güvenlik Bilgi Formu (GBF)' },
  { value: 'Certificates', label: 'İzin & Personel Sertifikası / Mesul Müdür' },
  { value: 'Contracts', label: 'Müşteri Sözleşmesi / Protokol' },
  { value: 'FieldInspections', label: 'Saha İnceleme & Hijyen Tutanağı' },
  { value: 'SitePlans', label: 'Tesis Krokisi / Yerleşim Planı' },
  { value: 'General', label: 'Genel Firma Belgesi' },
  { value: 'Other', label: 'Diğer Belge' },
];

// ═══════════════════════════════════════════════════════════════════════════
// PERSPECTIVE TRANSFORM (HOMOGRAPHY) & DOCUMENT FILTERS
// ═══════════════════════════════════════════════════════════════════════════

function dist(p1: Point, p2: Point): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

function solve3x3(A: number[][], b: number[]): number[] | null {
  const n = 3;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) maxRow = k;
    }
    if (Math.abs(M[maxRow][i]) < 1e-9) return null;
    [M[i], M[maxRow]] = [M[maxRow], M[i]];

    for (let k = i + 1; k < n; k++) {
      const c = -M[k][i] / M[i][i];
      for (let j = i; j <= n; j++) {
        if (i === j) M[k][j] = 0;
        else M[k][j] += c * M[i][j];
      }
    }
  }

  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = M[i][n] / M[i][i];
    for (let k = i - 1; k >= 0; k--) {
      M[k][n] -= M[k][i] * x[i];
    }
  }
  return x;
}

function solve8x8(A: number[][], b: number[]): number[] | null {
  const n = 8;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) maxRow = k;
    }
    if (Math.abs(M[maxRow][i]) < 1e-9) return null;
    [M[i], M[maxRow]] = [M[maxRow], M[i]];

    for (let k = i + 1; k < n; k++) {
      const c = -M[k][i] / M[i][i];
      for (let j = i; j <= n; j++) {
        if (i === j) M[k][j] = 0;
        else M[k][j] += c * M[i][j];
      }
    }
  }

  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = M[i][n] / M[i][i];
    for (let k = i - 1; k >= 0; k--) {
      M[k][n] -= M[k][i] * x[i];
    }
  }
  return x;
}

function getHomographyMatrix(src: [Point, Point, Point, Point], dst: [Point, Point, Point, Point]): number[] | null {
  // src -> dst
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const sx = src[i].x;
    const sy = src[i].y;
    const dx = dst[i].x;
    const dy = dst[i].y;

    A.push([sx, sy, 1, 0, 0, 0, -dx * sx, -dx * sy]);
    b.push(dx);

    A.push([0, 0, 0, sx, sy, 1, -dy * sx, -dy * sy]);
    b.push(dy);
  }

  const h = solve8x8(A, b);
  if (!h) return null;
  return [...h, 1];
}

function warpPerspective(
  sourceCanvas: HTMLCanvasElement,
  corners: [Point, Point, Point, Point]
): HTMLCanvasElement {
  const [tl, tr, br, bl] = corners;

  // Calculate target dimensions
  const widthTop = dist(tl, tr);
  const widthBottom = dist(bl, br);
  const heightLeft = dist(tl, bl);
  const heightRight = dist(tr, br);

  let targetWidth = Math.round(Math.max(widthTop, widthBottom));
  let targetHeight = Math.round(Math.max(heightLeft, heightRight));

  // Minimum safe dimensions
  targetWidth = Math.max(200, Math.min(2400, targetWidth));
  targetHeight = Math.max(200, Math.min(3200, targetHeight));

  const outCanvas = document.createElement('canvas');
  outCanvas.width = targetWidth;
  outCanvas.height = targetHeight;
  const outCtx = outCanvas.getContext('2d');
  if (!outCtx) return sourceCanvas;

  const srcCtx = sourceCanvas.getContext('2d');
  if (!srcCtx) return sourceCanvas;

  const srcData = srcCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const srcPixels = srcData.data;
  const srcW = sourceCanvas.width;
  const srcH = sourceCanvas.height;

  const outData = outCtx.createImageData(targetWidth, targetHeight);
  const outPixels = outData.data;

  const dstQuad: [Point, Point, Point, Point] = [
    { x: 0, y: 0 },
    { x: targetWidth, y: 0 },
    { x: targetWidth, y: targetHeight },
    { x: 0, y: targetHeight },
  ];

  // Inverse mapping: dst -> src
  const invH = getHomographyMatrix(dstQuad, corners);
  if (!invH) {
    outCtx.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight);
    return outCanvas;
  }

  const [h0, h1, h2, h3, h4, h5, h6, h7, h8] = invH;

  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const denom = h6 * x + h7 * y + h8;
      if (Math.abs(denom) < 1e-9) continue;

      const sx = (h0 * x + h1 * y + h2) / denom;
      const sy = (h3 * x + h4 * y + h5) / denom;

      if (sx >= 0 && sx < srcW - 1 && sy >= 0 && sy < srcH - 1) {
        // Bilinear interpolation
        const x0 = Math.floor(sx);
        const x1 = x0 + 1;
        const y0 = Math.floor(sy);
        const y1 = y0 + 1;

        const dx = sx - x0;
        const dy = sy - y0;

        const idx00 = (y0 * srcW + x0) * 4;
        const idx10 = (y0 * srcW + x1) * 4;
        const idx01 = (y1 * srcW + x0) * 4;
        const idx11 = (y1 * srcW + x1) * 4;

        const outIdx = (y * targetWidth + x) * 4;

        for (let c = 0; c < 3; c++) {
          const top = srcPixels[idx00 + c] * (1 - dx) + srcPixels[idx10 + c] * dx;
          const bot = srcPixels[idx01 + c] * (1 - dx) + srcPixels[idx11 + c] * dx;
          outPixels[outIdx + c] = Math.round(top * (1 - dy) + bot * dy);
        }
        outPixels[outIdx + 3] = 255;
      }
    }
  }

  outCtx.putImageData(outData, 0, 0);
  return outCanvas;
}

function applyDocumentFilter(
  warpedCanvas: HTMLCanvasElement,
  filter: FilterType,
  rotation: number
): string {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const is90or270 = rotation % 180 !== 0;
  canvas.width = is90or270 ? warpedCanvas.height : warpedCanvas.width;
  canvas.height = is90or270 ? warpedCanvas.width : warpedCanvas.height;

  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(warpedCanvas, -warpedCanvas.width / 2, -warpedCanvas.height / 2);
  ctx.restore();

  if (filter === 'original') {
    return canvas.toDataURL('image/jpeg', 0.94);
  }

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  const len = data.length;

  if (filter === 'grayscale') {
    for (let i = 0; i < len; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
    }
  } else if (filter === 'document') {
    // Siyah-Beyaz Belge (High contrast adaptive clean binarization)
    for (let i = 0; i < len; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;

      // Dynamic curve for crisp text on clean white paper
      let adjusted = (gray - 128) * 1.8 + 145;
      if (adjusted > 195) {
        adjusted = 255;
      } else if (adjusted < 95) {
        adjusted = Math.max(0, adjusted * 0.6);
      }
      data[i] = adjusted;
      data[i + 1] = adjusted;
      data[i + 2] = adjusted;
    }
  } else if (filter === 'magic') {
    // Sihirli Renk (CamScanner Magic Color: Clean white paper, preserve blue stamps & colored text)
    for (let i = 0; i < len; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const chroma = max - min;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      if (lum > 155 && chroma < 30) {
        // Background paper shadow -> Pure white
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
      } else if (chroma > 30) {
        // Colored stamp, signature, logo -> Boost color saturation
        const boost = 1.35;
        data[i] = Math.min(255, Math.max(0, (r - 128) * boost + 130));
        data[i + 1] = Math.min(255, Math.max(0, (g - 128) * boost + 130));
        data[i + 2] = Math.min(255, Math.max(0, (b - 128) * boost + 130));
      } else {
        // Dark printed text -> Deepen contrast
        const dark = Math.max(0, (lum - 128) * 1.5 + 130);
        data[i] = dark < 80 ? Math.round(dark * 0.6) : dark;
        data[i + 1] = dark < 80 ? Math.round(dark * 0.6) : dark;
        data[i + 2] = dark < 80 ? Math.round(dark * 0.6) : dark;
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.94);
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function DocumentScannerModal({
  locations,
  inventoryItems,
  defaultCategory = 'Licenses',
  onClose,
  onSubmit,
}: Props) {
  // Mode: 'camera' -> 'crop' -> 'preview'
  const [mode, setMode] = useState<'camera' | 'crop' | 'preview'>('camera');

  // Camera & Stream State
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [torch, setTorch] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Active Crop Workspace
  const [cropSourceCanvas, setCropSourceCanvas] = useState<HTMLCanvasElement | null>(null);
  const [cropCorners, setCropCorners] = useState<[Point, Point, Point, Point]>([
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ]);
  const [activeCornerIndex, setActiveCornerIndex] = useState<number | null>(null);

  // Pages & Filter State
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [currentFilter, setCurrentFilter] = useState<FilterType>('magic');
  const [currentRotation, setCurrentRotation] = useState<number>(0);

  // Form Metadata
  const [category, setCategory] = useState(defaultCategory);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [locationKey, setLocationKey] = useState('');
  const [inventoryItemId, setInventoryItemId] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // DOM Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const cropCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isLicense = category === 'Licenses';
  const isSafetyDataSheet = category === 'SafetyDataSheets';
  const isProductDocument = isLicense || isSafetyDataSheet;

  // Initialize Camera
  useEffect(() => {
    let currentStream: MediaStream | null = null;

    async function startCamera() {
      setCameraError(null);
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Tarayıcınız kamera erişimini desteklemiyor.');
        }

        let newStream: MediaStream;
        try {
          newStream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: facingMode },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
            audio: false,
          });
        } catch {
          newStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: facingMode === 'environment' ? 'environment' : 'user' },
            audio: false,
          });
        }

        currentStream = newStream;
        setStream(newStream);

        if (videoRef.current) {
          videoRef.current.srcObject = newStream;
          await videoRef.current.play().catch(() => {});
        }

        const track = newStream.getVideoTracks()[0];
        if (track) {
          const capabilities = (track.getCapabilities?.() ?? {}) as { torch?: boolean };
          setHasTorch(Boolean(capabilities.torch));
        }
      } catch (err) {
        setCameraError(err instanceof Error ? err.message : 'Kameraya erişilemedi.');
      }
    }

    if (mode === 'camera') {
      void startCamera();
    } else {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        setStream(null);
      }
    }

    return () => {
      if (currentStream) {
        currentStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [facingMode, mode]);

  // Flashlight Toggle
  const toggleTorch = async () => {
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (track && hasTorch) {
      try {
        const nextTorch = !torch;
        await track.applyConstraints({
          advanced: [{ torch: nextTorch } as MediaTrackConstraintSet],
        });
        setTorch(nextTorch);
      } catch { }
    }
  };

  // Flip Camera
  const toggleCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  // Default A4 Margins based on image size
  const getDefaultCorners = (w: number, h: number): [Point, Point, Point, Point] => {
    const padX = Math.round(w * 0.08);
    const padY = Math.round(h * 0.08);
    return [
      { x: padX, y: padY },
      { x: w - padX, y: padY },
      { x: w - padX, y: h - padY },
      { x: padX, y: h - padY },
    ];
  };

  // Capture Frame and enter Crop Mode
  const captureFrame = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    setCropSourceCanvas(canvas);
    setCropCorners(getDefaultCorners(canvas.width, canvas.height));
    setMode('crop');
  };

  // Handle Disk File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Lütfen JPG, PNG veya WEBP formatında bir belge görseli seçin.');
      return;
    }

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);

      setCropSourceCanvas(canvas);
      setCropCorners(getDefaultCorners(canvas.width, canvas.height));
      setMode('crop');
    };
    img.src = URL.createObjectURL(file);
    e.target.value = '';
  };

  // Draw Crop UI Overlay
  useEffect(() => {
    if (mode !== 'crop' || !cropSourceCanvas || !cropCanvasRef.current) return;

    const canvas = cropCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = cropSourceCanvas.width;
    canvas.height = cropSourceCanvas.height;

    // 1. Draw base image
    ctx.drawImage(cropSourceCanvas, 0, 0);

    // 2. Darken area outside crop polygon
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Cut out the polygon
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.moveTo(cropCorners[0].x, cropCorners[0].y);
    ctx.lineTo(cropCorners[1].x, cropCorners[1].y);
    ctx.lineTo(cropCorners[2].x, cropCorners[2].y);
    ctx.lineTo(cropCorners[3].x, cropCorners[3].y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // 3. Draw bright neon bounding lines & grid
    ctx.save();
    ctx.strokeStyle = '#00f2fe';
    ctx.lineWidth = Math.max(3, Math.round(canvas.width / 400));
    ctx.beginPath();
    ctx.moveTo(cropCorners[0].x, cropCorners[0].y);
    ctx.lineTo(cropCorners[1].x, cropCorners[1].y);
    ctx.lineTo(cropCorners[2].x, cropCorners[2].y);
    ctx.lineTo(cropCorners[3].x, cropCorners[3].y);
    ctx.closePath();
    ctx.stroke();

    // 4. Draw corner handles
    const handleRadius = Math.max(14, Math.round(canvas.width / 80));
    cropCorners.forEach((corner, idx) => {
      ctx.beginPath();
      ctx.arc(corner.x, corner.y, handleRadius, 0, Math.PI * 2);
      ctx.fillStyle = idx === activeCornerIndex ? '#38ef7d' : '#00f2fe';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    });
    ctx.restore();
  }, [mode, cropSourceCanvas, cropCorners, activeCornerIndex]);

  // Touch / Mouse Handling for Interactive Corner Dragging
  const getCanvasCoords = (e: React.MouseEvent | React.TouchEvent): Point | null => {
    const canvas = cropCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    const pt = getCanvasCoords(e);
    if (!pt || !cropSourceCanvas) return;

    const threshold = Math.max(40, cropSourceCanvas.width / 20);
    let closestIdx = -1;
    let minD = Infinity;

    cropCorners.forEach((c, idx) => {
      const d = dist(pt, c);
      if (d < minD && d < threshold) {
        minD = d;
        closestIdx = idx;
      }
    });

    if (closestIdx !== -1) {
      setActiveCornerIndex(closestIdx);
    }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (activeCornerIndex === null || !cropSourceCanvas) return;
    const pt = getCanvasCoords(e);
    if (!pt) return;

    // Clamp inside canvas
    const x = Math.max(0, Math.min(cropSourceCanvas.width, pt.x));
    const y = Math.max(0, Math.min(cropSourceCanvas.height, pt.y));

    setCropCorners((prev) => {
      const next = [...prev] as [Point, Point, Point, Point];
      next[activeCornerIndex] = { x, y };
      return next;
    });
  };

  const handlePointerUp = () => {
    setActiveCornerIndex(null);
  };

  // Reset to full frame
  const handleFullFrame = () => {
    if (!cropSourceCanvas) return;
    setCropCorners([
      { x: 0, y: 0 },
      { x: cropSourceCanvas.width, y: 0 },
      { x: cropSourceCanvas.width, y: cropSourceCanvas.height },
      { x: 0, y: cropSourceCanvas.height },
    ]);
  };

  // Auto detect edges (smart 85% A4 bounding)
  const handleAutoDetect = () => {
    if (!cropSourceCanvas) return;
    setCropCorners(getDefaultCorners(cropSourceCanvas.width, cropSourceCanvas.height));
  };

  // Finalize Perspective Warp & Add Page
  const applyCropAndWarp = () => {
    if (!cropSourceCanvas) return;

    // Perform real homography perspective warp
    const warpedCanvas = warpPerspective(cropSourceCanvas, cropCorners);
    const processedDataUrl = applyDocumentFilter(warpedCanvas, currentFilter, 0);

    const newPage: ScannedPage = {
      id: Math.random().toString(36).substring(2, 9),
      originalCanvas: cropSourceCanvas,
      warpedCanvas,
      processedDataUrl,
      corners: cropCorners,
      filter: currentFilter,
      rotation: 0,
    };

    setPages((prev) => [...prev, newPage]);
    setActivePageIndex(pages.length);
    setMode('preview');

    if (!title) {
      const catLabel = documentCategories.find((c) => c.value === category)?.label ?? 'Belge';
      const today = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());
      setTitle(`${catLabel} - ${today}`);
    }
  };

  // Change Filter of Active Page
  const handleFilterChange = (filter: FilterType) => {
    setCurrentFilter(filter);
    if (pages.length === 0 || !pages[activePageIndex]) return;

    const page = pages[activePageIndex];
    const newProcessed = applyDocumentFilter(page.warpedCanvas, filter, page.rotation);

    setPages((prev) =>
      prev.map((p, idx) =>
        idx === activePageIndex ? { ...p, filter, processedDataUrl: newProcessed } : p
      )
    );
  };

  // Rotate Active Page
  const handleRotate = () => {
    if (pages.length === 0 || !pages[activePageIndex]) return;
    const page = pages[activePageIndex];
    const nextRotation = (page.rotation + 90) % 360;
    setCurrentRotation(nextRotation);

    const newProcessed = applyDocumentFilter(page.warpedCanvas, page.filter, nextRotation);
    setPages((prev) =>
      prev.map((p, idx) =>
        idx === activePageIndex ? { ...p, rotation: nextRotation, processedDataUrl: newProcessed } : p
      )
    );
  };

  // Re-crop active page
  const handleReCrop = () => {
    if (pages.length === 0 || !pages[activePageIndex]) return;
    const page = pages[activePageIndex];
    setCropSourceCanvas(page.originalCanvas);
    setCropCorners(page.corners);
    setMode('crop');
  };

  // Delete Active Page
  const handleDeletePage = (index: number) => {
    const updated = pages.filter((_, idx) => idx !== index);
    setPages(updated);
    if (updated.length === 0) {
      setMode('camera');
    } else {
      setActivePageIndex(Math.max(0, index - 1));
    }
  };

  // Add another page
  const handleAddPage = () => {
    setMode('camera');
  };

  // Submit and Upload PDF / Document
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (pages.length === 0) {
      setError('Lütfen en az 1 sayfa tarayın veya yükleyin.');
      return;
    }
    if (!title.trim()) {
      setError('Lütfen belge için bir başlık girin.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      let finalFile: File;

      if (pages.length === 1) {
        // Single page JPEG
        const blob = await (await fetch(pages[0].processedDataUrl)).blob();
        finalFile = new File([blob], `${title.replace(/\s+/g, '_')}.jpg`, { type: 'image/jpeg' });
      } else {
        // Multi-page PDF
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        for (let i = 0; i < pages.length; i++) {
          if (i > 0) pdf.addPage('a4', 'portrait');
          pdf.addImage(pages[i].processedDataUrl, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
        }
        const pdfBlob = pdf.output('blob');
        finalFile = new File([pdfBlob], `${title.replace(/\s+/g, '_')}.pdf`, { type: 'application/pdf' });
      }

      const [selectedCustomerId, selectedBranchId] = locationKey ? locationKey.split(':') : [undefined, undefined];

      await onSubmit({
        category,
        title: title.trim(),
        description: description.trim() || undefined,
        customerId: selectedCustomerId || undefined,
        branchId: selectedBranchId || undefined,
        inventoryItemId: isProductDocument && inventoryItemId ? inventoryItemId : undefined,
        licenseNumber: isLicense && licenseNumber ? licenseNumber : undefined,
        file: finalFile,
      });

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Belge kaydedilirken bir hata oluştu.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="scanner-modal-backdrop" role="dialog" aria-modal="true">
      <div className="scanner-modal-card">
        {/* Header */}
        <div className="scanner-header">
          <div className="scanner-header-left">
            <div className="scanner-header-icon">
              <Sparkles size={22} />
            </div>
            <div className="scanner-header-titles">
              <h2>Akıllı A4 Belge Tarayıcı</h2>
              <p>Otomatik köşe kırpma, perspektif düzeltme ve filtreli PDF tarama</p>
            </div>
          </div>
          <button type="button" className="scanner-close-btn" onClick={onClose} title="Kapat">
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="scanner-body">
          {/* Left Viewport Pane */}
          <div className="scanner-viewport-pane">
            {/* 1. CAMERA MODE */}
            {mode === 'camera' && (
              <div className="scanner-camera-container">
                {cameraError ? (
                  <div className="scanner-error-box" style={{ maxWidth: '85%' }}>
                    <p>{cameraError}</p>
                    <button
                      type="button"
                      className="scanner-retry-btn"
                      onClick={() => setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))}
                    >
                      <RefreshCw size={15} /> Kamerayı Değiştir
                    </button>
                  </div>
                ) : (
                  <>
                    <video ref={videoRef} className="scanner-video-element" autoPlay playsInline muted />
                    <div className="scanner-a4-overlay">
                      <span className="scanner-guide-tip">Belgeyi A4 kılavuzuna hizalayın ve çekin</span>
                      <div className="scanner-guide-box">
                        <div className="scanner-corner top-left" />
                        <div className="scanner-corner top-right" />
                        <div className="scanner-corner bottom-left" />
                        <div className="scanner-corner bottom-right" />
                      </div>
                    </div>

                    <div className="scanner-cam-controls">
                      <button
                        type="button"
                        className="scanner-tool-btn"
                        onClick={() => fileInputRef.current?.click()}
                        title="Galeriden / Dosyadan Seç"
                      >
                        <ImageIcon size={20} />
                      </button>

                      <button
                        type="button"
                        className="scanner-shutter-btn"
                        onClick={captureFrame}
                        title="Fotoğrafı Çek ve Tara"
                      >
                        <div className="scanner-shutter-inner" />
                      </button>

                      <button
                        type="button"
                        className="scanner-tool-btn"
                        onClick={toggleCamera}
                        title="Ön / Arka Kamera Değiştir"
                      >
                        <RotateCw size={19} />
                      </button>

                      {hasTorch && (
                        <button
                          type="button"
                          className={`scanner-tool-btn ${torch ? 'active' : ''}`}
                          onClick={toggleTorch}
                          title="Flaş / Işık Aç/Kapat"
                        >
                          <Zap size={19} />
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* 2. CROP & PERSPECTIVE WARP MODE */}
            {mode === 'crop' && (
              <div className="scanner-crop-container">
                <div className="scanner-crop-header-bar">
                  <span>
                    <Move size={15} /> 4 Köşeyi belgenin kenarlarına sürükleyip ayarlayın
                  </span>
                  <div className="scanner-crop-quick-actions">
                    <button type="button" onClick={handleAutoDetect} title="A4 Kılavuzuna Hizala">
                      <Wand2 size={14} /> Otomatik
                    </button>
                    <button type="button" onClick={handleFullFrame} title="Tüm Kareyi Seç">
                      <Maximize2 size={14} /> Tam Kare
                    </button>
                  </div>
                </div>

                <div
                  className="scanner-crop-canvas-wrapper"
                  onMouseDown={handlePointerDown}
                  onMouseMove={handlePointerMove}
                  onMouseUp={handlePointerUp}
                  onTouchStart={handlePointerDown}
                  onTouchMove={handlePointerMove}
                  onTouchEnd={handlePointerUp}
                >
                  <canvas ref={cropCanvasRef} className="scanner-crop-canvas" />
                </div>

                <div className="scanner-crop-bottom-bar">
                  <button
                    type="button"
                    className="scanner-secondary-btn"
                    onClick={() => setMode('camera')}
                  >
                    <ChevronLeft size={16} /> Tekrar Çek
                  </button>
                  <button
                    type="button"
                    className="scanner-primary-warp-btn"
                    onClick={applyCropAndWarp}
                  >
                    <Check size={18} /> Belgeyi Düzelt & Tara
                  </button>
                </div>
              </div>
            )}

            {/* 3. SCANNED PREVIEW MODE */}
            {mode === 'preview' && pages.length > 0 && (
              <div className="scanner-preview-container">
                <div className="scanner-canvas-wrap">
                  <img
                    src={pages[activePageIndex]?.processedDataUrl}
                    alt={`Sayfa ${activePageIndex + 1}`}
                    className="scanner-preview-img"
                  />
                </div>

                {/* CamScanner Filter Selector Bar */}
                <div className="scanner-filters-strip">
                  <button
                    type="button"
                    className={`scanner-filter-chip ${currentFilter === 'magic' ? 'active' : ''}`}
                    onClick={() => handleFilterChange('magic')}
                    title="Sihirli Renk (Gölge Temizleme & Canlı Mühür/İmza)"
                  >
                    <Sparkles size={14} /> Sihirli Renk
                  </button>
                  <button
                    type="button"
                    className={`scanner-filter-chip ${currentFilter === 'document' ? 'active' : ''}`}
                    onClick={() => handleFilterChange('document')}
                    title="Net Siyah-Beyaz Belge"
                  >
                    <FileText size={14} /> Net S/B
                  </button>
                  <button
                    type="button"
                    className={`scanner-filter-chip ${currentFilter === 'grayscale' ? 'active' : ''}`}
                    onClick={() => handleFilterChange('grayscale')}
                    title="Gri Tonlama"
                  >
                    <Minus size={14} /> Gri Ton
                  </button>
                  <button
                    type="button"
                    className={`scanner-filter-chip ${currentFilter === 'original' ? 'active' : ''}`}
                    onClick={() => handleFilterChange('original')}
                    title="Kırpılmış Orijinal Renk"
                  >
                    <Palette size={14} /> Orijinal
                  </button>
                  <button
                    type="button"
                    className="scanner-filter-chip"
                    onClick={handleRotate}
                    title="Sayfayı 90° Döndür"
                  >
                    <RotateCw size={14} /> 90°
                  </button>
                  <button
                    type="button"
                    className="scanner-filter-chip"
                    onClick={handleReCrop}
                    title="Köşeleri Yeniden Ayarla"
                  >
                    <Crop size={14} /> Yeniden Kırp
                  </button>
                </div>

                {/* Multi-Page Carousel & Add Page */}
                <div className="scanner-pages-strip">
                  {pages.map((p, idx) => (
                    <div
                      key={p.id}
                      className={`scanner-page-thumb ${idx === activePageIndex ? 'active' : ''}`}
                      onClick={() => {
                        setActivePageIndex(idx);
                        setCurrentFilter(p.filter);
                        setCurrentRotation(p.rotation);
                      }}
                    >
                      <img src={p.processedDataUrl} alt={`Sayfa ${idx + 1}`} />
                      <span className="scanner-page-num">{idx + 1}</span>
                      {pages.length > 1 && (
                        <button
                          type="button"
                          className="scanner-thumb-del"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeletePage(idx);
                          }}
                          title="Sayfayı Sil"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  ))}

                  <button
                    type="button"
                    className="scanner-add-page-thumb"
                    onClick={handleAddPage}
                    title="Yeni Sayfa Ekle"
                  >
                    <Plus size={20} />
                    <span>+ Sayfa</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Form Pane */}
          <div className="scanner-form-pane">
            <form onSubmit={handleSubmit} className="scanner-metadata-form">
              <h3>Belge Bilgileri & Kayıt</h3>

              {error && <div className="scanner-form-error">{error}</div>}

              <div className="scanner-input-group">
                <label>Belge Kategorisi *</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)} required>
                  {documentCategories.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="scanner-input-group">
                <label>Belge Başlığı *</label>
                <input
                  type="text"
                  placeholder="Örn: Haşere İlacı Ruhsatı 2026"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              {isProductDocument && (
                <div className="scanner-input-group">
                  <label>İlişkili İlaç / Biyosidal Ürün</label>
                  <select
                    value={inventoryItemId}
                    onChange={(e) => setInventoryItemId(e.target.value)}
                  >
                    <option value="">-- Depodan / Ürünlerden Seçin --</option>
                    {inventoryItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.category})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {isLicense && (
                <div className="scanner-input-group">
                  <label>Ruhsat / İzin Numarası</label>
                  <input
                    type="text"
                    placeholder="Örn: 2024/114-B"
                    value={licenseNumber}
                    onChange={(e) => setLicenseNumber(e.target.value)}
                  />
                </div>
              )}

              <div className="scanner-input-group">
                <label>Bağlı Tesis / Müşteri Şubesi</label>
                <select value={locationKey} onChange={(e) => setLocationKey(e.target.value)}>
                  <option value="">Tüm Firma / Genel Belge</option>
                  {locations.map((loc) => {
                    const key = `${loc.customerId}:${loc.branchId || ''}`;
                    return (
                      <option key={key} value={key}>
                        {loc.customerName} {loc.branchName ? `· ${loc.branchName}` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="scanner-input-group">
                <label>Açıklama / Notlar</label>
                <textarea
                  rows={2}
                  placeholder="Opsiyonel notlar veya geçerlilik bilgisi..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="scanner-form-actions">
                <button type="button" className="scanner-secondary-btn" onClick={onClose}>
                  İptal
                </button>
                <button
                  type="submit"
                  className="scanner-submit-btn"
                  disabled={saving || pages.length === 0}
                >
                  {saving ? (
                    'Kaydediliyor...'
                  ) : (
                    <>
                      <Check size={18} /> {pages.length > 1 ? `${pages.length} Sayfalı PDF Kaydet` : 'Belgeyi Kaydet'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept="image/*"
        onChange={handleFileUpload}
      />
    </div>
  );
}
