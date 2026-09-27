# CONDUCTOR — gesture tutorial for Meta Ray-Ban Display

*One gesture begins a note. Every gesture brings your orchestra to life.*

A standalone Web App that teaches the Meta Ray-Ban Display / Meta Neural Band control gestures
by turning the wearer into the conductor of an orchestra. An animated hand shows each gesture
as it is introduced, every gesture produces an immediate musical response, and the melody
played by the very first pinch grows into a full orchestral movement.

Version: **0.3.0** (shown in the dev overlay).

## Files

| File | Needed on the web host | Purpose |
|---|---|---|
| `index.html` | yes | The app. |
| `conductor-audio-v3.mp3` | yes | All instrument samples in one file (1.3 MB), next to `index.html`. |
| `README.md` | no | This document. |
| `tools/build-sprite.js` | no | Rebuilds the MP3 from the synth (Node + Playwright + ffmpeg). |

Upload `index.html` and `conductor-audio-v3.mp3` together. If the MP3 is missing or cannot be
loaded, the app still runs on the built-in synthesizer (the heavier v0.2 engine).

## What changed in 0.3 — audio on the glasses

Web Apps run on the glasses' own low-power processor. v0.2 synthesized every note live
(oscillators, filters, a convolution reverb, vibrato LFOs), and on the glasses the sound broke
up from the moment sections joined in Chapter II. v0.3 plays pre-rendered samples instead.

`tools/build-sprite.js` renders every note, chord and the final chord from the v0.2 synth,
with the hall reverb baked in, normalises each one, and packs them into one MP3 sprite with a
click marker at the start. At runtime:

- the sprite is fetched and decoded while the silent opening screen is showing, through an
  `OfflineAudioContext`, so no playing `AudioContext` exists before the first pinch;
- the click marker is located to cancel any MP3 encoder delay (measured alignment error
  under 1 ms for percussive samples);
- each note is one `AudioBufferSourceNode` + one `GainNode` reading its region of the shared
  buffer; a string chord is one sample instead of seven oscillators;
- there is no live reverb, no LFO and no per-note filter; the per-section gain and brightness
  filter, the Back-chapter duck and the pause duck work as before;
- sounding notes per section are capped (solo 4, strings 5, woodwinds 4, brass 3, timpani 2)
  and a displaced tail fades over ~0.2 s like a natural decay;
- the engine is chosen when the context is created and kept until restart;
- a +3.8 dB make-up gain matches the loudness of v0.2 (measured within ±0.8 dB).

The canvas is also capped at 30 fps, halving the drawing work that competes with audio.

Measured headroom (desktop CPU, notes scheduled 350 ms ahead exactly like the live app;
higher is better — v0.2 started breaking up on the glasses at about 12×):

| | Chapter I | Chapter II | Finale |
|---|---|---|---|
| v0.1 synth | 19.4× | 7.0× | 3.4× |
| v0.2 synth | 24.6× | 12.2× | 7.7× |
| **v0.3 samples** | **97.5×** | **64.0×** | **45.9×** |
| v0.3 synth fallback | 29.9× | 13.1× | 8.3× |

A correction to the 0.2 notes: the 0.2 figures were measured with every note scheduled
before rendering. That method slows down with the total number of notes (not-yet-started
nodes are processed too), so it overstated the load. The table above uses live-style
scheduling for every version.

## What 0.2 added

**Gesture guide.** A line-art hand (right hand, thumb side) demonstrates each gesture large in
the middle of the stage when it is introduced, names it and describes the motion. On the first
correct input it shrinks into a dock of small icons at the bottom. Icons flash gold when their
input arrives, pulse when a different gesture was used, and the big demo replays after 7 s
without the expected input.

**Back chapter.** Pinch opens a section's card (that section plays alone), the middle-finger
pinch demo appears, Back closes the card and the orchestra returns — once guided, once alone.
Back from the main stage opens a pause popup: Pinch restarts, Back keeps conducting.

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
2. **Find Your Orchestra** — swipe left/right between Strings, Woodwinds and Brass (visual
   only); pinch brings the focused section in.
3. **Step Back** — pinch opens a section's card, Back closes it. Twice.
4. **Shape the Music** — swipe up/down changes the focused section's dynamics; crescendo to ff.
5. **Conduct the Tempo** — pinch and drag sweeps the tempo; swipe up/down also changes it.
   Reach Allegro (108).
6. **The Finale** — pinch cues the full orchestra, pinch again brings it home: ritardando,
   final chord, "Bravo", then "Pinch to conduct again".

## Timing and structure

A single lookahead scheduler (350 ms) counts 16th-note steps; every section's pattern is a
function of that step and its time, so layers cannot drift, and tempo changes only alter the
length of future steps. Sustained samples (string chords, doublings) are cut at the note's end
with a short release, so they follow any tempo between 60 and 140 BPM. Hiding the page
suspends the context and the clock; restart closes the context entirely.

Back handling: when a popup opens the app adds one history entry. If the system Back goes
through history, `popstate` closes the popup instead of leaving the app. The app never calls
`history.back()` itself.

## Testing

**Desktop:** the MP3 must be served over HTTP; opened by double-click (`file://`) the browser
blocks the fetch and the app uses the synth fallback. In the CONDUCTOR folder run
`python -m http.server 8000` and open `http://localhost:8000/`. Press `D` for the overlay; its
first line shows `engine: samples · samples ready`.

**Simulator:** install the Meta Ray-Ban Display Simulator Chrome extension and open the hosted
URL.

**Glasses:** host both files at a public HTTPS URL (GitHub Pages) and connect it in the Meta AI
app under App Settings → Apps → Web Apps → Connect Web App. For diagnostics, connect a second
Web App with `#dev` appended (for example `https://yourname.github.io/conductor/#dev`).

Overlay fields: engine and sample state, audio state and latency, sources allocated (includes
the 350 ms scheduled ahead), stolen notes, the latest-scheduled note lateness, the scheduler's
longest timer gap, clock resyncs, the expected gesture, card/pause state and a log (sample
loading time, visibility changes, Back source).

Automated headless-Chromium runs of this build: 30/30 checks with samples, 30/30 with the synth
fallback, plus a check that a sprite arriving after the first pinch keeps that session on the
synth and switches to samples after restart.

## Still to verify on the glasses

1. **Stutter gone?** Play through Chapter II and the finale. In the `#dev` Web App the overlay
   must show `engine: samples`. If it still breaks up, note `max timer gap`, `late notes max`,
   `resyncs` near the break.
2. **Sample loading** time on the glasses (logged as `samples ready … ms`).
3. **Back gesture delivery** — closes the card, or leaves the app? The log shows the source.
4. **Swipe direction** — if thumb-toward-fingertip produces `ArrowRight`, set `SWIPE_FLIP = true`.
5. **Legibility of the hand** on the additive display in daylight.
6. **Pinch and drag** scale (`0.22 BPM per px`).

## Rebuilding the samples

After changing a synth voice or the score, run `node tools/build-sprite.js` in the CONDUCTOR
folder (requires Node, `npm i playwright`, and ffmpeg). It rewrites `conductor-audio-v3.mp3`
and the sample map inside `index.html`. Give the MP3 a new name (`OUT` in the script) whenever
its content changes, so browsers never mix an old sprite with a new map.

## Extending

`Score` holds the musical material, `Layers.onStep` the arrangement, `Audio.play` the musical
API (each call picks samples or synth), `Gestures.INFO` / `Gestures.pose` the hand guide, and
`Game` the chapters (`firstCue`, `enter2`…`enter6`, `onAction`, `expected`).
