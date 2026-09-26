# CONDUCTOR — gesture tutorial for Meta Ray-Ban Display

*One gesture begins a note. Every gesture brings your orchestra to life.*

A standalone Web App (single `index.html`, no build step, no dependencies) that teaches the
Meta Ray-Ban Display / Meta Neural Band control gestures by turning the wearer into the
conductor of an orchestra. An animated hand shows each gesture as it is introduced, every
gesture produces an immediate musical response, and the melody played by the very first
pinch grows into a full orchestral movement.

Version: **0.2.0** (shown in the dev overlay).

## What changed in 0.2

**Audio no longer breaks up on the glasses.** In 0.1 the finale reached 174 simultaneous
sound sources, and the engine rendered only 2.7× faster than real time on a desktop CPU,
with digital clipping (peak 1.17). The glasses' processor could not keep up once more
sections joined. Measured with the same finale in an offline render:

| | v0.1 | v0.2 |
|---|---|---|
| Peak simultaneous sources | 177 | 57 |
| Sources created over 8 finale bars | 1712 | 571 |
| Render speed (desktop CPU) | 2.7× real time | 6.9× real time |
| Peak level / clipped samples | 1.17 / 24 | 0.89 / 0 |

How: a voice budget with per-section caps and oldest-note stealing (40 ms fade), tails that
stop once inaudible, one shared vibrato LFO per section, brass chords sharing one filter,
two saws per string note (one for doublings), no per-note bass filter, short woodwind breath
noise, a lighter looping solo voice (the first pinch keeps the full, rich voice), a 2.0 s
reverb (was 2.8 s), a brick-wall limiter, a 350 ms scheduler lookahead (was 160 ms),
`latencyHint: 'balanced'`, and pre-rendered glow sprites that take load off the main thread.

**The gesture guide is now the centre of the app.** A line-art hand (right hand, thumb side)
demonstrates each gesture large in the middle of the stage when it is introduced, names it,
and describes the motion. On the first correct input it shrinks into a dock of small icons at
the bottom, which stays as a reminder. Icons flash gold when their input arrives, pulse when a
different gesture was used, and the big demo replays after 7 s without the expected input.

**A new chapter teaches Back.** Pinch opens a section's card (the other sections drop away
so the chosen one plays alone); the middle-finger pinch demo appears; Back closes the card
and the orchestra returns. The wearer does it once guided and once alone. Back from the main
stage opens a pause popup: Pinch restarts, Back keeps conducting.

## Gestures and the inputs they produce

| Gesture (Meta Neural Band) | Hand animation | Event the app receives |
|---|---|---|
| Pinch — thumb to index finger | Thumb taps the index fingertip, gold spark | `Enter` |
| Swipe — thumb along the side of the index finger | Thumb slides along the finger, horizontal chevrons | `ArrowLeft` / `ArrowRight` |
| Swipe up / down | Thumb slides across the finger, vertical chevrons | `ArrowUp` / `ArrowDown` |
| Pinch and drag (opt-in) | Pinched hand moves side to side | `pointerdown/move/up` |
| Back — thumb to middle finger | Index lifts, thumb taps the gold middle finger | `Escape`, or history back |

The guide reacts to input events only. It cannot see the wearer's hand and never claims to.

Desktop keys: `Enter` (or `Space`) = pinch, arrows = swipes, `Escape` = Back, mouse drag =
pinch-and-drag, `D` = developer overlay.

## Chapters

1. **The First Note** — one pinch, one note. Eight pinches play the melody; the shared clock
   then starts and the phrase repeats.
2. **Find Your Orchestra** — swipe left/right to move between Strings, Woodwinds and Brass
   (visual only); pinch brings the focused section in.
3. **Step Back** — pinch opens a section's card (that section plays alone), Back closes it.
   Twice.
4. **Shape the Music** — swipe up/down changes the focused section's dynamics; crescendo to ff.
5. **Conduct the Tempo** — pinch and drag sweeps the tempo; swipe up/down also changes it
   (±4 BPM). Reach Allegro (108).
6. **The Finale** — pinch cues the full orchestra, pinch again brings it home: ritardando,
   final chord, "Bravo", then "Pinch to conduct again".

## How the music engine works

Everything is synthesized with the Web Audio API; there are no audio files and no services.
No `AudioContext` exists until the first `Enter`; it is created inside that handler and the
first note is scheduled 10 ms later. A single lookahead scheduler counts 16th-note steps and
every section's pattern is a function of that step and its time, so layers cannot drift.
Tempo changes only alter the length of future steps. Dynamics move each section's bus gain and
lowpass cutoff with smooth `setTargetAtTime` ramps; the Back chapter uses a separate duck gain
per section, and the pause popup ducks the master. Hiding the page suspends the context and
the clock; returning resumes both. Restart closes the context entirely.

Back handling: the Meta docs say Back arrives as `Escape` or as `history.back()`. When a popup
opens the app adds one history entry. If the system goes back through history, `popstate`
closes the popup instead of leaving the app. The app never calls `history.back()` itself, so a
Back cannot be applied twice.

## Testing

Desktop: open `index.html` in Chrome, click the page, press Enter. Press `D` for the overlay.

Simulator: install the **Meta Ray-Ban Display Simulator** Chrome extension, open the hosted URL,
switch the simulator on and use its D-pad and Select buttons.

Glasses: host at a public HTTPS URL (GitHub Pages) and connect it in the Meta AI app under
App Settings → Apps → Web Apps → Connect Web App. For diagnostics on the glasses, connect a
second Web App with the same URL plus `#dev` (for example
`https://yourname.github.io/conductor/#dev`); it opens with the overlay showing.

The overlay shows: audio state and latency, sources allocated now and peak (this includes the
350 ms already scheduled ahead, so it reads higher than the number actually sounding), stolen
notes, the latest-scheduled note lateness, the scheduler's longest timer gap, clock resyncs,
the expected gesture, card/pause state and a timestamped log (including visibility changes).

An automated headless-Chromium run of this build passed 28 checks covering silence before
input, one note per first pinch, repeat/duplicate/rapid-input rejection, the idle hint, every
chapter transition, the card and both Back paths (Escape and history), the pause popup,
dynamics, drag tempo, four layers on one grid, the finale and restart.

## Still to verify on the glasses

1. **Stutter gone?** Play through the finale. If it still breaks up, open the `#dev` Web App
   and note `max timer gap`, `late notes max`, `resyncs` and `stolen` near the finale.
2. **Back gesture delivery.** Does the middle-finger pinch close the card, or leave the app
   for the system menu? The log shows whether it arrived as a key or as `history back`.
3. **Swipe direction.** Compare with the glasses' own tutorial. If thumb-toward-fingertip
   produces `ArrowRight` rather than `ArrowLeft`, set `SWIPE_FLIP = true` in the Gestures
   module so the chevrons match.
4. **Legibility of the hand** on the additive display in daylight, and whether the 0.3 stage
   dim behind the big demo is enough.
5. **Pinch and drag** scale (`0.22 BPM per px`) and whether a plain pinch also produces a
   pointer sequence.
6. **Web Audio through the glasses speaker** — already working per your test.

## Extending

`Score` holds the musical material, `Layers.onStep` the arrangement, `Gestures.INFO` the
gesture names and descriptions, `Gestures.pose` the hand animation per gesture, and
`Game` the chapters (`firstCue`, `enter2`…`enter6`, `onAction`, `expected`).
