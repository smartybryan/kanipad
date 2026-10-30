# Kanipad

A children's app for making music with sounds and loops. Tap the big colored
pads and they play; there's no goal, it's an instrument. For ages 1–8.

A static site with no build step: open `index.html` by double-clicking it, or
serve the folder from GitHub Pages. Add it to a tablet's home screen and it runs
full screen, without an address bar.

## Playing

The menu has three tiles:

| Tile | What it is |
|---|---|
| rainbow bars | **Pads.** Eight xylophone bars, low to high. Landscape: low on the left. Portrait: low at the bottom. |
| 🐘🐶🐭🐮 | **Animal drums.** 🐘 kick, 🐶 snare, 🐭 hi-hat, 👏 clap, 🐻 tom, 🐮 cowbell. |
| ⭐🐑🎵 | **Songs.** ⭐ Twinkle Twinkle, 🐑 Mary Had a Little Lamb, 🍞 Hot Cross Buns, 🚣 Row Your Boat, 😊 Ode to Joy. |

The pads are tuned to a **pentatonic scale** (C D E G A C D E), so any
combination at all sounds pleasant. Along the top, pick the sound: 🎹 piano,
🔔 bells, 🤖 robot beeps, 🤪 silly (slides into the note and goes "wah"). Each
one says its name when picked.

Every finger is its own note, so chords and two-handed banging work, and
sliding a finger across the bars plays each one it crosses. On a laptop, keys
1–8 (or A S D F G H J K) play the pads, and 1–6 the drums.

**⌂** goes back (Esc on a keyboard).

### Record and loop

The tape buttons, top right on pads and drums:

- **●** records. The clock starts at the first note, so a slow start doesn't
  put silence at the front. Tap **■** to stop.
- **▶** plays it back. **■** stops it.
- **🔁** loops it. While a loop is playing you can play along on top, or press
  **●** to *add* to the loop in time with it (overdub); **■** stops adding and
  the loop keeps going.

The tape carries on when you switch between pads and drums, so record a drum
beat, go to the pads, and play a tune over it. Notes on the tape light up their
pads as they play. The recording is kept on the device until a new one
replaces it (an empty take doesn't), or a grown-up erases it.

### Songs

The next pad to tap glows, and the song waits for it; there's no tempo. A
wrong pad still plays its note (it's an instrument) and the right one bounces.
**👂** plays the whole song through in time so it can be heard first. The bar
along the top fills up, and at the end there's a party and the song starts
over. Songs use the C major scale instead (C D E F G A B C), since most need F.

The size on the menu changes only the songs:

| | |
|---|---|
| 🐣 | any pad plays the next note, so it always comes out right |
| 🐥 | the next pad glows |
| 🐔 | it glows only after a 2.5 s pause, or after a wrong tap |

## Grown-ups

**Press and hold ⚙ for two seconds** (the ring fills up) to open the settings:
spoken words on/off, the device voice with its speed and pitch, and **Erase the
recording**. Settings are kept in `localStorage`.

**No sound on an iPhone?** The app asks Safari to treat it as media playback
(`navigator.audioSession`, Safari 16.4 and later), so the silent switch leaves
it alone. On an older iPhone the switch mutes everything, so check it first.

## Shipping a new version

Asset URLs carry a version stamp (`app.js?v=20261027-1`), so a changed file
arrives under a name that no cache has seen before. Bump every stamp whenever a
`.js` or `.css` file changes:

    sed -i '' 's|?v=[^"]*|?v=20261028|g' index.html

The **↻** button (top right of the menu) gets the newest version even from a
home-screen launch: it navigates to `?fresh=<time>`, then refetches the plain
address with `cache: 'reload'` so the next launch is fresh too.

## Files

    index.html       the menu, song picker, play screen and settings dialog
    styles.css       layout, the xylophone bars and drums, the play bar
    app.js           screens, pads and drums, multi-touch, songs, menu, settings
    instruments.js   the synthesized instruments and drums
    tape.js          record, play back, loop and overdub, on the audio clock
    songs.js         the play-along songs
    audio.js         Sound: unlock, tone, cheer, say -- shared with Pop!
    celebrate.js     celebrate(): confetti, cheer, kind words -- shared with Pop!
    manifest.json    name, colors and icons for a home-screen launch
    icon.svg         full-bleed icon art; the PNGs are rendered from it
    favicon.svg      the same art in a rounded tile

`audio.js` and `celebrate.js` are copied from Pop! (`pop-the-bubbles`).
`audio.js` has one addition, `Sound.bus()`, the limited master gain that the
instruments play into; it's worth copying back.

Rebuilding the icons after changing `icon.svg`:

    rsvg-convert -w 192 -h 192 icon.svg -o icon-192.png
    rsvg-convert -w 512 -h 512 icon.svg -o icon-512.png
    rsvg-convert -w 180 -h 180 icon.svg -o apple-touch-icon.png

## How it works

Every sound is synthesized with Web Audio, so there are no sound files. Each
note gets a quick attack and a smooth release so nothing clicks, and all of it
goes through one master gain and a `DynamicsCompressorNode`, so ten fingers at
once doesn't clip. The drums are the classic recipes: a sine sweeping down for
the kick and tom, filtered noise for the snare, hi-hat and clap, and two square
waves through a band-pass for the cowbell.

Touch is handled with Pointer Events on the play area, one entry per pointer
ID. On each move the pad under the finger is found with `elementFromPoint`, and
a new pad plays when the finger slides onto it.

The tape is `{ events: [{ t, i, n }], length }`: seconds from the first note,
the instrument and the pad. Playback uses a lookahead scheduler: every 80 ms it
hands the audio clock every note due in the next 300 ms, so the timing doesn't
drift the way a chain of `setTimeout`s would. Only the pad flashes use
`setTimeout`. An overdubbed note goes into the event list at its place in the
loop; it has already sounded live, and the scheduler is past that point, so it
plays from the next pass.

Adding a song is one entry in `SONGS` (pad numbers, with beat lengths only
used for 👂).

## Ideas for later

- A few saved recordings with picture labels, instead of one tape.
- Animal noises: real samples (short mp3s) on the drums screen.
- A 16-step sequencer grid for the 7–8s.
- Record your voice and play it back at different pitches (chipmunk / giant).
