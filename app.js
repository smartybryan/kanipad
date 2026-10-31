/* --------------------------------------------------------------------------
 * Kanipad: big colored pads that make music. There's no goal; it's an
 * instrument. The pads are tuned to the C major scale, C to C, like a toy
 * xylophone. Record a tune, play it back, loop it and play along.
 * The songs light up the next pad and wait for it, with no tempo.
 * ----------------------------------------------------------------------- */

'use strict';

const $ = id => document.getElementById(id);

/* ------------------------------------------------------------------ data */

// low to high, a rainbow
const PAD_COLORS = ['#ff4d4d', '#ff9f1c', '#ffd23f', '#3cc85a', '#2ec4b6', '#3a86ff', '#9b5de5', '#ff70a6'];

const VOICES = [
  { id: 'piano', icon: '🎹' },
  { id: 'bells', icon: '🔔' },
  { id: 'beeps', icon: '🤖' },
  { id: 'silly', icon: '🤪' },
];

// kick, snare, hi-hat, clap, tom, cowbell (in instruments.js order)
const DRUMS = [
  { icon: '🐘', color: '#9b5de5' },
  { icon: '🐶', color: '#ff9f1c' },
  { icon: '🐭', color: '#2ec4b6' },
  { icon: '👏', color: '#ff70a6' },
  { icon: '🐻', color: '#3a86ff' },
  { icon: '🐮', color: '#3cc85a' },
];

// how much help the songs give
const LEVELS = {
  hatchling: { icon: '🐣', caption: 'Any pad plays the song' },
  chick:     { icon: '🐥', caption: 'The next pad glows' },
  hen:       { icon: '🐔', caption: 'Glows after a pause' },
};
const HINT_MS = 2500;

// laptop keys: 1-8 or the home row, low to high
const KEYS = ['12345678', 'asdfghjk'];

const SETTINGS_KEY = 'kanipad.settings';
const settings = { level: 'hatchling', inst: 'piano' };

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    for (const k of Object.keys(settings)) if (k in saved) settings[k] = saved[k];
  } catch (e) { /* private mode, or nothing saved yet */ }
  if (!LEVELS[settings.level]) settings.level = 'hatchling';
  if (!VOICES.some(v => v.id === settings.inst)) settings.inst = 'piano';
}

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {}
}

// No spoken words: the shared Sound and celebrate() stay quiet.
Sound.setVoice(false);
celebrate.say = () => {};


/* --------------------------------------------------------------- screens */

// view is 'pads' (free play), 'drums' or 'song'
const play = { view: null, song: null, notes: [], pos: 0, done: false, hint: null, listen: [] };

function show(screen) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== screen);
}

function goHome() {
  Tape.stop();
  Tape.stopRecording();
  endSong();
  play.view = null;
  $('stage').innerHTML = '';
  show('menu-screen');
}

// ⌂ from a song goes back to the song picker; from anywhere else, the menu.
function back() {
  const fromSong = play.view === 'song';
  goHome();
  if (fromSong) show('songs-screen');
}

function openView(view, song) {
  Sound.unlock();
  play.view = view;
  const stage = $('stage');
  stage.className = `stage ${view === 'drums' ? 'drums' : 'pads'}`;
  stage.innerHTML = view === 'drums' ? drumsHTML() : padsHTML();

  $('voices').classList.toggle('hidden', view === 'drums');
  $('transport').classList.toggle('hidden', view === 'song');
  $('song-tools').classList.toggle('hidden', view !== 'song');
  $('song-head').classList.toggle('hidden', view !== 'song');

  show('play-screen');
  if (view === 'song') startSong(song);
}

function padsHTML() {
  return PAD_COLORS.map((c, n) =>
    `<div class="pad" data-n="${n}" style="--c:${c}; --len:${100 - n * 5}%"><i></i><i></i></div>`).join('');
}

function drumsHTML() {
  return DRUMS.map((d, n) =>
    `<div class="drum-cell"><div class="drum" data-n="${n}" style="--c:${d.color}">${d.icon}</div></div>`).join('');
}

const padEl = n => $('stage').querySelector(`[data-n="${n}"]`);


/* ----------------------------------------------------------------- hits */

