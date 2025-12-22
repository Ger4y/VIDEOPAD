
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { PadCell } from '../types';
import { Trash2, Volume2, VolumeX, Video, Layers, Volume1 } from 'lucide-react';
import { getAudioContext, connectToMaster } from '../services/audio';

interface GridCellProps {
  cell: PadCell;
  isDeleteMode: boolean;
  isSuspended: boolean;
  onRecord: (id: number) => void;
  onDelete: (id: number) => void;
  onVolumeChange: (id: number, volume: number) => void;
  onToggleOverlap: (id: number, allowOverlap: boolean) => void;
}

export const GridCell: React.FC<GridCellProps> = ({ 
  cell, 
  isDeleteMode, 
  isSuspended,
  onRecord, 
  onDelete,
  onVolumeChange,
  onToggleOverlap
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const playTimerRef = useRef<number | null>(null);
  const activeSources = useRef<Set<AudioBufferSourceNode>>(new Set());
  
  // Gestión de suspensión: Solo pausamos, no borramos el SRC para evitar el "moteo" (parpadeo negro)
  useEffect(() => {
    if (isSuspended && videoRef.current) {
      videoRef.current.pause();
    }
  }, [isSuspended]);

  const stopVisuals = useCallback(() => {
    setIsPlaying(false);
    if (videoRef.current) {
      videoRef.current.pause();
      // Volvemos al inicio del sample para que la miniatura sea coherente
      videoRef.current.currentTime = cell.startTime;
    }
  }, [cell.startTime]);

  const handlePointerDown = async (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.control-ui')) return;
    if (cell.isEmpty || isDeleteMode || isSuspended) return;

    e.preventDefault();
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const duration = cell.endTime - cell.startTime;

    // Gestión de Polifonía (Overlap)
    if (!cell.allowOverlap) {
      activeSources.current.forEach(source => {
        try { source.stop(); } catch (err) {}
      });
      activeSources.current.clear();
    }

    // DISPARO DE AUDIO (Web Audio API)
    if (cell.audioBuffer) {
      const source = ctx.createBufferSource();
      const gainNode = ctx.createGain(); 
      source.buffer = cell.audioBuffer;
      
      const vol = Math.max(0, cell.volume / 10);
      gainNode.gain.setValueAtTime(vol, ctx.currentTime);
      
      source.connect(gainNode);
      connectToMaster(gainNode);
      
      activeSources.current.add(source);
      source.onended = () => activeSources.current.delete(source);

      source.start(0, cell.startTime, Math.max(0, duration));
    } 
    
    // DISPARO DE VÍDEO
    if (videoRef.current && !isSuspended) {
      videoRef.current.muted = true;
      videoRef.current.currentTime = cell.startTime;
      
      try {
        await videoRef.current.play();
        setIsPlaying(true);
        
        if (playTimerRef.current) window.clearTimeout(playTimerRef.current);
        playTimerRef.current = window.setTimeout(stopVisuals, Math.max(0, duration * 1000));
      } catch (err) {
        console.warn("Hardware decoder limit or user gesture requirement");
      }
    }
  };

  useEffect(() => {
    return () => {
      if (playTimerRef.current) window.clearTimeout(playTimerRef.current);
      activeSources.current.forEach(source => {
        try { source.stop(); } catch(e) {}
      });
    };
  }, []);

  const videoStyle: React.CSSProperties = {
    transform: `translate(${cell.transform.x * 100}%, ${cell.transform.y * 100}%) scale(${cell.transform.scale}) rotate(${cell.transform.rotation || 0}deg)`,
    transition: 'transform 0.1s ease-out',
    willChange: 'transform'
  };

  return (
    <div 
      onPointerDown={handlePointerDown}
      className={`
        relative w-full h-full rounded-2xl overflow-hidden cursor-pointer select-none
        transform transition-all duration-75 touch-none border-2
        ${!isDeleteMode && !cell.isEmpty && 'active:scale-95'}
        ${cell.isEmpty ? 'bg-gray-900/40 border-gray-800 border-dashed hover:bg-gray-800/40' : 'bg-black shadow-xl border-white/5'}
        ${isPlaying ? 'ring-4 ring-pink-500/50 border-pink-400 brightness-110 z-10 scale-[1.03]' : ''}
      `}
    >
      {cell.isEmpty ? (
        <div className="w-full h-full flex items-center justify-center p-4">
          <button 
            onClick={() => onRecord(cell.id)}
            className="w-full h-full flex flex-col items-center justify-center bg-gray-800/60 hover:bg-gray-700/80 rounded-2xl transition-all text-gray-400 hover:text-pink-500 group"
          >
            <Video className="w-8 h-8 mb-2 group-hover:scale-110 transition-transform" />
            <span className="text-[9px] font-black uppercase tracking-[0.2em]">Grabar Pad</span>
          </button>
        </div>
      ) : (
        <>
          <video 
            ref={videoRef}
            src={cell.videoUrl || undefined}
            playsInline
            muted
            style={videoStyle}
            className={`w-full h-full object-cover pointer-events-none transition-opacity duration-300 ${isSuspended ? 'opacity-40 grayscale' : 'opacity-100'}`}
            preload="auto"
          />
          {isSuspended && (
            <div className="absolute inset-0 bg-pink-500/5 backdrop-blur-[1px] flex items-center justify-center pointer-events-none">
              <div className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-pulse" />
            </div>
          )}
          <div className={`absolute inset-0 bg-gradient-to-t from-pink-500/30 to-transparent pointer-events-none transition-opacity duration-100 ${isPlaying ? 'opacity-100' : 'opacity-0'}`} />
        </>
      )}

      {isDeleteMode && !cell.isEmpty && (
        <div className="absolute inset-0 z-10 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-between p-3 animate-in fade-in zoom-in-95 duration-200">
          <div className="w-full flex justify-end gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); onToggleOverlap(cell.id, !cell.allowOverlap); }}
              className={`control-ui p-2.5 rounded-xl transition-all shadow-lg active:scale-90 ${cell.allowOverlap ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-500'}`}
              title="Permitir solapamiento"
            >
              <Layers className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(cell.id); }}
              className="control-ui p-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl transition-all shadow-lg active:scale-90"
              title="Borrar pad"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 w-full flex items-center justify-center px-1">
            <input
              type="range"
              min="0" max="10" step="0.1"
              value={cell.volume}
              onChange={(e) => onVolumeChange(cell.id, parseFloat(e.target.value))}
              className="control-ui w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-pink-500"
            />
          </div>
          <div className="w-full flex items-center justify-center gap-2 pb-1">
             {cell.volume === 0 ? <VolumeX className="w-4 h-4 text-red-500" /> : 
              cell.volume > 5 ? <Volume2 className="w-4 h-4 text-pink-500" /> : 
              <Volume1 className="w-4 h-4 text-gray-400" />}
             <span className="text-[10px] font-black text-gray-400 tabular-nums">{cell.volume.toFixed(1)}</span>
          </div>
        </div>
      )}
    </div>
  );
};
