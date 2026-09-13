"""Shared script handling for the TTS tools. No heavy dependencies.

Our narration scripts carry `[pause]` and `[softly]` markers written for
ElevenLabs. No local engine honours either, so every local renderer has to
treat them the same way or its output is not comparable:

  [pause]   becomes a real inserted silence, which is what makes pause
            length an exact lever rather than a plea to the model
  [softly]  is dropped, and counted, because that delivery cue is simply
            lost on engines that have no notion of it

`tools/tts-ladder.py` established this contract for Kokoro; it lives here so
the multi-engine audition cannot quietly diverge from it and compare a
Kokoro render that inserted silences against a Chatterbox render that read
the word "pause" out loud.
"""
from __future__ import annotations

import re

# Matches the shipped stories (measured -19.4 to -20.3 LUFS integrated).
TARGET_LUFS = -19.5
# The "short gaps" constant. Andrew's 125 wpm finding predicts he wants
# these shorter rather than longer, which is untested.
DEFAULT_PAUSE_SECONDS = 0.6


def load_script(path: str) -> tuple[list[str], int, int]:
    """Split on [pause]; return (segments, word count, dropped-[softly] count)."""
    raw = open(path, encoding="utf-8").read()
    softly = len(re.findall(r"\[softly\]", raw))
    raw = re.sub(r"\[softly\]", " ", raw)
    segments: list[str] = []
    for part in re.split(r"\[pause\]", raw):
        # Blank lines are paragraph breaks and read as gaps, so they are
        # segment boundaries too.
        for block in re.split(r"\n\s*\n", part):
            block = " ".join(block.split())
            if block:
                segments.append(block)
    words = count_words(" ".join(segments))
    return segments, words, softly


def count_words(text: str) -> int:
    return len(re.findall(r"[A-Za-z0-9'’\-]+", text))


def gross_wpm(words: int, total_seconds: float) -> float:
    """Words over *total* duration including gaps.

    Gross is the metric measured off the shipped files and the only one that
    survived scrutiny — silence-detection pause statistics did not, see
    notes/tts-research-2026-09-12.md §4b.
    """
    return words * 60.0 / total_seconds if total_seconds > 0 else 0.0


def chunk_segment(text: str, max_chars: int) -> list[str]:
    """Split a segment on sentence boundaries into pieces under max_chars.

    Every one of these engines has a practical input ceiling, and they do not
    report hitting it — Chatterbox silently truncated 480-character segments,
    which surfaced only as an implausible 227.9 wpm "natural rate" because the
    full word count was being credited to partial audio. Chunking below the
    ceiling is the fix; `plausible_wpm` is the alarm for next time.

    Pieces are concatenated with no gap between them, so this changes where
    the engine breathes, never where the script's pauses fall.
    """
    if len(text) <= max_chars:
        return [text]
    sentences = re.findall(r"[^.!?]+[.!?]+\s*|[^.!?]+$", text)
    chunks, cur = [], ""
    for s in sentences:
        if cur and len(cur) + len(s) > max_chars:
            chunks.append(cur.strip())
            cur = s
        else:
            cur += s
    if cur.strip():
        chunks.append(cur.strip())
    return chunks


# A coarse smoke alarm only. It was originally (85, 210) on the assumption
# that an implausible rate meant truncation — then transcription proved
# Chatterbox really does read at ~260 wpm with every word present. Rate cannot
# distinguish "fast" from "cut off"; only `tools/tts-verify.py` can. These
# bounds now catch gross breakage (silence, a single word, a runaway loop).
PLAUSIBLE_WPM = (60.0, 320.0)


def plausible_wpm(wpm: float) -> bool:
    return PLAUSIBLE_WPM[0] <= wpm <= PLAUSIBLE_WPM[1]
