// In-browser test pad generator.
//
// Used only by the Phase-1 dev harness to verify the FileLayer crossfade
// engine without requiring real audio files in the repo. NOT used in the
// real app — once we ingest real recordings, FileLayer takes those instead.
//
// Generates a soft, slowly-evolving stereo pad: three detuned sine waves
// in a quiet drone, with a slow amplitude envelope at both ends so the
// buffer itself doesn't have hard edges that would defeat the crossfade
// test (we want the seam to be inside, not at the buffer ends).

export function generateTestPadBuffer(
  ctx: AudioContext,
  durationSeconds: number,
  fundamentalHz: number
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(durationSeconds * sampleRate);
  const buffer = ctx.createBuffer(2, length, sampleRate);

  const partials = [
    { ratio: 1.0, gain: 0.5, phase: 0 },
    { ratio: 1.005, gain: 0.4, phase: 0.7 }, // slight detune for chorus
    { ratio: 2.0, gain: 0.18, phase: 1.3 },
    { ratio: 3.005, gain: 0.08, phase: 2.1 },
  ];

  for (let ch = 0; ch < 2; ch++) {
    const channelData = buffer.getChannelData(ch);
    // Stereo: very small phase offset between channels for width.
    const stereoOffset = ch === 0 ? 0 : 0.02;
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      let s = 0;
      for (const p of partials) {
        s += p.gain * Math.sin(2 * Math.PI * fundamentalHz * p.ratio * t + p.phase + stereoOffset);
      }
      // Slow LFO on overall amplitude — makes the pad evolve so silent
      // crossfades are easy to spot.
      const lfo = 0.85 + 0.15 * Math.sin(2 * Math.PI * 0.07 * t);
      // Soft fade-in/fade-out envelope on the buffer ends so loops can
      // overlap cleanly even before the FileLayer's crossfade kicks in.
      const env = bufferEnvelope(t, durationSeconds, 1.5);
      channelData[i] = s * lfo * env * 0.25;
    }
  }
  return buffer;
}

function bufferEnvelope(t: number, total: number, fade: number): number {
  if (t < fade) return t / fade;
  if (t > total - fade) return Math.max(0, (total - t) / fade);
  return 1;
}
