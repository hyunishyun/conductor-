# CONDUCTOR — gesture tutorial for Meta Ray-Ban Display

*One gesture begins a note. Every gesture brings your orchestra to life.*

A standalone Web App (single `index.html`, no build step, no dependencies) that teaches the
Meta Ray-Ban Display control actions by turning the wearer into the conductor of an orchestra.
Every supported gesture produces an immediate musical response; the melody played by the very
first pinch grows into a full orchestral movement.

## Files

| File | Purpose |
|---|---|
| `index.html` | The complete app. Host this file at a public HTTPS URL for the glasses. |
| `README.md` | This document. |

## Running it on a desktop browser

Open `index.html` directly (double-click) or serve it locally, e.g. `npx serve .` or
`python3 -m http.server 8000`, then open `http://localhost:8000/`. Chrome is the reference
browser (the glasses runtime and the official simulator are both Chromium-based).

Keyboard controls (these are the exact events the glasses send):

| Key | Glasses gesture | Meaning |
|---|---|---|
| `Enter` | Pinch (activation) | Cue / select. Chapter 1: one press = one note. |
| `Arrow ← →` | D-pad swipe left / right | Choose an instrument section |
| `Arrow ↑ ↓` | D-pad swipe up / down | Chapter 3 & 5: dynamics of the selected section. Chapter 4: tempo. |
| `Escape` | Back gesture | Ask to restart (Enter confirms, Escape cancels) |
| Pointer drag | Pinch-and-drag (opt-in, Chapter 4+) | Sweep the tempo continuously |
| `Space` | — | Desktop-only alias for Enter |
| `D` | — | Toggle the developer overlay (also `#dev` in the URL) |

## How the music engine works

Everything is synthesized with the Web Audio API at runtime; there are no audio files,
no third-party services and nothing copyrighted.

**Silence until the first gesture.** No `AudioContext` exists until the first `Enter`
keydown. `Audio.ensure()` is only ever called from inside the input handler, which is
what browser autoplay policies require. If the context comes up `suspended`, it is resumed
in the same handler and the first note is scheduled at `currentTime + 10 ms`, so it sounds
the moment the context runs. Restarting closes the context entirely; the next run builds a
fresh one from the next pinch.

**Signal chain.** Five buses — `solo`, `strings`, `winds`, `brass`, `perc` — each go
through an optional lowpass filter (brightness) and a level gain (dynamics), then into a
master gain, a gentle compressor and the destination. Every bus also has a send into a
`ConvolverNode` whose impulse response is generated in code (2.8 s exponentially decaying
stereo noise), which gives every note its hall reverberation.

**Voices.** Each instrument is a small additive/subtractive patch with attack, sustain and
release envelopes:
- *Soloist* (the first note): sine + triangle + two soft partials with a fast attack and
  exponential decay, plus a slow sine "bloom" an octave below — harp-like, with body.
- *Strings*: three detuned sawtooths with delayed vibrato and a 0.3 s bow attack, plus a
  filtered bass on the chord root.
- *Woodwinds*: triangle + sine with vibrato and a short filtered-noise breath transient.
- *Brass*: two sawtooths + sub-square through a per-note lowpass whose cutoff opens on
  the attack and settles, giving the characteristic brass "bite".
- *Timpani* (finale only): sine with a pitch drop plus a low noise thump.

**Shared clock.** `Clock` is a single look-ahead scheduler (160 ms window, 25 ms timer) that
counts 16th-note steps. Every section's pattern is a pure function of the same step number
and the same step time, so layers cannot drift relative to one another. A section that joins
mid-bar starts on the very next scheduler step; strings and brass additionally fill the rest
of the current bar immediately, so the join is heard at once without waiting for bar 1.

**Tempo.** Changing the BPM only changes the length of *future* steps
(`nextTime += 60 / bpm / 4`). Notes already handed to the audio thread keep their times, so a
tempo change never re-triggers or restarts anything; it simply bends the grid from the next
step on. The finale's ritardando is the same mechanism applied a little each step.

**Dynamics.** Intensity (0–1, in 1/8 steps) drives the bus gain with `setTargetAtTime` and
the bus lowpass cutoff (500 Hz → 7 kHz), so a crescendo gets louder *and* brighter with no
zipper noise. The dynamic marking shown under each section (pp … fff) is derived from the
same value.

