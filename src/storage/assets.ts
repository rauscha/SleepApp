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

/**
 * Ask the browser to make this origin's storage PERSISTENT, so it is not
 * silently evicted under storage pressure. Without this, IndexedDB is
 * "best-effort": a phone low on space can drop a user's generated story
 * audio (~45 MB WAVs) between sessions — losing content they paid real money
 * to synthesize, which is exactly the "stories disappear when I reload" bug.
 *
 * Idempotent and best-effort: returns whether storage is now persistent.
 * On Android Chrome this is typically granted for installed PWAs / engaged
 * sites without a prompt. Safe to call on every launch.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    const storage =
      typeof navigator !== 'undefined' ? navigator.storage : undefined;
    if (!storage?.persist) return false;
    if (storage.persisted && (await storage.persisted())) return true;
    return await storage.persist();
  } catch {
    return false;
  }
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  const promise = new Promise<IDBDatabase>((resolve, reject) => {
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
  // If the open fails (rare — quota/permission/private-mode), drop the
  // cached promise so the NEXT call can retry. Otherwise every subsequent
  // call returns the same rejection forever, locking us out for the
  // lifetime of the page.
  promise.catch(() => {
    if (dbPromise === promise) dbPromise = null;
  });
  dbPromise = promise;
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
    const abortError = () =>
      tx.error ?? new DOMException('IndexedDB transaction aborted', 'AbortError');
    if (result instanceof Promise) {
      result.then(resolve, reject);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(abortError());
      return;
    }
    // Capture the request's result on success, but resolve on tx.oncomplete
    // — NOT on request.onsuccess. A request's onsuccess fires before the
    // transaction commits, and the commit can still abort afterwards (most
    // importantly a QuotaExceededError on a large story-audio write).
    // Resolving on onsuccess reported success for a write that never landed
    // — losing a $1–3 generated story while the UI said "done" (bug H2).
    // tx.onabort was also previously unwired, so a quota abort was silent.
    let value: T;
    result.onsuccess = () => {
      value = result.result;
    };
    result.onerror = () => reject(result.error);
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(abortError());
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
  // Delete metadata and audio atomically in a single transaction. With two
  // separate transactions a partial failure could orphan one without the
  // other, leaving the library in an inconsistent state.
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_METADATA, STORE_AUDIO], 'readwrite');
    tx.objectStore(STORE_METADATA).delete(id);
    tx.objectStore(STORE_AUDIO).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
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

/** Test hook — drop the cached DB connection so a fresh fake IndexedDB can
 *  be installed between tests. Not used in production. */
export function __resetDbForTests(): void {
  dbPromise = null;
}
