import JSZip from 'jszip';
import { getAllClips, saveClip, deleteClip } from './db';

interface ClipMetadata {
  id: number;
  startTime: number;
  endTime: number;
  volume: number;
  filename: string;
  allowOverlap?: boolean;
  transform?: { scale: number; x: number; y: number; rotation: number };
}

interface ProjectFile {
  projectName: string;
  version: number;
  timestamp: number;
  clips: ClipMetadata[];
}

/**
 * Exporta el proyecto completo como un archivo .zip (con extensión .madpad.zip para claridad)
 */
export const exportProject = async (projectName: string): Promise<void> => {
  const zip = new JSZip();
  const clips = await getAllClips();
  
  const metadata: ProjectFile = {
    projectName: projectName || "Untitled Project",
    version: 3, 
    timestamp: Date.now(),
    clips: [],
  };

  const videoFolder = zip.folder("video_assets");

  for (const clip of clips) {
    // Usamos .mp4 como extensión interna para que el navegador lo reconozca mejor al desempaquetar
    const filename = `pad_${clip.id}.mp4`; 
    if (videoFolder) {
      videoFolder.file(filename, clip.blob);
    }
    
    metadata.clips.push({
      id: clip.id,
      startTime: clip.startTime,
      endTime: clip.endTime,
      volume: clip.volume ?? 5.0,
      filename: `video_assets/${filename}`,
      allowOverlap: clip.allowOverlap ?? false,
      transform: clip.transform as any
    });
  }

  zip.file("project_manifest.json", JSON.stringify(metadata, null, 2));

  const content = await zip.generateAsync({ 
    type: "blob",
    compression: "STORE",
    mimeType: "application/zip"
  });

  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  const safeName = projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  // Forzamos .zip al final para que los sistemas operativos no se confundan
  a.download = `${safeName || 'videopad'}.madpad.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * Importa un proyecto desde un archivo .madpad, .zip o .madpad.zip
 */
export const importProject = async (file: File): Promise<string> => {
  const zip = new JSZip();
  let loadedZip;
  
  try {
    loadedZip = await zip.loadAsync(file);
  } catch (e) {
    throw new Error("El archivo no es un archivo ZIP válido.");
  }

  const manifestFile = loadedZip.file("project_manifest.json") || loadedZip.file("project.json");
  if (!manifestFile) {
    throw new Error("El archivo no contiene un manifiesto de VideoPad.");
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
      // Importante: recrear el Blob con un tipo MIME explícito
      const videoBlob = new Blob([arrayBuffer], { type: 'video/mp4' }); 
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