function hit(n) {
  if (play.view === 'drums') {
    Instruments.play('drums', n);
    Tape.note('drums', n);
    flash(padEl(n));
  } else if (play.view === 'pads') {
    Instruments.play(settings.inst, n);
    Tape.note(settings.inst, n);
    flash(padEl(n));
  } else if (play.view === 'song') {
    songTap(n);
  }
}

function flash(el) {
  if (!el) return;
  el.animate(
    [{ transform: 'scale(.93)', filter: 'brightness(1.35)' }, { transform: 'none', filter: 'none' }],
    { duration: 380, easing: 'ease-out' });
}

// A recorded note is sounding: light its pad, if it's on screen.
Tape.onNote = e => {
  const drum = e.i === 'drums';
  if ((drum && play.view === 'drums') || (!drum && play.view === 'pads')) flash(padEl(e.n));
};

/* Every finger is its own pointer, so chords and two-handed banging work.
 * Sliding a finger onto another pad plays that one too (a glissando). */
const stage = $('stage');
const held = new Map();   // pointerId -> the pad under it

function padAt(e) {
  const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-n]');
  return el && stage.contains(el) ? el : null;
}

stage.addEventListener('pointerdown', e => {
  e.preventDefault();
  Sound.unlock();
  const el = padAt(e);
  held.set(e.pointerId, el);
  if (el) hit(Number(el.dataset.n));
});

stage.addEventListener('pointermove', e => {
  if (!held.has(e.pointerId)) return;
  const el = padAt(e);
  if (el === held.get(e.pointerId)) return;
  held.set(e.pointerId, el);
  if (el) hit(Number(el.dataset.n));
});

for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
  stage.addEventListener(type, e => held.delete(e.pointerId));
}

stage.addEventListener('contextmenu', e => e.preventDefault());


/* ----------------------------------------------------------------- songs */

function startSong(song) {
  endSong();
  play.song = song;
  play.notes = songNotes(song);
  play.pos = 0;
  play.done = false;
  $('song-title').textContent = song.title;
  drawStaff();
  showNext();
}

function endSong() {
  stopListening();
  clearTimeout(play.hint);
  play.song = null;
  play.done = false;
}

function songTap(n) {
  if (play.done) {
    // between the cheer and starting over, the pads are just an instrument
    Instruments.play(settings.inst, n);
    flash(padEl(n));
    return;
  }
  const want = play.notes[play.pos].pad;
  // the littlest ones play the song whatever they tap
  if (settings.level === 'hatchling') n = want;
  Instruments.play(settings.inst, n);
  flash(padEl(n));
  if (n === want) advance();
  else nudge(padEl(want));
}

function advance() {
  play.pos++;
  if (play.pos < play.notes.length) {
    showNext();
    return;
  }
  play.done = true;
  showNext();
  celebrate({ big: true });
  setTimeout(() => {
    if (!play.done || play.view !== 'song') return;
    play.pos = 0;
    play.done = false;
    showNext();
  }, 3500);
}

// Light the pad to tap next (on 🐔 only after a pause), mark the note on the
// staff, and fill the bar.
function showNext() {
  clearTimeout(play.hint);
  for (const el of stage.querySelectorAll('.next')) el.classList.remove('next');
  $('song-fill').style.width = `${(play.pos / play.notes.length) * 100}%`;
  markStaff();
  if (play.done) return;
  const el = padEl(play.notes[play.pos].pad);
  if (settings.level === 'hen') play.hint = setTimeout(() => el.classList.add('next'), HINT_MS);
  else el.classList.add('next');
}

// A wrong pad still plays (it's an instrument), and the right one bounces.
function nudge(el) {
  el.animate(
    [{ transform: 'none' }, { transform: 'translateY(-14px)' }, { transform: 'none' },
     { transform: 'translateY(-6px)' }, { transform: 'none' }],
    { duration: 500, easing: 'ease-out' });
  if (settings.level === 'hen') el.classList.add('next');
}

