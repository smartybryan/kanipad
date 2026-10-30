/* --------------------------------------------------------------------------
 * The instruments. Every sound is synthesized (oscillators, noise, filters),
 * so there are no asset files. Needs audio.js loaded first.
 *
 *   Instruments.play(id, n, when, scale)
 *       id     'piano' | 'bells' | 'beeps' | 'silly' | 'drums'
 *       n      pad number: 0..7 low to high, or the drum number 0..5
 *       when   AudioContext time to start; omitted means now
 *       scale  'pentatonic' (free play: anything sounds nice) or 'major'
 *              (songs, which need F and B)
 *
 * Every note has a quick attack and a smooth release so nothing clicks, and
 * everything goes through the limiter in Sound.bus(), so ten fingers at once
 * doesn't clip.
 * ----------------------------------------------------------------------- */

const Instruments = (() => {
  const C4 = 261.63;

  // semitones above middle C for pads 0..7
  const SCALES = {
    pentatonic: [0, 2, 4, 7, 9, 12, 14, 16],   // C D E G A C D E
    major:      [0, 2, 4, 5, 7, 9, 11, 12],    // C D E F G A B C
  };

  const freq = (scale, n) => C4 * 2 ** (SCALES[scale][n] / 12);

  // A gain node that swells in over `attack` and dies away over `decay`.
  function envelope(c, when, peak, attack, decay, dest = Sound.bus()) {
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay);
    g.connect(dest);
    return g;
  }

  function osc(c, type, f, when, dur, dest) {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, when);
    o.connect(dest);
    o.start(when);
    o.stop(when + dur + 0.05);
    return o;
  }

  let noiseBuffer = null;
  function noise(c, when, dur, dest) {
    if (!noiseBuffer) {
      noiseBuffer = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = c.createBufferSource();
    src.buffer = noiseBuffer;
    src.connect(dest);
    src.start(when);
    src.stop(when + dur + 0.05);
    return src;
  }

  function filter(c, type, f, dest, q = 1) {
    const flt = c.createBiquadFilter();
    flt.type = type;
    flt.frequency.value = f;
    flt.Q.value = q;
    flt.connect(dest);
    return flt;
  }

  /* --------------------------------------------------------- melodic */

  const MELODIC = {
    // a soft triangle with a little octave shimmer, dying away like a struck string
    piano(c, f, t) {
      const dur = 1.4;
      const g = envelope(c, t, 0.32, 0.005, dur);
      osc(c, 'triangle', f, t, dur, g);
      osc(c, 'sine', f * 2, t, dur, envelope(c, t, 0.08, 0.005, dur * 0.5));
    },

    // xylophone-ish: a pure tone an octave up, with a short inharmonic "tock"
    bells(c, f, t) {
      const dur = 0.9;
      osc(c, 'sine', f * 2, t, dur, envelope(c, t, 0.38, 0.003, dur));
      osc(c, 'sine', f * 2 * 2.76, t, 0.15, envelope(c, t, 0.12, 0.002, 0.12));
    },

    // a video-game blip
    beeps(c, f, t) {
      const dur = 0.25;
      const g = envelope(c, t, 0.13, 0.005, dur);
      osc(c, 'square', f, t, dur, filter(c, 'lowpass', 2600, g));
    },

    // slides up into the note and goes "wah", with a wobbly vibrato
    silly(c, f, t) {
      const dur = 0.6;
      const g = envelope(c, t, 0.22, 0.01, dur);
      const wah = filter(c, 'lowpass', 400, g, 6);
      wah.frequency.setValueAtTime(400, t);
      wah.frequency.exponentialRampToValueAtTime(3000, t + 0.12);
      wah.frequency.exponentialRampToValueAtTime(700, t + dur);
      const o = osc(c, 'sawtooth', f * 0.7, t, dur, wah);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
      const lfo = c.createOscillator();
      const depth = c.createGain();
      lfo.frequency.value = 7;
      depth.gain.value = f * 0.035;
      lfo.connect(depth);
      depth.connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
    },
  };

  /* ----------------------------------------------------------- drums */

  const DRUMS = [
    // 0 kick: a sine dropping fast in pitch
    (c, t) => {
      const o = osc(c, 'sine', 150, t, 0.4, envelope(c, t, 0.9, 0.002, 0.4));
      o.frequency.exponentialRampToValueAtTime(45, t + 0.35);
    },
    // 1 snare: a short body plus a burst of bright noise
    (c, t) => {
      const o = osc(c, 'triangle', 190, t, 0.12, envelope(c, t, 0.35, 0.002, 0.12));
      o.frequency.exponentialRampToValueAtTime(120, t + 0.1);
      noise(c, t, 0.2, filter(c, 'highpass', 1200, envelope(c, t, 0.45, 0.002, 0.2)));
    },
    // 2 hi-hat: very high noise, very short
    (c, t) => {
      noise(c, t, 0.07, filter(c, 'highpass', 7000, envelope(c, t, 0.35, 0.001, 0.07)));
    },
    // 3 clap: three quick bursts of band-passed noise, then a tail
    (c, t) => {
      for (const d of [0, 0.012, 0.024]) {
        noise(c, t + d, 0.03, filter(c, 'bandpass', 1500, envelope(c, t + d, 0.5, 0.001, 0.03), 1.5));
      }
      noise(c, t + 0.03, 0.18, filter(c, 'bandpass', 1500, envelope(c, t + 0.03, 0.35, 0.002, 0.18), 1.5));
    },
    // 4 tom: like the kick, but higher and rounder
    (c, t) => {
      const o = osc(c, 'sine', 240, t, 0.35, envelope(c, t, 0.7, 0.002, 0.35));
      o.frequency.exponentialRampToValueAtTime(120, t + 0.3);
    },
    // 5 cowbell: two square waves a clashing interval apart, band-passed
    (c, t) => {
      const g = envelope(c, t, 0.25, 0.002, 0.3);
      const bp = filter(c, 'bandpass', 800, g, 2);
      osc(c, 'square', 540, t, 0.3, bp);
      osc(c, 'square', 800, t, 0.3, bp);
    },
  ];

  function play(id, n, when, scale = 'pentatonic') {
    const c = Sound.unlock();
    if (!c) return;
    const t = Math.max(when ?? 0, c.currentTime);
    if (id === 'drums') DRUMS[n]?.(c, t);
    else MELODIC[id]?.(c, freq(scale, n), t);
  }

  return { play, MELODIC: Object.keys(MELODIC), DRUM_COUNT: DRUMS.length, PADS: 8 };
})();
