// Asset storage backed by IndexedDB.
//
// Generated story audio is large (25–40 MB per story per the brief). Quotas
// vary, but localStorage is typically capped at ~5 MB and synchronous —
// using it for audio is a non-starter. IndexedDB handles binary blobs cleanly
// and asynchronously.
//
// Schema (db: 'sleep-app', version: 1):
//   - object store 'storyMetadata' keyed by id (StoryMetadata records)
//   - object store 'audioAssets'   keyed by id (StoredAudioAsset records)
//
// We deliberately keep metadata separate from audio bytes so the library
// screen can list stories quickly without paging in megabytes of audio.

import type { StoredAudioAsset, StoryMetadata } from './types';

const DB_NAME = 'sleep-app';
const DB_VERSION = 1;
const STORE_METADATA = 'storyMetadata';
const STORE_AUDIO = 'audioAssets';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_METADATA)) {
        db.createObjectStore(STORE_METADATA, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_AUDIO)) {
        db.createObjectStore(STORE_AUDIO, { keyPath: 'id' });
      }
    };
  });
  return dbPromise;
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const result = fn(store);
    if (result instanceof Promise) {
      result.then(resolve, reject);
    } else {
      result.onsuccess = () => resolve(result.result);
      result.onerror = () => reject(result.error);
    }
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveStory(meta: StoryMetadata): Promise<void> {
  await withStore(STORE_METADATA, 'readwrite', (store) => store.put(meta));
}

export async function getStory(id: string): Promise<StoryMetadata | null> {
  const result = await withStore<StoryMetadata | undefined>(STORE_METADATA, 'readonly', (store) =>
    store.get(id)
  );
  return result ?? null;
}

export async function listStories(): Promise<StoryMetadata[]> {
  return await withStore<StoryMetadata[]>(STORE_METADATA, 'readonly', (store) => store.getAll());
}

export async function deleteStory(id: string): Promise<void> {
  await withStore(STORE_METADATA, 'readwrite', (store) => store.delete(id));
  await withStore(STORE_AUDIO, 'readwrite', (store) => store.delete(id));
}

export async function saveStoryAudio(asset: StoredAudioAsset): Promise<void> {
  await withStore(STORE_AUDIO, 'readwrite', (store) => store.put(asset));
}

export async function getStoryAudio(id: string): Promise<StoredAudioAsset | null> {
  const result = await withStore<StoredAudioAsset | undefined>(STORE_AUDIO, 'readonly', (store) =>
    store.get(id)
  );
  return result ?? null;
}
