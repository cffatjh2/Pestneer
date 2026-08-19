import { useEffect, useRef, useState, useCallback } from 'react';
import { Barcode, Camera, CheckCircle2, Keyboard, RefreshCw, ScanLine, Volume2, VolumeX, X } from 'lucide-react';
import { BrowserMultiFormatReader } from '@zxing/browser';

function playBeep() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1450, ctx.currentTime);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.14);
  } catch {
    // ignore audio block
  }
}

type Props = {
  title?: string;
  subtitle?: string;
  onClose: () => void;
  onScan: (value: string) => void;
};

export default function QrScannerModal({
  title = 'İstasyon Barkod / QR Kodunu Okut',
  subtitle = 'Barkod veya QR kodu kameranın ortasına getirin.',
  onClose,
  onScan,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [manual, setManual] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | undefined>();
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);

  // Initialize camera list
  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices?.().then((devices) => {
      const videoDevices = devices.filter((d) => d.kind === 'videoinput');
      setCameras(videoDevices);
      // Prefer back/environment camera
      const backCam = videoDevices.find((d) => /back|rear|environment|arka/i.test(d.label));
      if (backCam) {
        setSelectedCameraId(backCam.deviceId);
      } else if (videoDevices.length > 0) {
        setSelectedCameraId(videoDevices[0].deviceId);
      }
    }).catch(() => undefined);
  }, []);

  const handleDetected = useCallback((rawText: string) => {
    const text = rawText.trim();
    if (!text) return;
    setLastScanned(text);
    if (soundEnabled) playBeep();
    if (navigator.vibrate) {
      try { navigator.vibrate([60, 40, 90]); } catch {}
    }
    // Stop camera and deliver scan result
    controlsRef.current?.stop();
    onScan(text);
  }, [onScan, soundEnabled]);

  // Start MultiFormat scanning (reads QR, Code 128, Code 39, EAN-13, ITF, DataMatrix, etc.)
  useEffect(() => {
    let disposed = false;
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;

    if (!window.isSecureContext && location.hostname !== 'localhost') {
      setCameraError('Kamera yalnızca güvenli HTTPS bağlantısında açılabilir. Kodu manuel girebilirsiniz.');
      return;
    }

    if (!videoRef.current) return;

    reader.decodeFromVideoDevice(
      selectedCameraId,
      videoRef.current,
      (result) => {
        if (!disposed && result) {
          handleDetected(result.getText());
        }
      }
    ).then((controls) => {
      if (disposed) {
        controls.stop();
      } else {
        controlsRef.current = controls;
        setCameraError(null);
      }
    }).catch((err) => {
      if (!disposed) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('Permission') || msg.includes('denied')) {
          setCameraError('Kamera izni verilmedi. Lütfen tarayıcı ayarlarından kamera iznini açın veya barkodu manuel girin.');
        } else {
          setCameraError('Kamera başlatılamadı. Kodu aşağıdan elle girebilir veya farklı bir kamera seçebilirsiniz.');
        }
      }
    });

    return () => {
      disposed = true;
      controlsRef.current?.stop();
    };
  }, [selectedCameraId, handleDetected]);

  // Switch to next camera
  const switchCamera = () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex((c) => c.deviceId === selectedCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    setSelectedCameraId(cameras[nextIndex].deviceId);
  };

  return (
    <div className="nested-modal-layer" role="dialog" aria-modal="true" aria-label="Barkod ve QR İstasyon Okutucu">
      <div className="qr-scanner-modal barcode-scanner-modal">
        <header>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ background: 'linear-gradient(135deg, #0284c7, #0d9488)', color: '#fff', padding: '7px', borderRadius: '10px', display: 'flex' }}>
              <Barcode size={22} />
            </span>
            <div>
              <strong style={{ fontSize: '15px', color: '#0f172a' }}>{title}</strong>
              <small style={{ color: '#64748b', display: 'block', fontSize: '11.5px' }}>{subtitle}</small>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              className="icon-button"
              title={soundEnabled ? 'Sesi Kapat' : 'Sesi Aç'}
              onClick={() => setSoundEnabled(!soundEnabled)}
            >
              {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
            {cameras.length > 1 && (
              <button
                type="button"
                className="icon-button"
                title="Kamerayı Değiştir (Ön / Arka)"
                onClick={switchCamera}
              >
                <RefreshCw size={17} />
              </button>
            )}
            <button type="button" className="icon-button" onClick={onClose}>
              <X size={20} />
            </button>
          </div>
        </header>

        <div className="qr-camera" style={{ position: 'relative', overflow: 'hidden', background: '#000', borderRadius: '12px' }}>
          <video
            ref={videoRef}
            muted
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />

          {cameraError && (
            <div className="qr-camera-error" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px', background: 'rgba(15, 23, 42, 0.88)', color: '#f8fafc', textAlign: 'center', gap: '10px' }}>
              <Camera size={32} color="#f59e0b" />
              <span style={{ fontSize: '13px', lineHeight: 1.4 }}>{cameraError}</span>
            </div>
          )}

          {!cameraError && (
            <>
              {/* Animated Target Laser Crosshair */}
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '74%',
                height: '62%',
                border: '2px solid rgba(13, 148, 136, 0.85)',
                borderRadius: '16px',
                boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.45)',
                pointerEvents: 'none',
              }}>
                {/* Laser animation bar */}
                <div style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  height: '2px',
                  background: 'linear-gradient(90deg, transparent, #06b6d4, #10b981, transparent)',
                  boxShadow: '0 0 10px #10b981',
                  animation: 'laserSweep 2s ease-in-out infinite alternate',
                }} />
              </div>

              <div style={{
                position: 'absolute',
                bottom: '12px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(15, 23, 42, 0.75)',
                color: '#e2e8f0',
                padding: '4px 12px',
                borderRadius: '20px',
                fontSize: '11px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backdropFilter: 'blur(4px)',
              }}>
                <ScanLine size={13} color="#10b981" />
                <span>1D Barkod (Code128/EAN) & 2D QR Hazır</span>
              </div>
            </>
          )}

          {lastScanned && (
            <div style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(16, 185, 129, 0.85)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              gap: '8px',
              animation: 'fadeIn 0.2s ease',
            }}>
              <CheckCircle2 size={44} />
              <strong style={{ fontSize: '16px' }}>Kod Algılandı!</strong>
              <code style={{ background: 'rgba(0,0,0,0.25)', padding: '4px 10px', borderRadius: '6px', fontSize: '13px' }}>{lastScanned}</code>
            </div>
          )}
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (manual.trim()) {
              if (soundEnabled) playBeep();
              onScan(manual.trim());
            }
          }}
          style={{ marginTop: '12px' }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', fontWeight: 600, color: '#334155' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Keyboard size={15} /> Barkod veya QR Kodunu Manuel Girin / El Terminali
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                value={manual}
                onChange={(event) => setManual(event.target.value)}
                placeholder="Örn: YM-03, PST-1003, BAR-003..."
                autoFocus={!!cameraError}
                style={{
                  flex: 1,
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13.5px',
                  outline: 'none',
                }}
              />
              <button
                type="submit"
                className="primary-button"
                disabled={!manual.trim()}
                style={{ padding: '0 18px', whiteSpace: 'nowrap' }}
              >
                İstasyonu Aç
              </button>
            </div>
          </label>
        </form>
      </div>
    </div>
  );
}
