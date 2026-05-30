// Hand-rolled AudioContext mock for vitest.
//
// jsdom does not implement Web Audio, so any code that constructs an
// AudioContext (everything in src/audio/*) is untestable by default.
// Rather than pull in a heavyweight Web Audio polyfill (web-audio-test-api
// is unmaintained since 2018), this mock provides the exact surface the
// engine actually touches — and only that surface. It records scheduled
// events so tests can assert against the schedule instead of trying to
// hear audio.
//
// Design notes:
//   - currentTime is advanced manually via `mock.advanceTime(seconds)`.
//     This lets a test step the clock without waiting in wall-time.
//   - source.start(t) / source.stop(t) record their times. The mock
//     fires source.onended when stop() time elapses (mostly when
//     advanceTime crosses it).
//   - AudioParam scheduled events are stored as a flat array per param,
//     in the order the engine called them. Tests can introspect via
//     `gain.scheduledEvents` rather than running a curve evaluator.
//   - audioWorklet.addModule rejects by default if `mock.failWorkletOnce`
//     is set — exercises the rejection-cache fix in AudioEngine.
//
// Type-safety note: real Web Audio types are quite rich; we declare just
// enough structural compatibility for the engine to compile and run
// against these mocks. Where a property is read by the engine, the mock
// has it; the rest is `any` so we don't drag in irrelevant ceremony.

import { vi } from 'vitest';

export interface ScheduledEvent {
  kind:
    | 'setValueAtTime'
    | 'linearRampToValueAtTime'
    | 'setTargetAtTime'
    | 'setValueCurveAtTime'
    | 'cancelScheduledValues';
  time: number;
  value?: number;
  timeConstant?: number;
  curveLength?: number;
  curveDuration?: number;
}

export class MockAudioParam {
  value: number;
  readonly scheduledEvents: ScheduledEvent[] = [];

  constructor(initialValue = 0) {
    this.value = initialValue;
  }

  setValueAtTime(value: number, time: number): MockAudioParam {
    this.scheduledEvents.push({ kind: 'setValueAtTime', time, value });
    this.value = value;
    return this;
  }
  linearRampToValueAtTime(value: number, time: number): MockAudioParam {
    this.scheduledEvents.push({ kind: 'linearRampToValueAtTime', time, value });
    // For introspection convenience, settle .value at the ramp target;
    // real Web Audio interpolates over time, but tests assert against
    // scheduledEvents directly.
    this.value = value;
    return this;
  }
  setTargetAtTime(value: number, time: number, timeConstant: number): MockAudioParam {
    this.scheduledEvents.push({
      kind: 'setTargetAtTime',
      time,
      value,
      timeConstant,
    });
    return this;
  }
  setValueCurveAtTime(
    curve: Float32Array,
    time: number,
    duration: number
  ): MockAudioParam {
    this.scheduledEvents.push({
      kind: 'setValueCurveAtTime',
      time,
      curveLength: curve.length,
      curveDuration: duration,
    });
    if (curve.length > 0) this.value = curve[curve.length - 1]!;
    return this;
  }
  cancelScheduledValues(time: number): MockAudioParam {
    this.scheduledEvents.push({ kind: 'cancelScheduledValues', time });
    return this;
  }
}

export class MockAudioNode {
  readonly connections: MockAudioNode[] = [];
  readonly disconnects: { calls: number } = { calls: 0 };

  connect(destination: MockAudioNode): MockAudioNode {
    this.connections.push(destination);
    return destination;
  }
  disconnect(): void {
    this.disconnects.calls++;
    this.connections.length = 0;
  }
}

export class MockGainNode extends MockAudioNode {
  readonly gain = new MockAudioParam(1);
}

export class MockAnalyserNode extends MockAudioNode {
  fftSize = 2048;
  smoothingTimeConstant = 0.7;
  readonly frequencyBinCount = 1024;
  getByteFrequencyData(_buf: Uint8Array): void {
    // No-op — engine only uses this from the dev harness, not tested here.
  }
}

export class MockDynamicsCompressor extends MockAudioNode {
  readonly threshold = new MockAudioParam(-24);
  readonly knee = new MockAudioParam(30);
  readonly ratio = new MockAudioParam(12);
  readonly attack = new MockAudioParam(0.003);
  readonly release = new MockAudioParam(0.25);
  readonly reduction = 0;
}

