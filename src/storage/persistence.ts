// Storage durability, and the one-time disposal of the generated-story
// database.
//
// What is left to protect is the service worker's Cache Storage: every scene
// variant, meditation and bundled story is an Opus/MP3 file the SW keeps so
// the app opens offline. That is hundreds of megabytes on a phone, and
// "best-effort" storage can be reclaimed by the OS under pressure — which on
// this app looks like a scene going silent mid-night because its file was
// evicted. Asking for persistence is the only lever the page has.
//
// This module used to sit alongside an IndexedDB layer holding generated
// story audio; see dropGeneratedStoryDatabase below for what happened to it.

/** IndexedDB database written by the removed in-app story generator. */
const GENERATED_STORY_DB = 'sleep-app';

/**
 * Ask the browser to make this origin's storage PERSISTENT, so it is not
 * silently evicted under storage pressure.
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

export type DropDatabaseOutcome =
  /** The database existed and is now gone. */
  | 'deleted'
  /** Nothing to delete — already clean, or this install never generated. */
  | 'absent'
  /** Another tab still holds a connection; it will be deleted when that
   *  closes. Nothing here opens this database any more, so this is rare. */
  | 'blocked'
  /** IndexedDB is unavailable (private mode, an old WebView, a test env). */
  | 'unsupported'
  /** The delete request errored. */
  | 'failed';

/**
 * Delete the IndexedDB database the in-app story generator wrote into.
 *
 * Generated stories were 25–40 MB of WAV each and there is no longer any
 * code that can read them, so leaving the database in place would strand
 * that space on the device forever with nothing able to reclaim it. Andrew,
 * asked whether to preserve the ones already on his phone: "I don't love the
 * generated ones on my phone, they can disappear, i'm not worried about the
 * wasted work." So this is a deliberate delete, not a migration.
 *
 * Never throws and never blocks startup — the caller fires it and forgets.
 * Deleting a database that does not exist succeeds, which is what makes it
 * safe to run on every launch rather than behind a one-shot flag.
 */
export function dropGeneratedStoryDatabase(): Promise<DropDatabaseOutcome> {
  return new Promise<DropDatabaseOutcome>((resolve) => {
    try {
      if (typeof indexedDB === 'undefined' || !indexedDB?.deleteDatabase) {
        resolve('unsupported');
        return;
      }
      const req = indexedDB.deleteDatabase(GENERATED_STORY_DB);
      req.onsuccess = (event) => {
        // A delete of a database that never existed also succeeds, with
        // oldVersion 0 — that is how we tell "cleaned up 400 MB" from
        // "there was nothing here", which is worth knowing in the log.
        const oldVersion = (event as IDBVersionChangeEvent).oldVersion ?? 0;
        resolve(oldVersion > 0 ? 'deleted' : 'absent');
      };
      req.onerror = () => resolve('failed');
      req.onblocked = () => resolve('blocked');
    } catch {
      resolve('failed');
    }
  });
}
