#!/usr/bin/env python3
"""seamfit.py -- pick the loop start offset that makes a wrap level-matched.

Used by `loopify-scenes.py`. Background: a scene variant is trimmed to its
element's prime `loopOffsetSeconds` (P) with a C-second gapless wrap (the
post-loop tail faded over the faded-in head). The wrap is *continuous* by
construction, but only level-matched if the two sides happen to sit at the
same loudness. Trimming from t=0 -- which is what this tool did until
2026-09-02 -- puts the raw recording's fade-in / the recordist settling
against a fully settled tail, so the loop carries a 10-17 dB level STEP that
recurs every P seconds all night. Hunting that step is exactly the kind of
thing that wakes a sleeper.

What the wrap actually sounds like. Cut from start offset S, the finished
loop is  W = fadein(source[S, S+C]) + fadeout(source[S+P, S+P+C])  followed by
M = source[S+C, S+P]. Both junctions are sample-continuous (W ends on the same
audio M begins with; M ends on the same audio W begins with), so nothing
clicks. What the ear gets over the C-second wrap is a *glide* from the level
the source had at S+P to the level it had at S+C. So the artifact to minimise
is

    step(S) = | L(S + P - C) - L(S + C) |,   L(t) = mean dB of [t, t+C]

i.e. the level just BEFORE the wrap against the level just AFTER it. (Matching
the head and tail windows themselves -- [S, S+C] vs [S+P, S+P+C] -- is the
obvious formulation and is what the 2026-08 scratch script used, but it is
systematically fooled by a source fade-in: a head window sitting inside a fade
averages far below the level the head *ends* at, and it is the end of the head
that plays out of the wrap. forest-night night-5 scored 0.5 dB on that
criterion and rendered a 14 dB audible step.)

Residual steps are then flattened by an end-matching tilt -- see `tilt_for`.

Level measurement is delegated to ffmpeg (`astats` at one frame per second,
printed via `ametadata`), so this module needs no numpy and decodes no audio
in Python -- ffmpeg is already a hard dependency of the pipeline. (numpy IS
installed on the authoring machine, but keeping this stdlib-only means the
scene pipeline stays a two-dependency tool: python + ffmpeg.)

All prints are plain ASCII on purpose -- a fancy arrow crashed a whole run on
Windows' cp1252 console once (2026-07-01).
"""
import subprocess

WRAP_SECONDS = 6          # C: the gapless wrap length loopify builds
FRAME_SECONDS = 1         # envelope resolution == search granularity
ENVELOPE_RATE = 48000     # analysis sample rate (frames = ENVELOPE_RATE samples)
# A candidate whose wrap windows sit further than this off the file's own mean
# level is penalised: a perfectly matched pair of windows is worthless if both
# sit in, say, a freak quiet gap unrepresentative of the loop's body.
LEVEL_DEVIATION_TOLERANCE_DB = 4.0
SILENT_FLOOR_DB = -120.0  # astats reports "-inf" for a digitally silent frame
# End-matching tilt: when the best S still leaves a residual step (a short
# master has little slack -- forest-night night-4 is 226s of source for a 199s
# loop), a linear-in-dB gain ramp across the trimmed segment walks the tail
# onto the head. Spread over 199-691s a few dB is imperceptible drift; a large
# one would be an audible swell, hence the cap.
TILT_THRESHOLD_DB = 1.0
TILT_MAX_DB = 8.0


def level_envelope(path, frame_seconds=FRAME_SECONDS, rate=ENVELOPE_RATE):
    """Return a per-frame RMS level envelope in dBFS (one value per
    `frame_seconds` of `path`), measured full-bandwidth by ffmpeg."""
    n = int(round(rate * frame_seconds))
    fc = (f"aresample={rate},aformat=sample_fmts=fltp:channel_layouts=mono,"
          f"asetnsamples=n={n}:p=0,astats=metadata=1:reset=1,"
          f"ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-")
    out = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-af", fc, "-f", "null", "-"],
        capture_output=True, text=True, check=True).stdout
    env = []
    for line in out.splitlines():
        if "RMS_level=" in line:
            v = line.split("=", 1)[1].strip()
            try:
                env.append(max(float(v), SILENT_FLOOR_DB))
            except ValueError:      # "-inf" / "nan" on a silent frame
                env.append(SILENT_FLOOR_DB)
    return env


def _mean(xs):
    return sum(xs) / len(xs) if xs else SILENT_FLOOR_DB


def window_levels(env, wrap=WRAP_SECONDS, frame_seconds=FRAME_SECONDS):
    """L[i] = mean dB level of the `wrap`-second window starting at frame i."""
    w = max(1, int(round(wrap / frame_seconds)))
    if len(env) < w:
        return []
    run = sum(env[:w])
    out = [run / w]
    for i in range(w, len(env)):
        run += env[i] - env[i - w]
        out.append(run / w)
    return out


def _frames(seconds, frame_seconds):
    return int(round(seconds / frame_seconds))


