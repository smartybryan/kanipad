/* --------------------------------------------------------------------------
 * The tape: record what's played, play it back, loop it, and play along on
 * top. Needs audio.js and instruments.js loaded first.
 *
 *   Tape.record()        start recording. The clock starts at the first note,
 *                        so a slow start doesn't put silence at the front.
 *                        While a loop is playing, this adds to the loop
 *                        instead (overdub), in time with it.
 *   Tape.stopRecording()
 *   Tape.note(i, n)      every live hit calls this; it's kept while recording
 *   Tape.play()          play it through once, or round and round if looping
 *   Tape.stop()
 *   Tape.setLoop(on)     can change while playing; off finishes the pass
 *   Tape.erase()
 *   Tape.state()         { recording, playing, looping, hasTape }
 *   Tape.onChange = fn   the state above changed
 *   Tape.onNote = fn     ({ i, n }) a recorded note is sounding now, to light
 *                        its pad
 *
 * Playback is scheduled on the AudioContext clock a little ahead of time (the
 * usual lookahead scheduler), so the timing doesn't drift the way a chain of
 * setTimeouts would. Only the pad flashes use setTimeout.
 *
 * A tape is { events: [{ t, i, n }], length } in seconds, where i is the
 * instrument id and n the pad. It's kept in localStorage.
 * ----------------------------------------------------------------------- */

const Tape = (() => {
  const KEY = 'kanipad.tape';
  const MAX_SECONDS = 60;
  const MAX_EVENTS = 1500;
  const MIN_LOOP = 1.0;      // one note and a quick stop still makes a sane loop
  const LOOKAHEAD = 0.3;     // seconds scheduled ahead
  const TICK_MS = 80;

  let tape = { events: [], length: 0 };
  let rec = null;      // { overdub } or { start, events }
  let playing = null;  // { start, pass, pos, endAt, timer }
  let looping = false;
  const flashes = new Set();

  const api = { onChange() {}, onNote() {} };
  const changed = () => api.onChange(state());

  function state() {
    return { recording: !!rec, playing: !!playing, looping, hasTape: tape.events.length > 0 };
  }

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY));
      if (saved && Array.isArray(saved.events) && saved.length > 0) tape = saved;
    } catch (e) { /* private mode, or nothing saved yet */ }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(tape)); } catch (e) {}
  }

  /* ------------------------------------------------------------ record */

  function record() {
    if (rec) return;
    if (playing && looping) {
      rec = { overdub: true };
    } else {
      stop();
      rec = { start: null, events: [] };
    }
    changed();
  }

  function stopRecording() {
    if (!rec) return;
    if (rec.overdub) {
      save();
    } else if (rec.events.length) {
      const c = Sound.context();
      const last = rec.events[rec.events.length - 1].t;
      const length = Math.min(MAX_SECONDS, Math.max(c.currentTime - rec.start, last + 0.3, MIN_LOOP));
      tape = { events: rec.events, length };
      save();
    }
    // nothing played: keep the old tape rather than wipe it
    rec = null;
    changed();
  }

  function note(i, n) {
    if (!rec) return;
    const c = Sound.context();
    if (!c) return;
    const now = c.currentTime;

    if (rec.overdub) {
      if (!playing || tape.events.length >= MAX_EVENTS) return;
      const t = (now - playing.start) % tape.length;
      if (t < 0) return;   // tapped in the moment before the loop starts
      const at = tape.events.findIndex(e => e.t > t);
      tape.events.splice(at < 0 ? tape.events.length : at, 0, { t, i, n });
      return;
    }

    if (rec.start === null) rec.start = now;
    const t = now - rec.start;
    if (t > MAX_SECONDS || rec.events.length >= MAX_EVENTS) {
      stopRecording();
      return;
    }
    rec.events.push({ t, i, n });
  }

  /* -------------------------------------------------------------- play */

  function play() {
    if (playing || !tape.events.length) return;
    if (rec) stopRecording();
    const c = Sound.unlock();
    if (!c) return;
    playing = { start: c.currentTime + 0.08, pass: 0, pos: 0, endAt: null, timer: null };
    tick();
    playing.timer = setInterval(tick, TICK_MS);
    changed();
  }

  // Schedule everything due before now + LOOKAHEAD that isn't scheduled yet.
  // pos is how far into the current pass scheduling has got.
  function tick() {
    if (!playing) return;
    const c = Sound.context();
    const len = tape.length;

    while (playing.endAt === null) {
      const passStart = playing.start + playing.pass * len;
      const to = Math.min(c.currentTime + LOOKAHEAD - passStart, len);
      if (to <= playing.pos) break;
      for (const e of tape.events) {
        if (e.t >= playing.pos && e.t < to) sound(e, passStart + e.t);
      }
      playing.pos = to;
      if (to < len) break;
      if (!looping) {
        playing.endAt = passStart + len;
        break;
      }
      playing.pass++;
      playing.pos = 0;
    }

    if (playing.endAt !== null && c.currentTime >= playing.endAt) stop();
  }

  function sound(e, when) {
    Instruments.play(e.i, e.n, when);
    const c = Sound.context();
    const id = setTimeout(() => {
      flashes.delete(id);
      api.onNote(e);
    }, Math.max(0, (when - c.currentTime) * 1000));
    flashes.add(id);
  }

  function stop() {
    if (rec && rec.overdub) stopRecording();
    if (!playing) return;
    clearInterval(playing.timer);
    // notes already handed to the audio clock will still sound (a few
    // hundred ms at most); just don't light their pads
    for (const id of flashes) clearTimeout(id);
    flashes.clear();
    playing = null;
    changed();
  }

  function setLoop(on) {
    looping = on;
    // turning it back on before the last pass ends keeps it going
    if (on && playing && playing.endAt !== null) {
      playing.endAt = null;
      playing.pass++;
      playing.pos = 0;
    }
    changed();
  }

  function erase() {
    stop();
    rec = null;
    tape = { events: [], length: 0 };
    try { localStorage.removeItem(KEY); } catch (e) {}
    changed();
  }

  load();
  return Object.assign(api, { record, stopRecording, note, play, stop, setLoop, erase, state });
})();