// 👂 plays the whole song in time, lighting each pad as it goes.
function listen() {
  if (!play.song) return;
  stopListening();
  const c = Sound.unlock();
  if (!c) return;
  let at = 0.1;
  for (const [i, { pad, beats }] of play.notes.entries()) {
    Instruments.play(settings.inst, pad, c.currentTime + at);
    play.listen.push(setTimeout(() => {
      flash(padEl(pad));
      markStaff(i);
    }, at * 1000));
    at += beats * play.song.beat;
  }
  // and back to the note to tap once it's over
  play.listen.push(setTimeout(() => markStaff(), at * 1000 + 300));
}

function stopListening() {
  for (const id of play.listen) clearTimeout(id);
  if (play.listen.length) markStaff();
  play.listen = [];
}


/* ----------------------------------------------------------------- staff
 *
 * The whole song on treble staves, one note head per note in its pad's color,
 * wrapped onto as many rows as the screen's width needs, so it's all in view.
 * Pads 0..7 are C4..C5: C4 sits on a ledger line below the staff. Notes of
 * two beats or more are open heads (half notes); four beats has no stem (a
 * whole note). The spacing is even; the beats don't stretch it.
 *
 * A glowing ball under the staff sits below the note to play, and glides to
 * the next one.
 * ----------------------------------------------------------------------- */

const STAFF = { gap: 34, left: 64, right: 24, rowH: 112, ballY: 98 };
const staffY = pad => 80 - pad * 5;   // E4 (pad 2) on the bottom line, y 70
let staffLayout = null;               // { perRow } for the drawn staff
let staffWidth = 0;                   // the width it was drawn for

function notePlace(i) {
  const { perRow } = staffLayout;
  return {
    x: STAFF.left + (i % perRow) * STAFF.gap + STAFF.gap / 2,
    top: Math.floor(i / perRow) * STAFF.rowH,
  };
}

function drawStaff() {
  const box = $('staff');
  const notes = play.notes;
  // about 0.9 px a unit on a tablet, down to 0.55 on a phone
  const unit = Math.min(0.9, Math.max(0.55, box.clientWidth / 1100));
  const fit = Math.max(6, Math.floor((box.clientWidth / unit - STAFF.left - STAFF.right) / STAFF.gap));
  const rows = Math.ceil(notes.length / fit);
  const perRow = Math.ceil(notes.length / rows);   // even rows, not a stub at the end
  staffLayout = { perRow };
  staffWidth = box.clientWidth;

  const w = STAFF.left + perRow * STAFF.gap + STAFF.right;
  let out = '';
  for (let r = 0; r < rows; r++) {
    const top = r * STAFF.rowH;
    const n = Math.min(perRow, notes.length - r * perRow);
    const end = STAFF.left + n * STAFF.gap + 8;
    out += `<g transform="translate(0 ${top})">${[30, 40, 50, 60, 70]
      .map(y => `<line class="staff-line" x1="4" x2="${end}" y1="${y}" y2="${y}"/>`).join('')}
      <line class="staff-line" x1="${end}" x2="${end}" y1="30" y2="70"/>
      <text class="clef" x="6" y="73">\u{1D11E}</text></g>`;
  }
  out += notes.map(({ pad, beats }, i) => {
    const { x, top } = notePlace(i);
    const y = top + staffY(pad);
    const up = pad < 6;   // B4 and above take their stems down
    const ledger = pad === 0
      ? `<line class="ledger" x1="${x - 12}" x2="${x + 12}" y1="${top + 80}" y2="${top + 80}"/>` : '';
    const stem = beats >= 4 ? '' : up
      ? `<line class="stem" x1="${x + 6.5}" x2="${x + 6.5}" y1="${y - 1}" y2="${y - 33}"/>`
      : `<line class="stem" x1="${x - 6.5}" x2="${x - 6.5}" y1="${y + 1}" y2="${y + 33}"/>`;
    return `<g class="note${beats >= 2 ? ' open' : ''}" data-i="${i}" style="--c:${PAD_COLORS[pad]}">${ledger}${stem}
      <ellipse class="head" cx="${x}" cy="${y}" rx="7.5" ry="5.5" transform="rotate(-20 ${x} ${y})"/></g>`;
  }).join('');

  box.innerHTML = `<svg viewBox="0 0 ${w} ${rows * STAFF.rowH}" preserveAspectRatio="xMinYMin meet">
    <defs><filter id="ball-glow" x="-150%" y="-150%" width="400%" height="400%">
      <feGaussianBlur stdDeviation="3"/>
    </filter></defs>
    ${out}
    <g id="ball" class="ball"><circle class="ball-glow" r="10" filter="url(#ball-glow)"/><circle class="ball-core" r="6"/></g>
  </svg>`;
  markStaff(undefined, false);
}

