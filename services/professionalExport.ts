import { RenderMetadata, SceneDocument } from '../types';

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportImage(dataUrl: string, format: 'png' | 'jpeg' | 'webp', quality: number) {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = reject;
    element.src = dataUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  canvas.getContext('2d')!.drawImage(image, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Export encoding failed.')), `image/${format}`, quality / 100));
  downloadBlob(blob, `lumina-render-${Date.now()}.${format === 'jpeg' ? 'jpg' : format}`);
}

export function exportScenePackage(scene: SceneDocument, metadata?: RenderMetadata) {
  const payload = JSON.stringify({ scene, render: metadata }, null, 2);
  downloadBlob(new Blob([payload], { type: 'application/json' }), `lumina-scene-${Date.now()}.json`);
}
