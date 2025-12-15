import React, { useRef, useState, useEffect } from 'react';
import { findBeatOnset } from '../services/audio';
import { RecorderProps } from '../types';
import { Loader2, Video, X, SwitchCamera, Zap, ZapOff } from 'lucide-react';

export const Recorder: React.FC<RecorderProps> = ({ onRecordingComplete, onCancel }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  
  // Screen Light state: Default to TRUE to illuminate face as requested
  const [screenLight, setScreenLight] = useState(true);

  useEffect(() => {
    let localStream: MediaStream | null = null;

    const startCamera = async () => {
      try {
        const ms = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: facingMode,
            width: { ideal: 240 }, // Keep small for performance
            height: { ideal: 240 },
            frameRate: { ideal: 24 }
          },
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false, // Better for music/percussion
          }
        });
        localStream = ms;
        setStream(ms);
        if (videoRef.current) {
          videoRef.current.srcObject = ms;
        }
      } catch (err) {
        console.error("Camera error:", err);
        alert("Camera access denied or unavailable.");
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
      if (count === 0) {
        clearInterval(timer);
        setCountdown(null);
        startCapture();
      } else {
        setCountdown(count);
      }
    }, 600);
  };

  const startCapture = () => {
    if (!stream) return;
    
    // Aggressive optimization for file size and parsing speed
    const options: MediaRecorderOptions = {
      videoBitsPerSecond: 250000, // 250 kbps (Very low, but fast)
      audioBitsPerSecond: 64000,  // 64 kbps (Enough for samples)
    };

    if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
      options.mimeType = 'video/webm;codecs=vp8,opus';
    } else if (MediaRecorder.isTypeSupported('video/mp4')) {
      options.mimeType = 'video/mp4';
    }
    
    try {
      const mediaRecorder = new MediaRecorder(stream, options);
      
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        setIsProcessing(true);
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        
        // Analyze audio for beat onset
        const startTime = await findBeatOnset(blob);
        
        setIsProcessing(false);
        onRecordingComplete(blob, startTime);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (e) {
      console.error("Recorder initialization failed", e);
      alert("Recorder failed to start. Try a different browser.");
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

  // UI Theme Helpers
  const bgClass = screenLight ? 'bg-white' : 'bg-black';
  const textClass = screenLight ? 'text-gray-500' : 'text-gray-400';
  const buttonSecondaryClass = screenLight 
    ? 'bg-gray-100 text-gray-900 hover:bg-gray-200' 
    : 'bg-gray-800 text-white hover:bg-gray-700';

  return (
    <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center transition-colors duration-300 ${bgClass}`}>
      
      {/* Screen Light Toggle */}
      <button 
        onClick={() => setScreenLight(!screenLight)}
        className={`absolute top-4 right-4 p-3 rounded-full transition-all ${buttonSecondaryClass}`}
        aria-label="Toggle Screen Light"
      >
        {screenLight ? <Zap className="w-6 h-6 fill-current" /> : <ZapOff className="w-6 h-6" />}
      </button>

      {/* Viewfinder */}
      <div className={`
        relative w-full max-w-md aspect-square overflow-hidden rounded-lg shadow-2xl 
        border transition-colors duration-300
        ${screenLight ? 'border-gray-200 bg-black' : 'border-gray-700 bg-black'}
      `}>
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          className={`w-full h-full object-cover transition-transform duration-300 ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
        />
        
        {countdown !== null && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <span className="text-9xl font-bold text-white animate-pulse">{countdown}</span>
          </div>
        )}

        {isProcessing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm flex-col">
            <Loader2 className="w-12 h-12 text-pink-500 animate-spin mb-4" />
            <p className="text-white font-medium">Processing...</p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="mt-8 flex items-center gap-8">
        {!isRecording ? (
          <>
            <button 
              onClick={onCancel}
              className={`p-4 rounded-full transition-colors ${buttonSecondaryClass}`}
            >
              <X className="w-8 h-8" />
            </button>
            <button 
              onClick={handleStartRecording}
              disabled={!!countdown}
              className="p-6 rounded-full bg-red-600 text-white hover:bg-red-500 transition-all transform active:scale-95 shadow-lg shadow-red-900/50"
            >
              <Video className="w-8 h-8 fill-current" />
            </button>
            <button 
              onClick={toggleCamera}
              className={`p-4 rounded-full transition-colors ${buttonSecondaryClass}`}
            >
              <SwitchCamera className="w-8 h-8" />
            </button>
          </>
        ) : (
          <button 
            onClick={handleStopRecording}
            className="p-8 rounded-full bg-red-600 border-4 border-white animate-pulse shadow-lg shadow-red-600/50"
          >
            <div className="w-6 h-6 bg-white rounded-sm" />
          </button>
        )}
      </div>
      
      <p className={`mt-6 text-sm transition-colors duration-300 ${textClass}`}>
        {isRecording ? "Tap to stop & save" : "Tap red button to record"}
      </p>
    </div>
  );
};