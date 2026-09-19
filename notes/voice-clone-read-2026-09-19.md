# A bedtime read, for cloning

Yes: you read a bedtime story once so a machine can read you a hundred. That
is the whole trade, and it is a good one.

## Why this exists

Your June recordings are 31.7 minutes of **question-answering Andrew**, and a
clone made from them sounds like it. The 2026-09-14 measurements say why, and
they say the problem is not the one we assumed:

| | median F0 | interquartile range |
|---|---|---|
| You, answering questions | 98.5 Hz | 88–115 Hz (27 Hz wide) |
| ElevenLabs `stone`, your pick | 87.9 Hz | 82–97 Hz (15 Hz wide) |

Pitching the reference down by three semitones lands your *median* on
`stone`. It cannot touch the *range*, and the range is nearly double. That
spread is what "explaining something" sounds like, and no amount of
shifting a reference clip removes it — it has to not be there in the first
place. Hence: read something, in the voice you would actually use.

Everything below is built for that. The script is a real sleep story rather
than a phonetic word list, because you will read a list like a list.

---

## How to record it

**Same rig as June.** The booth, the Tr mic, the same distance. Matching the
existing set matters more than improving on it — if the new material is
brighter or closer than the old, the two can't be pooled.

**Format:** mono, 48 kHz or higher, 24-bit or float. No noise reduction, no
compression, no EQ. Keep the raw file; I'll normalise and cut references.

**Delivery — this is the part that matters.** You are not performing and you
are not narrating. You are reading to someone who is already most of the way
asleep and will not remember the ending.

- **Every sentence ends lower than it started.** No sentence turns upward,
  including the ones that look like they should.
- **Don't lift at commas.** A comma is a breath, not a signal that more is
  coming.
- **No emphasis.** Resist the word you want to lean on. Let it go by flat.
- **Quiet, but not whispered.** Whisper strips the pitched excitation a
  cloner needs. Speak low and close, at the volume you'd use so as not to
  wake someone in the same room.
- **Slow — about 120 words a minute.** That is slower than it will feel. The
  whole script should take you six or seven minutes. If you finish in four,
  it's wrong.
- **Leave the breaths in.** Audible, unhurried, unedited.
- **Don't smile.** It lifts the formants and you can hear it.

**Takes.** Four marked below. Stop between them, breathe, start the next.
Restart any take you dislike rather than patching a line. If you have the
patience for a second full pass, do it — twice the material makes a
noticeably better clone.

---

## The read

### Take one

There is nothing left to do tonight. The door is shut behind you and the
cold is on the other side of it, and the house has that particular silence a
house has when it has been empty since morning and is only now beginning to
notice you.

Your coat is heavier than it was. Snow does that. It has gone from a
weather thing to a wet weight across your shoulders, and you hang it on the
hook by the jamb where it will drip onto the tiles, and the tiles will not
mind. The third hook. The one that has always been yours.

Your boots come off without your hands. Heel against toe, then the other,
and you leave them where they fall because no one is coming, and no one
would judge you if they did.

### Take two

The kitchen is warm in the way old kitchens are, which is unevenly. The
boiler is in the cupboard under the stairs and it has been going since four,
and it makes that low rushing noise that you stopped hearing years ago and
can only hear now because you are listening for it.

You fill the kettle. Not because you especially want anything, but because
it is a thing the hands know, and there is a small pleasure in letting
them do it. The
water goes on, and the tap coughs once, the way it always does, and then
runs clear.

There is a yellow jug on the shelf with a chip out of the lip, and a
measuring cup beside it, and behind them both a jar of something you keep
meaning to throw away. The window over the sink has gone entirely black, and
you can see the room in it, and yourself in the room, quite far away.

### Take three

The stairs are the loud part of the house. The fourth one from the bottom
and the one at the top, and you have known which is which since you were
young enough to be sneaking, and your feet still avoid them without asking
you.

The landing is dark. There is a thin grey light from the window at the end
of it, enough to see the shape of the banister and the edge of the rug, and
that is all the light you need for a journey you have made ten thousand
times.

The cat is on the chair, and does not get up, and watches you go past with
the particular unhurried attention of something that has already decided you
are not interesting. Somewhere below, the boiler changes its mind about
something, and settles.

### Take four

The bedroom is cold at the edges and warm where the bed is. You get in
without ceremony, and the sheets are cool for a moment and then they are
not. The blanket on top is wool, and smells faintly of the cupboard it
spends the summer in, and you are not sure that you have ever washed it.

There is no choice left in the day. That is the good part. Every decision
that was going to be made has been made, well or badly, and none of them can
be reached from here.

Outside, the snow is still coming down, and it is the kind that falls
straight, with no wind in it at all. You can hear it, or you think you can —
that soft crowded hush of a great many small things arriving at once, on the
roof, on the sill, on the garden that will be unrecognisable by morning and
does not need you to see it.

The clock in the hall makes its small sound on the hour. You do not count
it. There is no measure of the night you are responsible for, and no version
of tomorrow that needs deciding tonight.

The room is quiet. The house is quiet. The snow goes on falling in the dark,
gently, for hours, whether or not anyone is awake to watch it.

---

## Afterwards

Drop the file anywhere in `~/sounds` and say so. Then:

1. Normalised to −23 LUFS, matching every other reference in the audition.
2. Twenty-second reference clips cut for **XTTS v2 and StyleTTS2**, which are
   the two engines that render your voice with no smearing at all. Those need
   only seconds of material, so they can be judged the same day.
3. The full read used for **ElevenLabs instant cloning**, which wants one to
   three minutes.
4. Rendered against the same passage and the same `rain-on-window` bed as the
   other 31 audition files, so it drops straight into the comparison you
   already have.

**If you want the professional clone** — your account has it — the threshold
is around thirty minutes of audio, which this script is nowhere near. The
neat answer is to read the library itself: `public/stories/*.txt` are four
finished sleep stories in exactly the delivery you want, about 11,000 words
between them. Two of them plus this script clears the bar at roughly fifty
minutes. You would be reading real bedtime stories to build the voice that
reads bedtime stories, which is either perfectly circular or the only
sensible way to do it.
