import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Camera, Check, CopyPlus, FileText, Image as ImageIcon, Layers, Minus, Palette, Plus, RefreshCw, RotateCw, Sparkles, Trash2, Upload, Volume2, X, Zap } from 'lucide-react';
import { jsPDF } from 'jspdf';
import type { InventoryItem } from '../../services/inventoryApi';
import type { QualityLocation, UploadQualityDocumentInput } from '../../services/qualityApi';
import './documentScanner.css';

export type FilterType = 'document' | 'enhanced' | 'grayscale' | 'original';

export type ScannedPage = {
  id: string;
  originalCanvas: HTMLCanvasElement;
  processedDataUrl: string;
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

export default function DocumentScannerModal({ locations, inventoryItems, defaultCategory = 'Licenses', onClose, onSubmit }: Props) {
  // Camera & Stream State
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [torch, setTorch] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [cameraActive, setCameraActive] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Pages & Image Processing
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [currentFilter, setCurrentFilter] = useState<FilterType>('document');
  const [currentRotation, setCurrentRotation] = useState<number>(0);

  // Metadata Form State
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
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
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
          const constraints: MediaStreamConstraints = {
            video: {
              facingMode: { ideal: facingMode },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
            audio: false,
          };
          newStream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch {
          // Fallback to simpler constraints for restrictive mobile devices
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

        // Check Torch Support
        const track = newStream.getVideoTracks()[0];
        if (track) {
          const capabilities = (track.getCapabilities?.() ?? {}) as { torch?: boolean };
          setHasTorch(Boolean(capabilities.torch));
        }
      } catch (err) {
        setCameraError(err instanceof Error ? err.message : 'Kameraya erişilemedi.');
      }
    }


    if (cameraActive) {
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
  }, [facingMode, cameraActive]);

  // Toggle Torch
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
      } catch {
        // torch not supported on this track
      }
    }
  };

  // Toggle Camera Facing
  const toggleCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  // Apply Document Processing Filter
  const processImage = (sourceCanvas: HTMLCanvasElement, filter: FilterType, rotation: number): string => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    const is90or270 = rotation % 180 !== 0;
    canvas.width = is90or270 ? sourceCanvas.height : sourceCanvas.width;
    canvas.height = is90or270 ? sourceCanvas.width : sourceCanvas.height;

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(sourceCanvas, -sourceCanvas.width / 2, -sourceCanvas.height / 2);
    ctx.restore();

    if (filter === 'original') {
      return canvas.toDataURL('image/jpeg', 0.92);
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
      // High-Contrast Document B&W Scanner Filter (Adaptive contrast & threshold)
      for (let i = 0; i < len; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;

        // Enhance contrast & clean background shadows
        let adjusted = (gray - 128) * 1.6 + 140;
        if (adjusted > 210) {
          adjusted = 255; // Pure clean white paper background
        } else if (adjusted < 90) {
          adjusted = Math.max(0, adjusted * 0.7); // Crisp dark text
        }
        data[i] = adjusted;
        data[i + 1] = adjusted;
        data[i + 2] = adjusted;
      }
    } else if (filter === 'enhanced') {
      // Color Document Mode: Brighten paper while keeping colored stamps & seals
      for (let i = 0; i < len; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Boost saturation & lightness
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const delta = max - min;

        let nr = (r - 128) * 1.35 + 135;
        let ng = (g - 128) * 1.35 + 135;
        let nb = (b - 128) * 1.35 + 135;

        // If it's near-white background, push to pure white
        if (min > 185 && delta < 25) {
          nr = 255;
          ng = 255;
          nb = 255;
        }

        data[i] = Math.min(255, Math.max(0, nr));
        data[i + 1] = Math.min(255, Math.max(0, ng));
        data[i + 2] = Math.min(255, Math.max(0, nb));
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.92);
  };

  // Capture Photo from Camera
  const captureFrame = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = video.videoWidth;
    sourceCanvas.height = video.videoHeight;
    const ctx = sourceCanvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, sourceCanvas.width, sourceCanvas.height);

    const processedDataUrl = processImage(sourceCanvas, currentFilter, 0);
    const newPage: ScannedPage = {
      id: Math.random().toString(36).substring(2, 9),
      originalCanvas: sourceCanvas,
      processedDataUrl,
      filter: currentFilter,
      rotation: 0,
    };

    setPages((prev) => [...prev, newPage]);
    setActivePageIndex(pages.length);
    setCameraActive(false);

    // Auto default title if empty
    if (!title) {
      const catLabel = documentCategories.find((c) => c.value === category)?.label ?? 'Belge';
      const today = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());
      setTitle(`${catLabel} - ${today}`);
    }
  };

  // Upload Photo / PDF File from Disk
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Lütfen JPG, PNG veya WEBP formatında bir belge görseli seçin.');
      return;
    }

    const img = new Image();
    img.onload = () => {
      const sourceCanvas = document.createElement('canvas');
      sourceCanvas.width = img.width;
      sourceCanvas.height = img.height;
      const ctx = sourceCanvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);

      const processedDataUrl = processImage(sourceCanvas, currentFilter, 0);
      const newPage: ScannedPage = {
        id: Math.random().toString(36).substring(2, 9),
        originalCanvas: sourceCanvas,
        processedDataUrl,
        filter: currentFilter,
        rotation: 0,
      };

      setPages((prev) => [...prev, newPage]);
      setActivePageIndex(pages.length);
      setCameraActive(false);

      if (!title) {
        const cleanName = file.name.replace(/\.[^/.]+$/, '');
        setTitle(cleanName);
      }
    };
    img.src = URL.createObjectURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Change Filter of Active Page
  const handleFilterChange = (filter: FilterType) => {
    setCurrentFilter(filter);
    if (pages.length === 0 || activePageIndex >= pages.length) return;

    const activePage = pages[activePageIndex];
    const newProcessed = processImage(activePage.originalCanvas, filter, activePage.rotation);

    setPages((prev) =>
      prev.map((p, idx) =>
        idx === activePageIndex ? { ...p, filter, processedDataUrl: newProcessed } : p
      )
    );
  };

  // Rotate Active Page (90 deg)
  const handleRotate = () => {
    if (pages.length === 0 || activePageIndex >= pages.length) return;

    const activePage = pages[activePageIndex];
    const newRotation = (activePage.rotation + 90) % 360;
    setCurrentRotation(newRotation);

    const newProcessed = processImage(activePage.originalCanvas, activePage.filter, newRotation);

    setPages((prev) =>
      prev.map((p, idx) =>
        idx === activePageIndex ? { ...p, rotation: newRotation, processedDataUrl: newProcessed } : p
      )
    );
  };

  // Delete Page
  const handleDeletePage = (index: number) => {
    setPages((prev) => {
      const next = prev.filter((_, idx) => idx !== index);
      if (next.length === 0) {
        setCameraActive(true);
        setActivePageIndex(0);
      } else if (activePageIndex >= next.length) {
        setActivePageIndex(next.length - 1);
      }
      return next;
    });
  };

  // Switch Active Page
  const handleSelectPage = (index: number) => {
    setActivePageIndex(index);
    setCameraActive(false);
    setCurrentFilter(pages[index].filter);
    setCurrentRotation(pages[index].rotation);
  };

  // Add Another Page (Open Camera)
  const handleAddAnotherPage = () => {
    setCameraActive(true);
  };

  // Compile to PDF & Submit
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (pages.length === 0) {
      setError('Lütfen en az bir sayfa tarayın veya yükleyin.');
      return;
    }

    if (isProductDocument && !inventoryItemId) {
      setError('Lütfen belgenin bağlı olduğu stok ürününü seçin.');
      return;
    }

    if (isLicense && !licenseNumber.trim()) {
      setError('Lütfen ruhsat numarasını girin.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // 1. Create jsPDF A4 Document
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      const a4Width = 210;
      const a4Height = 297;

      for (let i = 0; i < pages.length; i++) {
        if (i > 0) pdf.addPage('a4', 'portrait');
        const pageDataUrl = pages[i].processedDataUrl;
        pdf.addImage(pageDataUrl, 'JPEG', 0, 0, a4Width, a4Height, undefined, 'FAST');
      }

      // 2. Output PDF Blob & File
      const pdfBlob = pdf.output('blob');
      const cleanFileName = `${(title.trim() || 'Taranan_Belge').replace(/[^a-zA-Z0-9_\u00C0-\u017F-]/g, '_')}.pdf`;
      const pdfFile = new File([pdfBlob], cleanFileName, { type: 'application/pdf' });

      // 3. Find Customer & Branch Location if selected
      const location = locations.find((l) => `${l.customerId}|${l.branchId ?? ''}` === locationKey);

      // 4. Upload to Quality Center
      await onSubmit({
        file: pdfFile,
        category,
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        customerId: isProductDocument ? undefined : location?.customerId,
        branchId: isProductDocument ? undefined : location?.branchId,
        inventoryItemId: isProductDocument ? inventoryItemId : undefined,
        licenseNumber: isLicense ? licenseNumber.trim() : undefined,
      });

      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Belge sisteme kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  const activePage = pages[activePageIndex];

  return (
    <div className="scanner-modal-backdrop" role="dialog" aria-modal="true">
      <div className="scanner-modal-card">
        {/* Header */}
        <div className="scanner-header">
          <div className="scanner-header-left">
            <div className="scanner-header-icon">
              <Camera size={24} />
            </div>
            <div className="scanner-header-titles">
              <h2>Akıllı A4 Belge Tarayıcı</h2>
              <p>Ruhsat, MSDS/GBF, sözleşme ve sertifikaları yüksek netlikte tarayıp sisteme ekleyin.</p>
            </div>
          </div>
          <button type="button" className="scanner-close-btn" onClick={onClose} title="Kapat">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="scanner-body">
          {/* Left: Viewport / Camera / Preview */}
          <div className="scanner-viewport-pane">
            {cameraActive ? (
              <div className="scanner-camera-container">
                {cameraError ? (
                  <div className="scanner-error-box" style={{ maxWidth: '85%' }}>
                    <span>{cameraError} Lütfen dosya yükleme seçeneğini kullanın.</span>
                  </div>
                ) : (
                  <>
                    <video ref={videoRef} className="scanner-video-element" autoPlay playsInline muted />
                    
                    {/* A4 Guidance Overlay */}
                    <div className="scanner-a4-overlay">
                      <span className="scanner-guide-tip">Belgenin 4 köşesini A4 çerçevesine hizalayın</span>
                      <div className="scanner-guide-box">
                        <div className="scanner-corner top-left" />
                        <div className="scanner-corner top-right" />
                        <div className="scanner-corner bottom-left" />
                        <div className="scanner-corner bottom-right" />
                      </div>
                      <div style={{ height: '24px' }} />
                    </div>

                    {/* Camera Controls Bar */}
                    <div className="scanner-cam-controls">
                      <button
                        type="button"
                        className="scanner-tool-btn"
                        onClick={() => fileInputRef.current?.click()}
                        title="Galeriden / Dosyadan Seç"
                      >
                        <ImageIcon size={18} />
                      </button>

                      <button
                        type="button"
                        className="scanner-shutter-btn"
                        onClick={captureFrame}
                        title="Belgeyi Tara / Çek"
                      >
                        <Camera size={28} />
                      </button>

                      <button
                        type="button"
                        className="scanner-tool-btn"
                        onClick={toggleCamera}
                        title="Kamerayı Değiştir (Ön/Arka)"
                      >
                        <RefreshCw size={18} />
                      </button>

                      {hasTorch && (
                        <button
                          type="button"
                          className={`scanner-tool-btn ${torch ? 'active' : ''}`}
                          onClick={toggleTorch}
                          title="Feneri Aç/Kapat"
                        >
                          <Zap size={18} />
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="scanner-preview-container">
                {/* Processed Page Preview */}
                <div className="scanner-canvas-wrap">
                  {activePage && (
                    <img
                      src={activePage.processedDataUrl}
                      alt="Taranan Belge"
                      className="scanner-preview-canvas"
                    />
                  )}
                </div>

                {/* Filter Options Toolbar */}
                <div className="scanner-filters-toolbar">
                  <button
                    type="button"
                    className={`scanner-filter-chip ${currentFilter === 'document' ? 'active' : ''}`}
                    onClick={() => handleFilterChange('document')}
                    title="Yüksek Kontrastlı Belge Filtresi"
                  >
                    <Sparkles size={14} /> Belge Modu (S/B)
                  </button>
                  <button
                    type="button"
                    className={`scanner-filter-chip ${currentFilter === 'enhanced' ? 'active' : ''}`}
                    onClick={() => handleFilterChange('enhanced')}
                    title="Canlı Renkler & Mühürler"
                  >
                    <Palette size={14} /> Canlı Renk
                  </button>
                  <button
                    type="button"
                    className={`scanner-filter-chip ${currentFilter === 'grayscale' ? 'active' : ''}`}
                    onClick={() => handleFilterChange('grayscale')}
                  >
                    Gri Ton
                  </button>
                  <button
                    type="button"
                    className={`scanner-filter-chip ${currentFilter === 'original' ? 'active' : ''}`}
                    onClick={() => handleFilterChange('original')}
                  >
                    Orijinal
                  </button>
                </div>

                {/* Adjust Tools */}
                <div className="scanner-adjust-tools">
                  <button
                    type="button"
                    className="scanner-secondary-btn"
                    onClick={handleRotate}
                    title="90° Sağa Döndür"
                  >
                    <RotateCw size={15} /> Döndür
                  </button>
                  <button
                    type="button"
                    className="scanner-secondary-btn"
                    onClick={handleAddAnotherPage}
                    title="Yeniden Çek veya Yeni Sayfa Ekle"
                  >
                    <CopyPlus size={15} /> Sayfa Ekle / Yeniden Çek
                  </button>
                </div>

                {/* Multi-Page Thumbnails Strip */}
                {pages.length > 0 && (
                  <div className="scanner-pages-strip">
                    {pages.map((p, index) => (
                      <div
                        key={p.id}
                        className={`scanner-thumb-card ${index === activePageIndex ? 'active' : ''}`}
                        onClick={() => handleSelectPage(index)}
                      >
                        <img src={p.processedDataUrl} alt={`Sayfa ${index + 1}`} className="scanner-thumb-img" />
                        <span className="scanner-thumb-num">{index + 1}</span>
                        <button
                          type="button"
                          className="scanner-thumb-del"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeletePage(index);
                          }}
                          title="Bu sayfayı sil"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="scanner-add-page-btn"
                      onClick={handleAddAnotherPage}
                      title="Yeni Sayfa Ekle"
                    >
                      <Plus size={16} />
                      <span>Ekle</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept="image/*"
              onChange={handleFileUpload}
            />
          </div>

          {/* Right: Metadata Form Pane */}
          <form className="scanner-form-pane" onSubmit={handleSubmit}>
            <div className="scanner-form-fields">
              <div className="scanner-pages-badge">
                <Layers size={15} />
                <span>{pages.length > 0 ? `${pages.length} Sayfa Taranıyor (A4 PDF)` : 'Kameradan Sayfa Bekleniyor'}</span>
              </div>

              {/* Category Select */}
              <div className="scanner-field-group">
                <label>Belge Kategorisi</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {documentCategories.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Linked Product (If License or MSDS) */}
              {isProductDocument ? (
                <>
                  <div className="scanner-field-group">
                    <label>Bağlı Stok Ürünü</label>
                    <select
                      value={inventoryItemId}
                      onChange={(e) => setInventoryItemId(e.target.value)}
                      required
                    >
                      <option value="">İlaç / Sarfiyat Seçin</option>
                      {inventoryItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.quantity} {item.unit})
                        </option>
                      ))}
                    </select>
                  </div>

                  {isLicense && (
                    <div className="scanner-field-group">
                      <label>Ruhsat / İzin Numarası</label>
                      <input
                        type="text"
                        value={licenseNumber}
                        onChange={(e) => setLicenseNumber(e.target.value)}
                        placeholder="Örn: 2024/156 Sağlık Bakanlığı İzni"
                        required
                      />
                    </div>
                  )}
                </>
              ) : (
                /* Customer / Branch Select */
                <div className="scanner-field-group">
                  <label>Müşteri / Şube Bağlantısı</label>
                  <select value={locationKey} onChange={(e) => setLocationKey(e.target.value)}>
                    <option value="">Firma İçi Genel Belge</option>
                    {locations.map((loc) => {
                      const key = `${loc.customerId}|${loc.branchId ?? ''}`;
                      return (
                        <option key={key} value={key}>
                          {loc.customerName} · {loc.branchName}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {/* Document Title */}
              <div className="scanner-field-group">
                <label>Belge Başlığı</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Örn: Bayer K-Othrine Ruhsat Belgesi"
                  required
                />
              </div>

              {/* Description / Notes */}
              <div className="scanner-field-group">
                <label>Açıklama / Notlar (Opsiyonel)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Geçerlilik tarihi, onay notu veya denetim açıklaması..."
                />
              </div>

              {error && <div className="scanner-error-box">{error}</div>}
            </div>

            {/* Actions */}
            <div className="scanner-actions">
              <button type="button" className="scanner-cancel-btn" onClick={onClose}>
                Vazgeç
              </button>
              <button
                type="submit"
                className="scanner-submit-btn"
                disabled={saving || pages.length === 0}
              >
                {saving ? (
                  <>
                    <RefreshCw size={17} className="spin-icon" /> PDF Hazırlanıyor…
                  </>
                ) : (
                  <>
                    <Check size={18} /> Belgeyi Arşive Kaydet (PDF)
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
