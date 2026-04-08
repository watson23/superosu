// IndexedDB storage for imported beatmaps

import type { Beatmap } from '../core/beatmap-parser.ts';

export interface StoredBeatmapSet {
  id?: number;
  title: string;
  artist: string;
  creator: string;
  difficulties: Beatmap[];
  audioData: ArrayBuffer;
  backgroundBlob: Blob | null;
}

const DB_NAME = 'superosu';
const DB_VERSION = 1;
const BEATMAP_STORE = 'beatmaps';
const SCORES_STORE = 'scores';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(BEATMAP_STORE)) {
        db.createObjectStore(BEATMAP_STORE, {
          keyPath: 'id',
          autoIncrement: true,
        });
      }
      if (!db.objectStoreNames.contains(SCORES_STORE)) {
        const store = db.createObjectStore(SCORES_STORE, {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('beatmap', ['beatmapId', 'version'], {
          unique: false,
        });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveBeatmapSet(
  set: StoredBeatmapSet
): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BEATMAP_STORE, 'readwrite');
    const store = tx.objectStore(BEATMAP_STORE);
    const req = store.add(set);
    req.onsuccess = () => resolve(req.result as number);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllBeatmapSets(): Promise<StoredBeatmapSet[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BEATMAP_STORE, 'readonly');
    const store = tx.objectStore(BEATMAP_STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getBeatmapSet(
  id: number
): Promise<StoredBeatmapSet | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BEATMAP_STORE, 'readonly');
    const store = tx.objectStore(BEATMAP_STORE);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteBeatmapSet(id: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BEATMAP_STORE, 'readwrite');
    const store = tx.objectStore(BEATMAP_STORE);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// Score storage
export interface StoredScore {
  id?: number;
  beatmapId: number;
  version: string;
  score: number;
  accuracy: number;
  maxCombo: number;
  rank: string;
  counts: { 300: number; 100: number; 50: number; 0: number };
  date: number;
}

export async function saveScore(score: StoredScore): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SCORES_STORE, 'readwrite');
    const store = tx.objectStore(SCORES_STORE);
    const req = store.add(score);
    req.onsuccess = () => resolve(req.result as number);
    req.onerror = () => reject(req.error);
  });
}

export async function getScores(
  beatmapId: number,
  version: string
): Promise<StoredScore[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SCORES_STORE, 'readonly');
    const store = tx.objectStore(SCORES_STORE);
    const index = store.index('beatmap');
    const req = index.getAll([beatmapId, version]);
    req.onsuccess = () => {
      const scores = req.result as StoredScore[];
      scores.sort((a, b) => b.score - a.score);
      resolve(scores);
    };
    req.onerror = () => reject(req.error);
  });
}
