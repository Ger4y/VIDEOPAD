import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GridCell } from './components/GridCell';
import { Recorder } from './components/Recorder';
import { PadCell } from './types';
import { saveClip, getAllClips, deleteClip, updateClipVolume } from './services/db';
import { decodeAudio, getAudioContext } from './services/audio';
import { exportProject, importProject } from './services/project';
import { Trash2, X, Settings2, Loader2 } from 'lucide-react';

const GRID_SIZE = 12;
// Default gain factor. 2.5 means 250% volume boost to compensate for quiet mobile mics.
const DEFAULT_VOLUME = 2.5; 

export default function App() {
  const [cells, setCells] = useState<PadCell[]>([]);
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [recordingCellId, setRecordingCellId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProjectAction, setIsProjectAction] = useState(false); // For import/export spinner
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize and Unlock Audio Context on first user interaction
  useEffect(() => {
    const unlockAudio = () => {
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('touchstart', unlockAudio);
    };
    document.addEventListener('click', unlockAudio);
    document.addEventListener('touchstart', unlockAudio);
    return () => {
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('touchstart', unlockAudio);
    };
  }, []);

  const loadData = useCallback(async () => {
    // Only show loading spinner on initial load, not on background refresh
    if (cells.length === 0) setIsLoading(true);
    
    try {
      const storedClips = await getAllClips();
      
      const loadedCells: PadCell[] = [];
      
      for (let i = 0; i < GRID_SIZE; i++) {
        const id = i + 1;
        const found = storedClips.find(c => c.id === id);
        
        if (found) {
          let buffer = null;
          try {
             buffer = await decodeAudio(found.blob);
          } catch (err) {
             console.warn(`Cell ${id}: Audio decode failed, falling back to video audio.`, err);
          }

          loadedCells.push({
            id,
            videoUrl: URL.createObjectURL(found.blob),
            audioBuffer: buffer,
            startTime: found.startTime,
            isEmpty: false,
            volume: found.volume ?? DEFAULT_VOLUME
          });
        } else {
          loadedCells.push({ id, videoUrl: null, audioBuffer: null, startTime: 0, isEmpty: true, volume: DEFAULT_VOLUME });
        }
      }
      setCells(loadedCells);
    } catch (e) {
      console.error("Failed to load DB", e);
    } finally {
      setIsLoading(false);
    }
  }, []); // Intentionally empty dependency on cells to avoid loops, handled by logic

  // Initial Load & Visibility Change Handler (Fix for black screens)
  useEffect(() => {
    loadData();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // When app comes back to foreground, refresh data to ensure video blobs/textures are fresh
        console.log("App foregrounded, refreshing video assets...");
        loadData();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadData]);

  const handleRecordingComplete = useCallback(async (blob: Blob, startTime: number) => {
    if (recordingCellId === null) return;

    const url = URL.createObjectURL(blob);
    let buffer: AudioBuffer | null = null;
    
    try {
      buffer = await decodeAudio(blob);
    } catch (e) {
      console.warn("Audio decode failed for new recording, will use video audio fallback.", e);
    }
    
    // Apply loud volume by default
    const initialVolume = DEFAULT_VOLUME;

    setCells(prev => prev.map(cell => 
      cell.id === recordingCellId 
        ? { ...cell, videoUrl: url, audioBuffer: buffer, startTime, isEmpty: false, volume: initialVolume } 
        : cell
    ));

    await saveClip(recordingCellId, blob, startTime, initialVolume);
    setRecordingCellId(null);
  }, [recordingCellId]);

  const handleDelete = useCallback(async (id: number) => {
    setCells(prev => prev.map(cell => 
      cell.id === id 
        ? { ...cell, videoUrl: null, audioBuffer: null, startTime: 0, isEmpty: true, volume: DEFAULT_VOLUME } 
        : cell
    ));
    await deleteClip(id);
  }, []);

  const handleVolumeChange = useCallback((id: number, newVolume: number) => {
    setCells(prev => prev.map(cell => 
      cell.id === id ? { ...cell, volume: newVolume } : cell
    ));
    updateClipVolume(id, newVolume);
  }, []);

  const handleExport = async () => {
    if (isProjectAction) return;
    setIsProjectAction(true);
    try {
      await exportProject();
    } catch (e) {
      console.error("Export failed", e);
      alert("Failed to save project.");
    } finally {
      setIsProjectAction(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (isProjectAction) return;
    setIsProjectAction(true);
    
    try {
      await importProject(file);
      // Reload the grid with new data
      await loadData();
    } catch (err) {
      console.error("Import failed", err);
      alert("Failed to load project. Ensure it is a valid .madpad file.");
    } finally {
      setIsProjectAction(false);
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
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

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-950 text-white font-sans overflow-hidden">
      {/* Hidden File Input */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept=".madpad,.zip" 
        className="hidden" 
      />

      {/* Header */}
      <header className="flex-none p-3 flex items-center justify-between border-b border-gray-800 bg-gray-900/90 backdrop-blur-md z-20">
        <div className="flex items-center gap-3">
          <div className="relative w-8 h-8 rounded-lg overflow-hidden bg-white/10 shadow-lg shadow-purple-900/40">
            {/* Logo Image */}
            <img 
              src="/logo.png" 
              alt="Logo" 
              className="w-full h-full object-cover"
              onError={(e) => {
                // Fallback if logo.png is missing or not in public folder yet
                e.currentTarget.style.display = 'none';
                e.currentTarget.parentElement!.classList.add('bg-gradient-to-tr', 'from-pink-500', 'to-purple-600');
              }}
            />
          </div>
          <h1 className="text-lg font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-300">
            VideoPad <span className="text-pink-500 text-xs font-normal align-top ml-0.5">by Geray</span>
          </h1>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Project Controls: TEXT BUTTONS */}
          <div className="flex items-center gap-2 mr-2">
             <button
               onClick={handleImportClick}
               disabled={isProjectAction}
               className="px-3 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-md text-xs font-bold text-gray-300 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1"
             >
                {isProjectAction ? <Loader2 className="w-3 h-3 animate-spin"/> : 'LOAD'}
             </button>
             <button
               onClick={handleExport}
               disabled={isProjectAction}
               className="px-3 py-1 bg-gray-200 hover:bg-white text-black border border-white rounded-md text-xs font-bold transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1"
             >
               {isProjectAction ? <Loader2 className="w-3 h-3 animate-spin"/> : 'SAVE'}
             </button>
          </div>

          <button
            onClick={() => setIsDeleteMode(!isDeleteMode)}
            className={`
              flex items-center gap-2 px-3 py-1.5 rounded-full font-medium transition-all text-xs uppercase tracking-wide
              ${isDeleteMode 
                ? 'bg-pink-600 text-white shadow-lg shadow-pink-900/50' 
                : 'bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700'
              }
            `}
          >
            {isDeleteMode ? (
              <X className="w-4 h-4" />
            ) : (
              <Settings2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </header>

      {/* Main Grid Area */}
      <main className="flex-1 w-full h-full p-2 sm:p-4 flex items-center justify-center overflow-hidden">
        <div className="
          w-full max-w-5xl 
          grid grid-cols-3 landscape:grid-cols-4 
          gap-2 sm:gap-3 md:gap-4
          auto-rows-fr
          aspect-[3/4] landscape:aspect-[4/3]
          max-h-full
        ">
          {cells.map(cell => (
            <GridCell
              key={cell.id}
              cell={cell}
              isDeleteMode={isDeleteMode}
              onRecord={(id) => setRecordingCellId(id)}
              onDelete={handleDelete}
              onVolumeChange={handleVolumeChange}
            />
          ))}
        </div>
      </main>

      <footer className="flex-none p-2 text-center text-[10px] text-gray-600 uppercase tracking-widest">
        {isDeleteMode ? 'Edit Mode' : 'Ready'}
      </footer>

      {recordingCellId !== null && (
        <Recorder 
          onRecordingComplete={handleRecordingComplete}
          onCancel={() => setRecordingCellId(null)}
        />
      )}
    </div>
  );
}