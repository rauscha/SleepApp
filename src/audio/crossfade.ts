// Equal-power crossfade utilities.
//
// Why equal-power instead of linear? Linear crossfades cause an audible
// volume dip at t=0.5 (combined power = 0.5 instead of 1.0). Equal-power
// keeps perceived loudness constant across the fade — the user hears no
// dip at the seam, which is the whole point. cos/sin curves are the
// standard equal-power pair.

import type { CrossfadeGains } from './types';

/** Equal-power crossfade gains for normalized progress t ∈ [0, 1]. */
export function equalPower(t: number): CrossfadeGains {
  const clamped = Math.max(0, Math.min(1, t));
  return {
    out: Math.cos((clamped * Math.PI) / 2),
    in: Math.sin((clamped * Math.PI) / 2),
  };
}

/**
 * Apply an equal-power crossfade to a pair of GainNodes via AudioParam
 * scheduling. Uses a curve sampled at `steps` points (default 32) for
 * smoothness; setValueCurveAtTime expects a Float32Array.
 *
 * Both gains' AudioParam state is fully scheduled by this call — callers
 * should not also try to set the gain manually during the fade window.
 */
export function scheduleEqualPowerCrossfade(
  outgoing: GainNode,
  incoming: GainNode,
  startTime: number,
  durationSeconds: number,
  peakOut: number,
  peakIn: number,
  steps = 64
): void {
  const outCurve = new Float32Array(steps);
  const inCurve = new Float32Array(steps);
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const g = equalPower(t);
    outCurve[i] = g.out * peakOut;
    inCurve[i] = g.in * peakIn;
  }
  outgoing.gain.cancelScheduledValues(startTime);
  incoming.gain.cancelScheduledValues(startTime);
  outgoing.gain.setValueAtTime(peakOut, startTime);
  incoming.gain.setValueAtTime(0, startTime);
  outgoing.gain.setValueCurveAtTime(outCurve, startTime, durationSeconds);
  incoming.gain.setValueCurveAtTime(inCurve, startTime, durationSeconds);
}
