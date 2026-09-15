// Re-exports: a single import surface for the rest of the app.
// All consumers should import from '@/storage' (or the relative path) —
// never reach into the localStorage modules directly.

export * from './types';
export {
  getSetting,
  setSetting,
  getLayerVolumes,
  rememberLayerVolume,
  forgetLayerVolumes,
  getAllSettings,
  resetSettings,
  DEFAULT_SETTINGS,
} from './settings';
export {
  requestPersistentStorage,
  dropGeneratedStoryDatabase,
} from './persistence';
export type { DropDatabaseOutcome } from './persistence';
export {
  getAnthropicApiKey,
  getElevenLabsApiKey,
  hasAnthropicEnvKey,
  hasElevenLabsEnvKey,
} from './apiKeys';
