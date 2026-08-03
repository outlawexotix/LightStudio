export enum LightType {
  Point = 'Physical point light',
  Spot = 'Physical spot light',
  Area = 'Physical area light',
  Tube = 'Physical tube light',
  Environment = 'Physical environment light',
  Pinpoint = 'A simple, bright pinpoint of light',
  Volumetric = 'Soft, volumetric light casting visible rays',
  Lens_Flare = 'A cinematic lens flare effect',
  God_RAYS = 'Dramatic god rays beaming down',
  Lightning = 'A bright, jagged lightning strike',
}

export interface LightSource {
  id: string;
  x: number; // percentage
  y: number; // percentage
  type: LightType;
  exposure: number; // 0-100
  depthOfField: number; // 0-100 (blur amount)
  intensity: number; // 0-100
  direction: number; // 0-360
  rotation: number; // 0-360
  color: string; // hex color or preset name
  size: number; // 10-300 (scale/size of the light source)
  shadowIntensity: number; // 0-100 (strength/darkness of cast shadows)
  opacity: number; // 0-100 (global blend opacity)
  placement?: 'foreground' | 'background'; // Depth layer placement
  subjectIsolation?: number; // Subject masking/isolation strength (0-100)
  rimLightIntensity?: number; // Silhouette edge rim light power (0-100)
  zDepth?: number; // -100 behind subject, 0 subject plane, 100 in front
  coneAngle?: number; // spot/beam cone in degrees (5-120)
  falloff?: number; // inverse-square falloff blend (0-100)
  temperature?: number; // white-balance temperature in Kelvin (1800-12000)
  length?: number; // tube/area aspect control (10-300)
  targetX?: number; // Target Look-At center X (0-100)
  targetY?: number; // Target Look-At center Y (0-100)
  useTarget?: boolean; // Whether Target Look-At control is enabled
  enabled?: boolean; // Whether this light layer is active/enabled
}

export type MaskBrushMode = 'add' | 'erase';

export interface MaskStroke {
  id: string;
  points: Array<{ x: number; y: number }>;
  radius: number;
  mode: MaskBrushMode;
}

export interface ControlMapBundle {
  lightMap: string;
  colorMap: string;
  directionMap: string;
  depthMap: string;
  subjectMask: string;
  width: number;
  height: number;
}

export interface RenderMetadata {
  sceneHash: string;
  renderId: string;
  generatedAt: string;
  model: string;
  matchScore?: number;
}

export interface SceneDocument {
  version: 2;
  name: string;
  savedAt: string;
  lights: LightSource[];
  subjectBounds: SubjectBounds;
  maskStrokes: MaskStroke[];
  model: string;
}

export interface SubjectBounds {
  x: number;      // center X (0-100)
  y: number;      // center Y (0-100)
  width: number;  // width percentage (5-100)
  height: number; // height percentage (5-100)
  enabled: boolean;
  opacity: number; // visual helper mask opacity (0-100)
  isolationStrength?: number; // 0-100
  subjectLabel?: string;      // custom text description of the subject
  detectionMode?: 'auto' | 'portrait' | 'product' | 'animal' | 'vehicle';
  edgeRefinement?: number;    // 0-100 (edge crispness / matting sensitivity)
}
