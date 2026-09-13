#!/usr/bin/env python3
"""Render one passage from any local TTS engine, at an exact gross wpm.

Built for the engine audition: Kokoro lost to ElevenLabs under a scene bed,
so Chatterbox, StyleTTS2, XTTS and Higgs get the same test. For that to mean
anything every candidate must differ ONLY in voice, so this tool fixes
everything else:

  * identical passage, via tools/tts_text.py's [pause]/[softly] contract
  * identical gaps  - pauses are inserted here, not asked of the model
  * identical pace  - see below
  * identical level - loudness-normalised to the shipped library's target

Pace is set by rendering at the engine's natural rate and then time-stretching
the SPEECH ONLY, pitch-preserved, so the inserted pauses keep their exact
length. Kokoro's `speed` lever turned out discontinuous - 0.780 gave 159.7
wpm, 0.830 gave 141.1, and nothing landed near 150 - so asking an engine for
a rate cannot hit a target. Measuring what it did and stretching can, exactly,
on every engine including ones with no rate control at all.

Each engine lives in its own venv because their dependencies conflict
(coqui needs transformers<5, Higgs needs >=5.5). This re-execs itself under
the right interpreter, so call it with any python:

    python tools/tts-audition.py passage.txt out.wav --engine chatterbox \\
        --reference some-voice.wav --wpm 125
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

VENVS = {
    "kokoro": Path.home() / "venvs" / "tts",
    "chatterbox": Path.home() / "venvs" / "chatterbox",
    "styletts2": Path.home() / "venvs" / "styletts2",
    "xtts": Path.home() / "venvs" / "xtts",
    "higgs": Path.home() / "venvs" / "higgs",
}
# Below/above this, pitch-preserving stretch starts to smear consonants.
TEMPO_FLOOR, TEMPO_CEIL = 0.65, 1.6
# Rungs in the old ladder were 5 wpm apart; inside this, candidates are
# indistinguishable in pace and only the voice differs.
WPM_TOLERANCE = 0.75


def reexec(engine: str) -> None:
    """Hand over to the engine's own interpreter if we aren't in it."""
    want = VENVS[engine] / "bin" / "python"
    if not want.exists():
        sys.exit(f"no venv for {engine}: {want} does not exist")
    if Path(sys.executable).resolve() != want.resolve():
        os.execv(str(want), [str(want), os.path.abspath(__file__), *sys.argv[1:]])


# --- engines ---------------------------------------------------------------
# Each returns (list of float32 mono numpy arrays, sample rate).

def render_kokoro(segments, args):
    import numpy as np
    from kokoro import KPipeline
    pipe = KPipeline(lang_code="a")
    out = []
    for text in segments:
        chunks = []
        for r in pipe(text, voice=args.voice or "am_michael", speed=1.0):
            audio = r.audio if hasattr(r, "audio") else r[2]
            if audio is None:
                continue
            chunks.append(audio.detach().cpu().numpy()
                          if hasattr(audio, "detach") else np.asarray(audio))
        out.append(np.concatenate(chunks))
    return out, 24000


def render_chatterbox(segments, args):
    from chatterbox.tts import ChatterboxTTS
    m = ChatterboxTTS.from_pretrained(device="cuda")
    kw = {"audio_prompt_path": args.reference} if args.reference else {}
    out = []
    for text in segments:
        wav = m.generate(text, **kw)
        out.append(wav.squeeze().float().cpu().numpy())
    return out, m.sr


def render_styletts2(segments, args):
    import numpy as np
    from styletts2 import tts as s2
    m = s2.StyleTTS2()
    kw = {"target_voice_path": args.reference} if args.reference else {}
    out = []
    for text in segments:
        out.append(np.asarray(m.inference(text, **kw), dtype="float32"))
    # The LibriTTS checkpoint's vocoder runs at 24 kHz.
    return out, 24000


def render_xtts(segments, args):
    import numpy as np
    from TTS.api import TTS
    if not args.reference:
        sys.exit("xtts clones from a reference clip; pass --reference")
    m = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to("cuda")
    out = []
    for text in segments:
        wav = m.tts(text=text, speaker_wav=args.reference, language="en")
        out.append(np.asarray(wav, dtype="float32"))
    return out, 24000


def render_higgs(segments, args):
    import torch
    import torchaudio
    from transformers import AutoModelForCausalLM, AutoTokenizer
    repo = "multimodalart/higgs-audio-v3-tts-4b-transformers"
    tok = AutoTokenizer.from_pretrained(repo)
    kw = {}
    if args.four_bit:
        from transformers import BitsAndBytesConfig
        kw["quantization_config"] = BitsAndBytesConfig(
            load_in_4bit=True, bnb_4bit_compute_dtype=torch.bfloat16,
            bnb_4bit_quant_type="nf4", bnb_4bit_use_double_quant=True)
        kw["device_map"] = "cuda"
    else:
        kw["dtype"] = torch.bfloat16
    model = AutoModelForCausalLM.from_pretrained(repo, trust_remote_code=True, **kw)
    if not args.four_bit:
        model = model.to("cuda")
    model = model.eval()
    ref = {}
    if args.reference:
        wav, sr = torchaudio.load(args.reference)
        ref = {"reference_audio": wav, "reference_sample_rate": sr}
    out = []
    for text in segments:
        wav = model.generate_speech(text, tok, **ref)
        out.append(wav.squeeze().float().cpu().numpy())
    return out, model.config.sample_rate


ENGINES = {
    "kokoro": render_kokoro, "chatterbox": render_chatterbox,
    "styletts2": render_styletts2, "xtts": render_xtts, "higgs": render_higgs,
}


# --- assembly --------------------------------------------------------------

def stretch(path_in: Path, path_out: Path, tempo: float) -> None:
    """Pitch-preserving time-stretch. rubberband beats atempo on speech."""
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(path_in),
         "-filter:a", f"rubberband=tempo={tempo:.6f}:pitchq=quality",
         str(path_out)], check=True)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("script")
    ap.add_argument("output")
    ap.add_argument("--engine", required=True, choices=sorted(ENGINES))
    ap.add_argument("--voice", help="engine-native voice id (Kokoro)")
    ap.add_argument("--reference", help="reference clip for the cloning engines")
    ap.add_argument("--wpm", type=float, default=125.0)
    ap.add_argument("--pause", type=float, default=None)
    ap.add_argument("--four-bit", action="store_true",
                    help="4-bit quantise (Higgs 4B does not fit 8 GB in bf16)")
    args = ap.parse_args()

    reexec(args.engine)

    import numpy as np
    import soundfile as sf
    from tts_text import DEFAULT_PAUSE_SECONDS, TARGET_LUFS, gross_wpm, load_script

    pause_s = DEFAULT_PAUSE_SECONDS if args.pause is None else args.pause
    segments, words, softly = load_script(args.script)
    print(f"{args.engine}: {len(segments)} segments, {words} words, "
          f"{softly} [softly] dropped")

    import time
    t0 = time.time()
    chunks, sr = ENGINES[args.engine](segments, args)
    render_s = time.time() - t0

    speech_s = sum(len(c) for c in chunks) / sr
    pause_total = pause_s * (len(chunks) - 1)
    natural = gross_wpm(words, speech_s + pause_total)

    # Hit the target exactly by stretching speech only, so the gaps stay put.
    want_total = words * 60.0 / args.wpm
    want_speech = want_total - pause_total
    if want_speech <= 0:
        sys.exit(f"{args.wpm} wpm leaves no room for {pause_total:.1f}s of pauses")
    tempo = speech_s / want_speech
    print(f"  rendered {speech_s:.1f}s speech in {render_s:.0f}s "
          f"({speech_s/render_s:.1f}x realtime), natural {natural:.1f} wpm")
    print(f"  stretching speech x{tempo:.3f} to hit {args.wpm:.0f} wpm")
    if not TEMPO_FLOOR <= tempo <= TEMPO_CEIL:
        print(f"  WARNING: tempo {tempo:.3f} is outside {TEMPO_FLOOR}-{TEMPO_CEIL}; "
              f"expect smearing. This engine's natural rate is far from target.")

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        for i, c in enumerate(chunks):
            sf.write(tmp / f"{i}.wav", c, sr)
        gap = np.zeros(int(pause_s * sr), dtype="float32")

        def build(t: float):
            pieces = []
            for i in range(len(chunks)):
                stretch(tmp / f"{i}.wav", tmp / f"{i}s.wav", t)
                pieces.append(sf.read(tmp / f"{i}s.wav", dtype="float32")[0])
            joined = pieces[0]
            for p in pieces[1:]:
                joined = np.concatenate([joined, gap, p])
            return joined, gross_wpm(words, len(joined) / sr)

        # rubberband's output is not exactly 1/tempo long, and on a short
        # script that error is whole wpm. Correct it against the measurement
        # instead of trusting the requested factor — no re-synthesis needed,
        # so each pass costs a stretch of already-rendered audio.
        joined, actual = build(tempo)
        for _ in range(3):
            if abs(actual - args.wpm) <= WPM_TOLERANCE:
                break
            speech_now = len(joined) / sr - pause_total
            tempo *= speech_now / (words * 60.0 / args.wpm - pause_total)
            joined, actual = build(tempo)
            print(f"  refined tempo to {tempo:.4f} -> {actual:.1f} wpm")

        merged = tmp / "merged.wav"
        sf.write(merged, joined, sr)
        out_path = Path(args.output)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(merged),
             "-af", f"loudnorm=I={TARGET_LUFS}:TP=-1.0:LRA=7:linear=true",
             "-ar", "48000", str(out_path)], check=True)

    manifest = {
        "engine": args.engine, "voice": args.voice, "reference": args.reference,
        "words": words, "softlyDropped": softly, "segments": len(segments),
        "pauseSeconds": pause_s, "targetWpm": args.wpm,
        "naturalWpm": round(natural, 1), "actualWpm": round(actual, 1),
        "tempo": round(tempo, 4), "engineSampleRate": sr,
        "renderSeconds": round(render_s, 1),
        "realtimeFactor": round(speech_s / render_s, 2),
    }
    Path(str(out_path) + ".json").write_text(json.dumps(manifest, indent=2))
    print(f"  -> {out_path}  ({actual:.1f} wpm actual)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
