import type { InferenceSession } from 'onnxruntime-web';
import type { VisionModelPreference } from './pestneerVisionApi';

type ModelKey = 'pVision' | 'pLens';
type Manifest = {
  version: string;
  inputSize: number;
  tileSize: number;
  tileOverlap: number;
  confidenceThreshold: number;
  nmsThreshold: number;
  classes: string[];
  models: Record<ModelKey, { url: string; preferredRuntime: string }>;
};

const modelLabels: Record<ModelKey, string> = {
  pVision: 'pVision',
  pLens: 'pLens',
};

export type VisionDetection = {
  pestKey: string;
  pestName: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type VisionAnalysis = {
  modelKey: ModelKey;
  modelName: string;
  modelVersion: string;
  runtime: 'webgpu' | 'wasm';
  imageWidth: number;
  imageHeight: number;
  detections: VisionDetection[];
  durationMs: number;
};

const labels: Record<string, string> = {
  fly: 'Sinek',
  bee_wasp: 'Arı / yaban arısı',
  moth_butterfly: 'Güve / kelebek',
  beetle: 'Böcek / kınkanatlı',
  cockroach: 'Hamamböceği',
  grasshopper_cricket: 'Çekirge / cırcır böceği',
  termite: 'Termit',
  other_insect: 'Diğer böcek',
};

let manifestPromise: Promise<Manifest> | undefined;
let runtimePromise: Promise<typeof import('onnxruntime-web/webgpu')> | undefined;
const sessionCache = new Map<string, Promise<InferenceSession>>();

export async function analyzePestImage(file: File, preference: VisionModelPreference): Promise<VisionAnalysis> {
  const startedAt = performance.now();
  const manifest = await loadManifest();
  const image = await createImageBitmap(file);
  try {
    const modelKey = selectModel(preference);
    const wantsWebGpu = modelKey === 'pLens' && supportsWebGpu();
    let runtime: VisionAnalysis['runtime'] = wantsWebGpu ? 'webgpu' : 'wasm';
    let activeKey: ModelKey = modelKey;
    let session: InferenceSession;
    try {
      session = await getSession(manifest.models[activeKey].url, runtime);
    } catch {
      activeKey = 'pVision';
      runtime = 'wasm';
      session = await getSession(manifest.models.pVision.url, runtime);
    }
    const ort = await loadRuntime();
    const tiles = createTiles(image.width, image.height, manifest.tileSize, manifest.tileOverlap);
    const detections: VisionDetection[] = [];
    const inputName = session.inputNames[0] ?? 'images';
    const outputName = session.outputNames[0] ?? 'output';
    for (const tile of tiles) {
      const prepared = prepareTile(image, tile, manifest.inputSize);
      const result = await session.run({
        [inputName]: new ort.Tensor('float32', prepared.data, [1, 3, manifest.inputSize, manifest.inputSize]),
      });
      const output = result[outputName] ?? Object.values(result)[0];
      if (!output) throw new Error('Model beklenen çıktı katmanını üretmedi.');
      detections.push(...decodeOutput(output.data as Float32Array, manifest, tile, prepared.scale, image.width, image.height));
    }
    return {
      modelKey: activeKey,
      modelName: modelLabels[activeKey],
      modelVersion: manifest.version,
      runtime,
      imageWidth: image.width,
      imageHeight: image.height,
      detections: nonMaximumSuppression(detections, manifest.nmsThreshold),
      durationMs: Math.round(performance.now() - startedAt),
    };
  } finally {
    image.close();
  }
}

async function loadManifest() {
  manifestPromise ??= fetch('/models/pestneer-vision/manifest.json').then(async (response) => {
    if (!response.ok) throw new Error('PestneerVision model tanımı yüklenemedi.');
    return response.json() as Promise<Manifest>;
  });
  return manifestPromise;
}

function selectModel(preference: VisionModelPreference): ModelKey {
  if (preference === 'pVision') return 'pVision';
  if (preference === 'pLens') return supportsWebGpu() ? 'pLens' : 'pVision';
  return supportsWebGpu() && !isMobileDevice() ? 'pLens' : 'pVision';
}

function supportsWebGpu() {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

function isMobileDevice() {
  return typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

async function getSession(url: string, runtime: VisionAnalysis['runtime']) {
  const ort = await loadRuntime();
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  const key = `${runtime}:${url}`;
  let promise = sessionCache.get(key);
  if (!promise) {
    promise = ort.InferenceSession.create(url, { executionProviders: runtime === 'webgpu' ? ['webgpu', 'wasm'] : ['wasm'] });
    sessionCache.set(key, promise);
  }
  try { return await promise; }
  catch (error) {
    sessionCache.delete(key);
    if (runtime === 'webgpu') {
      return getSession(
        url
          .replace('pestneer-plens-v1.onnx', 'pestneer-pvision-v1.onnx')
          .replace('pestneer-vision-tiny-v1.onnx', 'pestneer-pvision-v1.onnx'),
        'wasm',
      );
    }
    throw error;
  }
}

function loadRuntime() {
  runtimePromise ??= import('onnxruntime-web/webgpu');
  return runtimePromise;
}

type Tile = { x: number; y: number; width: number; height: number };

function createTiles(width: number, height: number, tileSize: number, overlap: number): Tile[] {
  if (width <= tileSize && height <= tileSize) return [{ x: 0, y: 0, width, height }];
  const step = Math.max(1, tileSize - overlap);
  const xs = axisStarts(width, tileSize, step);
  const ys = axisStarts(height, tileSize, step);
  return ys.flatMap((y) => xs.map((x) => ({ x, y, width: Math.min(tileSize, width - x), height: Math.min(tileSize, height - y) })));
}

function axisStarts(length: number, tileSize: number, step: number) {
  if (length <= tileSize) return [0];
  const values: number[] = [];
  for (let value = 0; value < length - tileSize; value += step) values.push(value);
  values.push(length - tileSize);
  return [...new Set(values)];
}

function prepareTile(image: ImageBitmap, tile: Tile, inputSize: number) {
  const canvas = document.createElement('canvas');
  canvas.width = inputSize;
  canvas.height = inputSize;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Görüntü işleme alanı oluşturulamadı.');
  context.fillStyle = 'rgb(114,114,114)';
  context.fillRect(0, 0, inputSize, inputSize);
  const scale = Math.min(inputSize / tile.width, inputSize / tile.height);
  context.drawImage(image, tile.x, tile.y, tile.width, tile.height, 0, 0, tile.width * scale, tile.height * scale);
  const rgba = context.getImageData(0, 0, inputSize, inputSize).data;
  const pixels = inputSize * inputSize;
  const data = new Float32Array(pixels * 3);
  for (let index = 0; index < pixels; index += 1) {
    data[index] = rgba[index * 4 + 2];
    data[pixels + index] = rgba[index * 4 + 1];
    data[pixels * 2 + index] = rgba[index * 4];
  }
  return { data, scale };
}

function decodeOutput(output: Float32Array, manifest: Manifest, tile: Tile, scale: number, imageWidth: number, imageHeight: number) {
  const rowSize = 5 + manifest.classes.length;
  const detections: VisionDetection[] = [];
  for (let offset = 0; offset < output.length; offset += rowSize) {
    const objectness = output[offset + 4];
    let classIndex = 0;
    let classScore = 0;
    for (let index = 0; index < manifest.classes.length; index += 1) {
      if (output[offset + 5 + index] > classScore) {
        classScore = output[offset + 5 + index];
        classIndex = index;
      }
    }
    const confidence = objectness * classScore;
    if (confidence < manifest.confidenceThreshold) continue;
    const centerX = output[offset] / scale + tile.x;
    const centerY = output[offset + 1] / scale + tile.y;
    const width = output[offset + 2] / scale;
    const height = output[offset + 3] / scale;
    const left = Math.max(0, centerX - width / 2);
    const top = Math.max(0, centerY - height / 2);
    const right = Math.min(imageWidth, centerX + width / 2);
    const bottom = Math.min(imageHeight, centerY + height / 2);
    if (right <= left || bottom <= top) continue;
    const pestKey = manifest.classes[classIndex];
    detections.push({ pestKey, pestName: labels[pestKey] ?? pestKey, confidence, x: left, y: top, width: right - left, height: bottom - top });
  }
  return detections;
}

function nonMaximumSuppression(detections: VisionDetection[], threshold: number) {
  const accepted: VisionDetection[] = [];
  const groups = new Map<string, VisionDetection[]>();
  detections.forEach((item) => groups.set(item.pestKey, [...(groups.get(item.pestKey) ?? []), item]));
  for (const group of groups.values()) {
    const candidates = [...group].sort((a, b) => b.confidence - a.confidence);
    while (candidates.length) {
      const current = candidates.shift()!;
      accepted.push(current);
      for (let index = candidates.length - 1; index >= 0; index -= 1) {
        if (intersectionOverUnion(current, candidates[index]) >= threshold) candidates.splice(index, 1);
      }
    }
  }
  return accepted;
}

function intersectionOverUnion(first: VisionDetection, second: VisionDetection) {
  const left = Math.max(first.x, second.x);
  const top = Math.max(first.y, second.y);
  const right = Math.min(first.x + first.width, second.x + second.width);
  const bottom = Math.min(first.y + first.height, second.y + second.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union = first.width * first.height + second.width * second.height - intersection;
  return union > 0 ? intersection / union : 0;
}
