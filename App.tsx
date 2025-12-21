import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GridCell } from './components/GridCell';
import { Recorder } from './components/Recorder';
import { VideoTrimmer } from './components/VideoTrimmer';
import { PadCell, PadTransform } from './types';
import { saveClip, getAllClips, deleteClip, updateClipVolume, getClip, updateClipOverlap } from './services/db';
import { decodeAudio, getAudioContext, findBeatOnset } from './services/audio';
import { exportProject, importProject } from './services/project';
import { X, Settings2, Loader2, Info, Video, Upload, Scissors, Layers, Volume2, Trash2, Zap, Save, FolderOpen, Heart, CheckCircle2, AlertTriangle } from 'lucide-react';

const GRID_SIZE = 12;
const DEFAULT_VOLUME = 5.0; 
const DEFAULT_TRANSFORM: PadTransform = { scale: 1, x: 0, y: 0, rotation: 0 };

export default function App() {
  const [cells, setCells] = useState<PadCell[]>([]);
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isProjectAction, setIsProjectAction] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [infoLang, setInfoLang] = useState<'es' | 'en'>('es');
  
  // Estados para exportación y borrado
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const clearTimerRef = useRef<number | null>(null);

  const [activeCellId, setActiveCellId] = useState<number | null>(null);
  const [showRecorder, setShowRecorder] = useState(false);
  const [pendingClip, setPendingClip] = useState<{blob: Blob, startTime: number, endTime?: number, transform?: PadTransform, allowOverlap?: boolean} | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const activeUrlsRef = useRef<Set<string>>(new Set());

  const createTrackedUrl = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    activeUrlsRef.current.add(url);
    return url;
  };

  const cleanupUrls = () => {
    activeUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    activeUrlsRef.current.clear();
  };

  useEffect(() => {
    return () => cleanupUrls();
  }, []);

  const loadData = useCallback(async () => {
    if (cells.length === 0) setIsLoading(true);
    try {
      const storedClips = await getAllClips();
      cleanupUrls();
      
      const loadedCells: PadCell[] = [];
      for (let i = 0; i < GRID_SIZE; i++) {
        const id = i + 1;
        const found = storedClips.find(c => c.id === id);
        if (found) {
          let buffer = null;
          try { buffer = await decodeAudio(found.blob); } catch (err) {}
          loadedCells.push({
            id,
            videoUrl: createTrackedUrl(found.blob),
            audioBuffer: buffer,
            startTime: found.startTime,
            endTime: found.endTime,
            isEmpty: false,
            volume: found.volume ?? DEFAULT_VOLUME,
            transform: found.transform || DEFAULT_TRANSFORM,
            allowOverlap: found.allowOverlap ?? false
          });
        } else {
          loadedCells.push({ 
            id, videoUrl: null, audioBuffer: null, startTime: 0, endTime: 0, isEmpty: true, volume: DEFAULT_VOLUME,
            transform: DEFAULT_TRANSFORM,
            allowOverlap: false
          });
        }
      }
      setCells(loadedCells);
    } catch (e) {
      console.error("Failed to load DB", e);
    } finally {
      setIsLoading(false);
    }
  }, [cells.length]);

  useEffect(() => {
    loadData();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') loadData();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [loadData]);

  const performSave = async (id: number, blob: Blob, startTime: number, endTime: number, transform: PadTransform) => {
    const url = createTrackedUrl(blob);
    let buffer: AudioBuffer | null = null;
    try { buffer = await decodeAudio(blob); } catch (e) {}

    const currentCell = cells.find(c => c.id === id);
    if (currentCell?.videoUrl) {
      URL.revokeObjectURL(currentCell.videoUrl);
      activeUrlsRef.current.delete(currentCell.videoUrl);
    }

    const updatedOverlap = currentCell?.allowOverlap ?? false;
    const updatedVolume = currentCell?.isEmpty ? DEFAULT_VOLUME : currentCell?.volume ?? DEFAULT_VOLUME;

    setCells(prev => prev.map(cell => 
      cell.id === id 
        ? { 
            ...cell, 
            videoUrl: url, 
            audioBuffer: buffer, 
            startTime, 
            endTime, 
            isEmpty: false, 
            volume: updatedVolume,
            transform,
            allowOverlap: updatedOverlap
          } 
        : cell
    ));

    await saveClip(id, blob, startTime, endTime, updatedVolume, transform, updatedOverlap);
  };

  const handleCaptureComplete = async (blob: Blob) => {
    if (activeCellId === null) return;
    const tempVideo = document.createElement('video');
    const url = URL.createObjectURL(blob);
    tempVideo.src = url;
    tempVideo.preload = 'metadata';
    tempVideo.muted = true;
    
    const getDuration = () => {
      return new Promise<number>((resolve) => {
        tempVideo.onloadedmetadata = () => {
          if (tempVideo.duration === Infinity || isNaN(tempVideo.duration)) {
            tempVideo.onseeked = () => resolve(tempVideo.duration || 999);
            tempVideo.currentTime = 1e10;
          } else {
            resolve(tempVideo.duration);
          }
        };
        setTimeout(() => resolve(tempVideo.duration || 999), 3000);
      });
    };

    const duration = await getDuration();
    URL.revokeObjectURL(url);
    await performSave(activeCellId, blob, 0, duration, DEFAULT_TRANSFORM);
    setShowRecorder(false);
    setActiveCellId(null);
  };

  const handleImportComplete = async (blob: Blob) => {
    const startTime = await findBeatOnset(blob);
    setPendingClip({ blob, startTime, transform: DEFAULT_TRANSFORM });
  };

  const handleTrimSave = async (finalStartTime: number, finalEndTime: number, finalTransform: PadTransform) => {
    if (!pendingClip || activeCellId === null) return;
    await performSave(activeCellId, pendingClip.blob, finalStartTime, finalEndTime, finalTransform);
    setPendingClip(null);
    setActiveCellId(null);
  };

  const handleTrimExisting = useCallback(async (id: number) => {
    const clip = await getClip(id);
    if (clip) {
      setActiveCellId(id);
      setPendingClip({
        blob: clip.blob,
        startTime: clip.startTime,
        endTime: clip.endTime,
        transform: clip.transform || DEFAULT_TRANSFORM,
        allowOverlap: clip.allowOverlap
      });
    }
  }, []);

  const handleDelete = useCallback(async (id: number) => {
    setCells(prev => {
      const cell = prev.find(c => c.id === id);
      if (cell?.videoUrl) {
        URL.revokeObjectURL(cell.videoUrl);
        activeUrlsRef.current.delete(cell.videoUrl);
      }
      return prev.map(c => 
        c.id === id 
          ? { ...c, videoUrl: null, audioBuffer: null, startTime: 0, endTime: 0, isEmpty: true, volume: DEFAULT_VOLUME, transform: DEFAULT_TRANSFORM, allowOverlap: false } 
          : c
      );
    });
    await deleteClip(id);
  }, []);

  const handleClearAll = async () => {
    if (!isConfirmingClear) {
      setIsConfirmingClear(true);
      if (clearTimerRef.current) window.clearTimeout(clearTimerRef.current);
      clearTimerRef.current = window.setTimeout(() => setIsConfirmingClear(false), 3000);
      return;
    }

    setIsProjectAction(true);
    setActionMessage("Borrando todo...");
    
    try {
      const clips = await getAllClips();
      for (const clip of clips) {
        await deleteClip(clip.id);
      }
      cleanupUrls();
      await loadData();
      setIsConfirmingClear(false);
      setActionMessage("¡Proyecto vaciado!");
      setTimeout(() => setActionMessage(null), 2000);
    } catch (e) {
      alert("Error al borrar");
    } finally {
      setIsProjectAction(false);
    }
  };

  const handleVolumeChange = useCallback((id: number, newVolume: number) => {
    setCells(prev => prev.map(cell => 
      cell.id === id ? { ...cell, volume: newVolume } : cell
    ));
    updateClipVolume(id, newVolume);
  }, []);

  const handleToggleOverlap = useCallback((id: number, allowOverlap: boolean) => {
    setCells(prev => prev.map(cell => 
      cell.id === id ? { ...cell, allowOverlap } : cell
    ));
    updateClipOverlap(id, allowOverlap);
  }, []);

  const handleExport = async () => {
    setIsProjectAction(true);
    setActionMessage("Empaquetando proyecto...");
    try {
      await exportProject(newProjectName || "My VideoPad Project");
      setShowSaveModal(false);
      setNewProjectName('');
    } catch (e) {
      alert("Error al exportar");
    } finally {
      setIsProjectAction(false);
      setActionMessage(null);
    }
  };

  const handleImport = async (file: File) => {
    setIsProjectAction(true);
    setActionMessage("Importando archivos...");
    try {
      const name = await importProject(file);
      await loadData();
      setActionMessage(`¡Proyecto "${name}" cargado!`);
      setTimeout(() => setActionMessage(null), 2000);
    } catch (e: any) {
      alert(e.message);
      setActionMessage(null);
    } finally {
      setIsProjectAction(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-gray-900 text-white space-y-4">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-pink-500"></div>
        <p className="text-sm text-gray-400">Loading VideoPad...</p>
      </div>
    );
  }

  const infoContent = {
    es: {
      title: "Manual de VideoPad",
      mainControls: "Controles Principales",
      editMode: "Modo Edición",
      editModeDesc: "Activa los ajustes individuales de cada pad (volumen, recorte, etc).",
      saveLoad: "Guardar/Cargar",
      saveLoadDesc: "Exporta o importa tu sesión completa en un archivo .madpad (formato ZIP robusto).",
      cellActions: "Acciones de Celda",
      record: "GRABAR",
      recordDesc: "Graba un clip instantáneo. Se inserta directamente al terminar.",
      import: "IMPORTAR",
      importDesc: "Añade un vídeo de tu galería y ajusta su encuadre.",
      trim: "RECORTAR Y ZOOM",
      trimDesc: "Ajusta el punto IN/OUT, gira el vídeo y haz zoom con 2 dedos.",
      overlap: "SOLAPAMIENTO (OVERLAP)",
      overlapDesc: "Permite que el sonido se acumule si pulsas varias veces el mismo pad.",
      volume: "VOLUMEN",
      volumeDesc: "Control individual para nivelar tus sonidos.",
      delete: "BORRAR",
      deleteDesc: "Elimina el contenido de la celda permanentemente.",
      recorder: "Grabadora",
      flash: "FLASH DE PANTALLA",
      flashDesc: "Pone la pantalla en blanco para iluminar tu cara al grabar.",
      close: "Entendido",
      createdBy: "Creado por Geray Padilla Pérez"
    },
    en: {
      title: "VideoPad Manual",
      mainControls: "Main Controls",
      editMode: "Edit Mode",
      editModeDesc: "Enables individual settings for each pad (volume, trim, etc).",
      saveLoad: "Save/Load",
      saveLoadDesc: "Export or import your complete session in a .madpad file (robust ZIP format).",
      cellActions: "Cell Actions",
      record: "RECORD",
      recordDesc: "Record an instant clip. It inserts directly when finished.",
      import: "IMPORT",
      importDesc: "Add a video from your gallery and adjust its framing.",
      trim: "TRIM & ZOOM",
      trimDesc: "Adjust IN/OUT points, rotate, and zoom using 2 fingers.",
      overlap: "OVERLAP",
      overlapDesc: "Allows sound to stack if you tap the same pad multiple times.",
      volume: "VOLUME",
      volumeDesc: "Individual control to level your sounds.",
      delete: "DELETE",
      deleteDesc: "Permanently removes the cell content.",
      recorder: "Recorder",
      flash: "SCREEN FLASH",
      flashDesc: "Turns the screen white to illuminate your face when recording.",
      close: "Got it",
      createdBy: "Created by Geray Padilla Pérez"
    }
  }[infoLang];

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-950 text-white font-sans overflow-hidden">
      <input type="file" ref={fileInputRef} onChange={async (e) => {
        const f = e.target.files?.[0];
        if (f) await handleImport(f);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }} accept=".madpad,.zip" className="hidden" />
      
      <input type="file" ref={importFileInputRef} onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) handleImportComplete(file);
        if (importFileInputRef.current) importFileInputRef.current.value = '';
      }} accept="video/*" className="hidden" />

      <header className="flex-none p-4 flex items-center justify-between border-b border-gray-800 bg-gray-900/90 backdrop-blur-md z-20">
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 rounded-xl overflow-hidden bg-white/10 shadow-lg ring-1 ring-white/10">
            <img src="/logo.png" alt="Logo" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
            VideoPad <span className="text-pink-500 text-[10px] font-black align-top ml-0.5 uppercase tracking-tighter opacity-80">PRO</span>
          </h1>
        </div>
        
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-2">
             <button onClick={() => fileInputRef.current?.click()} disabled={isProjectAction} className="h-11 px-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl text-xs font-black text-gray-200 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2 shadow-inner">
                <FolderOpen className="w-4 h-4 text-blue-400"/>
                <span className="hidden xs:inline uppercase">Load</span>
             </button>
             <button onClick={() => setShowSaveModal(true)} disabled={isProjectAction} className="h-11 px-6 bg-white hover:bg-gray-100 text-black rounded-xl text-xs font-black transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-white/5">
               <Save className="w-4 h-4"/>
               <span className="hidden xs:inline uppercase">Save</span>
             </button>
          </div>

          <button 
            onClick={handleClearAll} 
            disabled={isProjectAction}
            className={`h-11 px-4 rounded-xl text-xs font-black transition-all active:scale-95 flex items-center gap-2 border shadow-lg ${
              isConfirmingClear 
              ? 'bg-red-600 border-red-500 text-white animate-pulse' 
              : 'bg-gray-800/50 border-gray-700 text-gray-500 hover:text-red-400'
            }`}
          >
            {isConfirmingClear ? <AlertTriangle className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
            <span className="uppercase">{isConfirmingClear ? 'Sure?' : 'Clear All'}</span>
          </button>
          
          <div className="flex gap-2 ml-2 border-l border-gray-800 pl-4">
            <button onClick={() => setShowInfo(true)} className="w-11 h-11 flex items-center justify-center bg-gray-800 border border-gray-700 rounded-full text-gray-400 hover:text-white transition-colors">
              <Info className="w-5 h-5" />
            </button>
            <button onClick={() => setIsDeleteMode(!isDeleteMode)} className={`w-11 h-11 flex items-center justify-center rounded-full font-black transition-all ${isDeleteMode ? 'bg-pink-600 shadow-xl shadow-pink-600/20 text-white' : 'bg-gray-800 border border-gray-700 text-gray-400'}`}>
              {isDeleteMode ? <X className="w-5 h-5" /> : <Settings2 className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {actionMessage && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] bg-blue-600 px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 animate-in slide-in-from-top-4 duration-300">
          {isProjectAction ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          <span className="text-xs font-black uppercase tracking-widest">{actionMessage}</span>
        </div>
      )}

      <main className="flex-1 w-full h-full p-2 sm:p-4 flex items-center justify-center overflow-hidden">
        <div className="w-full max-w-5xl grid grid-cols-3 landscape:grid-cols-4 gap-2 sm:gap-3 md:gap-4 auto-rows-fr aspect-[3/4] landscape:aspect-[4/3] max-h-full">
          {cells.map(cell => (
            <GridCell
              key={cell.id}
              cell={cell}
              isDeleteMode={isDeleteMode}
              onRecord={(id) => { setActiveCellId(id); setShowRecorder(true); }}
              onImport={(id) => { setActiveCellId(id); importFileInputRef.current?.click(); }}
              onTrim={handleTrimExisting}
              onDelete={handleDelete}
              onVolumeChange={handleVolumeChange}
              onToggleOverlap={handleToggleOverlap}
            />
          ))}
        </div>
      </main>

      <footer className="flex-none p-3 text-center text-[9px] text-gray-700 font-black uppercase tracking-[0.3em] bg-gray-950/50 backdrop-blur-sm flex flex-col gap-1">
        <div>{isDeleteMode ? 'CONFIG MODE ACTIVE' : 'SYSTEM ONLINE • READY TO SAMPLE'}</div>
        <div className="text-[7px] tracking-[0.4em] text-gray-800 opacity-60">CREATED BY GERAY PADILLA PÉREZ</div>
      </footer>

      {/* Save Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-in fade-in duration-200">
          <div className="bg-gray-900 border border-gray-800 w-full max-w-sm rounded-[2rem] overflow-hidden shadow-2xl p-8 space-y-6">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/10">
                <Save className="w-8 h-8 text-pink-500" />
              </div>
              <h2 className="text-xl font-black uppercase tracking-tight">Exportar Proyecto</h2>
              <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">Elige un nombre para tu archivo .madpad</p>
            </div>
            
            <div className="space-y-4">
              <input 
                type="text" 
                placeholder="Nombre del proyecto..." 
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                autoFocus
                className="w-full bg-gray-800 border border-gray-700 rounded-xl py-4 px-5 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-pink-500/50 transition-all text-center"
              />
              
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowSaveModal(false)}
                  className="flex-1 py-4 bg-gray-800 hover:bg-gray-750 text-gray-400 font-black text-xs rounded-xl transition-all uppercase tracking-widest"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleExport}
                  disabled={isProjectAction}
                  className="flex-[2] py-4 bg-white hover:bg-gray-100 text-black font-black text-xs rounded-xl shadow-xl transition-all uppercase tracking-widest flex items-center justify-center gap-2"
                >
                  {isProjectAction ? <Loader2 className="w-4 h-4 animate-spin" /> : "DESCARGAR ZIP"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showInfo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl" onClick={() => setShowInfo(false)}>
          <div className="bg-gray-900 border border-gray-800 w-full max-w-lg rounded-[2.5rem] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
              <div className="flex items-center gap-2">
                <Info className="w-5 h-5 text-pink-500" />
                <h2 className="text-xl font-black uppercase tracking-tight">{infoContent.title}</h2>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex bg-gray-800 p-1 rounded-lg border border-gray-700">
                  <button onClick={() => setInfoLang('es')} className={`px-2 py-1 text-[10px] font-black rounded ${infoLang === 'es' ? 'bg-pink-600 text-white' : 'text-gray-400'}`}>ES</button>
                  <button onClick={() => setInfoLang('en')} className={`px-2 py-1 text-[10px] font-black rounded ${infoLang === 'en' ? 'bg-pink-600 text-white' : 'text-gray-400'}`}>EN</button>
                </div>
                <button onClick={() => setShowInfo(false)} className="p-2 hover:bg-gray-800 rounded-full transition-colors text-gray-500 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-6 max-h-[50vh] overflow-y-auto no-scrollbar">
              <section>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-pink-500 mb-4 flex items-center gap-2">
                  <span className="w-1 h-3 bg-pink-500 rounded-full"></span>
                  {infoContent.mainControls}
                </h3>
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="p-2 bg-gray-800 border border-gray-700 rounded-xl shrink-0"><Settings2 className="w-4 h-4" /></div>
                    <div><p className="font-bold text-sm">{infoContent.editMode}</p><p className="text-xs text-gray-400 leading-relaxed">{infoContent.editModeDesc}</p></div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="p-2 bg-gray-800 border border-gray-700 rounded-xl shrink-0"><Save className="w-4 h-4" /></div>
                    <div><p className="font-bold text-sm">{infoContent.saveLoad}</p><p className="text-xs text-gray-400 leading-relaxed">{infoContent.saveLoadDesc}</p></div>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-4 flex items-center gap-2">
                  <span className="w-1 h-3 bg-blue-400 rounded-full"></span>
                  {infoContent.cellActions}
                </h3>
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="p-2 bg-gray-800 border border-gray-700 rounded-xl shrink-0"><Video className="w-4 h-4 text-pink-500" /></div>
                    <div><p className="font-bold text-sm text-pink-500">{infoContent.record}</p><p className="text-xs text-gray-400 leading-relaxed">{infoContent.recordDesc}</p></div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="p-2 bg-gray-800 border border-gray-700 rounded-xl shrink-0"><Upload className="w-4 h-4 text-blue-400" /></div>
                    <div><p className="font-bold text-sm text-blue-400">{infoContent.import}</p><p className="text-xs text-gray-400 leading-relaxed">{infoContent.importDesc}</p></div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="p-2 bg-gray-800 border border-gray-700 rounded-xl shrink-0"><Scissors className="w-4 h-4 text-blue-400" /></div>
                    <div><p className="font-bold text-sm">{infoContent.trim}</p><p className="text-xs text-gray-400 leading-relaxed">{infoContent.trimDesc}</p></div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="p-2 bg-gray-800 border border-gray-700 rounded-xl shrink-0"><Layers className="w-4 h-4 text-orange-500" /></div>
                    <div><p className="font-bold text-sm">{infoContent.overlap}</p><p className="text-xs text-gray-400 leading-relaxed">{infoContent.overlapDesc}</p></div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="p-2 bg-gray-800 border border-gray-700 rounded-xl shrink-0"><Volume2 className="w-4 h-4" /></div>
                    <div><p className="font-bold text-sm">{infoContent.volume}</p><p className="text-xs text-gray-400 leading-relaxed">{infoContent.volumeDesc}</p></div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="p-2 bg-gray-800 border border-gray-700 rounded-xl shrink-0 text-red-500"><Trash2 className="w-4 h-4" /></div>
                    <div><p className="font-bold text-sm">{infoContent.delete}</p><p className="text-xs text-gray-400 leading-relaxed">{infoContent.deleteDesc}</p></div>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-yellow-500 mb-4 flex items-center gap-2">
                  <span className="w-1 h-3 bg-yellow-500 rounded-full"></span>
                  {infoContent.recorder}
                </h3>
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="p-2 bg-gray-800 border border-gray-700 rounded-xl shrink-0 text-yellow-500"><Zap className="w-4 h-4 fill-current" /></div>
                    <div><p className="font-bold text-sm">{infoContent.flash}</p><p className="text-xs text-gray-400 leading-relaxed">{infoContent.flashDesc}</p></div>
                  </div>
                </div>
              </section>
            </div>
            
            <div className="p-6 bg-gray-950/50 border-t border-gray-800 space-y-4">
              <div className="flex items-center justify-center gap-2 py-2 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">
                <Heart className="w-3 h-3 text-pink-600 fill-pink-600" />
                {infoContent.createdBy}
              </div>
              <button onClick={() => setShowInfo(false)} className="w-full py-4 bg-pink-600 hover:bg-pink-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-all active:scale-95 shadow-lg shadow-pink-900/20">
                {infoContent.close}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRecorder && (
        <Recorder 
          onRecordingComplete={handleCaptureComplete}
          onCancel={() => { setShowRecorder(false); setActiveCellId(null); }}
        />
      )}

      {pendingClip && (
        <VideoTrimmer 
          blob={pendingClip.blob}
          initialStartTime={pendingClip.startTime}
          initialEndTime={pendingClip.endTime}
          initialTransform={pendingClip.transform}
          onSave={handleTrimSave}
          onCancel={() => { setPendingClip(null); setActiveCellId(null); }}
        />
      )}
    </div>
  );
}