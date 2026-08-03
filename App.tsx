import React, { useState, ChangeEvent, useCallback, useRef } from 'react';
import { LightSource, LightType, MaskBrushMode, MaskStroke, RenderMetadata, SceneDocument, SubjectBounds } from './types';
import { editImageWithAI } from './services/geminiService';
import { EditorCanvas } from './components/EditorCanvas';
import { ControlPanel } from './components/ControlPanel';
import { UndoIcon, RedoIcon } from './components/icons';
import { buildControlMaps, calculatePreviewMatch, deleteScene, listSavedScenes, saveScene, stableSceneHash } from './services/sceneTools';
import { STUDIO_LIGHTING_PRESETS, StudioPreset } from './services/lightingPresets';

export const SAMPLE_PRESETS = [
  {
    id: 'cyberpunk',
    name: 'Cyberpunk Alley',
    url: 'https://images.unsplash.com/photo-1515621061946-eff1c2a352bd?q=80&w=800&auto=format&fit=crop',
    description: 'Moody neon city street. Perfect for Volumetric or Lens Flare light sources.'
  },
  {
    id: 'portrait',
    name: 'Moody Portrait',
    url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=800&auto=format&fit=crop',
    description: 'Dark classic portrait. Ideal for high-contrast Pinpoint key lights.'
  },
  {
    id: 'livingroom',
    name: 'Cozy Living Space',
    url: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?q=80&w=800&auto=format&fit=crop',
    description: 'Warm interior room at dusk. Perfect for casting volumetric rays and warm ambient glow.'
  }
];

