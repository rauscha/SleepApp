// normalize-voice-audio.ts — loudnorm a generated voice MP3.
//
// Voice content (meditations, stories) shipped without this step had wide
// loudness variance — body-scan-01 was ~12 dB louder than seaside-village,
// jarring enough to surface as a real complaint. Scene audio went through
// tools/transcode-scene-audio.sh's loudnorm step; voice content didn't.
// This helper closes that gap.
//
// Target: I=-19 LUFS, TP=-1.0, LRA=7
//   I=-19      Audiobook standard, slightly above the -20 LUFS used for
//              ambient scenes so a soloed meditation reads "present"
//              against the system. Below -16 (Spotify/podcast) so the
//              level doesn't punch through at 2am.
//   TP=-1.0    True-peak ceiling. -1.0 leaves headroom for the inter-
//              sample peaks that occur during MP3 decode.
//   LRA=7      Loudness-range target. Voice content has tighter LRA
//              than ambient (one speaker, controlled prosody). 7 LU
//              keeps natural breath/pause dynamics without over-
//              compressing or letting outliers like the ElevenLabs
//              level jumps survive the pass.
//
// Single-pass loudnorm with linear=true is accurate to within ~0.5 LUFS
// for voice content — well below the ~3 LU perceptual threshold and not
// worth the two-pass complexity.

import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export const VOICE_LOUDNORM_TARGET = 'I=-19:TP=-1.0:LRA=7';

/**
 * Run ffmpeg loudnorm over an MP3 buffer and return the normalized buffer.
 * Uses temp files because piping arbitrary binary through stdin/stdout
 * across Node + ffmpeg on Windows is more fragile than it's worth.
 *
 * Throws if ffmpeg isn't on PATH or exits non-zero.
 */
export function normalizeVoiceMp3(input: Buffer): Buffer {
  const dir = mkdtempSync(join(tmpdir(), 'sleep-voice-norm-'));
  const inPath = join(dir, 'in.mp3');
  const outPath = join(dir, 'out.mp3');
  try {
    writeFileSync(inPath, input);
    const result = spawnSync(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel', 'error',
        '-y',
        '-i', inPath,
        '-af', `loudnorm=${VOICE_LOUDNORM_TARGET}:linear=true`,
        '-c:a', 'libmp3lame',
        '-b:a', '128k',
        '-ar', '44100',
        '-ac', '1',
        outPath,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    if (result.status !== 0) {
      const stderr = result.stderr?.toString() ?? '';
      throw new Error(
        `ffmpeg loudnorm failed (exit ${result.status}): ${stderr.slice(0, 400)}`
      );
    }
    return readFileSync(outPath);
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* noop */ }
  }
}