**The composition.** An original two-bar melody in D major (D E F♯ A | B A F♯ D) over a
four-bar progression D – Bm – G – A. Chapter 1 hands the melody to the wearer one note per
pinch; when the 8th note lands, the clock starts and the soloist repeats the phrase. Strings
sustain the chords, woodwinds arpeggiate them an octave up, brass marks the half-bars. In
the finale the same melody is doubled at the octave, the strings take it in their register,
the woodwinds move to 16ths, the brass plays a fanfare rhythm and timpani enter. The
resolution is a one-bar ritardando into a held D-major chord in every section.

**Lifecycle.** On `visibilitychange` → hidden the clock pauses and the context is
suspended; on return both resume from where they were (no drift, because the context's clock
stops too). `pagehide` closes the context.

## Chapters and what each input does

1. **The First Note** — `Enter` plays exactly one note. Eight presses play the melody; the
   8th press starts the shared clock and the phrase repeats. Arrow keys do nothing here.
2. **Find Your Orchestra** — `← →` moves the focus cursor across Strings / Woodwinds / Brass
   (visual only, no musical action). `Enter` brings the focused section in.
3. **Shape the Music** — `↑ ↓` raise or lower the focused section's dynamics; the crescendo
   challenge completes when the average intensity of the joined sections reaches ff.
4. **Conduct the Tempo** — `↑ ↓` change the tempo ±4 BPM (keyboard fallback); pinch-and-drag
   sweeps it continuously. Reaching Allegro (≥108) completes the chapter.
5. **The Finale** — `Enter` cues the full orchestra (phase 2 starts on the next bar);
   `← → ↑ ↓` still shape sections; a second `Enter` brings the movement home
   (ritardando → final chord → completion animation → "Pinch to conduct again").

## What is real and what is a placeholder

Real and working in this build:
- All five chapters, the audio engine, the shared clock, section joins, dynamics, tempo
  (keys and pointer drag), the finale with resolution, restart, Escape confirmation.
- Input guards: key auto-repeat ignored, duplicate `keydown` without `keyup` ignored,
  the same action cannot fire twice within 80 ms, pointer drag needs 8 px of movement.

Placeholders / simplifications:
- The orchestra graphics are abstract glyphs, not modelled musicians.
- Google Fonts are linked for the display typography; if the glasses cannot reach
  fonts.googleapis.com the page falls back to system serif/sans faces and still works.
- Chapter 3's "challenge" measures average intensity, not any analysis of the wearer's
  gesture quality. The app never claims to evaluate finger position or technique.
- There is no persistence; each session starts from the silent overture.

## Verifying behaviour yourself

Press `D` for the developer overlay. It shows:
- **Audio** — whether an `AudioContext` exists (it must read *none* until the first pinch),
  its state, the number of *user-triggered* notes and of scheduled voices.
- **Clock** — running state, BPM, current step / bar / position, step length in ms.
- **Layers** — for each section: joined, the step it joined on, and the last step and
  audio time it scheduled. Because every layer reads the same step, layers that are on
  should show the same `last` step at the same `@time`. The overlay flags `DRIFT` if any
  active layer falls more than a bar behind the head.
- **Log** — timestamped events: context creation, each user note, joins, tempo changes,
  finale phases, the final chord time, restart.

From the browser console `window.CONDUCTOR` exposes every module. `CONDUCTOR.Audio.ctx()`
returns `null` before the first gesture; `CONDUCTOR.Audio.stats.userNotes` counts notes
that user input triggered; `CONDUCTOR.Layers.layers` gives the per-section step bookkeeping.

An automated headless-Chromium run of this build passed 24 checks: silence before input,
exactly one note on the first Enter, auto-repeat / duplicate / rapid-input rejection, melody
completion and clock start, navigation without joining, joining, four layers on one grid
with 0 ms error, dynamics changing gain and cutoff, tempo change with alignment preserved,
pointer-drag tempo, finale phases, resolution, and restart back to a context-free silent
state.

## Testing with the Meta Ray-Ban Display Web App Simulator

