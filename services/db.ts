import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface MadPadDB extends DBSchema {
  clips: {
    key: number;
    value: {
      id: number;
      blob: Blob;
      startTime: number;
      volume?: number; // Optional for backward compatibility
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

export const saveClip = async (id: number, blob: Blob, startTime: number, volume: number = 1.0) => {
  const db = await initDB();
  await db.put(STORE_NAME, { id, blob, startTime, volume });
};

// Updates only the volume without needing to re-save the blob
export const updateClipVolume = async (id: number, volume: number) => {
  const db = await initDB();
  const clip = await db.get(STORE_NAME, id);
  if (clip) {
    clip.volume = volume;
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