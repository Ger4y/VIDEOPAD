
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GridCell } from './components/GridCell';
import { Recorder } from './components/Recorder';
import { VideoTrimmer } from './components/VideoTrimmer';
import { PadCell, PadTransform } from './types';
import { saveClip, getAllClips, deleteClip, updateClipVolume, updateClipOverlap, getClip, updateClipTrim } from './services/db';
import { decodeAudio, findBeatOnset, getAudioContext } from './services/audio';
import { exportProject, importProject } from './services/project';
import { X, Settings2, Loader2, Info, Video, Layers, Volume2, Trash2, Save, FolderOpen, Heart, AlertTriangle } from 'lucide-react';

const GRID_SIZE = 12;
const DEFAULT_VOLUME = 5.0; 
const DEFAULT_TRANSFORM: PadTransform = { scale: 1, x: 0, y: 0, rotation: 0 };

export default function App() {
  const [cells, setCells] = useState<PadCell[]>([]);
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isProjectAction, setIsProjectAction] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const clearTimerRef = useRef<number | null>(null);

  const [activeCellId, setActiveCellId] = useState<number | null>(null);
  const [showRecorder, setShowRecorder] = useState(false);
  const [trimmerData, setTrimmerData] = useState<{ id: number, blob: Blob, url: string, start: number, end: number, volume: number } | null>(null);

  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeUrlsRef = useRef<Map<number, string>>(new Map());

  const getTrackedUrl = useCallback((id: number, blob: Blob) => {
    const existing = activeUrlsRef.current.get(id);
    if (existing) URL.revokeObjectURL(existing);
    const url = URL.createObjectURL(blob);
    activeUrlsRef.current.set(id, url);
    return url;
  }, []);

  const cleanupAllUrls = useCallback(() => {
    activeUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    activeUrlsRef.current.clear();
  }, []);

  const stopCamera = useCallback(() => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
  }, [cameraStream]);

  const initCamera = useCallback(async (mode: 'user' | 'environment' = facingMode) => {
    try {
      if (cameraStream) {
        cameraStream.getTracks().forEach(t => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 720 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      setCameraStream(stream);
      setFacingMode(mode);
      return stream;
    } catch (err) {
      console.error("Camera access error:", err);
      return null;
    }
  }, [cameraStream, facingMode]);

  useEffect(() => {
    const unlockAudio = () => {
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') ctx.resume();
    };
    document.addEventListener('touchstart', unlockAudio, { once: true });
    document.addEventListener('mousedown', unlockAudio, { once: true });
    return () => {
      cleanupAllUrls();
      if (cameraStream) cameraStream.getTracks().forEach(t => t.stop());
    };
  }, [cleanupAllUrls, cameraStream]);

  const loadData = useCallback(async (isInitial = false) => {
    if (isInitial) setIsLoading(true);
    try {
      const storedClips = await getAllClips();
      const loadedCells: PadCell[] = [];
      
      for (let i = 0; i < GRID_SIZE; i++) {
        const id = i + 1;
        const found = storedClips.find(c => c.id === id);
        
        if (found && found.blob) {
          const existingCell = cells.find(c => c.id === id && !c.isEmpty);
          let buffer = existingCell?.audioBuffer || null;
          
          if (!buffer) {
            try { buffer = await decodeAudio(found.blob); } catch (err) { console.warn(`Error decodificando pad ${id}:`, err); }
          }

          let videoUrl = activeUrlsRef.current.get(id) || getTrackedUrl(id, found.blob);
          loadedCells.push({
            id, videoUrl, audioBuffer: buffer, startTime: found.startTime, endTime: found.endTime,
            isEmpty: false, volume: found.volume ?? DEFAULT_VOLUME,
            transform: (found.transform as any) || DEFAULT_TRANSFORM,
            allowOverlap: found.allowOverlap ?? false
          });
        } else {
          loadedCells.push({ id, videoUrl: null, audioBuffer: null, startTime: 0, endTime: 0, isEmpty: true, volume: DEFAULT_VOLUME, transform: DEFAULT_TRANSFORM, allowOverlap: false });
        }
      }
      setCells(loadedCells);
    } catch (e) {
      console.error("Error cargando datos:", e);
    } finally {
      if (isInitial) setIsLoading(false);
    }
  }, [getTrackedUrl, cells]);

  useEffect(() => {
    loadData(true);
  }, []);

  const handleStartRecording = async (id: number) => {
    setActiveCellId(id);
    const stream = await initCamera();
    if (stream) setShowRecorder(true);
  };

  const handleOpenTrimmer = async (id: number) => {
    const clip = await getClip(id);
    if (!clip || !clip.blob) return;

    const currentCell = cells.find(c => c.id === id);
    if (!currentCell || !currentCell.videoUrl) return;

    setTrimmerData({ 
      id, 
      blob: clip.blob, 
      url: currentCell.videoUrl,
      start: clip.startTime, 
      end: clip.endTime || 0,
      volume: clip.volume ?? DEFAULT_VOLUME
    });
  };

  const handleSaveTrim = async (start: number, end: number) => {
    if (!trimmerData) return;
    const { id } = trimmerData;
    
    setActionMessage("Guardando...");
    setIsProjectAction(true);

    try {
      // Usar updateClipTrim para evitar reenviar el Blob a IndexedDB, 
      // lo cual previene errores de serialización "Error preparing Blob/File data".
      await updateClipTrim(id, start, end);

      // Actualizar estado local inmediatamente.
      setCells(prev => prev.map(c => c.id === id ? {
        ...c,
        startTime: start,
        endTime: end
      } : c));
      
      console.log(`Pad ${id} recortado correctamente a: ${start.toFixed(2)}s - ${end.toFixed(2)}s`);
    } catch (e) {
      console.error("Error al guardar recorte:", e);
      alert("No se pudo aplicar el recorte.");
    } finally {
      setTrimmerData(null);
      setIsProjectAction(false);
      setActionMessage(null);
    }
  };

  const handleCaptureComplete = async (blob: Blob) => {
    if (activeCellId === null) return;
    stopCamera();
    setIsProjectAction(true);
    setActionMessage("Analizando...");
    try {
      const startTime = await findBeatOnset(blob);
      const v = document.createElement('video');
      const u = URL.createObjectURL(blob);
      const duration = await new Promise<number>((resolve) => {
        v.onloadedmetadata = () => resolve(v.duration || 1);
        v.onerror = () => resolve(1);
        v.src = u;
      });
      const currentCell = cells.find(c => c.id === activeCellId);
      const vol = currentCell?.isEmpty ? DEFAULT_VOLUME : currentCell?.volume ?? DEFAULT_VOLUME;
      await saveClip(activeCellId, blob, startTime, duration, vol, DEFAULT_TRANSFORM, false);
      
      const buffer = await decodeAudio(blob);
      const videoUrl = getTrackedUrl(activeCellId, blob);
      setCells(prev => prev.map(c => c.id === activeCellId ? {
        id: activeCellId, videoUrl, audioBuffer: buffer, startTime, endTime: duration,
        isEmpty: false, volume: vol, transform: DEFAULT_TRANSFORM, allowOverlap: false
      } : c));

    } catch (e) {
      console.error(e);
    } finally {
      setIsProjectAction(false);
      setActionMessage(null);
      setShowRecorder(false);
      setActiveCellId(null);
    }
  };

  const handleDelete = async (id: number) => {
    setIsProjectAction(true);
    setActionMessage("Borrando...");
    try {
      await deleteClip(id);
      const url = activeUrlsRef.current.get(id);
      if (url) {
        URL.revokeObjectURL(url);
        activeUrlsRef.current.delete(id);
      }
      setCells(prev => prev.map(c => c.id === id ? {
        id, videoUrl: null, audioBuffer: null, startTime: 0, endTime: 0, isEmpty: true, volume: DEFAULT_VOLUME, transform: DEFAULT_TRANSFORM, allowOverlap: false
      } : c));
    } catch (e) {
      console.error(e);
    } finally {
      setIsProjectAction(false);
      setActionMessage(null);
    }
  };

  const handleVolumeChange = async (id: number, volume: number) => {
    try {
      await updateClipVolume(id, volume);
      setCells(prev => prev.map(cell => cell.id === id ? { ...cell, volume } : cell));
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleOverlap = async (id: number, allowOverlap: boolean) => {
    try {
      await updateClipOverlap(id, allowOverlap);
      setCells(prev => prev.map(cell => cell.id === id ? { ...cell, allowOverlap } : cell));
    } catch (e) {
      console.error(e);
    }
  };

  const handleClearAll = () => {
    if (!isConfirmingClear) {
      setIsConfirmingClear(true);
      if (clearTimerRef.current) window.clearTimeout(clearTimerRef.current);
      clearTimerRef.current = window.setTimeout(() => setIsConfirmingClear(false), 3000);
      return;
    }
    
    setIsProjectAction(true);
    (async () => {
      try {
        const clips = await getAllClips();
        for (const clip of clips) await deleteClip(clip.id);
        cleanupAllUrls();
        loadData(true);
        setIsConfirmingClear(false);
      } catch (e) {
        console.error(e);
      } finally { setIsProjectAction(false); }
    })();
  };

  const handleExport = async () => {
    if (isProjectAction) return;
    setIsProjectAction(true);
    setActionMessage("Exportando...");
    try {
      await exportProject(newProjectName || "Sesion VideoPad");
      setShowSaveModal(false);
    } catch (e) {
      alert("Error al exportar.");
    } finally { setIsProjectAction(false); setActionMessage(null); }
  };

  const handleImport = async (file: File) => {
    setIsProjectAction(true);
    setActionMessage("Importando...");
    try {
      await importProject(file);
      cleanupAllUrls();
      loadData(true);
    } catch (e) {
      alert("Error al importar el proyecto.");
    } finally { setIsProjectAction(false); setActionMessage(null); }
  };

  if (isLoading) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-gray-950 text-white space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-pink-500 shadow-lg"></div>
        <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.3em]">Preparando VideoPad...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-950 text-white font-sans overflow-hidden">
      <input type="file" ref={fileInputRef} onChange={async (e) => {
        const f = e.target.files?.[0]; if (f) await handleImport(f); if (fileInputRef.current) fileInputRef.current.value = '';
      }} accept=".zip" className="hidden" />
      
      <header className="flex-none p-4 flex items-center justify-between border-b border-gray-800 bg-gray-900/90 backdrop-blur-md z-20">
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 rounded-xl overflow-hidden bg-white/10 shadow-lg ring-1 ring-white/10"><img src="/logo.png" alt="Logo" className="w-full h-full object-cover" /></div>
          <h1 className="text-xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">VideoPad <span className="text-pink-500 text-[10px] font-black align-top ml-0.5 uppercase tracking-tighter opacity-80">PRO</span></h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => fileInputRef.current?.click()} className="h-11 px-4 bg-gray-800 border border-gray-700 rounded-xl text-xs font-black flex items-center gap-2 transition-all active:scale-95 shadow-inner hover:bg-gray-700">
            <FolderOpen className="w-4 h-4 text-blue-400"/><span className="hidden xs:inline uppercase">Cargar</span>
          </button>
          <button onClick={() => setShowSaveModal(true)} className="h-11 px-6 bg-white text-black rounded-xl text-xs font-black flex items-center gap-2 shadow-lg transition-all active:scale-95 hover:bg-gray-100">
            <Save className="w-4 h-4"/><span className="hidden xs:inline uppercase">Guardar</span>
          </button>
          <button onClick={handleClearAll} className={`h-11 px-4 rounded-xl text-xs font-black transition-all flex items-center gap-2 border shadow-lg ${isConfirmingClear ? 'bg-red-600 border-red-500 text-white animate-pulse' : 'bg-gray-800/50 border-gray-700 text-gray-500 hover:text-red-400'}`}>
            {isConfirmingClear ? <AlertTriangle className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
            <span className="uppercase tracking-widest">{isConfirmingClear ? '¿Seguro?' : 'BORRAR TODO'}</span>
          </button>
          <div className="flex gap-2 ml-2 border-l border-gray-800 pl-4">
            <button onClick={() => setShowInfo(true)} className="w-11 h-11 flex items-center justify-center bg-gray-800 border border-gray-700 rounded-full text-gray-400 hover:text-white transition-colors">
              <Info className="w-5 h-5" />
            </button>
            <button onClick={() => setIsDeleteMode(!isDeleteMode)} className={`w-11 h-11 flex items-center justify-center rounded-full font-black transition-all ${isDeleteMode ? 'bg-pink-600 text-white shadow-xl shadow-pink-600/20' : 'bg-gray-800 border border-gray-700 text-gray-400'}`}>
              {isDeleteMode ? <X className="w-5 h-5" /> : <Settings2 className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {actionMessage && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] bg-pink-600 px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 animate-in slide-in-from-top-4 duration-300">
          <Loader2 className="w-4 h-4 animate-spin" /><span className="text-xs font-black uppercase tracking-widest">{actionMessage}</span>
        </div>
      )}

      <main className="flex-1 w-full h-full p-2 sm:p-4 flex items-center justify-center overflow-hidden">
        <div className="w-full max-w-5xl grid grid-cols-3 landscape:grid-cols-4 gap-2 sm:gap-4 auto-rows-fr aspect-[3/4] landscape:aspect-[4/3] max-h-full">
          {cells.map(cell => (
            <GridCell
              key={cell.id}
              cell={cell} 
              isDeleteMode={isDeleteMode} 
              isSuspended={showRecorder || !!trimmerData}
              onRecord={handleStartRecording} 
              onDelete={handleDelete}
              onVolumeChange={handleVolumeChange} 
              onToggleOverlap={handleToggleOverlap}
              onTrim={handleOpenTrimmer}
            />
          ))}
        </div>
      </main>

      <footer className="flex-none p-3 text-center text-[9px] text-gray-700 font-black uppercase tracking-[0.3em] bg-gray-950/50 backdrop-blur-sm flex flex-col gap-1">
        <div>{isDeleteMode ? 'MODO EDICIÓN ACTIVADO' : 'SISTEMA LISTO • TOCA LOS PADS'}</div>
        <div className="text-[7px] tracking-[0.4em] text-gray-800 opacity-60 uppercase">Geray Padilla Pérez</div>
      </footer>

      {showSaveModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-in fade-in duration-200">
          <div className="bg-gray-900 border border-gray-800 w-full max-w-sm rounded-[2rem] p-8 space-y-6 shadow-2xl">
            <h2 className="text-xl font-black uppercase text-center">Exportar Proyecto</h2>
            <input type="text" placeholder="Nombre..." value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-xl py-4 px-5 text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-pink-500/50" />
            <div className="flex gap-3">
              <button onClick={() => setShowSaveModal(false)} className="flex-1 py-4 bg-gray-800 text-gray-400 font-black text-xs rounded-xl uppercase hover:text-white">Cerrar</button>
              <button onClick={handleExport} disabled={isProjectAction} className="flex-[2] py-4 bg-white text-black font-black text-xs rounded-xl uppercase shadow-xl disabled:opacity-50">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {showRecorder && cameraStream && (
        <Recorder stream={cameraStream} facingMode={facingMode} onSwitchCamera={(mode) => initCamera(mode)} onRecordingComplete={handleCaptureComplete} onCancel={() => { stopCamera(); setShowRecorder(false); setActiveCellId(null); }} />
      )}

      {trimmerData && (
        <VideoTrimmer blob={trimmerData.blob} initialUrl={trimmerData.url} initialStart={trimmerData.start} initialEnd={trimmerData.end} volume={trimmerData.volume} onSave={handleSaveTrim} onCancel={() => setTrimmerData(null)} />
      )}

      {showInfo && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl" onClick={() => setShowInfo(false)}>
          <div className="bg-gray-900 border border-gray-800 w-full max-w-lg rounded-[2.5rem] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
              <div className="flex items-center gap-2"><Info className="w-5 h-5 text-pink-500" /><h2 className="text-xl font-black uppercase tracking-tight">Ayuda VideoPad</h2></div>
              <button onClick={() => setShowInfo(false)} className="p-2 hover:bg-gray-800 rounded-full text-gray-500 hover:text-white"><X className="w-6 h-6" /></button>
            </div>
            <div className="p-6 space-y-6 max-h-[55vh] overflow-y-auto no-scrollbar">
              <div className="grid gap-4">
                 <div className="flex items-start gap-3"><div className="p-2 bg-gray-800 border border-gray-700 rounded-xl"><Settings2 className="w-4 h-4" /></div><div><p className="font-bold text-sm">Ajustes Individuales</p><p className="text-xs text-gray-400">Modifica el volumen, el comportamiento de las capas y el recorte de cada pad.</p></div></div>
                 <div className="flex items-start gap-3"><div className="p-2 bg-pink-500/20 text-pink-500 rounded-xl border border-pink-500/50"><Video className="w-4 h-4" /></div><div><p className="font-bold text-sm text-pink-500">Grabar Clips</p><p className="text-xs text-gray-400">El sistema detecta automáticamente el inicio del sonido.</p></div></div>
                 <div className="flex items-start gap-3"><div className="p-2 bg-gray-800 border border-gray-700 rounded-xl"><Layers className="w-4 h-4" /></div><div><p className="font-bold text-sm">Polifonía (Overlap)</p><p className="text-xs text-gray-400">Activa el solapamiento para que los clips no se corten entre sí.</p></div></div>
                 <div className="flex items-start gap-3"><div className="p-2 bg-gray-800 border border-gray-700 rounded-xl"><Save className="w-4 h-4" /></div><div><p className="font-bold text-sm">Proyectos ZIP</p><p className="text-xs text-gray-400">Guarda todo tu trabajo en un solo archivo para cargarlo más tarde.</p></div></div>
              </div>
            </div>
            <div className="p-6 bg-gray-950/50 border-t border-gray-800 flex flex-col gap-4">
              <div className="flex items-center justify-center gap-2 py-2 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]"><Heart className="w-3 h-3 text-pink-600 fill-pink-600" />Geray Padilla Pérez</div>
              <button onClick={() => setShowInfo(false)} className="w-full py-4 bg-pink-600 hover:bg-pink-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs active:scale-95 transition-all">Empezar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
