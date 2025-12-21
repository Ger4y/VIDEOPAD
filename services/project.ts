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
 * Exporta el proyecto completo como un archivo .madpad (formato ZIP)
 */
export const exportProject = async (projectName: string): Promise<void> => {
  const zip = new JSZip();
  const clips = await getAllClips();
  
  const metadata: ProjectFile = {
    projectName: projectName || "Untitled Project",
    version: 2, // Incrementamos versión por los cambios en transform (rotation)
    timestamp: Date.now(),
    clips: [],
  };

  const videoFolder = zip.folder("video_assets");

  for (const clip of clips) {
    const filename = `pad_${clip.id}.bin`; // Usamos .bin o similar para evitar que algunos SO intenten indexarlo como media
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
    compression: "STORE", // No comprimimos vídeo para máxima velocidad
    mimeType: "application/zip"
  });

  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  const safeName = projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  a.download = `${safeName || 'videopad_export'}.madpad`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * Importa un proyecto desde un archivo .madpad o .zip
 */
export const importProject = async (file: File): Promise<string> => {
  const zip = new JSZip();
  let loadedZip;
  
  try {
    loadedZip = await zip.loadAsync(file);
  } catch (e) {
    throw new Error("El archivo no es un proyecto VideoPad válido.");
  }

  // Buscar el manifiesto (soportamos nombres antiguos y nuevos)
  const manifestFile = loadedZip.file("project_manifest.json") || loadedZip.file("project.json");
  if (!manifestFile) {
    throw new Error("Formato de proyecto no reconocido (falta manifiesto).");
  }

  const metadataStr = await manifestFile.async("string");
  const metadata: ProjectFile = JSON.parse(metadataStr);

  // Borrar clips actuales solo si el manifiesto parece correcto
  const currentClips = await getAllClips();
  for (const clip of currentClips) {
    await deleteClip(clip.id);
  }

  // Importar clips
  for (const clipData of metadata.clips) {
    const videoFile = loadedZip.file(clipData.filename);
    if (videoFile) {
      const blob = await videoFile.async("blob");
      // Aseguramos que el blob mantenga un tipo de video genérico si se perdió
      const videoBlob = new Blob([blob], { type: 'video/mp4' }); 
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