// Mark the notes already played and the one to play now (by default the next
// to tap), and move the ball under it.
function markStaff(now = play.done ? -1 : play.pos, glide = true) {
  const box = $('staff');
  for (const g of box.querySelectorAll('.note')) {
    const i = Number(g.dataset.i);
    g.classList.toggle('done', !play.done && i < play.pos && i !== now);
    g.classList.toggle('now', i === now);
  }
  const ball = $('ball');
  if (!ball) return;
  ball.classList.toggle('hidden-ball', now < 0);
  if (now < 0) return;
  const { x, top } = notePlace(now);
  ball.classList.toggle('glide', glide);
  ball.style.setProperty('--c', PAD_COLORS[play.notes[now].pad]);
  ball.style.transform = `translate(${x}px, ${top + STAFF.ballY}px)`;
}

// a new width can mean a different number of rows
new ResizeObserver(() => {
  const w = $('staff').clientWidth;
  if (play.view === 'song' && w && w !== staffWidth) drawStaff();
}).observe($('staff'));


/* ----------------------------------------------------------- the play bar */

function buildVoices() {
  const box = $('voices');
  box.innerHTML = '';
  for (const v of VOICES) {
    const btn = document.createElement('button');
    btn.className = 'bar-btn voice-btn';
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-label', v.id);
    btn.setAttribute('aria-checked', String(settings.inst === v.id));
    btn.textContent = v.icon;
    btn.addEventListener('click', () => {
      settings.inst = v.id;
      saveSettings();
      for (const b of box.children) b.setAttribute('aria-checked', String(b === btn));
      Instruments.play(v.id, 4);
    });
    box.appendChild(btn);
  }
}

function showTape({ recording, playing, looping, hasTape }) {
  $('btn-rec').classList.toggle('on', recording);
  $('btn-rec').setAttribute('aria-label', recording ? 'Stop recording' : 'Record');
  $('btn-play').classList.toggle('on', playing);
  $('btn-play').classList.toggle('empty', !hasTape);
  $('btn-play').setAttribute('aria-label', playing ? 'Stop' : 'Play');
  $('btn-loop').setAttribute('aria-pressed', String(looping));
  document.body.classList.toggle('recording', recording);
}

Tape.onChange = showTape;

$('btn-rec').addEventListener('click', () => {
  Sound.unlock();
  if (Tape.state().recording) Tape.stopRecording();
  else Tape.record();
});

$('btn-play').addEventListener('click', () => {
  if (Tape.state().playing) Tape.stop();
  else Tape.play();
});

$('btn-loop').addEventListener('click', () => Tape.setLoop(!Tape.state().looping));


/* ------------------------------------------------------------------ menu */

const MODES = [
  {
    id: 'pads', label: 'Rainbow pads',
    tile: () => `<svg class="tile-art" viewBox="0 0 100 100" aria-hidden="true">${
      PAD_COLORS.map((c, n) => {
        const h = 80 - n * 5;
        return `<rect x="${6 + n * 11.4}" y="${50 - h / 2}" width="9" height="${h}" rx="3"
                fill="${c}" stroke="#23262b" stroke-width="2"/>`;
      }).join('')}</svg>`,
    open: () => openView('pads'),
  },
  {
    id: 'drums', label: 'Animal drums',
    tile: () => '<span class="tile-emoji">🐘🐶<br>🐭🐮</span>',
    open: () => openView('drums'),
  },
  {
    id: 'songs', label: 'Songs',
    tile: () => '<span class="tile-emoji">⭐🐑<br>🎵</span>',
    open: () => show('songs-screen'),
  },
];

