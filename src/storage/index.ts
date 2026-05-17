// Re-exports: a single import surface for the rest of the app.
// All consumers should import from '@/storage' (or the relative path) —
// never reach into the localStorage / IndexedDB modules directly.

export * from './types';
export {
  getSetting,
  setSetting,
  getAllSettings,
  resetSettings,
  DEFAULT_SETTINGS,
} from './settings';
export {
  saveStory,
  getStory,
  listStories,
  deleteStory,
  saveStoryAudio,
  getStoryAudio,
} from './assets';
export {
  getAnthropicApiKey,
  getElevenLabsApiKey,
  hasAnthropicEnvKey,
  hasElevenLabsEnvKey,
} from './apiKeys';
