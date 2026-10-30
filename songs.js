/* --------------------------------------------------------------------------
 * Play-along songs, on the eight pads tuned to C major:
 *
 *   pad   0  1  2  3  4  5  6  7
 *   note  C  D  E  F  G  A  B  C
 *
 * A note is a pad number (one beat long) or [pad, beats]. The beats only
 * matter for 👂, which plays the song through so it can be heard first;
 * playing along waits for every tap, with no tempo at all.
 * ----------------------------------------------------------------------- */

const SONGS = [
  {
    id: 'twinkle', icon: '⭐', title: 'Twinkle, Twinkle, Little Star', beat: 0.42,
    notes: [
      0, 0, 4, 4, 5, 5, [4, 2], 3, 3, 2, 2, 1, 1, [0, 2],
      4, 4, 3, 3, 2, 2, [1, 2], 4, 4, 3, 3, 2, 2, [1, 2],
      0, 0, 4, 4, 5, 5, [4, 2], 3, 3, 2, 2, 1, 1, [0, 2],
    ],
  },
  {
    id: 'mary', icon: '🐑', title: 'Mary Had a Little Lamb', beat: 0.38,
    notes: [
      2, 1, 0, 1, 2, 2, [2, 2], 1, 1, [1, 2], 2, 4, [4, 2],
      2, 1, 0, 1, 2, 2, 2, 2, 1, 1, 2, 1, [0, 4],
    ],
  },
  {
    id: 'buns', icon: '🍞', title: 'Hot Cross Buns', beat: 0.42,
    notes: [
      2, 1, [0, 2], 2, 1, [0, 2],
      [0, 0.5], [0, 0.5], [0, 0.5], [0, 0.5], [1, 0.5], [1, 0.5], [1, 0.5], [1, 0.5],
      2, 1, [0, 2],
    ],
  },
  {
    id: 'row', icon: '🚣', title: 'Row, Row, Row Your Boat', beat: 0.6,
    notes: [
      0, 0, [0, 2 / 3], [1, 1 / 3], 2,
      [2, 2 / 3], [1, 1 / 3], [2, 2 / 3], [3, 1 / 3], [4, 2],
      ...[7, 7, 7, 4, 4, 4, 2, 2, 2, 0, 0, 0].map(n => [n, 1 / 3]),
      [4, 2 / 3], [3, 1 / 3], [2, 2 / 3], [1, 1 / 3], [0, 2],
    ],
  },
  {
    id: 'joy', icon: '😊', title: 'Ode to Joy', beat: 0.4,
    notes: [
      2, 2, 3, 4, 4, 3, 2, 1, 0, 0, 1, 2, [2, 1.5], [1, 0.5], [1, 2],
      2, 2, 3, 4, 4, 3, 2, 1, 0, 0, 1, 2, [1, 1.5], [0, 0.5], [0, 2],
    ],
  },
];

// [{ pad, beats }] for a song
function songNotes(song) {
  return song.notes.map(n => Array.isArray(n) ? { pad: n[0], beats: n[1] } : { pad: n, beats: 1 });
}
