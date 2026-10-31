/* --------------------------------------------------------------------------
 * Silly voices: record a few seconds from the microphone, then play it back
 * faster (higher, a chipmunk) or slower (lower, a giant). Needs audio.js.
 *
 *   Voice.record({ onLevel, onDone })   start; onLevel(0..1) as the voice
 *                                       gets louder, onDone(ok) when it's
 *                                       stopped and ready (ok is false if
 *                                       there's no mic, it was refused, or
 *                                       nothing was heard)
 *   Voice.stop()                        stop recording early
 *   Voice.recording()                   true while recording
 *   Voice.has()                         true once there's a clip to play
 *   Voice.play(rate)                    1 is as recorded, 2 an octave up
 *
 * The clip lives in memory only, so it's gone when the app is closed. It's
 * trimmed to the voice (no silence before or after) and leveled, so a tap
 * plays straight away at a steady volume.
 *
 * The microphone needs a secure page: https (GitHub Pages) or localhost.
 * Safari won't offer it to a page opened straight off disk.
 * ----------------------------------------------------------------------- */

const Voice = (() => {
  const MAX_SECONDS = 5;
  const QUIET = 0.02;   // below this a sample counts as silence

  let clip = null;
  let rec = null;       // { recorder, stream, chunks, timer, raf, onDone }

  const supported = () =>
    !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

  // iOS: recording needs the audio session to allow input; back to plain
  // playback afterwards, so the silent switch keeps leaving the app alone.
  function session(type) {
    try { if (navigator.audioSession) navigator.audioSession.type = type; } catch (e) {}
  }

  async function record({ onLevel = () => {}, onDone = () => {} } = {}) {
    if (rec) return;
    const c = Sound.unlock();
    if (!c || !supported()) { onDone(false); return; }

    rec = { chunks: [], onDone };
    const mine = rec;
    session('play-and-record');
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch (e) {
      rec = null;
      session('playback');
      onDone(false);
      return;
    }
    // stopped (or the screen left) while the permission prompt was up
    if (rec !== mine) {
      stream.getTracks().forEach(t => t.stop());
      session('playback');
      return;
    }
    Sound.unlock();   // a session change can suspend the context

    rec.stream = stream;
    rec.recorder = new MediaRecorder(stream);
    rec.recorder.addEventListener('dataavailable', e => { if (e.data.size) mine.chunks.push(e.data); });
    rec.recorder.addEventListener('stop', () => finish(mine));
    rec.recorder.start();
    rec.timer = setTimeout(stop, MAX_SECONDS * 1000);

    // how loud, for the pulsing ring; the analyser only listens, through a
    // muted gain, so the mic isn't heard through the speaker
    const src = c.createMediaStreamSource(stream);
    const analyser = c.createAnalyser();
    analyser.fftSize = 1024;
    const mute = c.createGain();
    mute.gain.value = 0;
    src.connect(analyser);
    analyser.connect(mute);
    mute.connect(c.destination);
    const data = new Float32Array(analyser.fftSize);
    const tick = () => {
      analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (const x of data) sum += x * x;
      onLevel(Math.min(1, Math.sqrt(sum / data.length) * 6));
      mine.raf = requestAnimationFrame(tick);
    };
    tick();
    rec.cleanup = () => {
      cancelAnimationFrame(mine.raf);
      src.disconnect();
      mute.disconnect();
    };
  }

  function stop() {
    if (!rec) return;
    clearTimeout(rec.timer);
    if (rec.recorder?.state === 'recording') rec.recorder.stop();   // finish() follows
    else if (!rec.recorder) {
      // still waiting on the permission prompt
      const { onDone } = rec;
      rec = null;
      session('playback');
      onDone(false);
    }
  }

  async function finish(r) {
    r.cleanup?.();
    r.stream.getTracks().forEach(t => t.stop());
    session('playback');
    if (rec === r) rec = null;
    let ok = false;
    try {
      const blob = new Blob(r.chunks, { type: r.recorder.mimeType });
      const c = Sound.unlock();
      const raw = await c.decodeAudioData(await blob.arrayBuffer());
      const trimmed = trim(c, raw);
      if (trimmed) { clip = trimmed; ok = true; }
    } catch (e) { /* couldn't decode it; keep whatever clip there was */ }
    r.onDone(ok);
  }

  // Cut the silence off both ends and bring the loudest part up to 0.9.
  // Null if nothing was heard at all.
  function trim(c, buf) {
    const chans = [...Array(buf.numberOfChannels)].map((_, i) => buf.getChannelData(i));
    const loud = i => chans.some(ch => Math.abs(ch[i]) > QUIET);
    let a = 0;
    let b = buf.length - 1;
    while (a < buf.length && !loud(a)) a++;
    if (a >= buf.length) return null;
    while (b > a && !loud(b)) b--;
    const pad = Math.round(0.04 * buf.sampleRate);
    a = Math.max(0, a - pad);
    b = Math.min(buf.length - 1, b + pad);

    let peak = 0;
    for (const ch of chans) for (let i = a; i <= b; i++) peak = Math.max(peak, Math.abs(ch[i]));
    const gain = Math.min(8, 0.9 / peak);

    const out = c.createBuffer(chans.length, b - a + 1, buf.sampleRate);
    const fade = Math.min(Math.round(0.01 * buf.sampleRate), out.length >> 1);   // no clicks
    chans.forEach((ch, k) => {
      const dst = out.getChannelData(k);
      for (let i = 0; i < dst.length; i++) {
        const edge = Math.min(1, i / fade, (dst.length - 1 - i) / fade);
        dst[i] = ch[a + i] * gain * edge;
      }
    });
    return out;
  }

  function play(rate = 1) {
    const c = Sound.unlock();
    if (!c || !clip) return;
    const src = c.createBufferSource();
    src.buffer = clip;
    src.playbackRate.value = rate;
    src.connect(Sound.output());
    src.start();
  }

  return {
    record, stop, play, supported,
    recording: () => !!rec,
    has: () => !!clip,
    MAX_SECONDS,
  };
})();
