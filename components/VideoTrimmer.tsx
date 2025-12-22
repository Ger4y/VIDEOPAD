
import React, { useRef, useState, useEffect } from 'react';
import { Check, X, Play, Pause, Scissors, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
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
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

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
    // Forzamos un contenedor limpio para el blob
    const mimeType = blob.type && blob.type.includes('/') ? blob.type : 'video/mp4';
    const robustBlob = new Blob([blob], { type: mimeType });
    const url = URL.createObjectURL(robustBlob);
    setVideoUrl(url);

    return () => {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.src = "";
        videoRef.current.removeAttribute('src');
        videoRef.current.load();
      }
      if (url) URL.revokeObjectURL(url);
    };
  }, [blob, retryCount]);

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      let d = videoRef.current.duration;
      if (!isFinite(d) || d === 0 || isNaN(d)) {
        // Truco para disparar el motor de búsqueda de duración en Chrome/Safari
        videoRef.current.currentTime = 1e10; 
        return;
      }
      setDuration(d);
      if (!initialEndTime || initialEndTime > d || initialEndTime === 0) {
        setEndTime(d);
      }
      videoRef.current.currentTime = startTime;
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

  const handleVideoError = () => {
    if (!isReady) {
      console.warn("Video error in Trimmer", videoRef.current?.error);
      if (retryCount < 2) {
        setRetryCount(prev => prev + 1);
      } else {
        setError("Error de motor: El navegador ha bloqueado el vídeo. Reinicia la app o libera memoria.");
      }
    }
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

  const togglePlay = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!videoRef.current || !isReady) return;
    
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      if (videoRef.current.currentTime >= endTime || videoRef.current.currentTime < startTime) {
        videoRef.current.currentTime = startTime;
      }
      try {
        await videoRef.current.play();
        setIsPlaying(true);
      } catch (err) {
        console.error("Play failed", err);
        setIsPlaying(false);
      }
    }
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

  if (!videoUrl) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/98 backdrop-blur-2xl flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-gray-900 rounded-[2.5rem] overflow-hidden shadow-2xl border border-gray-800 flex flex-col animate-in zoom-in-95 duration-200">
        <div className="p-5 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
          <div className="flex items-center gap-2 text-pink-500">
            <Scissors className="w-5 h-5" />
            <h3 className="font-black text-base uppercase tracking-tight">Editar Pad</h3>
          </div>
          <button onClick={onCancel} className="p-2 hover:bg-gray-800 rounded-full transition-colors text-gray-400">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div 
          ref={containerRef}
          className="relative aspect-square bg-black flex items-center justify-center overflow-hidden touch-none"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
        >
          <video
            key={videoUrl + retryCount}
            ref={videoRef}
            src={videoUrl}
            preload="auto"
            playsInline
            style={{
              transform: `translate(${transform.x * 100}%, ${transform.y * 100}%) scale(${transform.scale}) rotate(${transform.rotation}deg)`,
              transition: touchState.current.isPinching ? 'none' : 'transform 0.1s ease-out',
              willChange: 'transform'
            }}
            className={`w-full h-full object-cover pointer-events-none transition-opacity duration-300 ${isReady ? 'opacity-100' : 'opacity-20'}`}
            onLoadedMetadata={handleLoadedMetadata}
            onSeeked={handleSeeked}
            onError={handleVideoError}
          />
          
          {!isReady && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/40 backdrop-blur-sm">
              <Loader2 className="w-10 h-10 text-pink-500 animate-spin mb-3" />
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Liberando decodificadores...</p>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-gray-900">
              <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
              <p className="text-sm font-bold text-gray-300 mb-6">{error}</p>
              <div className="flex gap-2">
                <button onClick={() => setRetryCount(prev => prev + 1)} className="px-6 py-2 bg-gray-800 rounded-xl text-xs font-black uppercase flex items-center gap-2">
                  <RefreshCw className="w-3 h-3" /> Reintentar
                </button>
                <button onClick={onCancel} className="px-6 py-2 bg-pink-600 rounded-xl text-xs font-black uppercase shadow-lg">Cerrar</button>
              </div>
            </div>
          )}
          
          {isReady && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <button 
                onClick={togglePlay}
                className="pointer-events-auto w-16 h-16 bg-pink-600/30 hover:bg-pink-600/40 backdrop-blur-md rounded-full flex items-center justify-center border border-white/20 transition-all active:scale-90 shadow-2xl"
              >
                {isPlaying ? <Pause className="w-8 h-8 text-white fill-white" /> : <Play className="w-8 h-8 text-white fill-white ml-1" />}
              </button>
            </div>
          )}
        </div>

        <div className="p-6 space-y-6">
          <div className="space-y-4">
            <div className="flex justify-between items-center px-1">
              <label className="text-[10px] font-black uppercase text-gray-500">In: {startTime.toFixed(2)}s</label>
              <label className="text-[10px] font-black uppercase text-gray-500">Out: {endTime.toFixed(2)}s</label>
            </div>
            <input
              type="range" min="0" max={duration || 100} step="0.01" value={startTime}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                const newStart = Math.min(val, Math.max(0, endTime - 0.1));
                setStartTime(newStart);
                if (videoRef.current) videoRef.current.currentTime = newStart;
              }}
              className="w-full h-2 bg-gray-800 rounded-full appearance-none cursor-pointer accent-pink-500"
            />
            <input
              type="range" min="0" max={duration || 100} step="0.01" value={endTime}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                const newEnd = Math.max(val, startTime + 0.1);
                setEndTime(newEnd);
                if (videoRef.current) videoRef.current.currentTime = newEnd;
              }}
              className="w-full h-2 bg-gray-800 rounded-full appearance-none cursor-pointer accent-blue-500"
            />
          </div>

          <div className="flex gap-4">
            <button onClick={onCancel} className="flex-1 py-4 bg-gray-800 hover:bg-gray-750 text-gray-400 font-black text-xs rounded-xl uppercase tracking-widest transition-all">Cancelar</button>
            <button
              disabled={!isReady}
              onClick={() => onSave(startTime, endTime, transform)}
              className="flex-[2] py-4 bg-pink-600 hover:bg-pink-500 text-white font-black text-xs rounded-xl shadow-lg uppercase tracking-widest transition-all disabled:opacity-50"
            >
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