/**
 * NoiseGenerator and TinnitusMaskLayer construct `new AudioWorkletNode(...)`
 * directly. jsdom has no implementation; provide a minimal one that records
 * messages posted to the worklet port (so tests could assert later if needed).
 */
export class MockAudioWorkletNode extends MockAudioNode {
  readonly port = {
    messages: [] as unknown[],
    postMessage: (msg: unknown): void => {
      (this.port.messages as unknown[]).push(msg);
    },
  };
  constructor(
    public readonly context: MockAudioContext,
    public readonly name: string,
    public readonly options?: unknown
  ) {
    super();
  }
}

export class MockBiquadFilter extends MockAudioNode {
  type: BiquadFilterType = 'lowpass';
  readonly frequency = new MockAudioParam(350);
  readonly Q = new MockAudioParam(1);
  readonly gain = new MockAudioParam(0);
  readonly detune = new MockAudioParam(0);
}

export class MockAudioBufferSource extends MockAudioNode {
  buffer: MockAudioBuffer | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  onended: (() => void) | null = null;
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  private context: MockAudioContext;

  constructor(context: MockAudioContext) {
    super();
    this.context = context;
    this.context.registerSource(this);
  }

  start(when = 0): void {
    if (this.startedAt !== null) {
      throw new Error('AudioBufferSourceNode.start called more than once.');
    }
    this.startedAt = when;
  }
  stop(when = 0): void {
    if (this.stoppedAt !== null) {
      // Real Web Audio: a second stop() is ignored (per spec it should
      // raise InvalidStateError, but engines vary; we mirror Chromium's
      // permissive behaviour to keep tests focused on lifecycle, not
      // exception handling).
      return;
    }
    this.stoppedAt = when;
  }
}

export class MockAudioBuffer {
  readonly duration: number;
  readonly sampleRate: number;
  readonly length: number;
  readonly numberOfChannels: number;
  private channels: Float32Array[];

  constructor(channels: number, length: number, sampleRate: number) {
    this.numberOfChannels = channels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
    this.channels = Array.from(
      { length: channels },
      () => new Float32Array(length)
    );
  }
  getChannelData(ch: number): Float32Array {
    return this.channels[ch]!;
  }
}

export interface MockAudioWorklet {
  addModule(url: string): Promise<void>;
}

type StateChangeListener = () => void;

export class MockAudioContext {
  state: 'running' | 'suspended' | 'closed' = 'running';
  currentTime = 0;
  readonly sampleRate = 48_000;
  readonly destination = new MockAudioNode();
  readonly audioWorklet: MockAudioWorklet;

  // Test-controlled knobs
  failWorkletOnce = false;
  /** When true, the next addModule() call hangs forever instead of resolving. */
  workletStallNext = false;
  workletAddModuleCalls = 0;
  resumeCalls = 0;

  private listeners = new Map<string, Set<StateChangeListener>>();
  private sources: MockAudioBufferSource[] = [];

  constructor() {
    this.audioWorklet = {
      addModule: vi.fn(async (_url: string) => {
        this.workletAddModuleCalls++;
        if (this.workletStallNext) {
          this.workletStallNext = false;
          // Stall forever — the test will assert against the
          // pending state, then call mock.reset() to clean up.
          await new Promise(() => { /* never resolves */ });
        }
        if (this.failWorkletOnce) {
          this.failWorkletOnce = false;
          throw new Error('mock-worklet-fail');
        }
      }),
    };
  }

  registerSource(src: MockAudioBufferSource): void {
    this.sources.push(src);
  }

  /**
   * Advance the audio clock and fire onended for any source whose stop()
   * time has passed. Tests should pair this with vi.advanceTimersByTime()
   * if they also rely on setTimeout-driven chain scheduling.
   */
  advanceTime(seconds: number): void {
    this.currentTime += seconds;
    for (const src of this.sources) {
      if (
        src.stoppedAt !== null &&
        src.stoppedAt <= this.currentTime &&
        src.onended
      ) {
        const cb = src.onended;
        src.onended = null;
        cb();
      }
    }
  }

  /** Returns every BufferSource ever created in this context (for assertions). */
  getAllSources(): readonly MockAudioBufferSource[] {
    return this.sources;
  }

