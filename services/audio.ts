// Singleton context for the app
let audioCtx: AudioContext | null = null;

export const getAudioContext = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
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