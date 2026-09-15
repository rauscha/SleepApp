// Storage-durability tests, plus the disposal of the generated-story
// database left behind by the removed in-app generator.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dropGeneratedStoryDatabase,
  requestPersistentStorage,
} from './persistence';

describe('requestPersistentStorage', () => {
  const original = Object.getOwnPropertyDescriptor(navigator, 'storage');
  function setStorage(value: unknown) {
    Object.defineProperty(navigator, 'storage', { configurable: true, value });
  }
  afterEach(() => {
    if (original) Object.defineProperty(navigator, 'storage', original);
    else setStorage(undefined);
  });

  it('returns false when the StorageManager API is unavailable', async () => {
    setStorage(undefined);
    expect(await requestPersistentStorage()).toBe(false);
  });

  it('returns true without re-requesting when already persisted', async () => {
    const persist = vi.fn(async () => true);
    setStorage({ persisted: async () => true, persist });
    expect(await requestPersistentStorage()).toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it('requests persistence when not yet persisted', async () => {
    const persist = vi.fn(async () => true);
    setStorage({ persisted: async () => false, persist });
    expect(await requestPersistentStorage()).toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('returns false rather than throwing when persist() rejects', async () => {
    setStorage({
      persisted: async () => false,
      persist: async () => {
        throw new Error('nope');
      },
    });
    expect(await requestPersistentStorage()).toBe(false);
  });
});

describe('dropGeneratedStoryDatabase', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  function setIndexedDB(value: unknown) {
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      value,
    });
  }
  afterEach(() => {
    if (original) Object.defineProperty(globalThis, 'indexedDB', original);
    else setIndexedDB(undefined);
  });

  /** Minimal IDBOpenDBRequest stand-in: capture the handlers the module
   *  installs, then fire one of them on the next tick. */
  function fakeDeleteDatabase(
    fire: (req: Record<string, (e: unknown) => void>) => void
  ) {
    const deleteDatabase = vi.fn(() => {
      const req: Record<string, (e: unknown) => void> = {};
      queueMicrotask(() => fire(req));
      return req;
    });
    setIndexedDB({ deleteDatabase });
    return deleteDatabase;
  }

  it('reports the database gone when one was actually there', async () => {
    const del = fakeDeleteDatabase((req) => req.onsuccess({ oldVersion: 1 }));
    expect(await dropGeneratedStoryDatabase()).toBe('deleted');
    expect(del).toHaveBeenCalledWith('sleep-app');
  });

  it('distinguishes "nothing was there" from a real delete', async () => {
    // Deleting a database that never existed still succeeds, with
    // oldVersion 0. Reporting that as a delete would make the log claim a
    // cleanup on every launch forever.
    fakeDeleteDatabase((req) => req.onsuccess({ oldVersion: 0 }));
    expect(await dropGeneratedStoryDatabase()).toBe('absent');
  });

  it('reports a blocked delete instead of hanging', async () => {
    fakeDeleteDatabase((req) => req.onblocked({}));
    expect(await dropGeneratedStoryDatabase()).toBe('blocked');
  });

  it('resolves rather than rejecting when the request errors', async () => {
    fakeDeleteDatabase((req) => req.onerror({}));
    expect(await dropGeneratedStoryDatabase()).toBe('failed');
  });

  it('reports unsupported when IndexedDB is missing', async () => {
    setIndexedDB(undefined);
    expect(await dropGeneratedStoryDatabase()).toBe('unsupported');
  });

  it('never throws when deleteDatabase itself throws', async () => {
    setIndexedDB({
      deleteDatabase: () => {
        throw new Error('private mode');
      },
    });
    expect(await dropGeneratedStoryDatabase()).toBe('failed');
  });
});
