import React, { useRef, useState, useCallback, PointerEvent, useEffect } from 'react';
import { LightSource, LightType, MaskBrushMode, MaskStroke, SubjectBounds } from '../types';
import { GpuLightPreview } from './GpuLightPreview';
import { SunIcon, ZapIcon, CameraIcon, SunriseIcon, LayersIcon } from './icons';
import { getLightRenderModel, calculateTargetAngle } from '../lightingModel';

interface EditorCanvasProps {
  image: string | null;
  editedImage: string | null;
  lights: LightSource[];
  selectedLightId: string | null;
  subjectBounds: SubjectBounds;
  onAddLight: (x: number, y: number) => void;
  onUpdateLight: (id: string, updates: Partial<LightSource>) => void;
  onSelectLight: (id: string | null) => void;
  onUpdateSubjectBounds: (bounds: SubjectBounds) => void;
  maskStrokes: MaskStroke[];
  maskMode: MaskBrushMode | null;
  maskBrushSize: number;
  onAddMaskStroke: (stroke: MaskStroke) => void;
  comparePosition: number;
  showComparison: boolean;
  onComparePositionChange: (position: number) => void;
}

const COLOR_HEX_MAP: Record<string, string> = {
  'Warm Gold (#ff9d42)': '#ff9d42',
  'Cool Cyan (#42a5ff)': '#42a5ff',
  'Neon Violet (#e042ff)': '#e042ff',
  'Cyber Red (#ff4242)': '#ff4242',
  'Aurora Green (#52ff42)': '#52ff42',
  'Candlelight Orange (#ff7a00)': '#ff7a00',
  'Pure White (#ffffff)': '#ffffff'
};

export function getLightColorHex(colorString: string): string {
  if (COLOR_HEX_MAP[colorString]) {
    return COLOR_HEX_MAP[colorString];
  }
  if (colorString.startsWith('#')) {
    return colorString;
  }
  const hexMatch = colorString.match(/#([0-9a-fA-F]{3,8})/);
  if (hexMatch) {
    return `#${hexMatch[1]}`;
  }
  return '#ff9d42';
}

class SeededRandom {
  private seed: number;
  constructor(seed: number) {
    this.seed = Math.sin(seed) * 10000;
  }
  next(): number {
    const x = Math.sin(this.seed++) * 10000;
    return x - Math.floor(x);
  }
  nextRange(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
}

function getNumericSeed(id: string, x: number, y: number, extra = 0): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash + Math.round(x * 100) + Math.round(y * 1000) + extra);
}

interface Point {
  x: number;
  y: number;
}

// Generates fractal points between two points using midpoint displacement
function generateFractalSegment(
  p1: Point,
  p2: Point,
  displace: number,
  rng: SeededRandom,
  minSegmentLength = 1.0,
  displacementReduction = 0.52
): Point[] {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance < minSegmentLength) {
    return [p1, p2];
  }

  const midX = (p1.x + p2.x) / 2;
  const midY = (p1.y + p2.y) / 2;

  // Perpendicular normal vector direction
  const nx = -dy / (distance || 1);
  const ny = dx / (distance || 1);

  // Random displacement offset
  const offset = rng.nextRange(-displace, displace);
  const midPoint = {
    x: midX + nx * offset,
    y: midY + ny * offset,
  };

  const left = generateFractalSegment(p1, midPoint, displace * displacementReduction, rng, minSegmentLength, displacementReduction);
  const right = generateFractalSegment(midPoint, p2, displace * displacementReduction, rng, minSegmentLength, displacementReduction);

  return [...left.slice(0, -1), ...right];
}

function pointsToSvgPath(points: Point[]): string {
  if (points.length === 0) return '';
  let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 1; i < points.length; i++) {
    path += ` L ${points[i].x.toFixed(2)} ${points[i].y.toFixed(2)}`;
  }
  return path;
}

// Highly controllable organic lightning strike generator
function generateOrganicLightning(
  light: LightSource
): { trunkPath: string; branches: string[] } {
  const seed = getNumericSeed(light.id, light.x, light.y, light.rotation + light.intensity);
  const rng = new SeededRandom(seed);

  // Calculate tilt angle of strike based on rotation (centered at 180 = straight down)
  let tiltAngle = light.rotation - 180;
  while (tiltAngle > 180) tiltAngle -= 360;
  while (tiltAngle < -180) tiltAngle += 360;

  // Clamp tilt to [-65, 65] degrees for realism
  const clampedTilt = Math.max(-65, Math.min(65, tiltAngle));
  const clampedTiltRad = (clampedTilt * Math.PI) / 180;

  // Solve starting sky point and ground strike ending point
  const startX = light.x - light.y * Math.tan(clampedTiltRad);
  const endX = light.x + (100 - light.y) * Math.tan(clampedTiltRad);

  const pStart = { x: startX, y: 0 };
  const pTarget = { x: light.x, y: light.y };
  const pEnd = { x: endX, y: 100 };

  // Control turbulence/jaggedness with shadowIntensity (0 to 100 mapped to displacement range)
  const jaggednessFactor = (light.shadowIntensity !== undefined ? light.shadowIntensity : 40) / 100;
  const initialDisplacement = jaggednessFactor * 10 + 1.5;

  // Recursive subdivision splits
  const upperPoints = generateFractalSegment(pStart, pTarget, initialDisplacement, rng, 1.2, 0.52);
  const lowerPoints = generateFractalSegment(pTarget, pEnd, initialDisplacement, rng, 1.2, 0.52);

  // Merge full trunk
  const trunkPoints = [...upperPoints.slice(0, -1), ...lowerPoints];
  const trunkPath = pointsToSvgPath(trunkPoints);

  // Generate branch forks based on intensity power
  const branches: string[] = [];
  const intensityFactor = light.intensity / 100;
  const numBranches = Math.floor(intensityFactor * 6);

  if (numBranches > 0 && trunkPoints.length > 8) {
    const availablePoints = trunkPoints.slice(3, -3);
    for (let b = 0; b < numBranches; b++) {
      const indexPct = (b + 0.2 + rng.next() * 0.5) / numBranches;
      const ptIndex = Math.floor(indexPct * availablePoints.length);
      const splitPt = availablePoints[ptIndex];

      // Branch splits away from tilt direction
      const splitAngle = clampedTiltRad + (rng.next() > 0.5 ? 1 : -1) * rng.nextRange(20, 45) * (Math.PI / 180);
      const remainingHeight = 100 - splitPt.y;

      if (remainingHeight > 4) {
        const branchLength = rng.nextRange(0.12, 0.38) * remainingHeight * (0.4 + intensityFactor * 0.6);
        const bEndX = splitPt.x + branchLength * Math.sin(splitAngle);
        const bEndY = splitPt.y + branchLength * Math.cos(splitAngle);

        const branchPoints = generateFractalSegment(
          splitPt,
          { x: bEndX, y: bEndY },
          initialDisplacement * 0.7,
          rng,
          1.0,
          0.54
        );
        branches.push(pointsToSvgPath(branchPoints));
      }
    }
  }

  return { trunkPath, branches };
}

