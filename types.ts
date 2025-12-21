export interface PadTransform {
  scale: number;
  x: number;
  y: number;
  rotation: number; // 0, 90, 180, 270
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

export interface RecorderProps {
  onRecordingComplete: (blob: Blob, startTime: number, endTime?: number) => void;
  onCancel: () => void;
}