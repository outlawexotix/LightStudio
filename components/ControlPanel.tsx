import React, { ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LightSource, LightType, MaskBrushMode, MaskStroke, RenderMetadata, SceneDocument, SubjectBounds } from '../types';
import { TrashIcon, UploadIcon, DownloadIcon } from './icons';
import { SAMPLE_PRESETS } from '../App';
import { saveOrShareImage } from '../services/nativeExport';
import { exportImage, exportScenePackage } from '../services/professionalExport';
import { calculateTargetAngle } from '../lightingModel';
import { STUDIO_LIGHTING_PRESETS, StudioPreset } from '../services/lightingPresets';

interface ControlPanelProps {
  imageFile: File | null;
  imageUrl: string | null;
  editedImageUrl: string | null;
  lights: LightSource[];
  selectedLightId: string | null;
  selectedModel: string;
  autoGenerate: boolean;
  isLoading: boolean;
  error: string | null;
  subjectBounds: SubjectBounds;
  onImageUpload: (e: ChangeEvent<HTMLInputElement>) => void;
  onSelectPreset: (url: string) => void;
  onAddLight: (x: number, y: number) => void;
  onUpdateLight: (id: string, updates: Partial<LightSource>) => void;
  onSelectLight: (id: string | null) => void;
  onDeleteLight: (id: string) => void;
  onGenerate: () => void;
  onModelChange: (model: string) => void;
  onAutoGenerateToggle: (auto: boolean) => void;
  onUpdateSubjectBounds: (bounds: SubjectBounds) => void;
  maskStrokes: MaskStroke[];
  maskMode: MaskBrushMode | null;
  maskBrushSize: number;
  onMaskModeChange: (mode: MaskBrushMode | null) => void;
  onMaskBrushSizeChange: (size: number) => void;
  onClearMask: () => void;
  renderMetadata?: RenderMetadata;
  showComparison: boolean;
  onShowComparisonChange: (value: boolean) => void;
  savedScenes: SceneDocument[];
  onSaveScene: (name: string) => void;
  onLoadScene: (scene: SceneDocument) => void;
  onDeleteScene: (name: string) => void;
  onDuplicateLight?: (id: string) => void;
  onApplyStudioPreset?: (preset: StudioPreset) => void;
}

const COLOR_PRESETS = [
  { name: 'Warm Gold', value: 'Warm Gold (#ff9d42)', hex: '#ff9d42' },
  { name: 'Cool Cyan', value: 'Cool Cyan (#42a5ff)', hex: '#42a5ff' },
  { name: 'Neon Violet', value: 'Neon Violet (#e042ff)', hex: '#e042ff' },
  { name: 'Cyber Red', value: 'Cyber Red (#ff4242)', hex: '#ff4242' },
  { name: 'Aurora Green', value: 'Aurora Green (#52ff42)', hex: '#52ff42' },
  { name: 'Candlelight', value: 'Candlelight Orange (#ff7a00)', hex: '#ff7a00' },
  { name: 'Pure White', value: 'Pure White (#ffffff)', hex: '#ffffff' },
];

