import { useEffect, useMemo, useRef, useState } from 'react';
import { BrainCircuit, CheckCircle2, ImagePlus, Minus, Plus, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import type { ReportPestObservationInput } from '../../services/serviceReportApi';
import { analyzePestImage, type VisionAnalysis, type VisionDetection } from '../../services/pestneerVision';
import { getVisionSettings, type VisionSettings } from '../../services/pestneerVisionApi';

type Props = {
  accessToken: string;
  value?: ReportPestObservationInput[];
  disabled?: boolean;
  onApply: (observations: ReportPestObservationInput[], summary: { total: number; dominantPest: string }) => void;
};

type CountRow = {
  pestKey: string;
  pestName: string;
  detectedCount: number;
  approvedCount: number;
  meanConfidence: number;
};

const manualClasses = [
  ['fly', 'Sinek'],
  ['bee_wasp', 'Arı / yaban arısı'],
  ['moth_butterfly', 'Güve / kelebek'],
  ['beetle', 'Böcek / kınkanatlı'],
  ['cockroach', 'Hamamböceği'],
  ['grasshopper_cricket', 'Çekirge / cırcır böceği'],
  ['termite', 'Termit'],
  ['other_insect', 'Diğer böcek'],
] as const;

const defaultDisclaimer = 'PestneerVision bir yapay zeka modelidir ve hata yapabilir. Sonuçları kontrol edin.';

const boxColors: Record<string, string> = {
  fly: '#e11d48',
  bee_wasp: '#d97706',
  moth_butterfly: '#7c3aed',
  beetle: '#2563eb',
  cockroach: '#0f766e',
  grasshopper_cricket: '#65a30d',
  termite: '#9333ea',
  other_insect: '#475569',
};

export default function PestneerVisionAnalyzer({ accessToken, value = [], disabled = false, onApply }: Props) {
  const [settings, setSettings] = useState<VisionSettings | null>(null);
  const [analysis, setAnalysis] = useState<VisionAnalysis | null>(null);
  const [rows, setRows] = useState<CountRow[]>(() => value.map(toRow));
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let active = true;
    getVisionSettings(accessToken)
      .then((result) => {
        if (active) setSettings(result);
      })
      .catch(() => {
        if (active) {
          setSettings({
            enabled: false,
            reviewRequired: true,
            preferredModel: 'Auto',
            disclaimer: defaultDisclaimer,
          });
        }
      });
    return () => {
      active = false;
    };
  }, [accessToken]);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  useEffect(() => {
    if (!previewUrl || !analysis) return;
    void drawDetections(previewUrl, analysis.detections, canvasRef.current);
  }, [previewUrl, analysis]);

  const total = useMemo(() => rows.reduce((sum, row) => sum + row.approvedCount, 0), [rows]);
  const canApply = rows.length > 0 && (!settings?.reviewRequired || reviewed);

  const analyze = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Lütfen JPG, PNG veya WEBP biçiminde bir fotoğraf seçin.');
      return;
    }
    setAnalyzing(true);
    setError(null);
    setReviewed(false);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    try {
      const result = await analyzePestImage(file, settings?.preferredModel ?? 'Auto');
      setAnalysis(result);
      const grouped = new Map<string, { pestName: string; count: number; confidence: number }>();
      result.detections.forEach((detection) => {
        const current = grouped.get(detection.pestKey) ?? { pestName: detection.pestName, count: 0, confidence: 0 };
        current.count += 1;
        current.confidence += detection.confidence;
        grouped.set(detection.pestKey, current);
      });
      setRows(
        [...grouped]
          .map(([pestKey, item]) => ({
            pestKey,
            pestName: item.pestName,
            detectedCount: item.count,
            approvedCount: item.count,
            meanConfidence: item.confidence / item.count,
          }))
          .sort((a, b) => b.approvedCount - a.approvedCount),
      );
      if (result.detections.length === 0) {
        setError('Model bu fotoğrafta belirgin zararlı bulamadı. Manuel tür ekleyebilir veya başka bir açıdan tekrar çekebilirsiniz.');
      }
    } catch (analysisError) {
      setAnalysis(null);
      setRows([]);
      setError(analysisError instanceof Error ? analysisError.message : 'Fotoğraf analiz edilemedi.');
    } finally {
      setAnalyzing(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const updateCount = (pestKey: string, approvedCount: number) => {
    setRows((current) =>
      current.map((row) =>
        row.pestKey === pestKey
          ? { ...row, approvedCount: Math.max(0, Math.min(100000, Math.round(approvedCount || 0))) }
          : row,
      ),
    );
    setReviewed(false);
  };

  const addManualClass = (pestKey: string) => {
    if (!pestKey || rows.some((row) => row.pestKey === pestKey)) return;
    const pestName = manualClasses.find(([key]) => key === pestKey)?.[1] ?? pestKey;
    setRows((current) => [...current, { pestKey, pestName, detectedCount: 0, approvedCount: 1, meanConfidence: 0 }]);
    setReviewed(false);
  };

  const apply = () => {
    const accepted = rows.filter((row) => row.approvedCount > 0);
    const compactResult = analysis
      ? JSON.stringify({
          imageWidth: analysis.imageWidth,
          imageHeight: analysis.imageHeight,
          runtime: analysis.runtime,
          durationMs: analysis.durationMs,
          detections: analysis.detections.slice(0, 200),
          totalDetections: analysis.detections.length,
        })
      : undefined;
    const observations: ReportPestObservationInput[] = accepted.map((row) => {
      const edited = analysis != null && row.approvedCount !== row.detectedCount;
      return {
        pestKey: row.pestKey,
        pestName: row.pestName,
        detectedCount: row.detectedCount,
        approvedCount: row.approvedCount,
        meanConfidence: Number(row.meanConfidence.toFixed(4)),
        source: analysis ? (edited ? 'VisionEdited' : 'PestneerVision') : 'Manual',
        modelName: analysis?.modelName,
        modelVersion: analysis?.modelVersion,
        reviewStatus: 'Approved',
        visionResultJson: compactResult,
        analyzedAt: new Date().toISOString(),
      };
    });
    const dominant = [...accepted].sort((a, b) => b.approvedCount - a.approvedCount)[0];
    onApply(observations, {
      total: accepted.reduce((sum, row) => sum + row.approvedCount, 0),
      dominantPest: dominant?.pestName ?? '',
    });
    setReviewed(true);
  };

  if (!settings) {
    return (
      <div className="vision-inline-loading">
        <RefreshCw className="spin-icon" size={17} /> PestneerVision hazırlanıyor…
      </div>
    );
  }
  if (!settings.enabled && value.length === 0) return null;

  return (
    <section className="vision-analyzer">
      <header>
        <span>
          <BrainCircuit />
        </span>
        <div>
          <strong>PestneerVision kart analizi</strong>
          <small>Sinek cihazı veya yapışkan kart fotoğrafındaki zararlıları cihazınızda sayar.</small>
        </div>
        {analysis && (
          <em>
            {analysis.modelName} · {analysis.runtime.toUpperCase()} · {(analysis.durationMs / 1000).toFixed(1)} sn
          </em>
        )}
      </header>

      {!disabled && (
        <div className="vision-upload-row">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            hidden
            onChange={(event) => void analyze(event.target.files?.[0])}
          />
          <button type="button" disabled={analyzing} onClick={() => inputRef.current?.click()}>
            {analyzing ? <RefreshCw className="spin-icon" /> : <ImagePlus />}
            {analyzing ? 'Kart analiz ediliyor…' : analysis ? 'Başka fotoğraf analiz et' : 'Kart fotoğrafı çek / seç'}
          </button>
          <select
            defaultValue=""
            aria-label="Manuel zararlı sınıfı ekle"
            onChange={(event) => {
              addManualClass(event.target.value);
              event.target.value = '';
            }}
          >
            <option value="">+ Manuel tür ekle</option>
            {manualClasses
              .filter(([key]) => !rows.some((row) => row.pestKey === key))
              .map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
          </select>
        </div>
      )}

      {previewUrl && (
        <div className="vision-preview">
          <canvas ref={canvasRef} aria-label="Analiz edilen yapışkan kart" />
          <span>
            <Sparkles size={15} /> {analysis?.detections.length ?? 0} nesne önerisi
          </span>
        </div>
      )}

      {rows.length > 0 && (
        <div className="vision-count-list">
          {rows.map((row) => (
            <div key={row.pestKey}>
              <span>
                <strong>{row.pestName}</strong>
                <small>
                  Model: {row.detectedCount} · Güven: %{Math.round(row.meanConfidence * 100)}
                </small>
              </span>
              <div>
                <button
                  type="button"
                  disabled={disabled || row.approvedCount === 0}
                  aria-label={`${row.pestName} sayısını azalt`}
                  onClick={() => updateCount(row.pestKey, row.approvedCount - 1)}
                >
                  <Minus />
                </button>
                <input
                  type="number"
                  min="0"
                  max="100000"
                  value={row.approvedCount}
                  disabled={disabled}
                  onChange={(event) => updateCount(row.pestKey, Number(event.target.value))}
                  aria-label={`${row.pestName} onaylanan sayısı`}
                />
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={`${row.pestName} sayısını artır`}
                  onClick={() => updateCount(row.pestKey, row.approvedCount + 1)}
                >
                  <Plus />
                </button>
                {!disabled && (
                  <button
                    type="button"
                    className="vision-remove"
                    aria-label={`${row.pestName} sonucunu kaldır`}
                    onClick={() => {
                      setRows((current) => current.filter((item) => item.pestKey !== row.pestKey));
                      setReviewed(false);
                    }}
                  >
                    <Trash2 />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div className="vision-total">
          <span>Onaylanacak toplam</span>
          <strong>{total}</strong>
        </div>
      )}

      {settings.reviewRequired && rows.length > 0 && !disabled && (
        <label className="vision-review-check">
          <input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />
          <span>
            <strong>Sonuçları kontrol ettim</strong>
            <small>Hatalı sayımları yukarıdaki + / − alanlarından düzelttim.</small>
          </span>
        </label>
      )}

      {!disabled && rows.length > 0 && (
        <button type="button" className="vision-apply" disabled={!canApply} onClick={apply}>
          <CheckCircle2 /> Onayla ve istasyona işle
        </button>
      )}

      {error && <div className="vision-error">{error}</div>}
      <p className="vision-disclaimer">{settings.disclaimer || defaultDisclaimer}</p>
    </section>
  );
}

function toRow(item: ReportPestObservationInput): CountRow {
  return {
    pestKey: item.pestKey,
    pestName: item.pestName,
    detectedCount: item.detectedCount,
    approvedCount: item.approvedCount,
    meanConfidence: item.meanConfidence,
  };
}

async function drawDetections(url: string, detections: VisionDetection[], canvas: HTMLCanvasElement | null) {
  if (!canvas) return;
  const image = new Image();
  image.src = url;
  await image.decode();
  const maxWidth = 480;
  const scale = Math.min(1, maxWidth / image.width);
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const context = canvas.getContext('2d');
  if (!context) return;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const top = [...detections].sort((a, b) => b.confidence - a.confidence).slice(0, 80);
  for (const detection of top) {
    const color = boxColors[detection.pestKey] ?? '#0f766e';
    const x = detection.x * scale;
    const y = detection.y * scale;
    const width = detection.width * scale;
    const height = detection.height * scale;
    context.strokeStyle = color;
    context.lineWidth = Math.max(1.5, 2 * scale);
    context.strokeRect(x, y, width, height);
    const label = `${detection.pestName} ${Math.round(detection.confidence * 100)}%`;
    context.font = 'bold 10px system-ui, sans-serif';
    const textWidth = context.measureText(label).width + 8;
    context.fillStyle = color;
    context.fillRect(x, Math.max(0, y - 14), textWidth, 14);
    context.fillStyle = '#fff';
    context.fillText(label, x + 4, Math.max(10, y - 4));
  }
}
