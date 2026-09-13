#!/usr/bin/env python3
"""Check that a TTS render actually says what it was given.

Local engines truncate, repeat and hallucinate, especially when cloning from
a reference. None of them report it. During an audition nobody listens to
every take before shipping it to a phone, so a bad render costs a night of
Andrew's time to discover.

Rate alone cannot detect this. Chatterbox measured 267 wpm on a chunk, which
looks exactly like truncation and is not — transcription showed all 39 words
present; it is simply a very fast speaker. So the check has to be the actual
words.

Transcribes with faster-whisper and reports word-sequence similarity to the
script. Runs in the accent venv, which has faster-whisper:

    ~/venvs/accent/bin/python tools/tts-verify.py render.wav script.txt
"""
from __future__ import annotations

import argparse
import difflib
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

# Below this, something is wrong with the render, not with the transcriber.
# ASR on clean synthetic speech scores well above it; truncation tanks it.
MIN_RATIO = 0.90


def normalise(text: str) -> list[str]:
    return re.sub(r"[^a-z0-9' ]", " ", text.lower()).split()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("audio")
    ap.add_argument("script")
    ap.add_argument("--model", default="base.en")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    from faster_whisper import WhisperModel
    from tts_text import load_script

    segments, words, _ = load_script(args.script)
    expected = normalise(" ".join(segments))

    model = WhisperModel(args.model, device="cuda", compute_type="float16")
    got_segments, _ = model.transcribe(args.audio, beam_size=5)
    actual = normalise(" ".join(s.text for s in got_segments))

    ratio = difflib.SequenceMatcher(None, expected, actual).ratio()
    name = Path(args.audio).name
    ok = ratio >= MIN_RATIO
    print(f"{name}: {len(actual)}/{len(expected)} words, similarity {ratio:.3f} "
          f"{'OK' if ok else 'SUSPECT'}")

    if not ok and not args.quiet:
        diff = difflib.SequenceMatcher(None, expected, actual)
        for tag, i1, i2, j1, j2 in diff.get_opcodes():
            if tag == "equal":
                continue
            exp = " ".join(expected[i1:i2])[:70]
            act = " ".join(actual[j1:j2])[:70]
            print(f"  {tag:<8} expected {exp!r}\n           actual   {act!r}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
