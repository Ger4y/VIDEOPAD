
import React, { useRef, useState, useEffect } from 'react';
import { RecorderProps } from '../types';
import { Loader2, X, SwitchCamera, Zap, ZapOff } from 'lucide-react';

export const Recorder: React.FC<RecorderProps> = ({ onRecordingComplete, onCancel }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [screenLight, setScreenLight] = useState(true);

  useEffect(() => {
    let localStream: MediaStream | null = null;
    const startCamera = async () => {
      try {
        const ms = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: facingMode,
            width: { ideal: 720 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 }
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          }
        });
        localStream = ms;
        setStream(ms);
        if (videoRef.current) {
          videoRef.current.srcObject = ms;
        }
      } catch (err) {
        console.error("Camera error:", err);
        alert("Acceso a cámara denegado.");
        onCancel();
      }
    };
    startCamera();
    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [facingMode, onCancel]);

  const handleStartRecording = () => {
    if (!stream) return;
    setCountdown(3);
    let count = 3;
    const timer = setInterval(() => {
      count--;
      if (count > 0) {
        setCountdown(count);
      } else {
        clearInterval(timer);
        setCountdown(null);
        // Inicio inmediato tras el 1
        startCapture();
      }
    }, 800);
  };

  const startCapture = () => {
    if (!stream) return;
    
    const options: MediaRecorderOptions = {
      videoBitsPerSecond: 2500000,
      audioBitsPerSecond: 128000,
    };

    const isApple = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    
    if (isApple && MediaRecorder.isTypeSupported('video/mp4')) {
      options.mimeType = 'video/mp4';
    } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
      options.mimeType = 'video/webm;codecs=vp8,opus';
    } else if (MediaRecorder.isTypeSupported('video/webm')) {
      options.mimeType = 'video/webm';
    }
    
    try {
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRecorder.onstop = async () => {
        setIsProcessing(true);
        const blob = new Blob(chunksRef.current, { type: options.mimeType || 'video/webm' });
        onRecordingComplete(blob, 0);
      };
      mediaRecorder.start();
      setIsRecording(true);
    } catch (e) {
      console.error("Error al iniciar grabadora", e);
      onCancel();
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const toggleCamera = () => {
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  };

  const bgClass = screenLight ? 'bg-white' : 'bg-black';
  const buttonSecondaryClass = screenLight 
    ? 'bg-gray-100 text-gray-900 hover:bg-gray-200 shadow-md' 
    : 'bg-gray-800 text-white hover:bg-gray-700 shadow-lg';

  return (
    <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center transition-colors duration-300 ${bgClass}`}>
      <button onClick={() => setScreenLight(!screenLight)} className={`absolute top-4 right-4 p-3 rounded-full transition-all z-10 ${buttonSecondaryClass}`}>
        {screenLight ? <Zap className="w-6 h-6 fill-current text-yellow-500" /> : <ZapOff className="w-6 h-6" />}
      </button>

      <div className={`relative w-full max-w-md aspect-square overflow-hidden rounded-[2rem] shadow-2xl border-4 transition-colors duration-300 ${screenLight ? 'border-gray-100 bg-black' : 'border-gray-800 bg-black'}`}>
        <video ref={videoRef} autoPlay playsInline muted className={`w-full h-full object-cover transition-transform duration-300 ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`} />
        
        {countdown !== null && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
            <span key={countdown} className="text-[12rem] font-black text-white drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)] animate-in zoom-in-50 duration-200">{countdown}</span>
          </div>
        )}

        {isRecording && !isProcessing && (
          <div className="absolute top-6 left-6 flex items-center gap-2 px-4 py-2 bg-red-600 rounded-full animate-pulse">
            <div className="w-2 h-2 rounded-full bg-white" />
            <span className="text-[10px] font-black uppercase tracking-widest text-white">Recording</span>
          </div>
        )}

        {isProcessing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm flex-col">
            <Loader2 className="w-12 h-12 text-pink-500 animate-spin mb-4" />
            <p className="text-white font-bold tracking-widest uppercase text-[10px]">Procesando...</p>
          </div>
        )}
      </div>

      <div className="mt-12 flex items-center gap-10">
        {!isRecording ? (
          <>
            <button onClick={onCancel} className={`p-4 rounded-full transition-all active:scale-90 ${buttonSecondaryClass}`}>
              <X className="w-8 h-8" />
            </button>
            <button onClick={handleStartRecording} disabled={countdown !== null} className="p-10 rounded-full bg-red-600 text-white hover:bg-red-500 transition-all transform active:scale-95 shadow-2xl shadow-red-900/50 flex items-center justify-center disabled:opacity-50">
              <div className="w-12 h-12 rounded-full border-4 border-white/40 flex items-center justify-center">
                 <div className="w-5 h-5 bg-white rounded-full shadow-lg" />
              </div>
            </button>
            <button onClick={toggleCamera} className={`p-4 rounded-full transition-all active:scale-90 ${buttonSecondaryClass}`}>
              <SwitchCamera className="w-8 h-8" />
            </button>
          </>
        ) : (
          <button onClick={handleStopRecording} className="group p-10 rounded-full bg-red-600 border-[10px] border-white animate-pulse shadow-2xl shadow-red-600/50 active:scale-90 transition-all">
            <div className="w-8 h-8 bg-white rounded-lg" />
          </button>
        )}
      </div>
    </div>
  );
};
