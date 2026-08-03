import { ControlMapBundle, LightSource, MaskStroke, SceneDocument, SubjectBounds } from '../types';
import { getLightRenderModel } from '../lightingModel';

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export function stableSceneHash(value: unknown): string {
  const normalized = JSON.stringify(value, (_key, item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    return Object.keys(item as Record<string, unknown>).sort().reduce<Record<string, unknown>>((result, key) => {
      result[key] = (item as Record<string, unknown>)[key];
      return result;
    }, {});
  });
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `lumina-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (source.startsWith('http://') || source.startsWith('https://')) {
      image.crossOrigin = 'anonymous';
    }
    image.onload = () => resolve(image);
    image.onerror = () => {
      if (image.crossOrigin) {
        const retryImage = new Image();
        retryImage.onload = () => resolve(retryImage);
        retryImage.onerror = () => reject(new Error('Could not analyze the source image.'));
        retryImage.src = source;
      } else {
        reject(new Error('Could not analyze the source image.'));
      }
    };
    image.src = source;
  });
}

function colorHex(value: string): [number, number, number] {
  const match = value.match(/#([0-9a-f]{6})/i);
  const hex = match?.[1] || 'ffffff';
  return [Number.parseInt(hex.slice(0, 2), 16), Number.parseInt(hex.slice(2, 4), 16), Number.parseInt(hex.slice(4, 6), 16)];
}

function drawStrokes(context: CanvasRenderingContext2D, strokes: MaskStroke[], width: number, height: number) {
  for (const stroke of strokes) {
    if (!stroke.points.length) continue;
    context.save();
    context.globalCompositeOperation = stroke.mode === 'erase' ? 'destination-out' : 'source-over';
    context.strokeStyle = '#fff';
    context.fillStyle = '#fff';
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = Math.max(2, stroke.radius * 2 * Math.min(width, height) / 100);
    context.beginPath();
    stroke.points.forEach((point, index) => {
      const x = point.x * width / 100;
      const y = point.y * height / 100;
      if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    });
    if (stroke.points.length === 1) context.arc(stroke.points[0].x * width / 100, stroke.points[0].y * height / 100, context.lineWidth / 2, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }
}

/** Builds compact, deterministic image-space guides consumed by both preview analysis and Gemini. */
export async function buildControlMaps(
  imageSource: string,
  lights: LightSource[],
  subject: SubjectBounds,
  strokes: MaskStroke[],
): Promise<ControlMapBundle> {
  const source = await loadImage(imageSource);
  const width = 512;
  const height = Math.max(256, Math.round(width / (source.naturalWidth / source.naturalHeight)));
  const makeCanvas = () => Object.assign(document.createElement('canvas'), { width, height });
  const lightCanvas = makeCanvas();
  const colorCanvas = makeCanvas();
  const directionCanvas = makeCanvas();
  const depthCanvas = makeCanvas();
  const maskCanvas = makeCanvas();
  const lightContext = lightCanvas.getContext('2d')!;
  const colorContext = colorCanvas.getContext('2d')!;
  const directionContext = directionCanvas.getContext('2d')!;
  const depthContext = depthCanvas.getContext('2d')!;
  const maskContext = maskCanvas.getContext('2d', { willReadFrequently: true })!;

  lightContext.fillStyle = '#000'; lightContext.fillRect(0, 0, width, height);
  colorContext.fillStyle = '#000'; colorContext.fillRect(0, 0, width, height);
  directionContext.fillStyle = '#000'; directionContext.fillRect(0, 0, width, height);
  depthContext.fillStyle = '#000'; depthContext.fillRect(0, 0, width, height);
  maskContext.fillStyle = '#000'; maskContext.fillRect(0, 0, width, height);

  lightContext.globalCompositeOperation = 'lighter';
  colorContext.globalCompositeOperation = 'lighter';
  directionContext.globalCompositeOperation = 'lighter';

  const activeLights = lights.filter(l => l.enabled !== false);
  for (const light of activeLights) {
    const x = light.x * width / 100;
    const y = light.y * height / 100;
    const radius = Math.max(16, light.size * width / 500);
    const strength = clamp(light.intensity * (light.opacity ?? 100) / 10000);
    const [red, green, blue] = colorHex(light.color);

    // 1. Light Intensity Map (White core fading to black boundary)
    const radial = lightContext.createRadialGradient(x, y, 0, x, y, radius);
    radial.addColorStop(0, `rgba(255,255,255,${strength})`);
    radial.addColorStop(0.35, `rgba(255,255,255,${strength * 0.7})`);
    radial.addColorStop(1, 'rgba(0,0,0,0)');
    lightContext.fillStyle = radial;
    lightContext.beginPath();
    lightContext.arc(x, y, radius, 0, Math.PI * 2);
    lightContext.fill();

    // 2. Light Color Map
    const colorRadial = colorContext.createRadialGradient(x, y, 0, x, y, radius);
    colorRadial.addColorStop(0, `rgba(${red},${green},${blue},${strength})`);
    colorRadial.addColorStop(0.5, `rgba(${red},${green},${blue},${strength * 0.5})`);
    colorRadial.addColorStop(1, 'rgba(0,0,0,0)');
    colorContext.fillStyle = colorRadial;
    colorContext.beginPath();
    colorContext.arc(x, y, radius, 0, Math.PI * 2);
    colorContext.fill();

    // 3. Direction Vector & Z-depth Map
    const optics = getLightRenderModel(light);
    const angle = optics.angle * Math.PI / 180;
    const redCh = Math.round((Math.sin(angle) + 1) * 127.5);
    const greenCh = Math.round((Math.cos(angle) + 1) * 127.5);
    const blueCh = Math.round(clamp((light.zDepth ?? 0) / 200 + 0.5) * 255);

    directionContext.strokeStyle = `rgba(${redCh},${greenCh},${blueCh},${Math.max(0.5, strength)})`;
    directionContext.lineWidth = Math.max(4, radius * 0.18);
    directionContext.beginPath();
    directionContext.moveTo(x, y);
    directionContext.lineTo(x + Math.sin(angle) * radius * 1.2, y + Math.cos(angle) * radius * 1.2);
    directionContext.stroke();

    directionContext.fillStyle = `rgb(${redCh},${greenCh},${blueCh})`;
    directionContext.beginPath();
    directionContext.arc(x, y, Math.max(5, radius * 0.16), 0, Math.PI * 2);
    directionContext.fill();
  }

  maskContext.fillStyle = '#000';
  maskContext.fillRect(0, 0, width, height);
  if (subject.enabled) {
    const x = subject.x * width / 100;
    const y = subject.y * height / 100;
    const radiusX = subject.width * width / 200;
    const radiusY = subject.height * height / 200;
    try {
      // Estimate foreground saliency from focus position and color distance from image-border pixels.
      const sourceCanvas = makeCanvas();
      const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true })!;
      sourceContext.drawImage(source, 0, 0, width, height);
      const pixels = sourceContext.getImageData(0, 0, width, height).data;
      const background = [0, 0, 0];
      let backgroundSamples = 0;
      for (let py = 0; py < height; py += Math.max(1, Math.floor(height / 24))) {
        for (const px of [0, Math.min(width - 1, 3), Math.max(0, width - 4), width - 1]) {
          const index = (py * width + px) * 4;
          background[0] += pixels[index]; background[1] += pixels[index + 1]; background[2] += pixels[index + 2];
          backgroundSamples += 1;
        }
      }
      background.forEach((_value, channel) => { background[channel] /= backgroundSamples; });
      const segmentation = maskContext.createImageData(width, height);
      const threshold = .2 + (subject.edgeRefinement ?? 50) / 250;
      for (let py = 0; py < height; py += 1) {
        for (let px = 0; px < width; px += 1) {
          const index = (py * width + px) * 4;
          const ellipseDistance = Math.hypot((px - x) / Math.max(1, radiusX), (py - y) / Math.max(1, radiusY));
          const prior = clamp(1.18 - ellipseDistance);
          const difference = Math.hypot(pixels[index] - background[0], pixels[index + 1] - background[1], pixels[index + 2] - background[2]) / 441.7;
          const confidence = clamp((prior * .72 + difference * .42 - threshold) * 2.2);
          const value = Math.round(confidence * 255);
          segmentation.data.set([value, value, value, 255], index);
        }
      }
      maskContext.putImageData(segmentation, 0, 0);
    } catch (_err) {
      maskContext.fillStyle = '#fff';
      maskContext.beginPath();
      maskContext.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2);
      maskContext.fill();
    }
  }
  drawStrokes(maskContext, strokes, width, height);

  const maskImage = maskContext.getImageData(0, 0, width, height);
  const depthImage = depthContext.createImageData(width, height);
  for (let index = 0; index < maskImage.data.length; index += 4) {
    const mask = maskImage.data[index] / 255;
    const px = (index / 4) % width;
    const py = Math.floor(index / 4 / width);
    const perspective = 1 - py / height;
    const depth = Math.round(255 * clamp(.18 + perspective * .25 + mask * .57));
    depthImage.data.set([depth, depth, depth, 255], index);
  }
  depthContext.putImageData(depthImage, 0, 0);

  return {
    lightMap: lightCanvas.toDataURL('image/png'),
    colorMap: colorCanvas.toDataURL('image/png'),
    directionMap: directionCanvas.toDataURL('image/png'),
    depthMap: depthCanvas.toDataURL('image/png'),
    subjectMask: maskCanvas.toDataURL('image/png'),
    width,
    height,
  };
}

export async function calculatePreviewMatch(original: string, rendered: string, lights: LightSource[]): Promise<number> {
  if (!lights.length) return 100;
  const [source, result] = await Promise.all([loadImage(original), loadImage(rendered)]);
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  const sample = (image: HTMLImageElement) => {
    context.clearRect(0, 0, 96, 96);
    context.drawImage(image, 0, 0, 96, 96);
    return context.getImageData(0, 0, 96, 96).data;
  };
  const before = sample(source);
  const after = sample(result);
  let error = 0;
  for (const light of lights) {
    const cx = Math.round(light.x * .95);
    const cy = Math.round(light.y * .95);
    let delta = 0;
    let samples = 0;
    for (let y = Math.max(0, cy - 5); y <= Math.min(95, cy + 5); y += 2) {
      for (let x = Math.max(0, cx - 5); x <= Math.min(95, cx + 5); x += 2) {
        const i = (y * 96 + x) * 4;
        delta += ((after[i] + after[i + 1] + after[i + 2]) - (before[i] + before[i + 1] + before[i + 2])) / 765;
        samples += 1;
      }
    }
    const observed = clamp(delta / samples + .5);
    const expected = clamp(light.intensity * (light.opacity ?? 100) / 10000);
    error += Math.abs(observed - expected);
  }
  return Math.round(clamp(1 - error / lights.length) * 100);
}

const STORAGE_KEY = 'lumina-scenes-v2';

export function listSavedScenes(): SceneDocument[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as SceneDocument[]; } catch { return []; }
}

export function saveScene(scene: SceneDocument): SceneDocument[] {
  const scenes = [scene, ...listSavedScenes().filter(item => item.name !== scene.name)].slice(0, 20);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scenes));
  return scenes;
}

export function deleteScene(name: string): SceneDocument[] {
  const scenes = listSavedScenes().filter(scene => scene.name !== name);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scenes));
  return scenes;
}