export const getColorInfo = (colorString: string) => {
  const matchedPreset = COLOR_PRESETS.find(p => p.value === colorString);
  if (matchedPreset) {
    return { name: matchedPreset.name, hex: matchedPreset.hex };
  }
  if (colorString.startsWith('#')) {
    return { name: 'Custom Color', hex: colorString };
  }
  const hexMatch = colorString.match(/#([0-9a-fA-F]{3,8})/);
  if (hexMatch) {
    return { name: 'Custom Color', hex: `#${hexMatch[1]}` };
  }
  return { name: 'Custom Color', hex: colorString || '#ff9d42' };
};

export const ControlPanel: React.FC<ControlPanelProps> = ({
  imageFile,
  imageUrl,
  editedImageUrl,
  lights,
  selectedLightId,
  selectedModel,
  autoGenerate,
  isLoading,
  error,
  subjectBounds,
  onImageUpload,
  onSelectPreset,
  onAddLight,
  onUpdateLight,
  onSelectLight,
  onDeleteLight,
  onGenerate,
  onModelChange,
  onAutoGenerateToggle,
  onUpdateSubjectBounds,
  maskStrokes,
  maskMode,
  maskBrushSize,
  onMaskModeChange,
  onMaskBrushSizeChange,
  onClearMask,
  renderMetadata,
  showComparison,
  onShowComparisonChange,
  savedScenes,
  onSaveScene,
  onLoadScene,
  onDeleteScene,
  onDuplicateLight,
  onApplyStudioPreset,
}) => {
  const selectedLight = lights.find((l) => l.id === selectedLightId);

  const handleDownload = async () => {
    if (!editedImageUrl) return;
    try {
      if (await saveOrShareImage(editedImageUrl)) return;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The image could not be exported.';
      window.alert(message);
      return;
    }
    await exportImage(editedImageUrl, exportFormat, exportQuality);
  };

  const [expandedIds, setExpandedIds] = React.useState<string[]>([]);
  const [sceneName, setSceneName] = React.useState('My lighting scene');
  const [exportFormat, setExportFormat] = React.useState<'png' | 'jpeg' | 'webp'>('png');
  const [exportQuality, setExportQuality] = React.useState(95);

  React.useEffect(() => {
    if (selectedLightId && !expandedIds.includes(selectedLightId)) {
      setExpandedIds(prev => [...prev, selectedLightId]);
    }
  }, [selectedLightId]);

  return (
    <div className="w-full lg:w-96 flex-none lg:flex bg-[#070b13]/90 backdrop-blur-2xl flex flex-col p-5 space-y-5 border-t lg:border-t-0 lg:border-l border-[#161f35]/80 overflow-visible h-auto lg:overflow-y-auto lg:h-full scrollbar-thin scrollbar-thumb-slate-800 relative shadow-2xl">
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent pointer-events-none" />

      {/* SECTION 1: Image Input */}
      <div className="space-y-3 bg-[#0a0f1d]/50 p-3 rounded-lg border border-[#16203a]/60 relative group">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-extrabold text-indigo-400 font-mono tracking-wider uppercase">Source Image</h3>
          {imageFile && <span className="text-[9px] text-emerald-400 font-mono">active</span>}
        </div>

        <div className="grid grid-cols-1 gap-2">
          <label htmlFor="file-upload" className="cursor-pointer inline-flex items-center justify-center px-3 py-2.5 border border-[#1b2542] hover:border-indigo-500/50 text-xs font-semibold rounded-md text-white bg-[#0b101e] hover:bg-[#111930] transition-all shadow-md shadow-black/10">
            <UploadIcon className="w-4 h-4 mr-2 text-indigo-400" />
            Upload Photo
          </label>
          <input id="file-upload" name="file-upload" type="file" className="sr-only" onChange={onImageUpload} accept="image/*" />

          {imageFile && (
            <div className="flex items-center justify-center bg-indigo-950/30 text-indigo-300 text-[9px] font-mono border border-indigo-900/40 px-2 py-1.5 rounded-md truncate">
              {imageFile.name}
            </div>
          )}
        </div>

        {/* Stock Presets */}
        {!imageUrl && (
          <div className="space-y-2 pt-1">
            <p className="text-[10px] text-gray-400 font-medium">Or select a professional stock scene:</p>
            <div className="grid grid-cols-3 gap-2">
              {SAMPLE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => onSelectPreset(preset.url)}
                  className="group relative h-14 rounded-lg overflow-hidden border border-[#1b2542] hover:border-indigo-500 transition-all text-left"
                  title={preset.description}
                >
                  <img src={preset.url} alt={preset.name} className="w-full h-full object-cover brightness-50 group-hover:brightness-90 group-hover:scale-105 transition-all duration-300" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-black/20" />
                  <span className="absolute bottom-1 left-1 right-1 text-[8px] font-bold text-white truncate drop-shadow-md">
                    {preset.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: AI Generation Engine Settings */}
      <div className="space-y-3 bg-[#0a0f1d]/50 p-3 rounded-lg border border-[#16203a]/60">
        <h3 className="text-[10px] font-extrabold text-indigo-400 font-mono tracking-wider uppercase">AI Optical Engine</h3>
        <div className="space-y-2.5">
          <div className="relative">
            <select
              value={selectedModel}
              onChange={(e) => onModelChange(e.target.value)}
              className="w-full text-xs bg-[#0b101e] border border-[#1b2542] hover:border-indigo-500/50 rounded-md px-3 py-2 text-gray-200 focus:outline-none focus:border-indigo-500 appearance-none cursor-pointer font-mono"
            >
              <option value="gemini-3.1-flash-lite-image">Gemini Flash Lite (Reactive)</option>
              <option value="gemini-3.1-flash-image">Gemini Flash (Ultra 1K HD)</option>
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-gray-500">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
          <div className="flex items-center justify-between bg-[#0b101e] px-2.5 py-2 rounded border border-[#1b2542] hover:border-indigo-500/20 transition-colors">
            <span className="text-[10px] text-gray-300 font-mono uppercase tracking-wider">Auto-Render Scene</span>
            <input
              type="checkbox"
              checked={autoGenerate}
              onChange={(e) => onAutoGenerateToggle(e.target.checked)}
              className="rounded bg-slate-950 border-slate-800 text-indigo-500 focus:ring-indigo-500 h-4 w-4 cursor-pointer accent-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* SECTION 3: Light Sources List */}
      <div className="flex-none lg:flex-grow flex flex-col space-y-2.5 overflow-visible lg:overflow-hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <h3 className="text-[10px] font-extrabold text-indigo-400 font-mono tracking-wider uppercase">Light Nodes</h3>
            {lights.length > 0 && (
              <div className="flex items-center space-x-1.5 text-[9px] font-mono text-indigo-400/80 bg-indigo-950/20 px-1.5 py-0.5 rounded border border-indigo-900/30">
                <button
                  onClick={() => setExpandedIds(lights.map(l => l.id))}
                  className="hover:text-indigo-300 transition-colors cursor-pointer"
                >
                  EXPAND
                </button>
                <span className="text-gray-700">|</span>
                <button
                  onClick={() => setExpandedIds([])}
                  className="hover:text-indigo-300 transition-colors cursor-pointer"
                >
                  COLLAPSE
                </button>
              </div>
            )}
          </div>
          <button
            onClick={() => onAddLight(50, 50)}
            disabled={!imageUrl}
            className="text-[9px] bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 disabled:from-[#13192a] disabled:to-[#13192a] disabled:text-gray-600 text-white px-2.5 py-1 rounded-md font-extrabold tracking-widest uppercase transition-all shadow-md shadow-indigo-950/40 active:scale-95 cursor-pointer"
          >
            + Add Node
          </button>
        </div>

        {/* Studio Presets Quick Selection */}
        {imageUrl && onApplyStudioPreset && (
          <div className="space-y-1.5 pt-0.5">
            <span className="text-[9px] text-indigo-300/80 font-mono uppercase tracking-wider block">Studio Presets</span>
            <div className="grid grid-cols-2 gap-1.5">
              {STUDIO_LIGHTING_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onApplyStudioPreset(preset)}
                  className="group relative px-2 py-1.5 rounded-md bg-[#0b101e] border border-[#1b2542] hover:border-amber-500/60 transition-all text-left flex items-center space-x-1.5 cursor-pointer shadow-sm"
                  title={preset.description}
                >
                  <div className={`w-2 h-2 rounded-full bg-gradient-to-r ${preset.colorBadge} shrink-0`} />
                  <span className="text-[9px] font-mono font-bold text-gray-200 truncate group-hover:text-amber-300">
                    {preset.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        {lights.length === 0 ? (
          <div className="flex-grow flex flex-col items-center justify-center p-6 border border-dashed border-[#1d2742] rounded-lg bg-[#0a0e1a]/20">
            <p className="text-[10px] text-gray-400 text-center leading-relaxed font-mono uppercase tracking-wider">
              No active light nodes.
            </p>
            <p className="text-[10px] text-gray-500 text-center mt-1">
              Click <span className="text-indigo-400">+ Add Node</span> or double-click canvas to start.
            </p>
          </div>
        ) : (
          <div className="flex-none overflow-visible max-h-none lg:flex-grow lg:overflow-y-auto space-y-2.5 pr-1 scrollbar-thin scrollbar-thumb-slate-800">
            <AnimatePresence initial={false}>
              {lights.map((light, index) => {
                const colorInfo = getColorInfo(light.color);
                const isExpanded = expandedIds.includes(light.id);
                const isSelected = selectedLightId === light.id;

                return (
                  <motion.div
                    key={light.id}
                    layout
                    initial={{ opacity: 0, y: 15, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.2 }}
                    className={`flex flex-col rounded-xl border transition-all duration-300 relative overflow-hidden ${
                      isSelected
                        ? 'bg-[#0f152b] border-[#4361ee]/60 shadow-[0_0_15px_rgba(67,97,238,0.15)] text-white'
                        : 'bg-[#0b101e]/60 border-[#1b2542] hover:bg-[#0f172a] hover:border-[#25355e]'
                    }`}
                  >
                    {/* Selected glow indicator line on the left edge */}
                    {isSelected && (
                      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b from-indigo-500 to-cyan-400" />
                    )}

                    {/* Layer Header Row */}
                    <div
                      onClick={() => {
                        onSelectLight(light.id);
                        if (isExpanded) {
                          setExpandedIds(prev => prev.filter(id => id !== light.id));
                        } else {
                          setExpandedIds(prev => [...prev, light.id]);
                        }
                      }}
                      className="flex items-center justify-between p-3 cursor-pointer select-none"
                    >
                      <div className="flex items-center space-x-3 pl-1">
                        <span
                          className="w-3 h-3 rounded-full border border-black/40 shadow-inner animate-pulse"
                          style={{
                            backgroundColor: colorInfo.hex,
                            boxShadow: `0 0 8px ${colorInfo.hex}80`
                          }}
                        />
                        <div className="flex flex-col">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-bold font-mono text-gray-100">NODE {String(index + 1).padStart(2, '0')}</span>
                            <span className="text-[8px] bg-indigo-950/45 border border-indigo-900/30 text-indigo-400 px-1.5 py-0.5 rounded-md font-mono font-medium">
                              X:{Math.round(light.x)} Y:{Math.round(light.y)}
                            </span>
                          </div>
                          <span className="text-[10px] text-gray-400 font-mono tracking-wider uppercase mt-0.5">
                            {light.type.replace(/_/g, ' ')}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateLight(light.id, { enabled: light.enabled === false ? true : false });
                          }}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                            light.enabled !== false
                              ? 'text-cyan-400 hover:bg-cyan-500/10'
                              : 'text-gray-600 hover:text-gray-400 hover:bg-gray-800/40'
                          }`}
                          title={light.enabled !== false ? 'Hide/Disable Light' : 'Show/Enable Light'}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            {light.enabled !== false ? (
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            ) : (
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858-5.908a10.025 10.025 0 014.122-.963c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21M3 3l18 18" />
                            )}
                          </svg>
                        </button>
                        {onDuplicateLight && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDuplicateLight(light.id);
                            }}
                            className="p-1.5 rounded-lg hover:bg-indigo-500/10 text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
                            title="Duplicate Layer (Ctrl+D)"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteLight(light.id);
                          }}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-400 hover:text-red-300 transition-colors cursor-pointer"
                          title="Delete Layer"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (isExpanded) {
                              setExpandedIds(prev => prev.filter(id => id !== light.id));
                            } else {
                              setExpandedIds(prev => [...prev, light.id]);
                            }
                          }}
                          className="p-1.5 rounded-lg hover:bg-[#1a2542]/50 text-gray-400 hover:text-gray-200 transition-colors cursor-pointer"
                          title={isExpanded ? "Collapse Layer" : "Expand Layer"}
                        >
                          {isExpanded ? (
                            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Inline Expanded Settings Accordion */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: 'easeInOut' }}
                          className="border-t border-[#1b2542]/60 bg-[#070b13]/60 relative overflow-hidden"
                        >
                          <div className="p-4 space-y-4">
                            <div className="space-y-3.5 text-xs">
                              {/* TYPE SELECTION */}
                              <label className="block space-y-1">
                                <span className="text-[9px] text-indigo-300/80 font-mono uppercase tracking-wider">Optical Flare Mode</span>
                                <select
                                  value={light.type}
                                  onChange={(e) => onUpdateLight(light.id, { type: e.target.value as LightType })}
                                  className="w-full text-xs bg-[#0b101f] border border-[#1b2542] text-gray-100 focus:outline-none focus:border-indigo-500 px-2.5 py-2 rounded-md font-mono"
                                >
                                  {Object.entries(LightType).map(([key, value]) => (
                                    <option key={key} value={value}>{key.replace(/_/g, ' ')}</option>
                                  ))}
                                </select>
                              </label>

                              {/* COLOR ACCENTS */}
                              <div className="space-y-2">
                                <span className="text-[9px] text-indigo-300/80 font-mono uppercase tracking-wider block">Wavelength Color Tone</span>

                                {/* Row with preset circles and the custom color trigger */}
                                <div className="flex flex-wrap items-center gap-2">
                                  {COLOR_PRESETS.map((preset) => (
                                    <button
                                      key={preset.name}
                                      onClick={() => onUpdateLight(light.id, { color: preset.value })}
                                      className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-115 cursor-pointer relative flex items-center justify-center ${
                                        light.color === preset.value
                                          ? 'border-indigo-400 scale-110 shadow-md shadow-indigo-900/50'
                                          : 'border-transparent'
                                      }`}
                                      style={{ backgroundColor: preset.hex }}
                                      title={preset.name}
                                    >
                                      {light.color === preset.value && (
                                        <span className="w-1.5 h-1.5 bg-black rounded-full" />
                                      )}
                                    </button>
                                  ))}

                                  {/* Custom Color Button & Picker Input */}
                                  <div className="relative flex items-center">
                                    <input
                                      type="color"
                                      id={`color-picker-${light.id}`}
                                      value={colorInfo.hex}
                                      onChange={(e) => onUpdateLight(light.id, { color: e.target.value })}
                                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                    />
                                    <button
                                      type="button"
                                      className={`w-6 h-6 rounded-full border-2 bg-gradient-to-tr from-rose-500 via-amber-400 to-indigo-500 transition-transform hover:scale-115 cursor-pointer flex items-center justify-center text-white font-black text-xs ${
                                        !COLOR_PRESETS.some(p => p.value === light.color)
                                          ? 'border-indigo-400 scale-110 shadow-md shadow-indigo-950/60'
                                          : 'border-transparent'
                                      }`}
                                      title="Custom Spectrum Color Picker"
                                    >
                                      +
                                    </button>
                                  </div>
                                </div>

                                {/* Custom hex text editor for power users */}
                                <div className="flex items-center space-x-2 mt-2 bg-[#090e1a] border border-[#1b2542] rounded-lg px-3 py-2">
                                  <span className="text-[10px] text-gray-500 font-mono">HEX:</span>
                                  <input
                                    type="text"
                                    value={colorInfo.hex.toUpperCase()}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      if (val.startsWith('#') && val.length <= 9) {
                                        onUpdateLight(light.id, { color: val });
                                      } else if (!val.startsWith('#') && val.length <= 8) {
                                        onUpdateLight(light.id, { color: `#${val}` });
                                      }
                                    }}
                                    placeholder="#FF9D42"
                                    className="bg-transparent text-xs text-white focus:outline-none w-24 font-mono uppercase"
                                  />
                                  <span
                                    className="w-4 h-4 rounded border border-white/10 ml-auto shadow-inner"
                                    style={{ backgroundColor: colorInfo.hex }}
                                  />
                                </div>
                              </div>

                              {/* SLIDERS */}
                              <div className="space-y-3.5 pt-1">
                                <SliderControl
                                  label={light.type === LightType.Lightning ? "Core Bolt Glow" : "Exposure Range"}
                                  value={light.exposure}
                                  onChange={(value) => onUpdateLight(light.id, { exposure: value })}
                                />
                                <SliderControl
                                  label={light.type === LightType.Lightning ? "Branching Discharges" : "Intensity Power"}
                                  value={light.intensity}
                                  onChange={(value) => onUpdateLight(light.id, { intensity: value })}
                                />
                                <SliderControl
                                  label={light.type === LightType.Lightning ? "Lightning Opacity" : "Wavelength Blend Opacity"}
                                  value={light.opacity !== undefined ? light.opacity : 100}
                                  min={0}
                                  max={100}
                                  onChange={(value) => onUpdateLight(light.id, { opacity: value })}
                                />
                                <SliderControl
                                  label={light.type === LightType.Lightning ? "Bolt Length / Scale" : "Aperture / Size Scale"}
                                  value={light.size !== undefined ? light.size : 100}
                                  min={10}
                                  max={300}
                                  onChange={(value) => onUpdateLight(light.id, { size: value })}
                                />
                                <SliderControl
                                  label={light.type === LightType.Lightning ? "Fractal Jaggedness" : "Shadow Ambient Occlusion"}
                                  value={light.shadowIntensity !== undefined ? light.shadowIntensity : 40}
                                  min={0}
                                  max={100}
                                  onChange={(value) => onUpdateLight(light.id, { shadowIntensity: value })}
                                />
                                <SliderControl
                                  label={light.type === LightType.Lightning ? "Corona Glow Blur" : "Lens Blur (Depth of Field)"}
                                  value={light.depthOfField}
                                  onChange={(value) => onUpdateLight(light.id, { depthOfField: value })}
                                />
                                <SliderControl
                                  label={light.type === LightType.Lightning ? "Strike Tilt Angle" : "Refraction Angle / Rotation"}
                                  value={light.rotation}
                                  max={360}
                                  onChange={(value) => onUpdateLight(light.id, { rotation: value })}
                                />
                                <SliderControl
                                  label="3D Depth (back to front)"
                                  value={(light.zDepth ?? 20) + 100}
                                  min={0}
                                  max={200}
                                  displayValue={`${light.zDepth ?? 20}`}
                                  onChange={(value) => onUpdateLight(light.id, { zDepth: value - 100, placement: value < 100 ? 'background' : 'foreground' })}
                                />
                                <SliderControl label="Physical Falloff" value={light.falloff ?? 65} onChange={(value) => onUpdateLight(light.id, { falloff: value })} />
                                {(light.type === LightType.Spot || light.type === LightType.Volumetric || light.type === LightType.God_RAYS) && (
                                  <SliderControl label="Beam Cone Angle" value={light.coneAngle ?? 45} min={5} max={120} displayValue={`${light.coneAngle ?? 45}°`} onChange={(value) => onUpdateLight(light.id, { coneAngle: value })} />
                                )}
                                {(light.type === LightType.Area || light.type === LightType.Tube) && (
                                  <SliderControl label="Emitter Length" value={light.length ?? 100} min={10} max={300} onChange={(value) => onUpdateLight(light.id, { length: value })} />
                                )}
                                <SliderControl label="Color Temperature" value={light.temperature ?? 4200} min={1800} max={12000} displayValue={`${light.temperature ?? 4200}K`} onChange={(value) => onUpdateLight(light.id, { temperature: value })} />

                                {/* DEPTH PLACEMENT */}
                                <div className="space-y-1 pt-1.5 border-t border-indigo-900/10">
                                  <span className="text-[9px] text-indigo-300/80 font-mono uppercase tracking-wider block">Depth Placement</span>
                                  <div className="flex bg-[#0b101f] border border-[#1b2542] rounded-md overflow-hidden p-0.5">
                                    <button
                                      type="button"
                                      onClick={() => onUpdateLight(light.id, { placement: 'foreground' })}
                                      className={`flex-1 text-[10px] font-mono py-1 rounded transition-all cursor-pointer ${
                                        light.placement !== 'background'
                                          ? 'bg-indigo-600/85 text-white shadow-sm font-semibold'
                                          : 'text-gray-400 hover:text-gray-200'
                                      }`}
                                    >
                                      Foreground
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => onUpdateLight(light.id, { placement: 'background' })}
                                      className={`flex-1 text-[10px] font-mono py-1 rounded transition-all cursor-pointer ${
                                        light.placement === 'background'
                                          ? 'bg-indigo-600/85 text-white shadow-sm font-semibold'
                                          : 'text-gray-400 hover:text-gray-200'
                                      }`}
                                    >
                                      Background
                                    </button>
                                  </div>
                                </div>

                                {/* CONDITIONAL RIM LIGHT SLIDER */}
                                {light.placement === 'background' && (
                                  <SliderControl
                                    label="Rim Light Halo Intensity"
                                    value={light.rimLightIntensity !== undefined ? light.rimLightIntensity : 40}
                                    min={0}
                                    max={100}
                                    onChange={(value) => onUpdateLight(light.id, { rimLightIntensity: value })}
                                  />
                                )}

                                {/* TARGET LOOK-AT CONTROLS */}
                                <div className="space-y-2 pt-2 border-t border-indigo-900/20">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[9px] text-amber-300/90 font-mono uppercase tracking-wider block">Target Look-At Vector</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const useTarget = !light.useTarget;
                                        const tx = light.targetX ?? light.x;
                                        const ty = light.targetY ?? Math.min(100, light.y + 25);
                                        const rotation = useTarget ? Math.round(calculateTargetAngle(light.x, light.y, tx, ty)) % 360 : light.rotation;
                                        onUpdateLight(light.id, { useTarget, targetX: tx, targetY: ty, rotation });
                                      }}
                                      className={`text-[9px] font-mono px-2 py-0.5 rounded border transition-all cursor-pointer ${
                                        light.useTarget
                                          ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 font-bold'
                                          : 'bg-[#0b101f] border-[#1b2542] text-gray-400 hover:text-gray-200'
                                      }`}
                                    >
                                      {light.useTarget ? 'TARGET MODE: ON' : 'TARGET MODE: OFF'}
                                    </button>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      const tx = Math.round(subjectBounds.x);
                                      const ty = Math.round(subjectBounds.y);
                                      const rotation = Math.round(calculateTargetAngle(light.x, light.y, tx, ty)) % 360;
                                      onUpdateLight(light.id, {
                                        useTarget: true,
                                        targetX: tx,
                                        targetY: ty,
                                        rotation
                                      });
                                    }}
                                    className="w-full text-[10px] font-mono py-1.5 px-3 rounded-md bg-gradient-to-r from-amber-600/80 to-indigo-600/80 hover:from-amber-500 hover:to-indigo-500 text-white font-bold tracking-wider uppercase transition-all shadow-md cursor-pointer flex items-center justify-center space-x-1.5"
                                  >
                                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                      <circle cx="12" cy="12" r="6" />
                                      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
                                    </svg>
                                    <span>Aim Beam at Subject Center</span>
                                  </button>

                                  {light.useTarget && (
                                    <div className="grid grid-cols-2 gap-2 text-[9px] font-mono text-gray-300 bg-[#090e1a] p-2 rounded-md border border-[#1b2542]">
                                      <div>
                                        <span className="text-gray-500">Target X:</span> {Math.round(light.targetX ?? light.x)}%
                                      </div>
                                      <div>
                                        <span className="text-gray-500">Target Y:</span> {Math.round(light.targetY ?? (light.y + 25))}%
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* SECTION 4: Subject Isolation Focus */}
      <div className="space-y-3.5 bg-[#0a0f1d]/50 p-3.5 rounded-lg border border-[#16203a]/60 relative overflow-hidden group">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <h3 className="text-[10px] font-extrabold text-cyan-400 font-mono tracking-wider uppercase">Subject Isolation</h3>
          </div>
          <div className="flex items-center">
            <input
              type="checkbox"
              id="subject-isolation-toggle"
              checked={subjectBounds.enabled}
              onChange={(e) => onUpdateSubjectBounds({ ...subjectBounds, enabled: e.target.checked })}
              className="rounded bg-slate-950 border-slate-800 text-cyan-500 focus:ring-cyan-500 h-4 w-4 cursor-pointer accent-cyan-500"
            />
          </div>
        </div>

        <p className="text-[10px] text-gray-400 leading-relaxed font-sans">
          Isolate subjects from backgrounds to allow lights to slip behind them and project gorgeous glowing rim-lights.
        </p>

        <AnimatePresence>
          {subjectBounds.enabled && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="space-y-3 pt-2.5 border-t border-cyan-950/40"
            >
              {/* SEMANTIC SUBJECT TEXT INPUT */}
              <div className="space-y-1">
                <label className="text-[9px] text-cyan-300/80 font-mono uppercase tracking-wider block">Semantic Subject Label</label>
                <input
                  type="text"
                  placeholder="e.g. woman, perfume bottle, cat, sports car"
                  value={subjectBounds.subjectLabel || ""}
                  onChange={(e) => onUpdateSubjectBounds({ ...subjectBounds, subjectLabel: e.target.value })}
                  className="w-full text-[11px] font-sans bg-[#060a14] border border-[#1b2542] text-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-cyan-500 placeholder-gray-600 transition-colors"
                />
              </div>

              {/* SEGMENTATION CLASS / DETECTION MODE DROPDOWN */}
              <div className="space-y-1">
                <label className="text-[9px] text-cyan-300/80 font-mono uppercase tracking-wider block">Detection Class Hint</label>
                <select
                  value={subjectBounds.detectionMode || "auto"}
                  onChange={(e) => onUpdateSubjectBounds({ ...subjectBounds, detectionMode: e.target.value as any })}
                  className="w-full text-[11px] font-mono bg-[#060a14] border border-[#1b2542] text-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:border-cyan-500 transition-colors cursor-pointer"
                >
                  <option value="auto">Auto-Detect Primary Object</option>
                  <option value="portrait">Human / Portrait (hair & skin)</option>
                  <option value="product">Product / Object (hard edges)</option>
                  <option value="animal">Animal / Pet (fur & textures)</option>
                  <option value="vehicle">Vehicle / Car (geometric bounds)</option>
                </select>
              </div>

              <SliderControl
                label="Isolation Edge Width"
                value={subjectBounds.width}
                min={5}
                max={100}
                onChange={(value) => onUpdateSubjectBounds({ ...subjectBounds, width: value })}
              />
              <SliderControl
                label="Isolation Edge Height"
                value={subjectBounds.height}
                min={5}
                max={100}
                onChange={(value) => onUpdateSubjectBounds({ ...subjectBounds, height: value })}
              />
              <SliderControl
                label="Edge Refinement Threshold"
                value={subjectBounds.edgeRefinement !== undefined ? subjectBounds.edgeRefinement : 50}
                min={0}
                max={100}
                onChange={(value) => onUpdateSubjectBounds({ ...subjectBounds, edgeRefinement: value })}
              />
              <SliderControl
                label="Subject Depth Strength"
                value={subjectBounds.isolationStrength !== undefined ? subjectBounds.isolationStrength : 80}
                min={0}
                max={100}
                onChange={(value) => onUpdateSubjectBounds({ ...subjectBounds, isolationStrength: value })}
              />
              <SliderControl
                label="Guide Ring Opacity"
                value={subjectBounds.opacity}
                min={0}
                max={100}
                onChange={(value) => onUpdateSubjectBounds({ ...subjectBounds, opacity: value })}
              />

              <div className="bg-cyan-950/10 border border-cyan-900/35 p-2 rounded text-[9px] text-cyan-300 font-mono">
                💡 Tip: Drag and resize the cyan guide ring on the canvas directly to position your subject!
              </div>
              <div className="space-y-2 rounded-md border border-cyan-900/40 bg-[#060a14] p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-mono uppercase text-cyan-300">Selective mask paint</span>
                  <span className="text-[9px] font-mono text-gray-500">{maskStrokes.length} strokes</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <button onClick={() => onMaskModeChange(maskMode === 'add' ? null : 'add')} className={`rounded border py-1.5 text-[9px] font-mono ${maskMode === 'add' ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200' : 'border-[#1b2542] text-gray-400'}`}>+ PAINT</button>
                  <button onClick={() => onMaskModeChange(maskMode === 'erase' ? null : 'erase')} className={`rounded border py-1.5 text-[9px] font-mono ${maskMode === 'erase' ? 'border-rose-400 bg-rose-500/20 text-rose-200' : 'border-[#1b2542] text-gray-400'}`}>− ERASE</button>
                  <button onClick={onClearMask} className="rounded border border-[#1b2542] py-1.5 text-[9px] font-mono text-gray-400">CLEAR</button>
                </div>
                <SliderControl label="Brush size" value={maskBrushSize} min={1} max={20} onChange={onMaskBrushSizeChange} />
                <p className="text-[9px] leading-snug text-gray-500">Auto segmentation supplies the base mask. Paint cyan to include details or red to exclude spill areas.</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* SECTION 5: Scene, comparison, and reproducibility */}
      <div className="space-y-3 bg-[#0a0f1d]/50 p-3 rounded-lg border border-[#16203a]/60">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-extrabold text-indigo-400 font-mono tracking-wider uppercase">Scene & Match</h3>
          {renderMetadata?.matchScore !== undefined && <span className="rounded border border-emerald-700/40 bg-emerald-950/30 px-2 py-0.5 text-[9px] font-mono text-emerald-300">MATCH {renderMetadata.matchScore}%</span>}
        </div>
        {renderMetadata && (
          <div className="rounded border border-[#1b2542] bg-[#060a14] p-2 text-[9px] font-mono text-gray-400">
            <div>HASH {renderMetadata.sceneHash}</div>
            <div>RENDER {renderMetadata.renderId}</div>
          </div>
        )}
        <label className="flex items-center justify-between rounded border border-[#1b2542] bg-[#060a14] px-2.5 py-2 text-[9px] font-mono text-gray-300">
          Before / after slider
          <input type="checkbox" checked={showComparison} onChange={event => onShowComparisonChange(event.target.checked)} className="accent-cyan-500" />
        </label>
        <div className="flex gap-2">
          <input value={sceneName} maxLength={50} onChange={event => setSceneName(event.target.value)} className="min-w-0 flex-1 rounded border border-[#1b2542] bg-[#060a14] px-2 py-1.5 text-[10px] text-gray-200" />
          <button onClick={() => onSaveScene(sceneName.trim() || 'Untitled scene')} className="rounded bg-indigo-600 px-3 text-[9px] font-bold text-white">SAVE</button>
        </div>
        {savedScenes.length > 0 && (
          <div className="max-h-28 space-y-1 overflow-y-auto">
            {savedScenes.map(scene => (
              <div key={scene.name} className="flex items-center gap-1 rounded border border-[#1b2542] px-2 py-1">
                <button onClick={() => onLoadScene(scene)} className="min-w-0 flex-1 truncate text-left text-[9px] font-mono text-indigo-300">{scene.name}</button>
                <button onClick={() => onDeleteScene(scene.name)} className="text-[9px] text-rose-400">×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 6: Generate and professional export */}
      <div className="pt-3 border-t border-[#161f35]/80">
        {error && (
          <div className="mb-3 text-[11px] leading-snug p-2.5 rounded border font-mono">
            {error.toLowerCase().includes('quota') || error.toLowerCase().includes('429') || error.toLowerCase().includes('resource_exhausted') ? (
              <div className="text-amber-400 bg-amber-950/20 border-amber-900/40">
                <p className="font-bold mb-1">⚠️ API Quota Exceeded</p>
                <p className="mb-2 text-[10px] text-gray-300">
                  Image editing and generation models (Gemini Flash Lite Image) require a paid-tier API key in Google AI Studio.
                </p>
                <p className="text-[10px] text-indigo-300">
                  We have triggered the AI Studio upgrade prompt to help you enable billing.
                </p>
              </div>
            ) : (
              <div className="text-red-400 bg-red-950/20 border-red-900/30">
                {error}
              </div>
            )}
          </div>
        )}
        <div className="space-y-2">
          <button
            onClick={onGenerate}
            disabled={!imageUrl || isLoading}
            className="w-full relative overflow-hidden flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-lg text-xs font-black tracking-widest uppercase text-white bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:brightness-110 disabled:bg-none disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed transition-all duration-300 shadow-indigo-900/20 active:scale-98 cursor-pointer"
          >
            {isLoading && (
              <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.15),transparent)] -translate-x-full animate-[shimmer_1.5s_infinite]" />
            )}
            {isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing Wavelengths...
              </>
            ) : 'Reconstruct & Apply Light'}
          </button>

          {editedImageUrl && !isLoading && (
            <div className="space-y-2 rounded-lg border border-emerald-900/30 bg-emerald-950/10 p-2.5">
              <div className="grid grid-cols-2 gap-2">
                <select value={exportFormat} onChange={event => setExportFormat(event.target.value as typeof exportFormat)} className="rounded border border-[#1b2542] bg-[#060a14] px-2 py-1.5 text-[10px] font-mono text-gray-200">
                  <option value="png">PNG lossless</option><option value="jpeg">JPEG</option><option value="webp">WebP</option>
                </select>
                <select value={exportQuality} onChange={event => setExportQuality(Number(event.target.value))} className="rounded border border-[#1b2542] bg-[#060a14] px-2 py-1.5 text-[10px] font-mono text-gray-200">
                  <option value="100">100% quality</option><option value="95">95% quality</option><option value="85">85% quality</option>
                </select>
              </div>
              <button onClick={handleDownload} className="w-full flex justify-center items-center py-2.5 px-4 border border-emerald-500/30 hover:border-emerald-500/60 rounded-md text-xs font-bold tracking-wide uppercase text-emerald-400 bg-emerald-950/25 cursor-pointer">
                <DownloadIcon className="w-4 h-4 mr-2 text-emerald-400" /> Export High-Res Render
              </button>
              <button
                onClick={() => exportScenePackage({ version: 2, name: sceneName, savedAt: new Date().toISOString(), lights, subjectBounds, maskStrokes, model: selectedModel }, renderMetadata)}
                className="w-full rounded border border-indigo-500/30 py-2 text-[10px] font-mono uppercase text-indigo-300"
              >Export reproducible scene JSON</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface SliderControlProps {
    label: string;
    value: number;
    min?: number;
    max?: number;
    onChange: (value: number) => void;
    displayValue?: string;
}
const SliderControl: React.FC<SliderControlProps> = ({ label, value, min = 0, max = 100, onChange, displayValue }) => (
    <div className="space-y-1">
        <div className="flex justify-between text-[9px] text-gray-400 font-mono tracking-wider uppercase">
            <span>{label}</span>
            <span className="text-indigo-400 font-semibold font-mono">{displayValue ?? `${value}%`}</span>
        </div>
        <div className="relative flex items-center">
            <input
                type="range"
                min={min}
                max={max}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className="w-full h-1.5 bg-[#080d19] rounded-lg appearance-none cursor-pointer border border-[#1b2542] focus:outline-none accent-indigo-500"
            />
        </div>
    </div>
);
