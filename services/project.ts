
import JSZip from 'jszip';
import { getAllClips, saveClip, deleteClip } from './db';

interface ClipMetadata {
  id: number;
  startTime: number;
  endTime: number;
  volume: number;
  filename: string;
  mimeType: string;
  allowOverlap?: boolean;
  transform?: { scale: number; x: number; y: number; rotation: number };
}

interface ProjectFile {
  projectName: string;
  version: number;
  timestamp: number;
  clips: ClipMetadata[];
}

export const exportProject = async (projectName: string): Promise<void> => {
  const zip = new JSZip();
  const clips = await getAllClips();
  
  if (clips.length === 0) {
    throw new Error("No hay clips para exportar.");
  }

  const metadata: ProjectFile = {
    projectName: projectName || "Untitled Project",
    version: 4, 
    timestamp: Date.now(),
    clips: [],
  };

  const videoFolder = zip.folder("video_assets");

  for (const clip of clips) {
    if (!clip || !clip.blob || clip.blob.size === 0) continue;

    const mime = clip.blob.type;
    const extension = mime.includes('webm') ? 'webm' : 'mp4';
    const filename = `pad_${clip.id}.${extension}`; 
    
    if (videoFolder) {
      videoFolder.file(filename, clip.blob);
    }
    
    metadata.clips.push({
      id: clip.id,
      startTime: clip.startTime,
      endTime: clip.endTime,
      volume: clip.volume ?? 5.0,
      filename: `video_assets/${filename}`,
      mimeType: mime,
      allowOverlap: clip.allowOverlap ?? false,
      transform: clip.transform as any
    });
  }

  zip.file("project_manifest.json", JSON.stringify(metadata, null, 2));

  const content = await zip.generateAsync({ 
    type: "blob",
    compression: "STORE"
  });

  const safeName = projectName.trim().replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'proyecto_videopad';
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = `${safeName}.zip`;
  
  document.body.appendChild(a);
  a.click();
  
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 2000);
};

export const importProject = async (file: File): Promise<string> => {
  const zip = new JSZip();
  let loadedZip;
  
  try {
    loadedZip = await zip.loadAsync(file);
  } catch (e) {
    throw new Error("El archivo no es un ZIP válido.");
  }

  const manifestFile = loadedZip.file("project_manifest.json") || loadedZip.file("project.json");
  if (!manifestFile) {
    throw new Error("No se encontró el archivo de proyecto.");
  }

  const metadataStr = await manifestFile.async("string");
  const metadata: ProjectFile = JSON.parse(metadataStr);

  const currentClips = await getAllClips();
  for (const clip of currentClips) {
    await deleteClip(clip.id);
  }

  for (const clipData of metadata.clips) {
    const videoFile = loadedZip.file(clipData.filename);
    if (videoFile) {
      const arrayBuffer = await videoFile.async("arraybuffer");
      let mimeType = clipData.mimeType || (clipData.filename.endsWith('.webm') ? 'video/webm' : 'video/mp4');
      const videoBlob = new Blob([arrayBuffer], { type: mimeType }); 
      
      await saveClip(
        clipData.id, 
        videoBlob, 
        clipData.startTime, 
        clipData.endTime, 
        clipData.volume, 
        clipData.transform as any, 
        clipData.allowOverlap
      );
    }
  }

  return metadata.projectName || "Proyecto Importado";
};
