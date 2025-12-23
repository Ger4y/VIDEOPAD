export interface PadTransform {
  scale: number;
  x: number;
  y: number;
  rotation: number;
}

export interface PadCell {
  id: number;
  videoUrl: string | null;
  audioBuffer?: AudioBuffer | null;
  startTime: number;
  endTime: number;
  isEmpty: boolean;
  volume: number;
  transform: PadTransform;
  allowOverlap: boolean;
}

export interface GlobalRecorderProps {
  stream: MediaStream;
  facingMode: 'user' | 'environment';
  onSwitchCamera: (mode: 'user' | 'environment') => void;
  onRecordingComplete: (blob: Blob) => void;
  onCancel: () => void;
}
