
// Singleton context and master nodes for the app
let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let masterCompressor: DynamicsCompressorNode | null = null;

export const getAudioContext = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
      latencyHint: 'interactive',
      sampleRate: 44100,
    });
    
    // Cadena maestra: Nodo -> Compresor (Limitador) -> Ganancia -> Destino
    masterCompressor = audioCtx.createDynamicsCompressor();
    masterGain = audioCtx.createGain();

    // Configuración del compresor para evitar distorsiones
    masterCompressor.threshold.setValueAtTime(-12, audioCtx.currentTime);
    masterCompressor.knee.setValueAtTime(30, audioCtx.currentTime);
    masterCompressor.ratio.setValueAtTime(12, audioCtx.currentTime);
    masterCompressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
    masterCompressor.release.setValueAtTime(0.25, audioCtx.currentTime);

    masterGain.gain.setValueAtTime(1.0, audioCtx.currentTime);

    masterCompressor.connect(masterGain);
    masterGain.connect(audioCtx.destination);
  }
  return audioCtx;
};

export const connectToMaster = (node: AudioNode) => {
  const ctx = getAudioContext();
  if (masterCompressor) {
    node.connect(masterCompressor);
  } else {
    node.connect(ctx.destination);
  }
};

export const decodeAudio = async (blob: Blob): Promise<AudioBuffer> => {
  if (!blob || blob.size === 0) {
    throw new Error("Blob vacío");
  }
  
  const ctx = getAudioContext();
  const arrayBuffer = await blob.arrayBuffer();
  
  try {
    return await ctx.decodeAudioData(arrayBuffer);
  } catch (err) {
    console.error("Error decodificando audio:", err);
    throw err;
  }
};

export const findBeatOnset = async (blob: Blob): Promise<number> => {
  try {
    const buffer = await decodeAudio(blob);
    const rawData = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    const threshold = 0.08; // Más sensible para no perder ataques suaves
    
    for (let i = 0; i < rawData.length; i++) {
      if (Math.abs(rawData[i]) > threshold) {
        // Retrocedemos 30ms para garantizar que capturamos el transitorio completo
        return Math.max(0, (i / sampleRate) - 0.03);
      }
    }
    return 0;
  } catch (error) {
    return 0;
  }
};
