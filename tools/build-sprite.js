// Renders every CONDUCTOR sample from the synth engine (reverb included) and writes
// conductor-audio-v3.mp3 + the sample map into index.html.
// Usage: node tools/build-sprite.js   (needs playwright + ffmpeg)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const OUT = 'conductor-audio-v3.mp3';
const SR = 48000, OUT_SR = 32000, MARKER = 0.05, LEAD = 0.35, GAP = 0.05;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('page error:', e.message));
  await page.goto('file://' + path.join(ROOT, 'index.html'));
  await page.waitForTimeout(500);
  const specs = await page.evaluate(() => {
    const out = []; const S = window.CONDUCTOR.Score, L = window.CONDUCTOR.Layers;
    [74, 76, 78, 81, 83, 86].forEach(m => out.push({ name: 'solo_' + m, fn: 'solo', args: [m, 0, 1.0], len: 5.6 }));
    [74, 76, 78, 81, 83].forEach(m => out.push({ name: 'soloOct_' + m, fn: 'melody', args: [m, 0, true], len: 5.6 }));
    S.chords.forEach((c, i) => {
      out.push({ name: 'pad_' + c.name, fn: 'pad', chord: i, args: [0, 4.2], len: 7.4 });
      out.push({ name: 'padHi_' + c.name, fn: 'padHi', chord: i, args: [0, 2.2], len: 5.2 });
      out.push({ name: 'brassPair_' + c.name, fn: 'brassPair', chord: i, args: [0, 0.71], len: 3.6 });
      out.push({ name: 'brassL_' + c.name, fn: 'brassHit', chord: i, args: ['L', 0, 0.75], len: 3.6 });
      out.push({ name: 'brassM_' + c.name, fn: 'brassHit', chord: i, args: ['M', 0, 0.5], len: 3.4 });
      out.push({ name: 'brassS_' + c.name, fn: 'brassHit', chord: i, args: ['S', 0, 0.25], len: 3.2 });
    });
    [62, 64, 66, 69, 71].forEach(m => out.push({ name: 'smel_' + m, fn: 'stringsMel', args: [m, 0, 1.8], len: 5.0 }));
    const winds = [...new Set(S.chords.flatMap(c => L.windsUp(c)))].sort((a, b) => a - b);
    winds.forEach(m => { out.push({ name: 'windsL_' + m, fn: 'winds', args: [m, 0, 0.42, false, true], len: 3.2 });
                         out.push({ name: 'windsS_' + m, fn: 'winds', args: [m, 0, 0.15, true, false], len: 3.0 }); });
    S.chords.forEach(c => out.push({ name: 'timp_' + (c.root - 12), fn: 'timpani', args: [c.root - 12, 0, 1], len: 4.0 }));
    out.push({ name: 'final', fn: 'final', args: [0], len: 9.0, full: true });
    return out;
  });
  console.log(specs.length, 'samples to render');

  const clips = [];
  for (const spec of specs) {
    const b64 = await page.evaluate(async ({ spec, SR }) => {
      const C = window.CONDUCTOR, A = C.Audio; A.sprite.forceSynth = true;
      OfflineAudioContext.prototype.close = function () { return Promise.resolve(); };
      BaseAudioContext.prototype.createDynamicsCompressor = function () { const g = this.createGain(); for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) g[k] = { value: 0 }; return g; };
      A.shutdown();
      window.AudioContext = function () { return new OfflineAudioContext(2, Math.ceil(SR * spec.len), SR); };
      const ctx = A.ensure(); A.synthGraph(); A._setBusFlat();
      if (spec.full) for (const [n, b] of Object.entries(A.bus())) { b.level.gain.value = b.base; if (b.filter) b.filter.frequency.value = 7000; }
      const args = spec.chord !== undefined ? [C.Score.chords[spec.chord], ...spec.args] : spec.args;
      A.play[spec.fn](...args);
      C.Visual.queue.length = 0;
      const buf = await ctx.startRendering();
      const l = buf.getChannelData(0), r = buf.getChannelData(1), n = l.length;
      const f = new Float32Array(n); for (let i = 0; i < n; i++) f[i] = (l[i] + r[i]) * 0.5;
      let s = ''; const u8 = new Uint8Array(f.buffer); for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      return btoa(s);
    }, { spec, SR });
    const f = new Float32Array(Buffer.from(b64, 'base64').buffer.slice(0));
    /* trim the silent tail (below -56 dB), then a 30 ms fade */
    let last = f.length - 1; while (last > 0 && Math.abs(f[last]) < 0.0015) last--;
    const end = Math.min(f.length, last + Math.round(0.03 * SR));
    const clip = f.slice(0, end); const fade = Math.round(0.03 * SR);
    for (let i = 0; i < fade && i < clip.length; i++) clip[clip.length - 1 - i] *= i / fade;
    let pk = 0; for (const x of clip) pk = Math.max(pk, Math.abs(x));
    clips.push({ name: spec.name, data: clip, peak: pk });
    process.stdout.write(`${spec.name} ${(clip.length / SR).toFixed(2)}s pk ${pk.toFixed(3)}  `);
  }
  await browser.close();
  console.log();

  /* each clip is normalised to peak 0.9 for the best MP3 resolution; the runtime restores its level */
  const maxPk = Math.max(...clips.map(c => c.peak));
  let total = Math.round((LEAD) * SR); const map = {};
  for (const c of clips) { c.scale = 0.9 / Math.max(c.peak, 1e-6); map[c.name] = [+(total / SR).toFixed(5), +(c.data.length / SR).toFixed(4), +(1 / c.scale).toFixed(5)]; total += c.data.length + Math.round(GAP * SR); }
  const pcm = new Int16Array(total);
  pcm[Math.round(MARKER * SR)] = 30000;                       /* click marker for encoder-delay alignment */
  let pos = Math.round(LEAD * SR);
  for (const c of clips) { for (let i = 0; i < c.data.length; i++) pcm[pos + i] = Math.max(-32767, Math.min(32767, Math.round(c.data[i] * c.scale * 32767))); pos += c.data.length + Math.round(GAP * SR); }
  const wav = path.join(os.tmpdir(), 'conductor-sprite.wav');   /* intermediate, not part of the project */
  const hdr = Buffer.alloc(44); const dataLen = pcm.length * 2;
  hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + dataLen, 4); hdr.write('WAVE', 8); hdr.write('fmt ', 12); hdr.writeUInt32LE(16, 16);
  hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(1, 22); hdr.writeUInt32LE(SR, 24); hdr.writeUInt32LE(SR * 2, 28); hdr.writeUInt16LE(2, 32); hdr.writeUInt16LE(16, 34);
  hdr.write('data', 36); hdr.writeUInt32LE(dataLen, 40);
  fs.writeFileSync(wav, Buffer.concat([hdr, Buffer.from(pcm.buffer)]));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-ar', String(OUT_SR), '-codec:a', 'libmp3lame', '-b:a', '80k', path.join(ROOT, OUT)]);
  const size = fs.statSync(path.join(ROOT, OUT)).size;
  console.log(`sprite: ${clips.length} samples, ${(total / SR).toFixed(1)} s, loudest ${maxPk.toFixed(3)}, ${OUT} ${(size / 1048576).toFixed(2)} MB`);

  const html = path.join(ROOT, 'index.html'); let src = fs.readFileSync(html, 'utf8');
  const obj = { url: OUT, rate: OUT_SR, marker: MARKER, map };
  src = src.replace(/\/\*SPRITE-MAP\*\/[\s\S]*?\/\*END-SPRITE-MAP\*\//, '/*SPRITE-MAP*/' + JSON.stringify(obj) + '/*END-SPRITE-MAP*/');
  fs.writeFileSync(html, src);
  console.log('index.html sample map updated');
})();