def wrap_step_at(levels, start, period, wrap=WRAP_SECONDS,
                 frame_seconds=FRAME_SECONDS):
    """Audible wrap step for cutting a `period` loop from `start`.

    Returns (step_db, pre_db, post_db): the level of the `wrap` seconds
    immediately before the wrap (source [S+P-C, S+P]) against the `wrap`
    seconds immediately after it (source [S+C, S+2C]). None if either window
    falls outside `levels`.
    """
    w = _frames(wrap, frame_seconds)
    s = _frames(start, frame_seconds)
    pre_i = s + _frames(period, frame_seconds) - w
    post_i = s + w
    if pre_i < 0 or post_i < 0 or pre_i >= len(levels) or post_i >= len(levels):
        return None
    pre, post = levels[pre_i], levels[post_i]
    return abs(pre - post), pre, post


def wrap_step_db(env, period, wrap=WRAP_SECONDS, frame_seconds=FRAME_SECONDS):
    """Measure the wrap level step of an ALREADY-CUT loop of length `period`.

    A finished loop's wrap lives in [0, C], so the step is the level of the
    last `wrap` seconds [P-C, P] against the `wrap` seconds just past the wrap
    [C, 2C] -- what the ear hears either side of the loop point. Returns
    (step_db, tail_db, post_wrap_db, mean_db), or None if too short to measure.
    """
    L = window_levels(env, wrap, frame_seconds)
    if not L:
        return None
    got = wrap_step_at(L, 0, period, wrap, frame_seconds)
    if got is None:
        return None
    step, pre, post = got
    return step, pre, post, _mean(env)


def find_loop_start(path, period, wrap=WRAP_SECONDS,
                    frame_seconds=FRAME_SECONDS,
                    tolerance_db=LEVEL_DEVIATION_TOLERANCE_DB, env=None):
    """Choose the start offset S that best level-matches the loop wrap.

    Minimises the audible wrap step (see module docstring) over
    S in [0, dur - P - C], penalising candidates whose two wrap windows sit
    more than `tolerance_db` off the file's own mean level -- a matched pair
    that both sit in a freak quiet gap is not a representative seam.

    Returns a dict: start, stepDb, stepAtZeroDb, preDb, postDb, meanDb,
    searched (False when the source has no slack -- then start is 0).
    """
    if env is None:
        env = level_envelope(path, frame_seconds)
    L = window_levels(env, wrap, frame_seconds)
    mean_db = _mean(env)
    at_zero = wrap_step_at(L, 0, period, wrap, frame_seconds)
    base = {"stepAtZeroDb": at_zero[0] if at_zero else None,
            "meanDb": mean_db, "searched": False}
    max_start = len(L) - 1 - _frames(period, frame_seconds)
    if not L or max_start <= 0 or at_zero is None:
        step, pre, post = at_zero or (0.0, mean_db, mean_db)
        base.update({"start": 0, "stepDb": step, "preDb": pre, "postDb": post})
        return base
    best = None
    for s in range(max_start + 1):
        got = wrap_step_at(L, s * frame_seconds, period, wrap, frame_seconds)
        if got is None:
            continue
        step, pre, post = got
        excess = max(0.0, max(abs(pre - mean_db), abs(post - mean_db))
                     - tolerance_db)
        cost = step + excess
        if best is None or cost < best[0]:
            best = (cost, s, step, pre, post)
    if best is None:
        step, pre, post = at_zero
        base.update({"start": 0, "stepDb": step, "preDb": pre, "postDb": post})
        return base
    _, s, step, pre, post = best
    base.update({"start": int(round(s * frame_seconds)), "stepDb": step,
                 "preDb": pre, "postDb": post, "searched": True})
    return base


def tilt_for(result, period, wrap=WRAP_SECONDS):
    """Signed end-matching tilt in dB for a `find_loop_start` result.

    The residual step is post - pre: the pre-wrap level (source [S+P-C, S+P])
    has to be lifted by that much to land on the post-wrap level
    ([S+C, S+2C]). Applied as gain_dB(t) = (t - S) * D / P across the trimmed
    segment, so the end of the loop is raised by ~D while its start is raised
    by ~C*D/P; the (1 - C/P) factor below solves for the D that closes the gap
    exactly. Over 199-691s a few dB of ramp is imperceptible drift, whereas
    the step it replaces is an audible tick every P seconds, all night.

    Returns (tilt_db, clamped) -- 0.0 below TILT_THRESHOLD_DB, magnitude
    clamped to TILT_MAX_DB (the caller should WARN and re-cut from a longer
    source when that happens).
    """
    pre, post = result.get("preDb"), result.get("postDb")
    if pre is None or post is None or not period:
        return 0.0, False
    d = (post - pre) / (1.0 - float(wrap) / period)
    if abs(d) < TILT_THRESHOLD_DB:
        return 0.0, False
    if abs(d) > TILT_MAX_DB:
        return (TILT_MAX_DB if d > 0 else -TILT_MAX_DB), True
    return d, False
