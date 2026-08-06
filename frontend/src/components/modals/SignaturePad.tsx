import { PointerEvent, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';

interface SignaturePadProps {
  onClose: () => void;
  onSave: (image: string) => void;
}

export default function SignaturePad({ onClose, onSave }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const getPoint = (event: PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const startDrawing = (event: PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    const pt = getPoint(event);
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
    ctx.strokeStyle = '#0e2a52';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDrawing(true);
  };

  const draw = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    const pt = getPoint(event);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
  };

  const stopDrawing = () => setIsDrawing(false);

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  };

  return (
    <div
      className="modal-layer signature-layer"
      role="dialog"
      aria-modal="true"
      aria-label="İmza al"
    >
      <div className="modal signature-modal">
        <div className="modal-header">
          <div>
            <p className="eyebrow">DİJİTAL İMZA</p>
            <h2>İmzanızı çiziniz</h2>
            <p>Parmağınızla, kalemle veya fareyle imza atabilirsiniz.</p>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="signature-pad-wrap">
          <canvas
            ref={canvasRef}
            width={840}
            height={300}
            className="signature-pad"
            onPointerDown={startDrawing}
            onPointerMove={draw}
            onPointerUp={stopDrawing}
            onPointerCancel={stopDrawing}
          />
          <span>İmzanızı bu alana çiziniz</span>
        </div>

        <div className="modal-actions">
          <button className="secondary-button" onClick={clear}>
            Temizle
          </button>
          <button
            className="primary-button"
            onClick={() => {
              const image = canvasRef.current?.toDataURL('image/png');
              if (image) onSave(image);
            }}
          >
            İmzayı rapora ekle <Check size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}