const App: React.FC = () => {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [editedImageUrl, setEditedImageUrl] = useState<string | null>(null);
  const [lightSources, setLightSources] = useState<LightSource[]>([]);

  // Undo/Redo History Stack
  const [history, setHistory] = useState<LightSource[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  const [selectedLightId, setSelectedLightId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.1-flash-lite-image');
  const [autoGenerate, setAutoGenerate] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const generationIdRef = useRef(0);
  const generationAbortRef = useRef<AbortController | null>(null);
  const [maskStrokes, setMaskStrokes] = useState<MaskStroke[]>([]);
  const [maskMode, setMaskMode] = useState<MaskBrushMode | null>(null);
  const [maskBrushSize, setMaskBrushSize] = useState(6);
  const [renderMetadata, setRenderMetadata] = useState<RenderMetadata | undefined>();
  const [comparePosition, setComparePosition] = useState(50);
  const [showComparison, setShowComparison] = useState(true);
  const [savedScenes, setSavedScenes] = useState<SceneDocument[]>(() => listSavedScenes());

  const cancelActiveGeneration = useCallback(() => {
    generationIdRef.current += 1;
    generationAbortRef.current?.abort();
    generationAbortRef.current = null;
    setIsLoading(false);
  }, []);

  React.useEffect(() => () => {
    generationAbortRef.current?.abort();
  }, []);

  // Subject boundary isolation mask state
  const [subjectBounds, setSubjectBounds] = useState<SubjectBounds>({
    x: 50,
    y: 50,
    width: 45,
    height: 65,
    enabled: false,
    opacity: 30,
    isolationStrength: 80,
    subjectLabel: '',
    detectionMode: 'auto',
    edgeRefinement: 50,
  });

  // Helper to push state to history stack cleanly
  const pushStateToHistory = useCallback((newState: LightSource[]) => {
    const currentSaved = history[historyIndex];
    if (currentSaved && JSON.stringify(currentSaved) === JSON.stringify(newState)) {
      return;
    }
    const updatedHistory = history.slice(0, historyIndex + 1);
    const nextHistory = [...updatedHistory, newState];
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
  }, [history, historyIndex]);

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setHistoryIndex(prevIndex);
      setLightSources(history[prevIndex]);
    }
  }, [history, historyIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      setLightSources(history[nextIndex]);
    }
  }, [history, historyIndex]);

  // Sync state on mouseup / touchend for continuous actions (dragging, sliding)
  React.useEffect(() => {
    const handleGlobalInteractionEnd = () => {
      pushStateToHistory(lightSources);
    };

    window.addEventListener('pointerup', handleGlobalInteractionEnd);
    window.addEventListener('pointercancel', handleGlobalInteractionEnd);
    return () => {
      window.removeEventListener('pointerup', handleGlobalInteractionEnd);
      window.removeEventListener('pointercancel', handleGlobalInteractionEnd);
    };
  }, [lightSources, pushStateToHistory]);

  const handleDuplicateLight = useCallback((id: string) => {
    const existing = lightSources.find(l => l.id === id);
    if (!existing) return;
    const duplicated: LightSource = {
      ...existing,
      id: crypto.randomUUID(),
      x: Math.min(95, existing.x + 4),
      y: Math.min(95, existing.y + 4),
      targetX: existing.targetX !== undefined ? Math.min(95, existing.targetX + 4) : undefined,
      targetY: existing.targetY !== undefined ? Math.min(95, existing.targetY + 4) : undefined,
    };
    const nextLights = [...lightSources, duplicated];
    setLightSources(nextLights);
    setSelectedLightId(duplicated.id);
    pushStateToHistory(nextLights);
  }, [lightSources, pushStateToHistory]);

  const handleApplyStudioPreset = useCallback((preset: StudioPreset) => {
    const nextLights = preset.createLights(subjectBounds);
    setLightSources(nextLights);
    if (nextLights.length > 0) {
      setSelectedLightId(nextLights[0].id);
    }
    pushStateToHistory(nextLights);
  }, [subjectBounds, pushStateToHistory]);

  // Bind key bindings for Ctrl+Z / Cmd+Z (Undo) and Ctrl+Y / Cmd+Shift+Z (Redo)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isZ = e.key.toLowerCase() === 'z';
      const isY = e.key.toLowerCase() === 'y';
      const isD = e.key.toLowerCase() === 'd';
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;

      if (isCmdOrCtrl && isZ) {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if (isCmdOrCtrl && isY) {
        e.preventDefault();
        handleRedo();
      } else if (isCmdOrCtrl && isD) {
        e.preventDefault();
        if (selectedLightId) {
          handleDuplicateLight(selectedLightId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, selectedLightId, handleDuplicateLight]);

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      cancelActiveGeneration();
      const file = e.target.files[0];
      setImageFile(file);

      const reader = new FileReader();
      reader.onloadend = () => {
        setImageUrl(reader.result as string);
        setEditedImageUrl(null); // Clear previous edit
        setLightSources([]); // Reset lights for new image
        setHistory([[]]); // Reset history
        setHistoryIndex(0);
        setSelectedLightId(null);
        setError(null);
        setMaskStrokes([]);
        setRenderMetadata(undefined);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSelectPreset = (url: string) => {
    cancelActiveGeneration();
    setImageFile(null); // Clear manual file upload since we are using a preset URL
    setImageUrl(url);
    setEditedImageUrl(null);
    setLightSources([]);
    setHistory([[]]); // Reset history
    setHistoryIndex(0);
    setSelectedLightId(null);
    setError(null);
    setMaskStrokes([]);
    setRenderMetadata(undefined);
  };

  const handleAddLight = (x: number, y: number) => {
    const newLight: LightSource = {
      id: crypto.randomUUID(),
      x,
      y,
      type: LightType.Point,
      exposure: 50,
      depthOfField: 20,
      intensity: 75,
      direction: 0,
      rotation: 0,
      color: 'Warm Gold (#ff9d42)',
      size: 100,
      shadowIntensity: 40,
      opacity: 100,
      placement: 'foreground',
      zDepth: 20,
      coneAngle: 45,
      falloff: 65,
      temperature: 4200,
      length: 100,
    };
    const nextLights = [...lightSources, newLight];
    setLightSources(nextLights);
    setSelectedLightId(newLight.id);
    pushStateToHistory(nextLights);
  };

  const handleUpdateLight = useCallback((id: string, updates: Partial<LightSource>) => {
    setLightSources(prev => prev.map(light => light.id === id ? { ...light, ...updates } : light));
  }, []);

  const handleDeleteLight = (id: string) => {
    const nextLights = lightSources.filter(light => light.id !== id);
    setLightSources(nextLights);
    if(selectedLightId === id) {
        setSelectedLightId(null);
    }
    pushStateToHistory(nextLights);
  };

  const handleGenerate = useCallback(async () => {
    // Android can restore the visible file input after an Activity restart while the
    // underlying File handle is no longer readable. imageUrl is our durable data copy.
    const activeImage = imageUrl;
    if (!activeImage) return;
    generationAbortRef.current?.abort();
    const controller = new AbortController();
    generationAbortRef.current = controller;
    const generationId = generationIdRef.current + 1;
    generationIdRef.current = generationId;
    const lightsSnapshot = lightSources;
    const subjectSnapshot = subjectBounds;
    const strokesSnapshot = maskStrokes;
    const modelSnapshot = selectedModel;
    setIsLoading(true);
    setError(null);
    try {
      const sceneState = { lights: lightsSnapshot, subjectBounds: subjectSnapshot, maskStrokes: strokesSnapshot, model: modelSnapshot };
      const sceneHash = stableSceneHash(sceneState);
      const controlMaps = await buildControlMaps(activeImage, lightsSnapshot, subjectSnapshot, strokesSnapshot);
      if (controller.signal.aborted) return;
      const result = await editImageWithAI(activeImage, lightsSnapshot, subjectSnapshot, modelSnapshot, controlMaps, sceneHash, controller.signal);
      if (generationId !== generationIdRef.current) return;
      if(result.editedImage) {
        setEditedImageUrl(result.editedImage);
        const matchScore = await calculatePreviewMatch(activeImage, result.editedImage, lightsSnapshot).catch(() => undefined);
        if (generationId !== generationIdRef.current) return;
        setRenderMetadata({
          ...(result.metadata || { sceneHash, renderId: sceneHash, generatedAt: new Date().toISOString(), model: modelSnapshot }),
          matchScore,
        });
      } else {
        setError("The AI model did not return an edited image. Please try adjusting your parameters.");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : "An unknown error occurred.");
    } finally {
      if (generationId === generationIdRef.current) {
        generationAbortRef.current = null;
        setIsLoading(false);
      }
    }
  }, [imageUrl, lightSources, subjectBounds, maskStrokes, selectedModel]);

  const handleSaveScene = (name: string) => {
    const scene: SceneDocument = { version: 2, name, savedAt: new Date().toISOString(), lights: lightSources, subjectBounds, maskStrokes, model: selectedModel };
    setSavedScenes(saveScene(scene));
  };

  const handleLoadScene = (scene: SceneDocument) => {
    setLightSources(scene.lights);
    setSubjectBounds(scene.subjectBounds);
    setMaskStrokes(scene.maskStrokes || []);
    setSelectedModel(scene.model);
    setEditedImageUrl(null);
    pushStateToHistory(scene.lights);
  };

  const handleManualGenerate = () => {
    handleGenerate();
  };

  // Real-time generation effect with debounce
  React.useEffect(() => {
    const activeImage = imageUrl;
    if (!autoGenerate || !activeImage) {
      return;
    }

    const handler = setTimeout(() => {
      handleGenerate();
    }, 2000); // 2.0 second debounce for safety and rate limiting

    return () => {
      clearTimeout(handler);
    };
  }, [lightSources, subjectBounds, maskStrokes, selectedModel, imageUrl, autoGenerate, handleGenerate]);

  return (
    <div className="flex flex-col lg:flex-row h-[100dvh] bg-[#06080d] bg-[linear-gradient(to_bottom,rgba(11,15,26,0.6)_0%,rgba(6,8,13,0.95)_100%)] text-gray-100 font-sans overflow-hidden relative">
        {/* Futuristic background elements */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(18,24,38,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(18,24,38,0.05)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-amber-500/3 rounded-full blur-[100px] pointer-events-none" />

        {/* Top Header Panel */}
        <header
          className="absolute top-0 left-0 right-0 bg-[#090d16]/75 backdrop-blur-xl border-b border-[#1b233a]/80 flex items-center justify-between px-4 md:px-6 z-20 shadow-lg shadow-black/25"
          style={{ height: 'calc(4rem + env(safe-area-inset-top))', paddingTop: 'env(safe-area-inset-top)' }}
        >
            <div className="flex items-center space-x-4">
                <div className="relative w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 via-indigo-600 to-cyan-500 flex items-center justify-center p-[1px] shadow-lg shadow-indigo-950/40">
                  <div className="w-full h-full bg-[#0a0f19] rounded-[10px] flex items-center justify-center">
                    <svg className="w-5 h-5 text-indigo-400 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="12" cy="12" r="6" stroke="url(#logo-grad)"></circle>
                      <path d="M12 2v4M12 18v4M2 12h4M18 12h4"></path>
                      <circle cx="12" cy="12" r="1.5" fill="currentColor"></circle>
                      <defs>
                        <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#f59e0b" />
                          <stop offset="50%" stopColor="#6366f1" />
                          <stop offset="100%" stopColor="#06b6d4" />
                        </linearGradient>
                      </defs>
                    </svg>
                  </div>
                </div>
                <div>
                    <h1 className="text-sm md:text-base font-extrabold tracking-wider bg-gradient-to-r from-white via-gray-100 to-gray-400 bg-clip-text text-transparent uppercase font-sans">
                      Lumina Light Studio
                    </h1>
                    <p className="text-[9px] text-indigo-400/80 font-mono tracking-widest uppercase">
                      Next-Gen Generative Relighting
                    </p>
                </div>
            </div>

            <div className="flex items-center space-x-4">
                {/* Undo/Redo Buttons */}
                <div className="flex items-center space-x-1 bg-[#171c2a] border border-[#232a3d] rounded-lg p-1 shadow-inner shadow-black/45">
                    <button
                        onClick={handleUndo}
                        disabled={historyIndex === 0}
                        className="p-1.5 rounded-md hover:bg-[#20273a] disabled:opacity-30 disabled:hover:bg-transparent text-gray-300 transition-all cursor-pointer"
                        title="Undo (Ctrl+Z)"
                    >
                        <UndoIcon className="w-4 h-4" />
                    </button>
                    <div className="w-px h-4 bg-[#232a3d]" />
                    <button
                        onClick={handleRedo}
                        disabled={historyIndex === history.length - 1}
                        className="p-1.5 rounded-md hover:bg-[#20273a] disabled:opacity-30 disabled:hover:bg-transparent text-gray-300 transition-all cursor-pointer"
                        title="Redo (Ctrl+Y or Ctrl+Shift+Z)"
                    >
                        <RedoIcon className="w-4 h-4" />
                    </button>
                </div>

                {error && (
                    <div className="hidden md:flex items-center space-x-2 text-xs bg-red-950/40 border border-red-900/50 text-red-300 px-3 py-1.5 rounded-md max-w-md truncate">
                        <span className="font-semibold">Error:</span>
                        <span>{error}</span>
                    </div>
                )}
            </div>
        </header>

        {/* Main Interface */}
        <main
          className="mobile-scroll-container flex-grow flex flex-col lg:flex-row overflow-y-auto overflow-x-hidden lg:overflow-hidden"
          style={{
            marginTop: 'calc(4rem + env(safe-area-inset-top))',
            height: 'calc(100dvh - 4rem - env(safe-area-inset-top))'
          }}
        >
            <EditorCanvas
                image={imageUrl}
                editedImage={editedImageUrl}
                lights={lightSources}
                selectedLightId={selectedLightId}
                subjectBounds={subjectBounds}
                onAddLight={handleAddLight}
                onUpdateLight={handleUpdateLight}
                onSelectLight={setSelectedLightId}
                onUpdateSubjectBounds={setSubjectBounds}
                maskStrokes={maskStrokes}
                maskMode={maskMode}
                maskBrushSize={maskBrushSize}
                onAddMaskStroke={(stroke) => setMaskStrokes(prev => [...prev, stroke])}
                comparePosition={comparePosition}
                showComparison={showComparison}
                onComparePositionChange={setComparePosition}
            />
            <ControlPanel
                imageFile={imageFile}
                imageUrl={imageUrl}
                editedImageUrl={editedImageUrl}
                lights={lightSources}
                selectedLightId={selectedLightId}
                selectedModel={selectedModel}
                autoGenerate={autoGenerate}
                isLoading={isLoading}
                error={error}
                subjectBounds={subjectBounds}
                onImageUpload={handleImageUpload}
                onSelectPreset={handleSelectPreset}
                onAddLight={handleAddLight}
                onUpdateLight={handleUpdateLight}
                onSelectLight={setSelectedLightId}
                onDeleteLight={handleDeleteLight}
                onGenerate={handleManualGenerate}
                onModelChange={setSelectedModel}
                onAutoGenerateToggle={setAutoGenerate}
                onUpdateSubjectBounds={setSubjectBounds}
                maskStrokes={maskStrokes}
                maskMode={maskMode}
                maskBrushSize={maskBrushSize}
                onMaskModeChange={setMaskMode}
                onMaskBrushSizeChange={setMaskBrushSize}
                onClearMask={() => setMaskStrokes([])}
                renderMetadata={renderMetadata}
                showComparison={showComparison}
                onShowComparisonChange={setShowComparison}
                savedScenes={savedScenes}
                onSaveScene={handleSaveScene}
                onLoadScene={handleLoadScene}
                onDeleteScene={(name) => setSavedScenes(deleteScene(name))}
            />
        </main>
    </div>
  );
}

export default App;