const LightTypeIcon: React.FC<{ type: LightType, className?: string }> = ({ type, className }) => {
    switch (type) {
        case LightType.Pinpoint: return <SunIcon className={className} />;
        case LightType.Lightning: return <ZapIcon className={className} />;
        case LightType.Lens_Flare: return <CameraIcon className={className} />;
        case LightType.God_RAYS: return <SunriseIcon className={className} />;
        case LightType.Volumetric: return <LayersIcon className={className} />;
        default: return <SunIcon className={className} />;
    }
};

const CanvasSlider: React.FC<{
    label: string;
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
}> = ({ label, value, onChange, min = 0, max = 100 }) => (
    <div className="grid grid-cols-[2.2rem_1fr_1.8rem] items-center gap-x-1.5 w-full text-white">
        <label className="text-[9px] font-extrabold text-indigo-300 font-mono tracking-wider uppercase">{label}</label>
        <input
            type="range"
            min={min}
            max={max}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full h-1 bg-[#050811] border border-[#1b2542] rounded appearance-none cursor-pointer accent-indigo-500 focus:outline-none"
        />
        <span className="text-[9px] text-right font-mono text-indigo-400 font-bold">{value}</span>
    </div>
);

const LightControls: React.FC<{
  light: LightSource;
  onUpdateLight: (id: string, updates: Partial<LightSource>) => void;
  canvasRef: React.RefObject<HTMLDivElement>;
}> = ({ light, onUpdateLight, canvasRef }) => {
    const [position, setPosition] = useState({ top: 0, left: 0 });

    useEffect(() => {
        if (!canvasRef.current) return;
        const canvasRect = canvasRef.current.getBoundingClientRect();
        const controlWidth = 190; // px
        const controlHeight = 180; // px
        const offsetX = 35; // Horizontal offset from the light icon

        const lightX_px = (light.x / 100) * canvasRect.width;
        const lightY_px = (light.y / 100) * canvasRect.height;

        let finalLeft = lightX_px + offsetX;

        // If it overflows right, flip to the left
        if (finalLeft + controlWidth > canvasRect.width - 10) { // 10px padding
            finalLeft = lightX_px - offsetX - controlWidth;
        }

        // Clamp vertical position to stay within canvas bounds
        let finalTop = lightY_px - (controlHeight / 2);
        finalTop = Math.max(10, Math.min(finalTop, canvasRect.height - controlHeight - 10));

        setPosition({ top: finalTop, left: finalLeft });
    }, [light.x, light.y, canvasRef]);

    const handleInteraction = (e: React.PointerEvent) => {
        e.stopPropagation();
    };

    return (
        <div
            className="absolute bg-[#060a13]/95 backdrop-blur-xl p-3.5 rounded-xl shadow-[0_10px_35px_rgba(0,0,0,0.7)] space-y-2 border border-[#1d2742] relative"
            style={{
                width: '190px',
                top: `${position.top}px`,
                left: `${position.left}px`,
                transform: `scale(1)`,
                transition: 'top 0.1s ease-out, left 0.1s ease-out',
                zIndex: 40
            }}
            onPointerDown={handleInteraction}
            onClick={handleInteraction}
        >
            {/* Tech accents */}
            <div className="absolute top-1 left-1 w-1.5 h-1.5 border-t border-l border-indigo-500/50 pointer-events-none rounded-tl-xs" />
            <div className="absolute top-1 right-1 w-1.5 h-1.5 border-t border-r border-indigo-500/50 pointer-events-none rounded-tr-xs" />
            <div className="absolute bottom-1 left-1 w-1.5 h-1.5 border-b border-l border-indigo-500/50 pointer-events-none rounded-bl-xs" />
            <div className="absolute bottom-1 right-1 w-1.5 h-1.5 border-b border-r border-indigo-500/50 pointer-events-none rounded-br-xs" />

            <CanvasSlider label={light.type === LightType.Lightning ? "GLO" : "EXP"} value={light.exposure} onChange={(v) => onUpdateLight(light.id, { exposure: v })} />
            <CanvasSlider label={light.type === LightType.Lightning ? "BRN" : "INT"} value={light.intensity} onChange={(v) => onUpdateLight(light.id, { intensity: v })} />
            <CanvasSlider label={light.type === LightType.Lightning ? "BLR" : "DoF"} value={light.depthOfField} onChange={(v) => onUpdateLight(light.id, { depthOfField: v })} />
            <CanvasSlider label={light.type === LightType.Lightning ? "LEN" : "SIZ"} value={light.size !== undefined ? light.size : 100} min={10} max={300} onChange={(v) => onUpdateLight(light.id, { size: v })} />
            <CanvasSlider label={light.type === LightType.Lightning ? "JAG" : "SHD"} value={light.shadowIntensity !== undefined ? light.shadowIntensity : 40} min={0} max={100} onChange={(v) => onUpdateLight(light.id, { shadowIntensity: v })} />
            <CanvasSlider label={light.type === LightType.Lightning ? "OPA" : "OPA"} value={light.opacity !== undefined ? light.opacity : 100} min={0} max={100} onChange={(v) => onUpdateLight(light.id, { opacity: v })} />
        </div>
    );
};

export const EditorCanvas: React.FC<EditorCanvasProps> = ({
  image,
  editedImage,
  lights,
  selectedLightId,
  subjectBounds,
  onAddLight,
  onUpdateLight,
  onSelectLight,
  onUpdateSubjectBounds,
  maskStrokes,
  maskMode,
  maskBrushSize,
  onAddMaskStroke,
  comparePosition,
  showComparison,
  onComparePositionChange,
}) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [draggingLightId, setDraggingLightId] = useState<string | null>(null);
  const [rotatingLightId, setRotatingLightId] = useState<string | null>(null);
  const [scalingLightId, setScalingLightId] = useState<string | null>(null);
  const [draggingTargetId, setDraggingTargetId] = useState<string | null>(null);
  const [imageAspectRatio, setImageAspectRatio] = useState(16 / 9);

  // Subject bounds manipulation state
  const [draggingSubject, setDraggingSubject] = useState(false);
  const [resizingSubject, setResizingSubject] = useState(false);
  const dragStartRef = useRef({ mx: 0, my: 0, sx: 0, sy: 0, sw: 0, sh: 0 });

  const hasDraggedOrRotatedRef = useRef(false);
  const selectedLight = lights.find(l => l.id === selectedLightId);
  const activeStrokeRef = useRef<MaskStroke | null>(null);
  const [activeStroke, setActiveStroke] = useState<MaskStroke | null>(null);

  const maskPoint = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, (event.clientX - rect.left) * 100 / rect.width)),
      y: Math.max(0, Math.min(100, (event.clientY - rect.top) * 100 / rect.height)),
    };
  };

  const startMaskStroke = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!maskMode) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const stroke: MaskStroke = { id: crypto.randomUUID(), mode: maskMode, radius: maskBrushSize, points: [maskPoint(event)] };
    activeStrokeRef.current = stroke;
    setActiveStroke(stroke);
  };

  const moveMaskStroke = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!activeStrokeRef.current) return;
    const previous = activeStrokeRef.current.points.at(-1)!;
    const next = maskPoint(event);
    if (Math.hypot(next.x - previous.x, next.y - previous.y) < .35) return;
    const stroke = { ...activeStrokeRef.current, points: [...activeStrokeRef.current.points, next] };
    activeStrokeRef.current = stroke;
    setActiveStroke(stroke);
  };

  const finishMaskStroke = () => {
    if (activeStrokeRef.current) onAddMaskStroke(activeStrokeRef.current);
    activeStrokeRef.current = null;
    setActiveStroke(null);
  };

  const handleSubjectPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!canvasRef.current || !subjectBounds.enabled) return;
    setDraggingSubject(true);
    dragStartRef.current = {
      mx: e.clientX,
      my: e.clientY,
      sx: subjectBounds.x,
      sy: subjectBounds.y,
      sw: subjectBounds.width,
      sh: subjectBounds.height
    };
  };

  const handleResizePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!canvasRef.current || !subjectBounds.enabled) return;
    setResizingSubject(true);
    dragStartRef.current = {
      mx: e.clientX,
      my: e.clientY,
      sx: subjectBounds.x,
      sy: subjectBounds.y,
      sw: subjectBounds.width,
      sh: subjectBounds.height
    };
  };

  const handleSubjectMove = useCallback((e: globalThis.PointerEvent) => {
    if (!canvasRef.current || (!draggingSubject && !resizingSubject)) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const deltaX_pct = ((e.clientX - dragStartRef.current.mx) / rect.width) * 100;
    const deltaY_pct = ((e.clientY - dragStartRef.current.my) / rect.height) * 100;

    if (draggingSubject) {
      const nextX = Math.max(0, Math.min(100, dragStartRef.current.sx + deltaX_pct));
      const nextY = Math.max(0, Math.min(100, dragStartRef.current.sy + deltaY_pct));
      onUpdateSubjectBounds({
        ...subjectBounds,
        x: Math.round(nextX),
        y: Math.round(nextY)
      });
    } else if (resizingSubject) {
      const nextW = Math.max(5, Math.min(100, dragStartRef.current.sw + deltaX_pct * 2));
      const nextH = Math.max(5, Math.min(100, dragStartRef.current.sh + deltaY_pct * 2));
      onUpdateSubjectBounds({
        ...subjectBounds,
        width: Math.round(nextW),
        height: Math.round(nextH)
      });
    }
  }, [draggingSubject, resizingSubject, subjectBounds, onUpdateSubjectBounds]);

  const handleSubjectEnd = useCallback(() => {
    setDraggingSubject(false);
    setResizingSubject(false);
  }, []);

  useEffect(() => {
    if (draggingSubject || resizingSubject) {
      window.addEventListener('pointermove', handleSubjectMove);
      window.addEventListener('pointerup', handleSubjectEnd);
      window.addEventListener('pointercancel', handleSubjectEnd);
    }
    return () => {
      window.removeEventListener('pointermove', handleSubjectMove);
      window.removeEventListener('pointerup', handleSubjectEnd);
      window.removeEventListener('pointercancel', handleSubjectEnd);
    };
  }, [draggingSubject, resizingSubject, handleSubjectMove, handleSubjectEnd]);

  const renderSingleLight = (light: LightSource) => {
    const lightColorHex = getLightColorHex(light.color);
    const optics = getLightRenderModel(light);
    const intensityFactor = optics.intensity;
    const exposureFactor = optics.exposure;
    const blurRadius = optics.softness * 18 + 2;
    const scaleMultiplier = optics.sizeScale;
    const globalOpacityFactor = optics.opacity;

    switch (light.type) {
      case LightType.Pinpoint:
        return (
          <div
            key={`realtime-pinpoint-${light.id}`}
            className="absolute rounded-full"
            style={{
              left: `${light.x}%`,
              top: `${light.y}%`,
              transform: 'translate(-50%, -50%)',
              width: `${optics.footprintDiameterPct}%`,
              aspectRatio: '1 / 1',
              background: `radial-gradient(circle, rgba(255,255,255,${0.7 + exposureFactor * 0.3}) 0%, ${lightColorHex}ee ${optics.coreRadiusPct}%, ${lightColorHex}80 24%, ${lightColorHex}2e 52%, ${lightColorHex}00 82%)`,
              filter: `blur(${blurRadius}px)`,
              opacity: (0.18 + intensityFactor * 0.72) * globalOpacityFactor,
              mixBlendMode: 'screen',
            }}
          />
        );
      case LightType.Volumetric:
      case LightType.God_RAYS:
        return (
          <div
            key={`realtime-volumetric-${light.id}`}
            className="absolute"
            style={{
              left: `${light.x}%`,
              top: `${light.y}%`,
              width: `${Math.min(145, 28 + optics.footprintDiameterPct)}%`,
              height: '165%',
              transform: `translate(-50%, 0%) rotate(${optics.angle}deg)`,
              transformOrigin: 'top center',
              background: `conic-gradient(from 150deg at 50% 0%,
                transparent 0deg,
                ${lightColorHex}33 8deg,
                ${lightColorHex}99 12deg,
                ${lightColorHex}1a 16deg,
                transparent 20deg,
                ${lightColorHex}66 24deg,
                #ffffffdd 28deg,
                ${lightColorHex}80 32deg,
                transparent 36deg,
                ${lightColorHex}4d 40deg,
                ${lightColorHex}aa 44deg,
                #ffffffaa 46deg,
                ${lightColorHex}66 48deg,
                transparent 54deg,
                ${lightColorHex}33 58deg,
                transparent 65deg
              )`,
              WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 5%, rgba(0,0,0,0.4) 30%, rgba(0,0,0,0) 85%)',
              maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 5%, rgba(0,0,0,0.4) 30%, rgba(0,0,0,0) 85%)',
              filter: `blur(${blurRadius + 4}px)`,
              opacity: Math.min(0.82, 0.12 + intensityFactor * 0.72) * globalOpacityFactor,
            }}
          />
        );
      case LightType.Lens_Flare:
        return (
          <div
            key={`realtime-lensflare-${light.id}`}
            className="absolute inset-0"
            style={{
              opacity: globalOpacityFactor,
            }}
          >
            {/* Core Sunburst */}
            <div
              className="absolute rounded-full"
              style={{
                left: `${light.x}%`,
                top: `${light.y}%`,
                transform: 'translate(-50%, -50%)',
                width: `${Math.max(18, optics.footprintDiameterPct * 0.7)}%`,
                aspectRatio: '1 / 1',
                background: `radial-gradient(circle, #ffffff 0%, ${lightColorHex}f2 10%, ${lightColorHex}82 34%, ${lightColorHex}00 76%)`,
                filter: `blur(${blurRadius}px)`,
                opacity: intensityFactor,
              }}
            />
            {/* Dynamic Light Rings */}
            <div
              className="absolute rounded-full border"
              style={{
                left: `${light.x}%`,
                top: `${light.y}%`,
                transform: 'translate(-50%, -50%)',
                width: `${Math.max(24, optics.footprintDiameterPct)}%`,
                aspectRatio: '1 / 1',
                borderColor: `${lightColorHex}45`,
                boxShadow: `inset 0 0 50px ${lightColorHex}35, 0 0 50px ${lightColorHex}35`,
                filter: `blur(${blurRadius / 2 + 1}px)`,
                opacity: intensityFactor * 0.65,
              }}
            />
            {/* Anamorphic Flare Beam */}
            <div
              className="absolute animate-pulse"
              style={{
                left: `${light.x}%`,
                top: `${light.y}%`,
                transform: `translate(-50%, -50%) rotate(${optics.angle}deg)`,
                width: `${Math.min(180, 70 + optics.footprintDiameterPct)}%`,
                height: `${Math.max(3, 1 + exposureFactor * 4)}%`,
                background: `linear-gradient(to right, transparent, ${lightColorHex}65, #ffffff, ${lightColorHex}65, transparent)`,
                filter: `blur(2px)`,
                opacity: intensityFactor * 0.9,
              }}
            />
          </div>
        );
      case LightType.Lightning: {
        const { trunkPath, branches } = generateOrganicLightning(light);

        // Customized rendering parameters linked to sliders
        const coreWidth = 0.4 + (light.exposure / 100) * 1.5;
        const branchCoreWidth = coreWidth * 0.55;

        const coronaWidth = 1.0 + (light.exposure / 100) * 3.5;
        const branchCoronaWidth = coronaWidth * 0.65;

        const coronaBlur = 0.5 + (light.depthOfField / 100) * 6;

        return (
          <div
            key={`realtime-lightning-${light.id}`}
            className="absolute inset-0 w-full h-full"
            style={{
              animation: 'lightning-flash 5s infinite ease-in-out',
              opacity: globalOpacityFactor,
            }}
          >
            {/* Ambient flash overlay */}
            <div
              className="absolute inset-0"
              style={{
                backgroundColor: lightColorHex,
                opacity: intensityFactor * 0.35,
                mixBlendMode: 'screen',
                filter: 'blur(16px)',
              }}
            />
            {/* Bolt SVG */}
            <svg
              className="absolute inset-0 w-full h-full overflow-visible"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              style={{
                color: '#ffffff',
                animation: 'bolt-flicker 5s infinite ease-in-out',
                transform: `scale(${scaleMultiplier})`,
                transformOrigin: `${light.x}% ${light.y}%`,
              }}
            >
              {/* 1. Wide Air Ionization Glow (Main Trunk) */}
              <path
                d={trunkPath}
                fill="none"
                stroke={lightColorHex}
                strokeWidth={coronaWidth * 3.0}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  filter: `blur(${coronaBlur + 2}px)`,
                  opacity: 0.35,
                }}
              />

              {/* 2. Wide Air Ionization Glow (Branches) */}
              {branches.map((b, bIdx) => (
                <path
                  key={`bg-branch-ion-${bIdx}`}
                  d={b}
                  fill="none"
                  stroke={lightColorHex}
                  strokeWidth={branchCoronaWidth * 2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    filter: `blur(${coronaBlur + 1}px)`,
                    opacity: 0.25,
                  }}
                />
              ))}

              {/* 3. Plasma Corona (Main Trunk) */}
              <path
                d={trunkPath}
                fill="none"
                stroke={lightColorHex}
                strokeWidth={coronaWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  filter: `blur(${coronaBlur / 2}px)`,
                  opacity: 0.95,
                }}
              />

              {/* 4. Plasma Corona (Branches) */}
              {branches.map((b, bIdx) => (
                <path
                  key={`bg-branch-corona-${bIdx}`}
                  d={b}
                  fill="none"
                  stroke={lightColorHex}
                  strokeWidth={branchCoronaWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    filter: `blur(${coronaBlur / 3}px)`,
                    opacity: 0.85,
                  }}
                />
              ))}

              {/* 5. Hot Inner Core (Main Trunk) */}
              <path
                d={trunkPath}
                fill="none"
                stroke="#ffffff"
                strokeWidth={coreWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  filter: 'blur(0.3px)',
                  opacity: 1.0,
                }}
              />

              {/* 6. Hot Inner Core (Branches) */}
              {branches.map((b, bIdx) => (
                <path
                  key={`fg-branch-core-${bIdx}`}
                  d={b}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth={branchCoreWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    filter: 'blur(0.2px)',
                    opacity: 0.9,
                  }}
                />
              ))}
            </svg>
          </div>
        );
      }
      default:
        return null;
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canvasRef.current) return;
    const target = e.target as HTMLElement;
    if (target !== canvasRef.current && target.tagName !== 'IMG') return;

    if (hasDraggedOrRotatedRef.current) {
      hasDraggedOrRotatedRef.current = false;
      return;
    }

    const rect = canvasRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    onAddLight(x, y);
  };

  const handleLightPointerDown = (e: PointerEvent<HTMLDivElement>, id: string) => {
    e.stopPropagation();
    hasDraggedOrRotatedRef.current = false;
    setDraggingLightId(id);
    onSelectLight(id);
  };

  const handlePointerMove = useCallback((e: globalThis.PointerEvent) => {
    if (!draggingLightId || !canvasRef.current) return;
    hasDraggedOrRotatedRef.current = true;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

    const light = lights.find(l => l.id === draggingLightId);
    if (light && light.useTarget && light.targetX !== undefined && light.targetY !== undefined) {
      const newAngle = calculateTargetAngle(x, y, light.targetX, light.targetY);
      onUpdateLight(draggingLightId, { x, y, rotation: Math.round(newAngle) % 360 });
    } else {
      onUpdateLight(draggingLightId, { x, y });
    }
  }, [draggingLightId, onUpdateLight, lights]);

  const handlePointerUp = useCallback(() => {
    setDraggingLightId(null);
  }, []);

  useEffect(() => {
    if (draggingLightId) {
        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', handlePointerUp);
    }
    return () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [draggingLightId, handlePointerMove, handlePointerUp]);

  const handleTargetPointerStart = (e: PointerEvent<HTMLDivElement>, id: string) => {
    e.stopPropagation();
    hasDraggedOrRotatedRef.current = false;
    setDraggingTargetId(id);
    onSelectLight(id);
  };

  const handleTargetPointerMove = useCallback((e: globalThis.PointerEvent) => {
    if (!draggingTargetId || !canvasRef.current) return;
    hasDraggedOrRotatedRef.current = true;
    const light = lights.find(l => l.id === draggingTargetId);
    if (!light) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const targetX = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const targetY = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

    const newAngle = calculateTargetAngle(light.x, light.y, targetX, targetY);

    onUpdateLight(draggingTargetId, {
      targetX: Math.round(targetX),
      targetY: Math.round(targetY),
      useTarget: true,
      rotation: Math.round(newAngle) % 360,
    });
  }, [draggingTargetId, onUpdateLight, lights]);

  const handleTargetPointerEnd = useCallback(() => {
    setDraggingTargetId(null);
  }, []);

  useEffect(() => {
    if (draggingTargetId) {
      window.addEventListener('pointermove', handleTargetPointerMove);
      window.addEventListener('pointerup', handleTargetPointerEnd);
      window.addEventListener('pointercancel', handleTargetPointerEnd);
    }
    return () => {
      window.removeEventListener('pointermove', handleTargetPointerMove);
      window.removeEventListener('pointerup', handleTargetPointerEnd);
      window.removeEventListener('pointercancel', handleTargetPointerEnd);
    };
  }, [draggingTargetId, handleTargetPointerMove, handleTargetPointerEnd]);

  const handleRotationStart = (e: PointerEvent<HTMLDivElement>, id: string) => {
    e.stopPropagation();
    hasDraggedOrRotatedRef.current = false;
    setRotatingLightId(id);
    onSelectLight(id);
  };

  const handleRotationMove = useCallback((e: globalThis.PointerEvent) => {
    if (!rotatingLightId || !canvasRef.current) return;
    hasDraggedOrRotatedRef.current = true;

    const light = lights.find(l => l.id === rotatingLightId);
    if (!light) return;

    const canvasRect = canvasRef.current.getBoundingClientRect();
    const targetX = Math.max(0, Math.min(100, ((e.clientX - canvasRect.left) / canvasRect.width) * 100));
    const targetY = Math.max(0, Math.min(100, ((e.clientY - canvasRect.top) / canvasRect.height) * 100));

    const angle = calculateTargetAngle(light.x, light.y, targetX, targetY);

    onUpdateLight(rotatingLightId, { rotation: Math.round(angle) % 360, useTarget: false });
  }, [rotatingLightId, onUpdateLight, lights]);

  const handleRotationEnd = useCallback(() => {
    setRotatingLightId(null);
  }, []);

  useEffect(() => {
    if (rotatingLightId) {
      window.addEventListener('pointermove', handleRotationMove);
      window.addEventListener('pointerup', handleRotationEnd);
      window.addEventListener('pointercancel', handleRotationEnd);
    }
    return () => {
      window.removeEventListener('pointermove', handleRotationMove);
      window.removeEventListener('pointerup', handleRotationEnd);
      window.removeEventListener('pointercancel', handleRotationEnd);
    };
  }, [rotatingLightId, handleRotationMove, handleRotationEnd]);

  const handleScalingStart = (e: PointerEvent<HTMLDivElement>, id: string) => {
    e.stopPropagation();
    hasDraggedOrRotatedRef.current = false;
    setScalingLightId(id);
    onSelectLight(id);
  };

  const handleScalingMove = useCallback((e: globalThis.PointerEvent) => {
    if (!scalingLightId || !canvasRef.current) return;
    hasDraggedOrRotatedRef.current = true;

    const light = lights.find(l => l.id === scalingLightId);
    if (!light) return;

    const canvasRect = canvasRef.current.getBoundingClientRect();
    const lightX_px = (light.x / 100) * canvasRect.width + canvasRect.left;
    const lightY_px = (light.y / 100) * canvasRect.height + canvasRect.top;

    const deltaX = e.clientX - lightX_px;
    const deltaY = e.clientY - lightY_px;

    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    let newSize = Math.round(distance * 2);
    newSize = Math.max(10, Math.min(300, newSize));

    onUpdateLight(scalingLightId, { size: newSize });
  }, [scalingLightId, onUpdateLight, lights]);

  const handleScalingEnd = useCallback(() => {
    setScalingLightId(null);
  }, []);

  useEffect(() => {
    if (scalingLightId) {
      window.addEventListener('pointermove', handleScalingMove);
      window.addEventListener('pointerup', handleScalingEnd);
      window.addEventListener('pointercancel', handleScalingEnd);
    }
    return () => {
      window.removeEventListener('pointermove', handleScalingMove);
      window.removeEventListener('pointerup', handleScalingEnd);
      window.removeEventListener('pointercancel', handleScalingEnd);
    };
  }, [scalingLightId, handleScalingMove, handleScalingEnd]);

  return (
    <div className="flex-none lg:flex-grow flex items-center justify-center p-4 lg:p-6 bg-[#0a0c10] overflow-hidden">
      {/* Dynamic Keyframes for lightning flicker realism */}
      <style>{`
        @keyframes lightning-flash {
          0%, 100% { opacity: 0; }
          3%, 12% { opacity: 0.04; }
          5% { opacity: 0.28; }
          8% { opacity: 0.05; }
          15% { opacity: 0.65; }
          17% { opacity: 0.15; }
          19% { opacity: 0.85; }
          23% { opacity: 0.12; }
          25% { opacity: 0.55; }
          35% { opacity: 0; }
        }

        @keyframes bolt-flicker {
          0%, 100% { opacity: 0; }
          4% { opacity: 0.15; }
          5% { opacity: 0.85; }
          8% { opacity: 0.08; }
          15% { opacity: 0.75; }
          17% { opacity: 0.08; }
          19% { opacity: 0.95; }
          22% { opacity: 0.25; }
          25% { opacity: 0.75; }
          28% { opacity: 0; }
        }
      `}</style>
      <div
        className="relative w-full max-w-4xl aspect-video bg-[#11141d] rounded-xl border border-[#1d2334] shadow-2xl overflow-hidden select-none"
      >
        {!image && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
            <UploadPlaceholder />
          </div>
        )}
        {(editedImage || image) && (
          <div
            ref={canvasRef}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden touch-none"
            style={{
              aspectRatio: imageAspectRatio,
              width: imageAspectRatio >= 16 / 9 ? '100%' : 'auto',
              height: imageAspectRatio >= 16 / 9 ? 'auto' : '100%',
            }}
            onClick={handleCanvasClick}
            onPointerDown={() => onSelectLight(null)}
          >
          <img
            src={image || editedImage || ''}
            alt="Lighting workspace"
            referrerPolicy="no-referrer"
            className="w-full h-full object-fill"
            onLoad={(event) => {
              const loadedImage = event.currentTarget;
              if (loadedImage.naturalWidth > 0 && loadedImage.naturalHeight > 0) {
                setImageAspectRatio(loadedImage.naturalWidth / loadedImage.naturalHeight);
              }
            }}
          />
          {editedImage && (
            <div
              className="absolute inset-0 z-[5] overflow-hidden pointer-events-none"
              style={{ clipPath: showComparison ? `inset(0 ${100 - comparePosition}% 0 0)` : 'inset(0)' }}
            >
              <img src={editedImage} alt="Rendered relighting" className="h-full w-full object-fill" />
            </div>
          )}
          {editedImage && showComparison && (
            <>
              <div className="absolute inset-y-0 z-[50] w-0.5 bg-white shadow-[0_0_10px_black] pointer-events-none" style={{ left: `${comparePosition}%` }} />
              <input aria-label="Before and after comparison" type="range" min="0" max="100" value={comparePosition} onChange={event => onComparePositionChange(Number(event.target.value))} className="absolute inset-x-3 bottom-3 z-[60] accent-cyan-400" />
            </>
          )}
          {image && !editedImage && <GpuLightPreview lights={lights} subject={subjectBounds} />}
          {image && !editedImage && subjectBounds.enabled && (maskStrokes.length > 0 || activeStroke) && (
            <svg className="absolute inset-0 z-[38] h-full w-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
              {[...maskStrokes, ...(activeStroke ? [activeStroke] : [])].map(stroke => (
                <polyline key={stroke.id} points={stroke.points.map(point => `${point.x},${point.y}`).join(' ')} fill="none" stroke={stroke.mode === 'add' ? '#22d3ee' : '#fb7185'} strokeOpacity=".65" strokeWidth={stroke.radius * .35} strokeLinecap="round" strokeLinejoin="round" />
              ))}
            </svg>
          )}
          {image && !editedImage && maskMode && (
            <div
              className="absolute inset-0 z-[70] cursor-crosshair touch-none"
              onPointerDown={startMaskStroke}
              onPointerMove={moveMaskStroke}
              onPointerUp={finishMaskStroke}
              onPointerCancel={finishMaskStroke}
            />
          )}
        {/* Real-time CSS shadow casting overlay */}
        {image && !editedImage && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden mix-blend-multiply select-none z-10">
            {lights.filter(l => l.enabled !== false).map((light) => {
              const shadowFactor = (light.shadowIntensity !== undefined ? light.shadowIntensity : 40) / 100;
              if (shadowFactor <= 0) return null;

              const optics = getLightRenderModel(light);
              const intensityFactor = optics.intensity;
              const globalOpacityFactor = optics.opacity;

              if (light.type === LightType.Volumetric || light.type === LightType.God_RAYS) {
                const inner = optics.footprintRadiusPct * 0.35;
                const mid1 = optics.footprintRadiusPct * 0.7;
                const mid2 = Math.min(82, optics.footprintRadiusPct * 1.35);
                const outer = Math.min(100, optics.footprintRadiusPct * 1.8);
                return (
                  <div
                    key={`realtime-shadow-volumetric-${light.id}`}
                    className="absolute inset-0"
                    style={{
                      background: `radial-gradient(circle at ${light.x}% ${light.y}%, transparent ${inner}%, rgba(0, 0, 0, ${shadowFactor * 0.25}) ${mid1}%, rgba(0, 0, 0, ${shadowFactor * 0.7}) ${mid2}%, rgba(0, 0, 0, ${shadowFactor * 0.95}) ${outer}%)`,
                      opacity: intensityFactor * globalOpacityFactor,
                    }}
                  />
                );
              } else if (light.type === LightType.Lightning) {
                return (
                  <div
                    key={`realtime-shadow-lightning-${light.id}`}
                    className="absolute inset-0"
                    style={{
                      background: `radial-gradient(circle at ${light.x}% ${light.y}%, transparent 15%, rgba(0, 0, 0, ${shadowFactor * 0.2}) 35%, rgba(0, 0, 0, ${shadowFactor * 0.6}) 55%, rgba(0, 0, 0, ${shadowFactor * 0.95}) 80%)`,
                      opacity: intensityFactor * 0.8 * globalOpacityFactor,
                    }}
                  />
                );
              } else {
                const inner = optics.footprintRadiusPct * 0.32;
                const mid1 = optics.footprintRadiusPct * 0.72;
                const mid2 = Math.min(84, optics.footprintRadiusPct * 1.38);
                const outer = Math.min(100, optics.footprintRadiusPct * 1.85);
                return (
                  <div
                    key={`realtime-shadow-pinpoint-${light.id}`}
                    className="absolute inset-0"
                    style={{
                      background: `radial-gradient(circle at ${light.x}% ${light.y}%, transparent ${inner}%, rgba(0, 0, 0, ${shadowFactor * 0.22}) ${mid1}%, rgba(0, 0, 0, ${shadowFactor * 0.65}) ${mid2}%, rgba(0, 0, 0, ${shadowFactor * 0.95}) ${outer}%)`,
                      opacity: intensityFactor * globalOpacityFactor,
                    }}
                  />
                );
              }
            })}
          </div>
        )}

        {/* Real-time BACKGROUND lighting effects overlay (Lights placed behind subject) */}
        {image && !editedImage && subjectBounds.enabled && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden mix-blend-screen select-none z-15">
            {lights
              .filter((light) => light.enabled !== false && light.placement === 'background')
              .map((light) => renderSingleLight(light))}
          </div>
        )}

        {/* Subject Layer (Perfect client-side depth isolation by clipping duplicate image) */}
        {image && !editedImage && subjectBounds.enabled && (
          <div
            className="absolute inset-0 pointer-events-none overflow-hidden select-none z-20"
            style={{
              WebkitMaskImage: `radial-gradient(ellipse ${subjectBounds.width / 2}% ${subjectBounds.height / 2}% at ${subjectBounds.x}% ${subjectBounds.y}%, rgba(0,0,0,1) 0%, rgba(0,0,0,1) ${Math.max(0, Math.min(99, (subjectBounds.edgeRefinement ?? 50) * 0.9))}%, rgba(0,0,0,0) 100%)`,
              maskImage: `radial-gradient(ellipse ${subjectBounds.width / 2}% ${subjectBounds.height / 2}% at ${subjectBounds.x}% ${subjectBounds.y}%, rgba(0,0,0,1) 0%, rgba(0,0,0,1) ${Math.max(0, Math.min(99, (subjectBounds.edgeRefinement ?? 50) * 0.9))}%, rgba(0,0,0,0) 100%)`,
            }}
          >
            <img
              src={image}
              alt="Isolated Subject Layer"
              referrerPolicy="no-referrer"
              className="w-full h-full object-fill"
            />
          </div>
        )}

        {/* Real-time SVG Rim Lighting (Edge glow halo from active background lights wrapping around isolated subject bounds) */}
        {image && !editedImage && subjectBounds.enabled && lights.some(l => l.enabled !== false && l.placement === 'background') && (
          <svg className="absolute inset-0 pointer-events-none w-full h-full z-21 select-none mix-blend-screen">
            {lights
              .filter((light) => light.enabled !== false && light.placement === 'background')
              .map((light) => {
                const hex = getLightColorHex(light.color);
                const rimPower = light.rimLightIntensity !== undefined ? light.rimLightIntensity : 40;
                if (rimPower <= 0) return null;

                return (
                  <ellipse
                    key={`rim-ellipse-${light.id}`}
                    cx={`${subjectBounds.x}%`}
                    cy={`${subjectBounds.y}%`}
                    rx={`${subjectBounds.width / 2}%`}
                    ry={`${subjectBounds.height / 2}%`}
                    fill="none"
                    stroke={hex}
                    strokeWidth={2 + (rimPower / 100) * 12}
                    opacity={(light.intensity / 100) * (rimPower / 100) * 0.95}
                    style={{
                      filter: `blur(${2 + (light.depthOfField / 100) * 8}px)`,
                    }}
                  />
                );
              })}
          </svg>
        )}

        {/* Real-time FOREGROUND / STANDARD lighting effects overlay (Lights shining in front) */}
        {image && !editedImage && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden mix-blend-screen select-none z-25">
            {lights
              .filter((light) => light.enabled !== false && (!subjectBounds.enabled || light.placement !== 'background'))
              .map((light) => renderSingleLight(light))}
          </div>
        )}

        {/* Real-time draggable Subject Bounds Control Ring HUD */}
        {image && !editedImage && subjectBounds.enabled && (
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2 border border-dashed border-cyan-400/60 rounded-full z-40 transition-all pointer-events-auto shadow-black/40"
            style={{
              left: `${subjectBounds.x}%`,
              top: `${subjectBounds.y}%`,
              width: `${subjectBounds.width}%`,
              height: `${subjectBounds.height}%`,
              boxShadow: `0 0 30px 4px rgba(34, 211, 238, ${subjectBounds.opacity / 100 * 0.5})`,
              backgroundColor: `rgba(34, 211, 238, ${subjectBounds.opacity / 100 * 0.12})`,
              cursor: draggingSubject ? 'grabbing' : 'grab'
            }}
            onPointerDown={handleSubjectPointerDown}
          >
            {/* Draggable center handle crosshair */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-cyan-300 pointer-events-none">
              <svg className="w-full h-full animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
              </svg>
            </div>

            {/* Symmetrical resizing drag handle (bottom-right edge) */}
            <div
              className="absolute w-5 h-5 bg-cyan-400 rounded-full border border-white shadow-xl cursor-se-resize flex items-center justify-center text-gray-950 hover:bg-cyan-300 hover:scale-110 active:scale-95 transition-transform z-50"
              style={{
                right: '10%',
                bottom: '10%',
                transform: 'translate(50%, 50%)'
              }}
              onPointerDown={handleResizePointerDown}
              title="Drag to resize focus boundary"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M15 3h6v6M9 21H3v-6" />
                <path d="M21 3l-7 7M3 21l7-7" />
              </svg>
            </div>

            {/* Indicator label */}
            <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 bg-[#090d16]/95 border border-cyan-500/50 text-cyan-300 text-[8px] font-mono font-black px-2 py-0.5 rounded shadow-lg pointer-events-none tracking-widest uppercase whitespace-nowrap">
              Subject Isolation Focus
            </div>
          </div>
        )}

        {/* Real-time Target Look-At Vector Direction Lines */}
        {image && !editedImage && lights.map((light) => {
          if (selectedLightId !== light.id && !light.useTarget) return null;
          const tx = light.targetX ?? light.x;
          const ty = light.targetY ?? Math.min(100, light.y + 25);
          const hex = getLightColorHex(light.color);
          return (
            <svg key={`target-vector-${light.id}`} className="absolute inset-0 pointer-events-none w-full h-full z-35 overflow-visible">
              <line
                x1={`${light.x}%`}
                y1={`${light.y}%`}
                x2={`${tx}%`}
                y2={`${ty}%`}
                stroke={hex}
                strokeWidth={selectedLightId === light.id ? "2" : "1"}
                strokeDasharray="4 4"
                className="animate-pulse"
                opacity={selectedLightId === light.id ? "0.9" : "0.5"}
              />
            </svg>
          );
        })}

        {/* Interactive Target Reticle Handles */}
        {image && !editedImage && lights.map((light) => {
          if (selectedLightId !== light.id && !light.useTarget) return null;
          const tx = light.targetX ?? light.x;
          const ty = light.targetY ?? Math.min(100, light.y + 25);
          const isSelected = selectedLightId === light.id;
          return (
            <div
              key={`target-reticle-${light.id}`}
              className={`absolute -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center cursor-crosshair z-40 transition-transform ${
                isSelected ? 'scale-110 shadow-lg shadow-amber-500/50' : 'opacity-80 hover:opacity-100 hover:scale-105'
              }`}
              style={{ left: `${tx}%`, top: `${ty}%` }}
              onPointerDown={(e) => handleTargetPointerStart(e, light.id)}
              title="Drag target to point light beam"
            >
              <div className="w-6 h-6 rounded-full bg-amber-950/90 border border-amber-400/80 flex items-center justify-center text-amber-300 shadow-md">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="4" strokeDasharray="2 2" />
                  <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
                  <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                </svg>
              </div>
              {isSelected && (
                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-amber-950/95 border border-amber-500/60 text-amber-200 text-[8px] font-mono font-black px-1.5 py-0.5 rounded shadow-lg pointer-events-none tracking-wider whitespace-nowrap uppercase">
                  LOOK-AT (X: {Math.round(tx)}% Y: {Math.round(ty)}%)
                </div>
              )}
            </div>
          );
        })}
        {image && !editedImage && lights.map((light) => {
          const lightColorHex = getLightColorHex(light.color);
          const optics = getLightRenderModel(light);
          return (
            <div
              key={light.id}
              className={`absolute -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center cursor-grab transition-all duration-200 z-30 ${
                selectedLightId === light.id ? 'ring-2 ring-white scale-110' : 'hover:scale-105'
              }`}
              style={{
                left: `${light.x}%`,
                top: `${light.y}%`,
                backgroundColor: `${lightColorHex}30`,
                boxShadow: selectedLightId === light.id
                  ? `0 0 24px 8px ${lightColorHex}70`
                  : `0 0 12px 3px ${lightColorHex}40`
              }}
              onPointerDown={(e) => handleLightPointerDown(e, light.id)}
            >
              <div
                className='w-7 h-7 p-1 bg-gray-950/85 rounded-full transition-transform border border-white/20 relative z-10'
                style={{
                  transform: `rotate(${optics.angle}deg)`,
                  color: lightColorHex
                }}
              >
                <LightTypeIcon type={light.type} className="w-full h-full"/>
              </div>
              {selectedLightId === light.id && (
                <>
                  {/* High-Precision Laser Crosshair Guide Axis */}
                  <div className="absolute left-1/2 -translate-x-1/2 h-[2000px] w-px border-l border-dashed border-indigo-500/20 pointer-events-none" style={{ top: `calc(-1000px + 50%)` }} />
                  <div className="absolute top-1/2 -translate-y-1/2 w-[2000px] h-px border-t border-dashed border-indigo-500/20 pointer-events-none" style={{ left: `calc(-1000px + 50%)` }} />

                  {/* Laser Target Node Readout */}
                  <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-[#090d19]/90 border border-indigo-500/40 text-indigo-300 text-[8px] font-mono font-black px-1.5 py-0.5 rounded shadow-lg pointer-events-none tracking-wider whitespace-nowrap">
                    X: {Math.round(light.x)}% | Y: {Math.round(light.y)}%
                  </div>

                  {/* Rotation Indicator Line */}
                  <div
                    className="absolute top-1/2 left-1/2 w-px h-7 bg-indigo-400 origin-top pointer-events-none"
                    style={{ transform: `rotate(${optics.angle}deg)`}}
                  />
                  {/* Rotation Grab Handle */}
                  <div
                    className="absolute w-3.5 h-3.5 bg-indigo-500 rounded-full border-2 border-white shadow-lg cursor-alias transition-transform hover:scale-125 hover:bg-indigo-400"
                    style={{
                      top: '50%',
                      left: '50%',
                      transform: `translate(-50%, -50%) rotate(${optics.angle}deg) translateY(30px) rotate(-${optics.angle}deg)`
                    }}
                    onPointerDown={(e) => handleRotationStart(e, light.id)}
                  />
                  {/* Sizing Circle Boundary Indicator */}
                  <div
                    className="absolute rounded-full border border-dashed border-emerald-500/40 pointer-events-none"
                    style={{
                      width: `${light.size !== undefined ? light.size : 100}px`,
                      height: `${light.size !== undefined ? light.size : 100}px`,
                      left: '50%',
                      top: '50%',
                      transform: 'translate(-50%, -50%)',
                    }}
                  />
                  {/* Sizing Grab Handle (Bottom-Right of circle) */}
                  <div
                    className="absolute w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white shadow-lg cursor-se-resize transition-transform hover:scale-125 hover:bg-emerald-400"
                    style={{
                      top: '50%',
                      left: '50%',
                      transform: `translate(-50%, -50%) translate(${(light.size !== undefined ? light.size : 100) * 0.5 * Math.cos(Math.PI / 4)}px, ${(light.size !== undefined ? light.size : 100) * 0.5 * Math.sin(Math.PI / 4)}px)`
                    }}
                    onPointerDown={(e) => handleScalingStart(e, light.id)}
                    title="Drag to resize (expand/shrink)"
                  />
                </>
              )}
            </div>
          );
        })}

        {selectedLight && !editedImage && (
            <LightControls
                light={selectedLight}
                onUpdateLight={onUpdateLight}
                canvasRef={canvasRef}
            />
        )}
          </div>
        )}
      </div>
    </div>
  );
};

const UploadPlaceholder: React.FC = () => (
    <div className="text-center p-8 border border-[#1b2542] rounded-2xl bg-[#060a13]/85 backdrop-blur-md max-w-sm relative shadow-2xl overflow-hidden group">
        <div className="absolute top-1 left-1 w-2.5 h-2.5 border-t-2 border-l-2 border-indigo-500/40" />
        <div className="absolute top-1 right-1 w-2.5 h-2.5 border-t-2 border-r-2 border-indigo-500/40" />
        <div className="absolute bottom-1 left-1 w-2.5 h-2.5 border-b-2 border-l-2 border-indigo-500/40" />
        <div className="absolute bottom-1 right-1 w-2.5 h-2.5 border-b-2 border-r-2 border-indigo-500/40" />

        <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12 text-indigo-500/60 transition-transform duration-500 group-hover:scale-110 group-hover:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <h3 className="mt-4 text-[10px] font-black text-gray-200 uppercase tracking-widest font-mono">OPTICAL STAGE STANDBY</h3>
        <p className="mt-2 text-xs text-gray-400 leading-relaxed font-sans">
          Load an image file or instantiate a template stock environment to engage precision lighting.
        </p>
    </div>
);
