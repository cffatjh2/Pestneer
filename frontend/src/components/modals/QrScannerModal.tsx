import { useEffect, useRef, useState } from 'react';
import { Camera, Keyboard, ScanLine, X } from 'lucide-react';
import { BrowserQRCodeReader } from '@zxing/browser';

export default function QrScannerModal({ onClose, onScan }: { onClose: () => void; onScan: (value: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [manual, setManual] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let controls: { stop: () => void } | undefined;
    const reader = new BrowserQRCodeReader();
    if (!window.isSecureContext && location.hostname !== 'localhost') {
      setCameraError('Kamera yalnızca güvenli HTTPS bağlantısında açılabilir. Kodu manuel girebilirsiniz.');
      return;
    }
    reader.decodeFromVideoDevice(undefined, videoRef.current!, (result) => {
      if (!disposed && result) {
        controls?.stop();
        onScan(result.getText());
      }
    }).then((value) => { controls = value; }).catch(() => {
      if (!disposed) setCameraError('Kamera açılamadı. Kamera iznini kontrol edin veya kodu manuel girin.');
    });
    return () => { disposed = true; controls?.stop(); };
  }, [onScan]);

  return <div className="nested-modal-layer" role="dialog" aria-modal="true" aria-label="QR istasyon okutucu"><div className="qr-scanner-modal">
    <header><div><span><ScanLine size={21} /></span><div><strong>İstasyon QR kodunu okut</strong><small>Kareyi kameranın ortasında sabit tutun.</small></div></div><button className="icon-button" onClick={onClose}><X size={19} /></button></header>
    <div className="qr-camera"><video ref={videoRef} muted playsInline />{cameraError && <div className="qr-camera-error"><Camera size={27} /><span>{cameraError}</span></div>}<i /><b /></div>
    <form onSubmit={(event) => { event.preventDefault(); if (manual.trim()) onScan(manual.trim()); }}><label><Keyboard size={16} /> QR içeriğini manuel girin<input value={manual} onChange={(event) => setManual(event.target.value)} placeholder="PESTNEER-STATION|…" /></label><button className="primary-button" disabled={!manual.trim()}>İstasyonu Aç</button></form>
  </div></div>;
}
