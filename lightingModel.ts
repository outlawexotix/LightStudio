import type { LightSource } from './types';

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export interface LightRenderModel {
  intensity: number;
  exposure: number;
  opacity: number;
  softness: number;
  shadow: number;
  sizeScale: number;
  footprintRadiusPct: number;
  footprintDiameterPct: number;
  coreRadiusPct: number;
  angle: number;
}

export function calculateTargetAngle(x: number, y: number, targetX: number, targetY: number): number {
  const dx = targetX - x;
  const dy = targetY - y;
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return 0;
  const degrees = (Math.atan2(dx, dy) * 180) / Math.PI;
  return ((degrees % 360) + 360) % 360;
}

export function calculateTargetDistance(x: number, y: number, targetX: number, targetY: number): number {
  const dx = targetX - x;
  const dy = targetY - y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Shared optical interpretation used by both the live preview and AI prompt. */
export function getLightRenderModel(light: Pick<LightSource,
  'intensity' | 'exposure' | 'opacity' | 'depthOfField' | 'shadowIntensity' | 'size' | 'rotation' | 'targetX' | 'targetY' | 'useTarget' | 'x' | 'y'
>): LightRenderModel {
  const intensity = clamp(light.intensity / 100);
  const exposure = clamp(light.exposure / 100);
  const opacity = clamp((light.opacity ?? 100) / 100);
  const softness = clamp(light.depthOfField / 100);
  const shadow = clamp((light.shadowIntensity ?? 40) / 100);
  const sizeScale = clamp((light.size ?? 100) / 100, 0.1, 3);
  const footprintRadiusPct = clamp(8 + 20 * sizeScale, 8, 68);

  const rawAngle = light.useTarget && light.targetX !== undefined && light.targetY !== undefined && light.x !== undefined && light.y !== undefined
    ? calculateTargetAngle(light.x, light.y, light.targetX, light.targetY)
    : light.rotation;

  return {
    intensity,
    exposure,
    opacity,
    softness,
    shadow,
    sizeScale,
    footprintRadiusPct,
    footprintDiameterPct: footprintRadiusPct * 2,
    coreRadiusPct: clamp(1.5 + exposure * 5.5, 1.5, 7),
    angle: ((rawAngle % 360) + 360) % 360,
  };
}
