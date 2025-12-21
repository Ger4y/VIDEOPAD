
// Singleton context and master nodes for the app
let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let masterCompressor: DynamicsCompressorNode | null = null;

export const getAudioContext = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({
      latencyHint: 'interactive',
    });
    
    // Create master chain to prevent clipping and OS ducking
    masterCompressor = audioCtx.createDynamicsCompressor();
    masterGain = audioCtx.createGain();

    // Configure compressor for "musical" limiting
    // This acts as a safety barrier so high volumes don't trigger OS-level protection
    masterCompressor.threshold.setValueAtTime(-12, audioCtx.currentTime);
    masterCompressor.knee.setValueAtTime(30, audioCtx.currentTime);
    masterCompressor.ratio.setValueAtTime(12, audioCtx.currentTime);
    masterCompressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
    masterCompressor.release.setValueAtTime(0.15, audioCtx.currentTime);

    masterGain.gain.setValueAtTime(1.0, audioCtx.currentTime);

    // Chain: Node -> Compressor -> MasterGain -> Destination
    masterCompressor.connect(masterGain);
    masterGain.connect(audioCtx.destination);
  }
  return audioCtx;
};

/**
 * Connects an audio node to the app's master processing chain
 */
export const connectToMaster = (node: AudioNode) => {
  getAudioContext(); // Ensure initialization
  if (masterCompressor) {
    node.connect(masterCompressor);
  } else {
    // Fallback if compressor failed to init
    node.connect(getAudioContext().destination);
  }
};

/**
 * Decodes a Blob into an AudioBuffer for instant playback
 */
export const decodeAudio = async (blob: Blob): Promise<AudioBuffer> => {
  if (!blob || blob.size === 0) {
    throw new Error("Cannot decode empty or null blob");
  }
  
  const ctx = getAudioContext();
  const arrayBuffer = await blob.arrayBuffer();
  
  // CRITICAL: .slice(0) creates a copy of the buffer. 
  // In Safari/WebKit, decodeAudioData detaches the buffer, causing "The object can not be found here" errors 
  // if the buffer is reused or in certain async contexts. 
  return await ctx.decodeAudioData(arrayBuffer.slice(0));
};

/**
 * Analyzes an audio/video blob to find the first significant volume peak (beat).
 * Returns the timestamp in seconds.
 */
export const findBeatOnset = async (blob: Blob): Promise<number> => {
  try {
    const buffer = await decodeAudio(blob);
    const rawData = buffer.getChannelData(0); // Analyze first channel
    const sampleRate = buffer.sampleRate;
    
    // Config for detection
    const threshold = 0.15; // Volume threshold
    
    for (let i = 0; i < rawData.length; i++) {
      if (Math.abs(rawData[i]) > threshold) {
        // Found a potential start, back up 50ms to catch the attack
        const onsetIndex = Math.max(0, i - (sampleRate * 0.05)); 
        return onsetIndex / sampleRate;
      }
    }
    
    return 0;
  } catch (error) {
    console.warn("Could not analyze audio for beat detection", error);
    return 0;
  }
};