function buildMenu() {
  const levels = $('levels');
  levels.innerHTML = '';
  for (const [id, lv] of Object.entries(LEVELS)) {
    const btn = document.createElement('button');
    btn.className = 'level-btn';
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-label', id);
    btn.setAttribute('aria-checked', String(settings.level === id));
    btn.innerHTML = `<span class="level-face">${lv.icon}</span><span class="level-caption">${lv.caption}</span>`;
    btn.addEventListener('click', () => {
      settings.level = id;
      saveSettings();
      for (const b of levels.children) b.setAttribute('aria-checked', String(b === btn));
      Sound.unlock();
      Sound.cheer();
    });
    levels.appendChild(btn);
  }

  const modes = $('modes');
  modes.innerHTML = '';
  for (const m of MODES) {
    const btn = document.createElement('button');
    btn.className = 'mode-tile';
    btn.setAttribute('aria-label', m.label);
    btn.innerHTML = `${m.tile()}<span class="tile-caption">${m.label}</span>`;
    btn.addEventListener('click', m.open);
    modes.appendChild(btn);
  }

  const songs = $('song-list');
  songs.innerHTML = '';
  for (const song of SONGS) {
    const btn = document.createElement('button');
    btn.className = 'mode-tile';
    btn.setAttribute('aria-label', song.title);
    btn.innerHTML = `<span class="tile-emoji">${song.icon}</span><span class="tile-caption">${song.title}</span>`;
    btn.addEventListener('click', () => openView('song', song));
    songs.appendChild(btn);
  }
}


/* ------------------------------------------------------- grown-up gate */

// Press and hold for two seconds. A small child pokes, a grown-up holds.
function holdToOpen(btn, ms, open) {
  let timer = null;
  const cancel = () => {
    clearTimeout(timer);
    timer = null;
    btn.classList.remove('holding');
  };
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    btn.classList.add('holding');
    timer = setTimeout(() => { cancel(); open(); }, ms);
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) btn.addEventListener(type, cancel);
  btn.addEventListener('contextmenu', e => e.preventDefault());
}

function openSettings() {
  $('erase-tape').disabled = !Tape.state().hasTape;
  $('settings').classList.remove('hidden');
}

function closeSettings() {
  $('settings').classList.add('hidden');
}

function eraseTape() {
  if (!confirm('Erase the recording?')) return;
  Tape.erase();
  $('erase-tape').disabled = true;
}


/* -------------------------------------------------------------- refresh
 *
 * Same trick as Color Me. From a home screen there is no reload, and
 * location.reload() is answered out of the cache holding the old copy. So go
 * to an address nothing has fetched before; on the way back up, refetch the
 * plain address with cache: 'reload' so the next launch starts new too.
 * ----------------------------------------------------------------------- */

const FRESH_KEY = 'fresh';

function refreshApp() {
  const here = location.href.split('#')[0].split('?')[0];
  location.replace(`${here}?${FRESH_KEY}=${Date.now()}`);
}

function settleAfterRefresh() {
  if (!new URLSearchParams(location.search).has(FRESH_KEY)) return;
  try {
    fetch(location.pathname, { cache: 'reload' }).catch(() => {});
    history.replaceState(null, '', location.pathname);
  } catch (e) {
    /* opened straight off disk -- this visit is already the fresh one */
  }
}


/* -------------------------------------------------------------- wire up */

for (const btn of document.querySelectorAll('[data-home]')) btn.addEventListener('click', back);
$('btn-listen').addEventListener('click', listen);
$('btn-refresh').addEventListener('click', refreshApp);
$('settings-done').addEventListener('click', closeSettings);
$('erase-tape').addEventListener('click', eraseTape);
holdToOpen($('btn-gear'), 2000, openSettings);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!$('settings').classList.contains('hidden')) return;
    if (play.view || !$('songs-screen').classList.contains('hidden')) back();
    return;
  }
  if (!play.view || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  const count = play.view === 'drums' ? DRUMS.length : PAD_COLORS.length;
  for (const row of KEYS) {
    const n = row.indexOf(e.key.toLowerCase());
    if (n >= 0 && n < count) {
      Sound.unlock();
      hit(n);
      return;
    }
  }
});

settleAfterRefresh();
loadSettings();
buildMenu();
buildVoices();
showTape(Tape.state());
