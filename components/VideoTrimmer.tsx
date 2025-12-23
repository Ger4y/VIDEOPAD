
import React, { useRef, useState, useEffect } from 'react';
import { X, Check, Play, Pause, Scissors, AlertCircle, Loader2 } from 'lucide-react';
import { getAudioContext } from '../services/audio';

interface VideoTrimmerProps {
  blob: Blob;
  initialUrl: string;
  initialStart: number;
  initialEnd: number;
  volume: number;
  onSave: (start: number, end: number) => void;
  onCancel: () => void;
}

export const VideoTrimmer: React.FC<VideoTrimmerProps> = ({
  blob,
  initialUrl,
  initialStart,
  initialEnd,
  volume,
  onSave,
  onCancel
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [startTime, setStartTime] = useState(initialStart);
  const [endTime, setEndTime] = useState(initialEnd);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastMoved, setLastMoved] = useState<'start' | 'end'>('end');

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    let vidDur = video.duration;
    
    video.volume = Math.max(0, Math.min(1, volume / 10));
    
    // Fallback agresivo para duración
    if (!vidDur || isNaN(vidDur) || vidDur === Infinity) {
      console.warn("Trimmer: Duración no detectada inmediatamente, esperando...");
      // Intentamos forzar la detección si es un blob conflictivo
      video.currentTime = 1e9;
      video.onseeked = () => {
        video.onseeked = null;
        const realDur = video.duration || 5;
        setDuration(realDur);
        setupInitialRange(realDur);
        video.currentTime = startTime;
        setIsReady(true);
      };
    } else {
      setDuration(vidDur);
      setupInitialRange(vidDur);
      video.currentTime = startTime;
      setIsReady(true);
    }
    setError(null);
  };

  const setupInitialRange = (dur: number) => {
    const start = Math.max(0, Math.min(initialStart, dur - 0.1));
    // Si initialEnd es 0 o mayor que la duración real, usamos la duración real
    const end = (initialEnd > 0 && initialEnd <= dur) ? initialEnd : dur;
    setStartTime(start);
    setEndTime(end);
  };

  const handleVideoError = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const err = e.currentTarget.error;
    setError(err ? `Error: ${err.code}` : "Error al cargar la previsualización.");
  };

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    if (video.currentTime >= endTime) {
      video.currentTime = startTime;
      if (!isPlaying) video.pause();
    }
  };

  const togglePlay = async () => {
    const video = videoRef.current;
    if (video) {
      if (isPlaying) {
        video.pause();
      } else {
        const ctx = getAudioContext();
        if (ctx.state === 'suspended') await ctx.resume();

        if (video.currentTime >= endTime || video.currentTime < startTime) {
          video.currentTime = startTime;
        }
        video.play().catch(() => setIsPlaying(false));
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleStartChange = (val: string) => {
    const v = parseFloat(val);
    if (v < endTime - 0.05) {
      setStartTime(v);
      setLastMoved('start');
      if (videoRef.current) videoRef.current.currentTime = v;
    }
  };

  const handleEndChange = (val: string) => {
    const v = parseFloat(val);
    if (v > startTime + 0.05) {
      setEndTime(v);
      setLastMoved('end');
      if (videoRef.current) videoRef.current.currentTime = v;
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/95 backdrop-blur-3xl flex flex-col animate-in fade-in duration-300">
      <header className="p-6 flex justify-between items-center border-b border-white/5 bg-black/40">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-pink-500/20 rounded-xl border border-pink-500/30">
            <Scissors className="w-5 h-5 text-pink-500" />
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-tight text-white">Editor de Recorte</h2>
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Ajusta los puntos de disparo</p>
          </div>
        </div>
        <button onClick={onCancel} className="p-3 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white">
          <X className="w-6 h-6" />
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-10 gap-8 overflow-y-auto no-scrollbar">
        <div className="relative w-full max-w-md aspect-square bg-gray-950 rounded-[2.5rem] overflow-hidden shadow-2xl border border-white/10 ring-1 ring-white/5">
          {error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-gray-950 gap-6">
              <AlertCircle className="w-10 h-10 text-red-500" />
              <p className="text-sm font-bold text-gray-300">{error}</p>
              <button onClick={onCancel} className="px-6 py-3 bg-gray-800 rounded-xl text-[10px] font-black uppercase tracking-widest">Cancelar</button>
            </div>
          ) : (
            <>
              <video 
                ref={videoRef}
                src={initialUrl}
                playsInline
                preload="auto"
                onLoadedMetadata={handleLoadedMetadata}
                onError={handleVideoError}
                onTimeUpdate={handleTimeUpdate}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                className={`w-full h-full object-cover transition-opacity duration-500 ${isReady ? 'opacity-100' : 'opacity-0'}`}
              />
              {!isReady && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-950 gap-4">
                  <Loader2 className="w-10 h-10 text-pink-500 animate-spin" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Analizando vídeo...</p>
                </div>
              )}
              {isReady && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <button 
                    onClick={togglePlay}
                    className="w-24 h-24 bg-black/40 backdrop-blur-xl rounded-full flex items-center justify-center scale-90 hover:scale-100 transition-all border border-white/20 shadow-2xl z-10 group"
                  >
                    {isPlaying ? <Pause className="w-10 h-10 fill-white text-white" /> : <Play className="w-10 h-10 fill-white text-white ml-2" />}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {isReady && !error && (
          <div className="w-full max-w-md space-y-10 bg-gray-900/40 p-8 rounded-[2rem] border border-white/5 backdrop-blur-md animate-in slide-in-from-bottom-6">
            <div className="space-y-6">
              <div className="flex justify-between text-[10px] font-black uppercase tracking-[0.2em]">
                <div className="flex flex-col gap-1">
                  <span className="text-gray-500">PUNTO DE INICIO</span>
                  <span className="text-pink-500 text-base">{startTime.toFixed(2)}s</span>
                </div>
                <div className="flex flex-col gap-1 text-right">
                  <span className="text-gray-500">PUNTO FINAL</span>
                  <span className="text-white text-base">{endTime.toFixed(2)}s</span>
                </div>
              </div>
              
              <div className="relative h-20 flex items-center px-2">
                <div className="absolute inset-x-2 h-1.5 bg-gray-800 rounded-full" />
                <div 
                  className="absolute h-1.5 bg-pink-500 shadow-[0_0_15px_rgba(236,72,153,0.5)] rounded-full"
                  style={{ 
                    left: `${(startTime / (duration || 1)) * 100}%`, 
                    width: `${((endTime - startTime) / (duration || 1)) * 100}%` 
                  }}
                />
                
                {/* Deslizador de Inicio */}
                <input
                  type="range"
                  min="0"
                  max={duration || 10}
                  step="0.01"
                  value={startTime}
                  onChange={(e) => handleStartChange(e.target.value)}
                  onMouseDown={() => setLastMoved('start')}
                  onTouchStart={() => setLastMoved('start')}
                  className={`absolute inset-x-0 h-full appearance-none bg-transparent cursor-pointer pointer-events-none
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-10 [&::-webkit-slider-thumb]:w-10 
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-pink-500 [&::-webkit-slider-thumb]:border-4 
                    [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:shadow-xl
                    ${lastMoved === 'start' ? 'z-30' : 'z-20'}`}
                />

                {/* Deslizador de Fin */}
                <input
                  type="range"
                  min="0"
                  max={duration || 10}
                  step="0.01"
                  value={endTime}
                  onChange={(e) => handleEndChange(e.target.value)}
                  onMouseDown={() => setLastMoved('end')}
                  onTouchStart={() => setLastMoved('end')}
                  className={`absolute inset-x-0 h-full appearance-none bg-transparent cursor-pointer pointer-events-none
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-10 [&::-webkit-slider-thumb]:w-10 
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-4 
                    [&::-webkit-slider-thumb]:border-pink-500 [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:shadow-xl
                    ${lastMoved === 'end' ? 'z-30' : 'z-20'}`}
                />
              </div>
            </div>

            <div className="flex gap-4">
              <button 
                onClick={onCancel}
                className="flex-1 py-5 bg-gray-800/40 text-gray-500 font-black text-[10px] rounded-2xl uppercase tracking-[0.2em] hover:text-white border border-white/5 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={() => onSave(startTime, endTime)}
                className="flex-[2] py-5 bg-white text-black font-black text-[10px] rounded-2xl uppercase tracking-[0.2em] shadow-2xl hover:bg-pink-500 hover:text-white transition-all flex items-center justify-center gap-3 active:scale-95"
              >
                <Check className="w-5 h-5" /> Aplicar Cambios
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
