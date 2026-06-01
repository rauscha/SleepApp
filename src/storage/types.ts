// Storage data shapes.
//
// The brief is firm that no rewrite should be needed when (later) cloud
// sync arrives. To make that real, ALL data the app persists is described
// here, and ALL access goes through the typed helpers in settings.ts /
// assets.ts. A future cloud implementation re-exports the same surface;
// nothing else changes.

export interface UserSettings {
  /** Last-played scene id ('forest-day' etc.). Used to restore on launch. */
  lastSceneId: string | null;

  /** Master volume in [0, 1]. */
  masterVolume: number;

  /** Bed-scene attenuation under meditation/story narration in [0, 1].
   *  The bed and the spoken voice are separate audio trees (Web Audio bed
   *  bus, Howler MP3 voice), so the bed is multiplied by this factor while
   *  ContentPlayerScreen is mounted to leave the narration audible above
   *  it. Restored to 1× when the screen unmounts so the standalone Player
   *  hears the bed at full master. */
  contentBedAttenuation: number;

  /** Tinnitus matcher state. */
  tinnitus: {
    /** Center frequency in Hz, in [2000, 12000]. */
    centerHz: number;
    /** Bandwidth in Hz (default ±200 Hz → 400). */
    bandwidthHz: number;
    /** Default volume of the masking layer when toggled on. [0, 1]. */
    defaultVolume: number;
    /** Whether the user has explicitly calibrated yet. */
    hasCalibrated: boolean;
  };

  /** Default voices for stories and meditations. Voice IDs from §6 of brief. */
  voices: {
    storyVoiceId: 'tide' | 'stone';
    meditationVoiceId: 'hush' | 'ember' | 'glen';
  };

  /** ElevenLabs API key. Stored locally only. NEVER phone-home. */
  elevenLabsApiKey: string | null;

  /** Anthropic Claude API key, used for story generation. */
  anthropicApiKey: string | null;

  /** UI display mode. */
  displayMode: 'lush' | 'nightstand';

  /** Default sleep timer duration in minutes; null = no timer. */
  defaultTimerMinutes: number | null;
}

// ---------------------------------------------------------------------------
// Meditation types (pre-generated, bundled as static files)

/** Metadata for a single bundled meditation. Lives in public/meditations/index.json. */
export interface MeditationMetadata {
  id: string;
  title: string;
  description: string;
  style: 'body-scan' | 'breath-focus' | 'visualization';
  /** Duration in seconds. */
  durationSeconds: number;
  /** Voice name (maps to an ElevenLabs voice ID). */
  voiceId: string;
  /** ISO 8601 timestamp when this meditation was generated. */
  createdAt: string;
  /** Path to the MP3 relative to /meditations/, e.g. "morning-scan.mp3". */
  audioPath: string;
  /** Backing scene id played underneath narration. Meditations use
   *  'stop-with-content' behavior — bed stops when narration ends —
   *  so this is purely an underbed for the spoken track. Same field
   *  shape as BundledStoryMetadata.sceneId. */
  sceneId?: string | null;
}

export interface MeditationIndex {
  meditations: MeditationMetadata[];
}

// ---------------------------------------------------------------------------

/** Metadata for a generated sleep story, stored in localStorage. */
export interface StoryMetadata {
  id: string;
  title: string;
  theme: string;
  voiceId: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
  /** Approximate duration in seconds. */
  durationSeconds: number;
  /** The script that was synthesized. Stored for transparency / debug. */
  script: string;
  /** Backing scene id played underneath, if any. */
  sceneId: string | null;
}

/** Metadata for a single bundled sleep story (shipped with the app).
 *  Lives in public/stories/index.json and is the read-only counterpart
 *  to StoryMetadata — same shape conceptually but the audio is at a
 *  URL instead of in IndexedDB, and the user can't delete it. */
export interface BundledStoryMetadata {
  id: string;
  title: string;
  /** Short blurb shown under the title in the Library card. */
  theme: string;
  /** Voice name (maps to a VITE_VOICE_TIDE/STONE id), e.g. 'tide' | 'stone'. */
  voiceId: string;
  /** ISO 8601 timestamp when this story was generated. */
  createdAt: string;
  /** Approximate spoken duration in seconds. */
  durationSeconds: number;
  /** Path to the MP3 relative to /stories/, e.g. "seaside-village.mp3". */
  audioPath: string;
  /** Backing scene id played underneath during narration, then left
   *  running so the room doesn't go silent. Same field as StoryMetadata. */
  sceneId?: string | null;
}

export interface BundledStoryIndex {
  stories: BundledStoryMetadata[];
}

/** Shape of an audio asset stored in IndexedDB. */
export interface StoredAudioAsset {
  /** Asset id — for stories this is the story id. */
  id: string;
  /** MIME type, e.g. 'audio/mpeg'. */
  mimeType: string;
  /** The audio bytes. */
  data: ArrayBuffer;
  /** When the asset was saved. */
  savedAt: string;
}
