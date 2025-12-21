import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface MadPadDB extends DBSchema {
  clips: {
    key: number;
    value: {
      id: number;
      blob: Blob;
      startTime: number;
      endTime: number;
      volume?: number;
      transform?: { scale: number; x: number; y: number };
      allowOverlap?: boolean; // Added
    };
  };
}

const DB_NAME = 'madpad-db';
const STORE_NAME = 'clips';

export const initDB = async (): Promise<IDBPDatabase<MadPadDB>> => {
  return openDB<MadPadDB>(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    },
  });
};

export const saveClip = async (
  id: number, 
  blob: Blob, 
  startTime: number, 
  endTime: number, 
  volume: number = 1.0,
  transform = { scale: 1, x: 0, y: 0 },
  allowOverlap: boolean = false
) => {
  const db = await initDB();
  await db.put(STORE_NAME, { id, blob, startTime, endTime, volume, transform, allowOverlap });
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

export const getClip = async (id: number) => {
  const db = await initDB();
  return await db.get(STORE_NAME, id);
};

export const deleteClip = async (id: number) => {
  const db = await initDB();
  await db.delete(STORE_NAME, id);
};

export const getAllClips = async () => {
  const db = await initDB();
  return await db.getAll(STORE_NAME);
};