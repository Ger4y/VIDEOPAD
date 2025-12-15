import JSZip from 'jszip';
import { getAllClips, saveClip, deleteClip } from './db';

interface ClipMetadata {
  id: number;
  startTime: number;
  volume: number;
  filename: string;
}

interface ProjectFile {
  version: number;
  timestamp: number;
  clips: ClipMetadata[];
}

export const exportProject = async (): Promise<void> => {
  const zip = new JSZip();
  const clips = await getAllClips();
  const metadata: ProjectFile = {
    version: 1,
    timestamp: Date.now(),
    clips: [],
  };

  clips.forEach((clip) => {
    const filename = `clip_${clip.id}.webm`; // Uniform naming, assuming webm/blob
    
    // Add blob to zip
    zip.file(filename, clip.blob);

    // Add metadata
    metadata.clips.push({
      id: clip.id,
      startTime: clip.startTime,
      volume: clip.volume ?? 1.0,
      filename: filename
    });
  });

  // Add metadata json
  zip.file("project.json", JSON.stringify(metadata, null, 2));

  // Generate ZIP blob
  const content = await zip.generateAsync({ type: "blob" });
  
  // Trigger Download
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  const dateStr = new Date().toISOString().split('T')[0];
  a.download = `madpad_project_${dateStr}.madpad`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const importProject = async (file: File): Promise<void> => {
  const zip = new JSZip();
  const loadedZip = await zip.loadAsync(file);

  const projectFile = loadedZip.file("project.json");
  if (!projectFile) {
    throw new Error("Invalid project file: missing project.json");
  }

  const metadataStr = await projectFile.async("string");
  const metadata: ProjectFile = JSON.parse(metadataStr);

  // Clear existing clips logic could be here, but let's do it cell by cell
  // Ideally, we clear the DB first to remove old project data
  const currentClips = await getAllClips();
  for (const clip of currentClips) {
    await deleteClip(clip.id);
  }

  // Restore clips
  for (const clipData of metadata.clips) {
    const videoFile = loadedZip.file(clipData.filename);
    if (videoFile) {
      const blob = await videoFile.async("blob");
      // Ensure the mimetype is correct for the blob, though IDB usually handles it well
      // Re-saving with the exact blob data
      await saveClip(clipData.id, blob, clipData.startTime, clipData.volume);
    }
  }
};