// IndexedDB asset-storage tests (review bug H2).
//
// The bug: withStore resolved on request.onsuccess, which fires BEFORE the
// transaction commits. A QuotaExceededError abort after success then lost a
// ~45 MB story WAV while reporting "done". These tests drive the storage
// layer against a hand-rolled in-memory IndexedDB that can reproduce that
// exact success-then-abort window.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetDbForTests,
  deleteStory,
  getStory,
  getStoryAudio,
  isStoragePersistent,
  listStories,
  requestPersistentStorage,
  saveStory,
  saveStoryAudio,
} from './assets';
import { installFakeIndexedDB, type FakeIndexedDBHandle } from '../test/fakeIndexedDB';
import type { StoredAudioAsset, StoryMetadata } from './types';

const STORE_AUDIO = 'audioAssets';

function meta(id: string): StoryMetadata {
  return {
    id,
    title: `Story ${id}`,
    theme: 'a quiet harbour',
    voiceId: 'tide',
    createdAt: new Date().toISOString(),
    durationSeconds: 1000,
    script: 'You walk along the water…',
    sceneId: null,
  };
}

function audio(id: string): StoredAudioAsset {
  return {
    id,
    mimeType: 'audio/wav',
    data: new Uint8Array([1, 2, 3, 4]).buffer,
    savedAt: new Date().toISOString(),
  };
}

describe('assets storage', () => {
  let idb: FakeIndexedDBHandle;

  beforeEach(() => {
    idb = installFakeIndexedDB();
    __resetDbForTests();
  });
  afterEach(() => {
    idb.restore();
    __resetDbForTests();
  });

  it('round-trips a story after the transaction commits', async () => {
    await saveStory(meta('s1'));
    const got = await getStory('s1');
    expect(got?.id).toBe('s1');
    expect(await listStories()).toHaveLength(1);
  });

  it('round-trips audio bytes', async () => {
    await saveStoryAudio(audio('s2'));
    const got = await getStoryAudio('s2');
    expect(got?.id).toBe('s2');
    expect(got?.mimeType).toBe('audio/wav');
  });

  // The crux of H2: a write whose request succeeds but whose transaction
  // then aborts must reject — not resolve as if the bytes landed.
  it('rejects when the transaction aborts after the request succeeds', async () => {
    idb.abortWritesFor(STORE_AUDIO);
    await expect(saveStoryAudio(audio('s3'))).rejects.toBeInstanceOf(DOMException);
    // Nothing was actually persisted.
    expect(await getStoryAudio('s3')).toBeNull();
  });

  it('deleteStory removes both metadata and audio', async () => {
    await saveStory(meta('s4'));
    await saveStoryAudio(audio('s4'));
    await deleteStory('s4');
    expect(await getStory('s4')).toBeNull();
    expect(await getStoryAudio('s4')).toBeNull();
  });
});

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
});

describe('isStoragePersistent', () => {
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
    expect(await isStoragePersistent()).toBe(false);
  });

  it('reflects the persisted() result and never prompts', async () => {
    const persist = vi.fn(async () => true);
    setStorage({ persisted: async () => true, persist });
    expect(await isStoragePersistent()).toBe(true);
    setStorage({ persisted: async () => false, persist });
    expect(await isStoragePersistent()).toBe(false);
    expect(persist).not.toHaveBeenCalled();
  });

  it('returns false (treats unknown as not-safe) when persisted() throws', async () => {
    setStorage({
      persisted: async () => {
        throw new Error('nope');
      },
    });
    expect(await isStoragePersistent()).toBe(false);
  });
});
