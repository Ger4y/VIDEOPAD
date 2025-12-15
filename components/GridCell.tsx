import React, { useRef, useEffect, useState } from 'react';
import { PadCell } from '../types';
import { Trash2, Plus, Volume2, VolumeX } from 'lucide-react';
import { getAudioContext } from '../services/audio';

interface GridCellProps {
  cell: PadCell;
  isDeleteMode: boolean;
  onRecord: (id: number) => void;
  onDelete: (id: number) => void;
  onVolumeChange: (id: number, volume: number) => void;
}

export const GridCell: React.FC<GridCellProps> = ({ 
  cell, 
  isDeleteMode, 
  onRecord, 
  onDelete,
  onVolumeChange 
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Determine if we have optimized audio available
  const hasAudioBuffer = !!cell.audioBuffer;

  // Sync volume to video element for fallback mode (React Effect)
  useEffect(() => {
    if (videoRef.current && !hasAudioBuffer) {
      videoRef.current.volume = Math.min(1.0, Math.max(0, cell.volume));
      videoRef.current.muted = false; // Force unmute if no audio buffer
    }
  }, [cell.volume, hasAudioBuffer]);

  // Robustness: ensure video seeks to start time immediately when loaded
  // This prevents the "black box" syndrome if the video starts in darkness or isn't seeked yet
  const handleMetadataLoaded = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = cell.startTime;
    }
  };

  const handlePointerDown = async (e: React.PointerEvent) => {
    // If interacting with slider or delete button, don't play
    if ((e.target as HTMLElement).closest('.control-ui')) return;

    e.preventDefault();
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    if (cell.isEmpty) {
      if (!isDeleteMode) onRecord(cell.id);
      return;
    }

    // Don't play if clicking delete (handled by the button specifically now)
    if (isDeleteMode) return;

    // 1. Audio Playback (Web Audio API) with Volume
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    if (cell.audioBuffer) {
      // Optimized Path
      const source = ctx.createBufferSource();
      const gainNode = ctx.createGain(); 
      
      source.buffer = cell.audioBuffer;
      gainNode.gain.setValueAtTime(cell.volume, ctx.currentTime);
      
      source.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      source.start(0, cell.startTime);
    } 
    
    // 2. Video Playback (Visuals + Fallback Audio)
    if (videoRef.current) {
      // Force volume update just in case
      if (!hasAudioBuffer) {
        videoRef.current.volume = Math.min(1.0, Math.max(0, cell.volume));
        videoRef.current.muted = false;
      } else {
        videoRef.current.muted = true;
      }

      videoRef.current.currentTime = cell.startTime;
      
      try {
        await videoRef.current.play();
      } catch (err) {
        // Ignore play interruption errors
        console.warn("Video play interrupted", err);
      }
      
      setIsPlaying(true);
      setTimeout(() => setIsPlaying(false), 150);
    }
  };

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;

    const handleEnded = () => {
      setIsPlaying(false);
      vid.currentTime = cell.startTime; 
    };

    vid.addEventListener('ended', handleEnded);
    return () => vid.removeEventListener('ended', handleEnded);
  }, [cell.videoUrl, cell.startTime]);

  return (
    <div 
      onPointerDown={handlePointerDown}
      className={`
        relative w-full h-full rounded-xl overflow-hidden cursor-pointer select-none
        transform transition-all duration-75 touch-none
        ${!isDeleteMode && 'active:scale-95'}
        ${cell.isEmpty ? 'bg-gray-800 border-2 border-gray-700 border-dashed hover:bg-gray-750' : 'bg-black shadow-lg shadow-purple-900/20'}
        ${isPlaying ? 'ring-2 ring-pink-500 brightness-110' : ''}
      `}
    >
      {cell.isEmpty ? (
        <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
          <Plus className="w-8 h-8 mb-1 opacity-50" />
          <span className="text-xs font-mono opacity-50">REC</span>
        </div>
      ) : (
        <>
          {/* 
            CRITICAL FIX: key={cell.videoUrl} 
            This forces React to completely replace the video element if the URL changes 
            (e.g., after a reload or background refresh). This fixes the "black box" issue
            by ensuring the DOM element is fresh and not holding onto a stale texture.
          */}
          <video 
            key={cell.videoUrl} 
            ref={videoRef}
            src={cell.videoUrl!}
            playsInline
            webkit-playsinline="true"
            // Ensure muted logic is correct based on whether we have a buffer
            muted={hasAudioBuffer}
            onLoadedMetadata={handleMetadataLoaded}
            className="w-full h-full object-cover pointer-events-none"
            preload="auto"
          />
          <div className={`absolute inset-0 bg-pink-500/20 pointer-events-none transition-opacity duration-75 ${isPlaying ? 'opacity-100' : 'opacity-0'}`} />
        </>
      )}

      {/* Edit Mode Overlay */}
      {isDeleteMode && !cell.isEmpty && (
        <div className="absolute inset-0 z-10 bg-black/60 backdrop-blur-[1px] flex flex-col items-center justify-between p-2 animate-in fade-in duration-200">
          
          {/* Delete Button */}
          <div className="w-full flex justify-end">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(cell.id);
              }}
              className="control-ui p-2 bg-red-500/80 hover:bg-red-600 text-white rounded-full transition-colors shadow-sm"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>

          {/* Volume Slider */}
          <div className="flex-1 w-full flex items-center justify-center relative">
            <div className="control-ui flex flex-col items-center h-full justify-center gap-2 w-full">
               <input
                type="range"
                min="0"
                max="4" 
                step="0.1"
                value={cell.volume}
                onChange={(e) => onVolumeChange(cell.id, parseFloat(e.target.value))}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()} 
                className="w-24 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer -rotate-90 origin-center accent-pink-500 touch-pan-y"
              />
            </div>
          </div>

          {/* Volume Icon Indicator */}
          <div className="w-full flex justify-center pb-1">
             {cell.volume === 0 ? (
               <VolumeX className="w-4 h-4 text-gray-400" />
             ) : (
               <Volume2 className="w-4 h-4 text-gray-200" style={{ opacity: Math.min(1, Math.max(0.3, cell.volume)) }} />
             )}
          </div>
        </div>
      )}
    </div>
  );
};