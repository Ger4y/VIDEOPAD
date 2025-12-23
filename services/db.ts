
import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface VideoPadDB extends DBSchema {
  clips: {
    key: number;
    value: {
      id: number;
      data: ArrayBuffer;
      mimeType: string;
      startTime: number;
      endTime: number;
      volume?: number;
      transform?: { scale: number; x: number; y: number; rotation: number };
      allowOverlap?: boolean;
    };
  };
}

const DB_NAME = 'videopad-db';
const STORE_NAME = 'clips';

// We increment the version to 2 to ensure the new schema (ArrayBuffer) is applied
export const initDB = async (): Promise<IDBPDatabase<VideoPadDB>> => {
  return openDB<VideoPadDB>(DB_NAME, 2, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      // If upgrading from version 1 to 2, we might need migration, 
      // but for simplicity in this context we'll let the app re-save or clear if needed.
      // The error reported by user suggests v1 was already failing.
    },
  });
};

export const saveClip = async (
  id: number, 
  blob: Blob, 
  startTime: number, 
  endTime: number, 
  volume: number = 5.0,
  transform = { scale: 1, x: 0, y: 0, rotation: 0 },
  allowOverlap: boolean = false
) => {
  const db = await initDB();
  const arrayBuffer = await blob.arrayBuffer();
  await db.put(STORE_NAME, { 
    id, 
    data: arrayBuffer, 
    mimeType: blob.type,
    startTime, 
    endTime, 
    volume, 
    transform, 
    allowOverlap 
  });
};

export const updateClipTrim = async (id: number, startTime: number, endTime: number) => {
  const db = await initDB();
  const clip = await db.get(STORE_NAME, id);
  if (clip) {
    clip.startTime = startTime;
    clip.endTime = endTime;
    await db.put(STORE_NAME, clip);
  } else {
    throw new Error(`Clip with id ${id} not found for trim update`);
  }
};

export const updateClipVolume = async (id: number, volume: number) => {
  const db = await initDB();
  const clip = await db.get(STORE_NAME, id);
  if (clip) {
    clip.volume = volume;
    await db.put(STORE_NAME, clip);
  }
};

export const updateClipOverlap = async (id: number, allowOverlap: boolean) => {
  const db = await initDB();
  const clip = await db.get(STORE_NAME, id);
  if (clip) {
    clip.allowOverlap = allowOverlap;
    await db.put(STORE_NAME, clip);
  }
};

// Helper to convert DB record to App-friendly format (with Blob)
const mapRecordToClip = (record: any) => {
  if (!record) return null;
  // Handle migration if someone has old version 1 records (with .blob)
  const blob = record.data 
    ? new Blob([record.data], { type: record.mimeType || 'video/webm' })
    : record.blob;
    
  return {
    ...record,
    blob
  };
};

export const getClip = async (id: number) => {
  const db = await initDB();
  const record = await db.get(STORE_NAME, id);
  return mapRecordToClip(record);
};

export const deleteClip = async (id: number) => {
  const db = await initDB();
  await db.delete(STORE_NAME, id);
};

export const getAllClips = async () => {
  const db = await initDB();
  const records = await db.getAll(STORE_NAME);
  return records.map(mapRecordToClip);
};
