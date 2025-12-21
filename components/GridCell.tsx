import React, { useRef, useEffect, useState } from 'react';
import { PadCell } from '../types';
import { Trash2, Volume2, VolumeX, Video, Upload, Scissors, Layers, Volume1 } from 'lucide-react';
import { getAudioContext, connectToMaster } from '../services/audio';

interface GridCellProps {
  cell: PadCell;
  isDeleteMode: boolean;
  onRecord: (id: number) => void;
  onImport: (id: number) => void;
  onTrim: (id: number) => void;
  onDelete: (id: number) => void;
  onVolumeChange: (id: number, volume: number) => void;
  onToggleOverlap: (id: number, allowOverlap: boolean) => void;
}

export const GridCell: React.FC<GridCellProps> = ({ 
  cell, 
  isDeleteMode, 
  onRecord, 
  onImport,
  onTrim,
  onDelete,
  onVolumeChange,
  onToggleOverlap
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const playTimerRef = useRef<number | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  
  const hasAudioBuffer = !!cell.audioBuffer;

  useEffect(() => {
    if (videoRef.current && !hasAudioBuffer) {
      videoRef.current.volume = Math.min(1.0, Math.max(0, cell.volume));
      videoRef.current.muted = false;
    }
  }, [cell.volume, hasAudioBuffer]);

  const handleMetadataLoaded = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = cell.startTime;
    }
  };

  const stopPlayback = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = cell.startTime;
    }
    setIsPlaying(false);
    if (playTimerRef.current) {
      window.clearTimeout(playTimerRef.current);
      playTimerRef.current = null;
    }
    activeSourceRef.current = null;
  };

  const handlePointerDown = async (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.control-ui')) return;
    if (cell.isEmpty) return;
    if (isDeleteMode) return;

    e.preventDefault();
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const duration = cell.endTime - cell.startTime;

    if (!cell.allowOverlap && activeSourceRef.current) {
      try {
        activeSourceRef.current.stop();
      } catch (e) {}
      activeSourceRef.current = null;
    }

    if (cell.audioBuffer) {
      const source = ctx.createBufferSource();
      const gainNode = ctx.createGain(); 
      source.buffer = cell.audioBuffer;
      
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(cell.volume, ctx.currentTime + 0.005);
      
      source.connect(gainNode);
      connectToMaster(gainNode);
      
      source.onended = () => {
        if (activeSourceRef.current === source) {
          activeSourceRef.current = null;
        }
      };

      source.start(0, cell.startTime, Math.max(0, duration));
      activeSourceRef.current = source;
    } 
    
    if (videoRef.current) {
      if (!hasAudioBuffer) {
        videoRef.current.volume = Math.min(1.0, Math.max(0, cell.volume));
        videoRef.current.muted = false;
      } else {
        videoRef.current.muted = true;
      }
      videoRef.current.currentTime = cell.startTime;
      try {
        await videoRef.current.play();
        setIsPlaying(true);
        if (playTimerRef.current) window.clearTimeout(playTimerRef.current);
        playTimerRef.current = window.setTimeout(stopPlayback, Math.max(0, duration * 1000));
      } catch (err) {
        console.warn("Video play interrupted", err);
      }
    }
  };

  useEffect(() => {
    return () => {
      if (playTimerRef.current) window.clearTimeout(playTimerRef.current);
      if (activeSourceRef.current) {
        try { activeSourceRef.current.stop(); } catch(e) {}
      }
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
        ${cell.isEmpty ? 'bg-gray-900/50 border-gray-800 border-dashed' : 'bg-black shadow-xl border-white/5'}
        ${isPlaying ? 'ring-4 ring-pink-500/50 border-pink-400 brightness-125 z-10' : ''}
      `}
    >
      {cell.isEmpty ? (
        <div className="w-full h-full flex items-center justify-center gap-2 p-1.5">
          <button 
            onClick={() => onRecord(cell.id)}
            className="flex-1 h-full flex flex-col items-center justify-center bg-gray-800/80 hover:bg-gray-700/80 rounded-xl transition-all text-gray-400 hover:text-pink-500 group"
          >
            <Video className="w-5 h-5 mb-1 group-hover:scale-110 transition-transform" />
            <span className="text-[8px] font-black uppercase tracking-widest">Record</span>
          </button>
          <button 
            onClick={() => onImport(cell.id)}
            className="flex-1 h-full flex flex-col items-center justify-center bg-gray-800/80 hover:bg-gray-700/80 rounded-xl transition-all text-gray-400 hover:text-blue-400 group"
          >
            <Upload className="w-5 h-5 mb-1 group-hover:scale-110 transition-transform" />
            <span className="text-[8px] font-black uppercase tracking-widest">Import</span>
          </button>
        </div>
      ) : (
        <>
          <video 
            key={cell.videoUrl} 
            ref={videoRef}
            src={cell.videoUrl!}
            playsInline
            webkit-playsinline="true"
            muted={hasAudioBuffer}
            onLoadedMetadata={handleMetadataLoaded}
            style={videoStyle}
            className="w-full h-full object-cover pointer-events-none"
            preload="auto"
          />
          <div className={`absolute inset-0 bg-gradient-to-t from-pink-500/40 to-transparent pointer-events-none transition-opacity duration-75 ${isPlaying ? 'opacity-100' : 'opacity-0'}`} />
        </>
      )}

      {isDeleteMode && !cell.isEmpty && (
        <div className="absolute inset-0 z-10 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-between p-3">
          <div className="w-full flex justify-between gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); onTrim(cell.id); }}
              className="control-ui p-2.5 bg-blue-500 hover:bg-blue-400 text-white rounded-xl transition-all shadow-lg active:scale-90"
            >
              <Scissors className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onToggleOverlap(cell.id, !cell.allowOverlap); }}
              className={`control-ui p-2.5 rounded-xl transition-all shadow-lg active:scale-90 ${cell.allowOverlap ? 'bg-orange-500 text-white' : 'bg-gray-700 text-gray-400'}`}
            >
              <Layers className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(cell.id); }}
              className="control-ui p-2.5 bg-red-500 hover:bg-red-400 text-white rounded-xl transition-all shadow-lg active:scale-90"
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
              className="control-ui w-full h-2 bg-gray-800 rounded-full appearance-none cursor-pointer accent-pink-500"
            />
          </div>
          <div className="w-full flex items-center justify-center gap-1.5 pb-1">
             {cell.volume === 0 ? <VolumeX className="w-4 h-4 text-red-500" /> : 
              cell.volume > 5 ? <Volume2 className="w-4 h-4 text-pink-500 animate-pulse" /> : 
              <Volume1 className="w-4 h-4 text-gray-300" />}
             <span className="text-[10px] font-black text-gray-400 w-6 text-center">{cell.volume.toFixed(1)}</span>
          </div>
        </div>
      )}
    </div>
  );
};