  createGain(): MockGainNode {
    return new MockGainNode();
  }
  createAnalyser(): MockAnalyserNode {
    return new MockAnalyserNode();
  }
  createDynamicsCompressor(): MockDynamicsCompressor {
    return new MockDynamicsCompressor();
  }
  createBufferSource(): MockAudioBufferSource {
    return new MockAudioBufferSource(this);
  }
  createBuffer(channels: number, length: number, sampleRate: number): MockAudioBuffer {
    return new MockAudioBuffer(channels, length, sampleRate);
  }
  createBiquadFilter(): MockBiquadFilter {
    return new MockBiquadFilter();
  }

  async decodeAudioData(_data: ArrayBuffer): Promise<MockAudioBuffer> {
    // Return a 30-second stereo buffer — long enough for any reasonable
    // FileLayer config in tests.
    return new MockAudioBuffer(2, 30 * this.sampleRate, this.sampleRate);
  }

  async resume(): Promise<void> {
    this.resumeCalls++;
    this.state = 'running';
    this.emit('statechange');
  }
  async suspend(): Promise<void> {
    this.state = 'suspended';
    this.emit('statechange');
  }
  async close(): Promise<void> {
    this.state = 'closed';
    this.emit('statechange');
  }

  addEventListener(type: string, listener: StateChangeListener): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }
  removeEventListener(type: string, listener: StateChangeListener): void {
    this.listeners.get(type)?.delete(listener);
  }
  private emit(type: string): void {
    this.listeners.get(type)?.forEach((l) => l());
  }
}

/**
 * Install MockAudioContext on `window` so `new AudioContext(...)` in
 * production code returns our mock. Returns a tuple of [mock, restore].
 * The restore() cleans up window mutations and resets timers.
 */
export function installAudioContextMock(): {
  ctx: MockAudioContext;
  restore: () => void;
} {
  // Capture any prior values so we can restore cleanly. jsdom doesn't
  // provide AudioContext so prior is typically undefined, but explicit
  // restore keeps the suite safe to run alongside other tests in any
  // order.
  const w = window as unknown as {
    AudioContext?: unknown;
    webkitAudioContext?: unknown;
    AudioWorkletNode?: unknown;
    isSecureContext?: unknown;
  };
  const g = globalThis as unknown as {
    AudioWorkletNode?: unknown;
  };
  const prior = {
    AudioContext: w.AudioContext,
    webkitAudioContext: w.webkitAudioContext,
    AudioWorkletNode: w.AudioWorkletNode,
    isSecureContext: w.isSecureContext,
    globalAudioWorkletNode: g.AudioWorkletNode,
  };

  // Hold a ref to the singleton-style instance the engine will see.
  let theCtx: MockAudioContext | null = null;
  const Ctor = function (this: unknown) {
    theCtx = new MockAudioContext();
    return theCtx;
  } as unknown as { new (): MockAudioContext };

  // NoiseGenerator / TinnitusMaskLayer use bare `new AudioWorkletNode(...)`,
  // not via `ctx.audioWorklet`. Hang one on both window and globalThis so
  // module-scope identifier resolution finds it under any bundler config.
  const WorkletCtor = function (
    this: unknown,
    context: MockAudioContext,
    name: string,
    options?: unknown
  ) {
    return new MockAudioWorkletNode(context, name, options);
  } as unknown as { new (ctx: MockAudioContext, name: string, options?: unknown): MockAudioWorkletNode };

  w.AudioContext = Ctor;
  w.webkitAudioContext = Ctor;
  w.AudioWorkletNode = WorkletCtor;
  g.AudioWorkletNode = WorkletCtor;
  w.isSecureContext = true;

  // Construct one up-front so the test can grab it before the engine
  // does (its first new AudioContext() will replace this with a fresh
  // one — tests should call `getMock()` after engine.unlock() to read
  // the live ref).
  theCtx = new MockAudioContext();

  return {
    get ctx() {
      return theCtx!;
    },
    restore() {
      w.AudioContext = prior.AudioContext;
      w.webkitAudioContext = prior.webkitAudioContext;
      w.AudioWorkletNode = prior.AudioWorkletNode;
      g.AudioWorkletNode = prior.globalAudioWorkletNode;
      w.isSecureContext = prior.isSecureContext;
    },
  };
}
