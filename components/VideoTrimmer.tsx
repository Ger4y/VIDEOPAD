import React, { useRef, useState, useEffect } from 'react';
import { Check, X, Play, Pause, Scissors, PlusCircle, Maximize2, Loader2, AlertCircle, RotateCcw, RotateCw } from 'lucide-react';
import { PadTransform } from '../types';

interface VideoTrimmerProps {
  blob: Blob;
  initialStartTime: number;
  initialEndTime?: number;
  initialTransform?: PadTransform;
  onSave: (startTime: number, endTime: number, transform: PadTransform) => void;
  onCancel: () => void;
}

export const VideoTrimmer: React.FC<VideoTrimmerProps> = ({ 
  blob, 
  initialStartTime, 
  initialEndTime,
  initialTransform,
  onSave, 
  onCancel 
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [startTime, setStartTime] = useState(initialStartTime);
  const [endTime, setEndTime] = useState(initialEndTime || 0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState(() => URL.createObjectURL(blob));

  const [transform, setTransform] = useState<PadTransform>(initialTransform || { scale: 1, x: 0, y: 0, rotation: 0 });
  const touchState = useRef({
    initialDistance: 0,
    initialScale: 1,
    initialX: 0,
    initialY: 0,
    centerX: 0,
    centerY: 0,
    isPinching: false
  });

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      let d = videoRef.current.duration;
      if (!isFinite(d) || d === 0) {
        videoRef.current.currentTime = 1e10; 
        return;
      }
      setDuration(d);
      if (!initialEndTime || initialEndTime > d || initialEndTime === 0) {
        setEndTime(d);
      }
      videoRef.current.currentTime = startTime;
      videoRef.current.volume = 1.0; // Asegurar que el audio se escuche
      setIsReady(true);
      setError(null);
    }
  };

  const handleSeeked = () => {
    if (videoRef.current && (!isFinite(duration) || duration === 0)) {
      const d = videoRef.current.duration;
      if (isFinite(d) && d > 0) {
        setDuration(d);
        if (!initialEndTime || initialEndTime > d || initialEndTime === 0) {
          setEndTime(d);
        }
        videoRef.current.currentTime = startTime;
        setIsReady(true);
      }
    }
  };

  const handleDurationChange = () => {
    if (videoRef.current) {
      const d = videoRef.current.duration;
      if (isFinite(d) && d > 0) {
        setDuration(d);
        if (!initialEndTime || initialEndTime > d || initialEndTime === 0) {
          setEndTime(d);
        }
        setIsReady(true);
      }
    }
  };

  const handleVideoError = () => {
    setError("Error al cargar el vídeo. Es posible que el navegador haya perdido el enlace al archivo original.");
  };

  const handleRetry = () => {
    setError(null);
    setIsReady(false);
    const newUrl = URL.createObjectURL(blob);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(newUrl);
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      if (video.currentTime >= endTime) {
        if (isPlaying) {
          video.currentTime = startTime;
        } else {
          video.pause();
          setIsPlaying(false);
          video.currentTime = startTime;
        }
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, [endTime, startTime, isPlaying]);

  const togglePlay = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!videoRef.current || !isReady) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      if (videoRef.current.currentTime >= endTime || videoRef.current.currentTime < startTime) {
        videoRef.current.currentTime = startTime;
      }
      videoRef.current.play().catch(err => {
        console.warn("Play failed:", err);
        setIsPlaying(false);
      });
    }
    setIsPlaying(!isPlaying);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].pageX - e.touches[1].pageX,
        e.touches[0].pageY - e.touches[1].pageY
      );
      touchState.current.initialDistance = dist;
      touchState.current.initialScale = transform.scale;
      touchState.current.isPinching = true;
    } else if (e.touches.length === 1) {
      touchState.current.centerX = e.touches[0].pageX;
      touchState.current.centerY = e.touches[0].pageY;
      touchState.current.initialX = transform.x;
      touchState.current.initialY = transform.y;
      touchState.current.isPinching = false;
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;

    if (e.touches.length === 2 && touchState.current.isPinching) {
      const dist = Math.hypot(
        e.touches[0].pageX - e.touches[1].pageX,
        e.touches[0].pageY - e.touches[1].pageY
      );
      const scaleChange = dist / touchState.current.initialDistance;
      const newScale = Math.min(Math.max(touchState.current.initialScale * scaleChange, 1), 5);
      setTransform(prev => ({ ...prev, scale: newScale }));
    } else if (e.touches.length === 1 && !touchState.current.isPinching) {
      const deltaX = (e.touches[0].pageX - touchState.current.centerX) / clientWidth;
      const deltaY = (e.touches[0].pageY - touchState.current.centerY) / clientHeight;
      setTransform(prev => ({
        ...prev,
        x: touchState.current.initialX + deltaX,
        y: touchState.current.initialY + deltaY
      }));
    }
  };

  const rotate = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTransform(prev => ({ ...prev, rotation: (prev.rotation + 90) % 360 }));
  };

  const resetZoom = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTransform({ scale: 1, x: 0, y: 0, rotation: 0 });
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-xl overflow-y-auto no-scrollbar">
      <div className="min-h-full w-full flex flex-col items-center justify-center p-4 py-8">
        <div className="w-full max-w-md bg-gray-900 rounded-[2.5rem] overflow-hidden shadow-2xl border border-gray-800 flex flex-col transition-all">
          
          <div className="p-5 sm:p-6 border-b border-gray-800 flex justify-between items-center bg-gray-900/50 sticky top-0 z-10 backdrop-blur-md">
            <div className="flex items-center gap-2 text-pink-500">
              <Scissors className="w-5 h-5" />
              <h3 className="font-black text-base sm:text-lg uppercase tracking-tight">Recortar y Zoom</h3>
            </div>
            <button onClick={onCancel} className="p-2 hover:bg-gray-800 rounded-full transition-colors text-gray-400">
              <X className="w-6 h-6" />
            </button>
          </div>

          <div 
            ref={containerRef}
            className="relative aspect-square bg-black flex items-center justify-center max-h-[40vh] sm:max-h-none overflow-hidden touch-none"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
          >
            <video
              key={videoUrl}
              ref={videoRef}
              src={videoUrl}
              style={{
                transform: `translate(${transform.x * 100}%, ${transform.y * 100}%) scale(${transform.scale}) rotate(${transform.rotation}deg)`,
                transition: touchState.current.isPinching ? 'none' : 'transform 0.1s ease-out',
                willChange: 'transform'
              }}
              className={`w-full h-full object-cover pointer-events-none transition-opacity duration-300 ${isReady ? 'opacity-100' : 'opacity-0'}`}
              onLoadedMetadata={handleLoadedMetadata}
              onDurationChange={handleDurationChange}
              onSeeked={handleSeeked}
              onError={handleVideoError}
              playsInline
            />
            
            {!isReady && !error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/40 backdrop-blur-sm">
                <Loader2 className="w-10 h-10 text-pink-500 animate-spin mb-3" />
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 text-center px-4">Preparando Previsualización...</p>
              </div>
            )}

            {error && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-gray-900">
                <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
                <p className="text-sm font-bold text-gray-300 mb-6 leading-relaxed">{error}</p>
                <div className="flex gap-3">
                   <button onClick={handleRetry} className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-xl text-xs font-black uppercase tracking-widest border border-gray-700 transition-colors">
                      <RotateCcw className="w-4 h-4" /> REINTENTAR
                   </button>
                   <button onClick={onCancel} className="px-4 py-2 bg-pink-600 hover:bg-pink-500 rounded-xl text-xs font-black uppercase tracking-widest transition-colors shadow-lg">SALIR</button>
                </div>
              </div>
            )}
            
            {isReady && (
              <>
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <button 
                    onClick={togglePlay}
                    className="pointer-events-auto w-20 h-20 bg-pink-600/30 hover:bg-pink-600/40 backdrop-blur-md rounded-full flex items-center justify-center transition-all active:scale-90 border border-white/20"
                  >
                    {isPlaying ? 
                      <Pause className="w-10 h-10 text-white fill-white" /> : 
                      <Play className="w-10 h-10 text-white fill-white ml-1" />
                    }
                  </button>
                </div>

                <div className="absolute top-4 right-4 flex flex-col gap-2">
                  <button 
                    onClick={rotate}
                    className="bg-black/50 hover:bg-black/80 p-3 rounded-xl border border-white/10 text-white transition-all active:scale-90 shadow-lg"
                    title="Rotate Video"
                  >
                    <RotateCw className="w-5 h-5" />
                  </button>
                  <button 
                    onClick={resetZoom}
                    className="bg-black/50 hover:bg-black/80 p-3 rounded-xl border border-white/10 text-white transition-all active:scale-90 shadow-lg"
                    title="Reset Transform"
                  >
                    <Maximize2 className="w-5 h-5" />
                  </button>
                </div>

                <div className="absolute top-4 left-4 bg-pink-600/90 px-3 py-1 rounded-lg text-[10px] font-black text-white uppercase tracking-tighter shadow-lg animate-pulse">
                  Pinch to Zoom
                </div>
                
                <div className="absolute bottom-4 left-4 right-4 flex justify-between gap-2">
                  <div className="bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 text-[10px] font-mono text-white/70 shadow-lg">
                    <span className="text-gray-500 mr-1">IN</span> {startTime.toFixed(2)}s
                  </div>
                  <div className="bg-pink-600 px-3 py-1.5 rounded-xl text-[10px] font-black text-white shadow-xl shadow-pink-600/20">
                    {(endTime - startTime).toFixed(2)}s
                  </div>
                  <div className="bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 text-[10px] font-mono text-white/70 shadow-lg">
                    <span className="text-gray-500 mr-1">OUT</span> {endTime.toFixed(2)}s
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="p-6 sm:p-8 space-y-8 bg-gray-900/80">
            <div className="space-y-10">
              <div className={`relative group transition-opacity ${!isReady ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
                <div className="flex justify-between items-center mb-4">
                  <label className="text-[11px] font-black uppercase tracking-widest text-gray-500 group-hover:text-pink-500 transition-colors">Start Point / Inicio</label>
                  <span className="text-sm font-mono font-black text-pink-500 bg-pink-500/10 px-2 py-0.5 rounded-md">{startTime.toFixed(2)}s</span>
                </div>
                <input
                  type="range" min="0" max={duration || 100} step="0.01" value={startTime}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    const newStart = Math.min(val, Math.max(0, endTime - 0.1));
                    setStartTime(newStart);
                    setIsPlaying(false);
                    if (videoRef.current) { videoRef.current.pause(); videoRef.current.currentTime = newStart; }
                  }}
                  className="w-full h-4 sm:h-6 bg-gray-800 rounded-full appearance-none cursor-pointer accent-pink-500 transition-all hover:bg-gray-750"
                  style={{ WebkitAppearance: 'none', appearance: 'none' }}
                />
              </div>

              <div className={`relative group transition-opacity ${!isReady ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
                <div className="flex justify-between items-center mb-4">
                  <label className="text-[11px] font-black uppercase tracking-widest text-gray-500 group-hover:text-blue-400 transition-colors">End Point / Final</label>
                  <span className="text-sm font-mono font-black text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded-md">{endTime.toFixed(2)}s</span>
                </div>
                <input
                  type="range" min="0" max={duration || 100} step="0.01" value={endTime}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    const newEnd = Math.max(val, startTime + 0.1);
                    setEndTime(newEnd);
                    setIsPlaying(false);
                    if (videoRef.current) { videoRef.current.pause(); videoRef.current.currentTime = newEnd; }
                  }}
                  className="w-full h-4 sm:h-6 bg-gray-800 rounded-full appearance-none cursor-pointer accent-blue-400 transition-all hover:bg-gray-750"
                  style={{ WebkitAppearance: 'none', appearance: 'none' }}
                />
              </div>
            </div>

            <div className="flex gap-4 pt-4">
              <button
                onClick={onCancel}
                className="flex-1 py-5 bg-gray-800 hover:bg-gray-750 text-gray-400 font-black text-sm rounded-2xl transition-all border border-gray-700 active:scale-95 shadow-inner"
              >
                DISCARD
              </button>
              <button
                disabled={!isReady}
                onClick={() => onSave(startTime, endTime, transform)}
                className="flex-[2] py-5 bg-gradient-to-br from-pink-600 to-pink-500 hover:from-pink-500 hover:to-pink-400 text-white font-black text-sm rounded-2xl shadow-xl shadow-pink-900/40 transition-all flex items-center justify-center gap-3 active:scale-95 border-t border-white/20 disabled:opacity-50 disabled:grayscale"
              >
                <PlusCircle className="w-6 h-6" />
                ADD TO PAD
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <style dangerouslySetInnerHTML={{ __html: `
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          height: 32px;
          width: 32px;
          border-radius: 50%;
          background: #ffffff;
          cursor: pointer;
          box-shadow: 0 4px 15px rgba(0,0,0,0.4);
          border: 4px solid currentColor;
          margin-top: 0;
        }
        input[type=range]::-moz-range-thumb {
          height: 32px;
          width: 32px;
          border-radius: 50%;
          background: #ffffff;
          cursor: pointer;
          box-shadow: 0 4px 15px rgba(0,0,0,0.4);
          border: 4px solid currentColor;
        }
      `}} />
    </div>
  );
};