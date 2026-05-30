// Per-scene visual treatment — photo with dark gradient overlay if a
// photo is available, else gradient-only fallback. Shared between the
// Tonight scene cards and the PlayerScreen so a scene's "look" carries
// continuously from selection into playback.

import { resolvePublicUrl } from './baseUrl';

// Photo paths run through resolvePublicUrl so the same code works at any
// deploy base (root '/' for dev, '/SleepApp/' on GitHub Pages).
const SCENE_PHOTOS: Record<string, string> = {
  'forest-day':     resolvePublicUrl('/scenes/photos/forest-day.jpg'),
  'forest-night':   resolvePublicUrl('/scenes/photos/forest-night.jpg'),
  'rain-on-window': resolvePublicUrl('/scenes/photos/rain-on-window.jpg'),
  'fireplace':      resolvePublicUrl('/scenes/photos/fireplace.jpg'),
};

const SCENE_GRADIENTS: Record<string, [string, string]> = {
  'forest-day':     ['#182A1E', '#0B0D10'],
  'forest-night':   ['#0C1812', '#0B0D10'],
  'forest-evening': ['#1A2418', '#0B0D10'],
  'rain-on-window': ['#161D2A', '#0B0D10'],
  'monsoon':        ['#1A2228', '#0B0D10'],
  'ocean-night':    ['#10202A', '#0B0D10'],
  'fireplace':      ['#2A1810', '#0B0D10'],
};

// Card overlay — moderate darkening so the editorial title sits over the
// photo's upper portion without washing it out. Used on the Tonight cards
// where the image is the headline element.
const CARD_OVERLAY =
  'linear-gradient(to bottom, rgba(11,13,16,0.35) 0%, rgba(11,13,16,0.55) 55%, rgba(11,13,16,0.95) 100%)';

// Player overlay — heavier than the card overlay because the photo sits
// behind controls and is stared at for tens of minutes pre-sleep. The
// floor at the bottom is near-opaque so the volume slider and mixer
// disclosure read cleanly against any source frame.
const PLAYER_OVERLAY =
  'linear-gradient(to bottom, rgba(11,13,16,0.55) 0%, rgba(11,13,16,0.70) 40%, rgba(11,13,16,0.92) 100%)';

function gradientBackground(id: string): string {
  const [from, to] = SCENE_GRADIENTS[id] ?? ['#1E2028', '#0B0D10'];
  return `linear-gradient(to bottom, ${from}, ${to})`;
}

/** Card-tier background — used on the Tonight scene picker. */
export function sceneCardBackground(id: string): string {
  const photo = SCENE_PHOTOS[id];
  if (photo) return `${CARD_OVERLAY}, url(${photo}) center/cover no-repeat`;
  return gradientBackground(id);
}

/** Player-tier background — heavier overlay for legibility under controls. */
export function scenePlayerBackground(id: string): string {
  const photo = SCENE_PHOTOS[id];
  if (photo) return `${PLAYER_OVERLAY}, url(${photo}) center/cover no-repeat`;
  return gradientBackground(id);
}

/** Whether a given scene has a curated photo (vs. gradient fallback). */
export function hasScenePhoto(id: string): boolean {
  return id in SCENE_PHOTOS;
}
