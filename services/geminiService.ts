import { ControlMapBundle, LightSource, RenderMetadata, SubjectBounds } from '../types';
import { Capacitor } from '@capacitor/core';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('The selected image is no longer readable. Please upload it again.'));
    reader.readAsDataURL(file);
  });
}

export async function editImageWithAI(
  image: File | string,
  lights: LightSource[],
  subjectBounds?: SubjectBounds,
  model: string = 'gemini-3.1-flash-lite-image',
  controlMaps?: ControlMapBundle,
  sceneHash?: string,
  signal?: AbortSignal,
): Promise<{ editedImage: string | null; metadata?: RenderMetadata }> {
  try {
    const imageData = typeof image === 'string' ? image : await fileToBase64(image);

    const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || (Capacitor.isNativePlatform() ? 'http://localhost:3000' : '')).replace(/\/+$/, '');
    const apiAccessToken = import.meta.env.VITE_API_ACCESS_TOKEN || '';
    const isLocalDevelopmentEndpoint = /^http:\/\/(10\.0\.2\.2|127\.0\.0\.1|localhost)(:\d+)?$/.test(apiBaseUrl);
    if (Capacitor.isNativePlatform() && !isLocalDevelopmentEndpoint && !apiAccessToken && !apiBaseUrl) {
      throw new Error(
        'This Android build has no backend configured. Set VITE_API_BASE_URL to the HTTPS URL of the Lumina server, then rebuild the app.'
      );
    }

    const response = await fetch(`${apiBaseUrl}/api/edit-image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiAccessToken ? { Authorization: `Bearer ${apiAccessToken}` } : {}),
      },
      signal,
      body: JSON.stringify({
        image: imageData,
        lights,
        subjectBounds,
        model,
        controlMaps,
        sceneHash,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Server returned error status ${response.status}`);
    }

    const data = await response.json();
    return { editedImage: data.editedImage || null, metadata: data.metadata };
  } catch (error) {
    if (signal?.aborted) {
      throw new DOMException('Generation canceled.', 'AbortError');
    }
    console.error("Error editing image with AI:", error);
    throw new Error(error instanceof Error ? error.message : "Failed to generate image. Please try again.");
  }
}