1. Install the **Meta Ray-Ban Display Simulator** Chrome extension from the Chrome Web
   Store (linked from https://wearables.developer.meta.com/docs/develop/webapps/test/).
2. Open your app URL in Chrome (a local `http://localhost` server is fine for the
   simulator) and click the extension icon to turn the simulator on. It frames the page at
   600 × 600 and shows on-screen D-pad and Select controls that dispatch the same
   `ArrowUp/Down/Left/Right` and `Enter` keyboard events the glasses send.
3. Walk the chapters with the on-screen controls or the physical arrow keys / Enter.
4. Use the simulator's **View on Glasses QR** to generate a deep-link QR for installing on
   your own glasses (this needs the public HTTPS URL below).

Meta's own note applies: the simulator is not a substitute for device validation.

## Hosting at a public HTTPS URL and opening it on the glasses

The glasses runtime only loads Web Apps from a publicly accessible **HTTPS** URL. Any static
host works; the app is a single file. Examples:

- **GitHub Pages**: push `index.html` to a repo, Settings → Pages → deploy from `main`.
- **Netlify / Vercel / Cloudflare Pages**: drag the folder in, or connect the repo.

Then, on the glasses:

1. In the Meta AI app go to Settings → App Info and tap the version number five times to
   reveal **Developer Mode**; switch it on. (Requires glasses software v125+ and Meta AI
   app v272+.)
2. Either scan the install QR generated by the simulator, or in the Meta AI app open
   **App Settings → Apps → Web Apps → Connect Web App**, enter the HTTPS URL and save.
3. Launch CONDUCTOR from the glasses. The screen shows the waiting orchestra; pinch once.

## What still needs verification on the actual glasses

These could not be verified inside this development environment and are called out rather
than simulated:

1. **Web Audio playback through the glasses speaker.** Meta's documentation states that
   Web Apps get audio playback through the glasses speaker and documents `speechSynthesis`,
   but it does not explicitly mention `AudioContext`. Confirm that the first pinch produces
   sound on hardware, and check whether the context starts `suspended` and needs the
   in-gesture `resume()` (already implemented).
2. **Low-frequency reproduction.** The bass and timpani voices sit around 70–150 Hz; the
   glasses' speakers may reproduce these weakly. Bass roots are already voiced an octave
   above the very lowest register; adjust `Score.chords[].root` if needed.
3. **Latency.** The desktop path from keydown to sound is a few ms; on device the pinch →
   Enter → audio path has unknown latency. If it feels loose, nothing in the engine needs
   to change, but the visual cue timing (`Visual.queue` lead of 12 ms) may want adjusting.
4. **Pinch-and-drag.** The opt-in (`touch-action: none` on `<body>` in the initial
   stylesheet) and the `pointerdown/move/up` handling follow the documentation, but the
   actual `clientX` scale of a wearer's arm movement is unknown. The tempo gain is
   `0.22 BPM per px` (`Game.setTempo` call in the `drag` handler); tune it on device.
   Also confirm whether a plain pinch on device emits *both* a pointer sequence and an
   `Enter` — the drag handler ignores pointer sequences under 8 px, so a plain pinch will
   not change tempo, but this is untested on hardware.
5. **Additive display legibility.** The design uses cyan / ivory / gold on pure black; the
   waiting-state musicians are drawn at ~13 % brightness, which may be invisible on the
   additive display in bright surroundings. Raise the `base` value in `Visual.draw` if so.
6. **Frame rate.** The canvas draws ~25 radial gradients per frame plus particles. Fine on
   desktop; verify it holds up on the glasses and reduce `spawn()` counts if not.
7. **Google Fonts reachability** from the glasses' network.
8. **Escape / back gesture behaviour**: whether the system consumes the back gesture before
   the page sees `Escape` (in which case the in-app restart prompt is reached only from the
   keyboard).

## Extending the composition

- `Score.melody` / `Score.chords` hold all musical material; `Layers.onStep` holds the
  arrangement per section and per finale phase.
- New sections: add a bus in `Audio.BUS`, a voice function, a branch in `Layers.onStep`,
  a cluster in `Visual.SEC`, and the name in `Game.SECTIONS`.
- New chapters: add an entry in `Game.CH` and a `case` in `Game.onAction`.
