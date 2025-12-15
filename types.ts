export interface PadCell {
  id: number;
  videoUrl: string | null;
  audioBuffer?: AudioBuffer | null; // New: pre-decoded audio for instant play
  startTime: number;
  isEmpty: boolean;
  volume: number; // 0.0 to 4.0 (Amplified gain)
}

export interface RecorderProps {
  onRecordingComplete: (blob: Blob, startTime: number) => void;
  onCancel: () => void;
}