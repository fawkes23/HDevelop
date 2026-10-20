import type { Asset, Doc, ModeId, Row, RowType, State } from './types';

/**
 * The cases from the h3-prompt-writing skill (base-en.txt section 5 and the
 * ref-en.txt complete example), rebuilt as sheets. I2VA, FL2VA, L2VA and Ref2VA
 * compile to the guide's text exactly; T2VA is split into blocks.
 */

let n = 0;
const id = (p: string) => `${p}${++n}`;

function row(type: RowType, f: Record<string, string>): Row {
  return { id: id('r'), type, enabled: true, f };
}
const asset = (kind: Asset['kind'], url: string): Asset => ({ id: id('a'), kind, url });

const doc = (d: Partial<Doc>): Doc => ({ style: '', styleOpening: '', tasks: [], summary: '', soundscape: '', silent: false, music: '', ...d });

const base = (mode: ModeId, duration: number): State => ({
  mode,
  duration,
  aspect: mode === 't2va' ? '16:9' : 'auto',
  frames: { first: '', last: '' },
  assets: [],
  doc: doc({}),
  rows: [],
});

const shot = (text: string, at = '', transition = 'the camera cuts to') => row('shot', { at, transition, text });
const camera = (motion: string, amplitude: string, speed: string, detail: string) => row('camera', { motion, amplitude, speed, detail });
const speech = (who: string, sid: string, verb: string, line: string, extra: Record<string, string> = {}) =>
  row('speech', { who, id: sid, voiceover: '', verb, pronoun: 'their', lang: 'English', line, continuity: '', ...extra });
const visual = (text: string) => row('visual', { text });
const define = (kind: string, assetId: string, def: string, marker: string, note: string, where = '') =>
  row('define', { kind, asset: assetId, def, where, marker, note });

export const EXAMPLES: Record<string, { label: string; build: () => State }> = {
  t2va: {
    label: 'T2VA: bakery (Case 1)',
    build: () => ({
      ...base('t2va', 8),
      doc: doc({
        style: 'Live-action, cinematic',
        soundscape:
          'Wooden shutters scrape open over a quiet street as trays clink softly inside the bakery. The doorbell rings once, followed by light footsteps and the crisp sound of bread being sliced.',
        music: 'A soft acoustic-guitar pattern at a moderate tempo, joined by sparse upright-bass notes and a gentle fade at the end.',
      }),
      rows: [
        shot('a medium-wide shot frames a baker opening the shutters of a small street bakery before sunrise.'),
        camera('Push In', 'small', 'slow', 'as the baker places a fresh loaf on the wooden counter'),
        speech('The middle-aged baker with a calm, slightly raspy voice', 'S1', 'says:', 'First batch of the morning.'),
        shot("a close-up of steam rising from the sliced bread while the baker's final words carry over from the previous shot.", '5'),
      ],
    }),
  },
  i2va: {
    label: 'I2VA: train window (Case 2)',
    build: () => ({
      ...base('i2va', 8),
      frames: { first: 'https://example.com/train-window.png', last: '' },
      doc: doc({
        style: 'Live-action, cinematic',
        soundscape: 'The train wheels produce a steady metallic rhythm beneath a low ventilation hum. Rain ticks against the window while paper rustles softly in her hands.',
        music: 'Sustained cello notes at a slow tempo with widely spaced piano tones, gradually decreasing in volume.',
      }),
      rows: [
        shot('the young woman shown in <Picture 1> remains beside the rain-covered train window, preserving her appearance, clothing, seat position, and the carriage layout.'),
        camera('Truck Right', 'small', 'slow', 'as she lifts her gaze from the folded letter toward the passing city lights'),
        speech('Her reflection moves across the glass while the quiet, breathy young woman', 'S1', 'says:', 'I get off at the next station.'),
        visual('She folds the letter along its existing crease.'),
      ],
    }),
  },
  fl2va: {
    label: 'FL2VA: umbrella (Case 3)',
    build: () => ({
      ...base('fl2va', 8),
      frames: { first: 'https://example.com/umbrella-closed.png', last: 'https://example.com/umbrella-open.png' },
      doc: doc({
        style: 'Live-action, cinematic',
        soundscape:
          'Rain falls steadily on the pavement, followed by the metallic click of the umbrella runner and the soft snap of the canopy opening. Water drips from the bicycle frame as distant traffic passes.',
      }),
      rows: [
        shot('a rain-soaked cyclist begins in the position and framing established by Picture 1, holding a closed black umbrella beside a silver bicycle.'),
        camera('Pull Out', 'small', 'slow', 'as she releases the bicycle handle, raises the umbrella above her shoulder, and presses the runner upward until the canopy opens'),
        visual(
          'Water rolls from the expanding fabric while she steps beneath it, rotates the handle into the final angle, and settles into the pose, spacing, and composition established by Picture 2 at the end of the shot.',
        ),
      ],
    }),
  },
  l2va: {
    label: 'L2VA: broken glass (Case 4)',
    build: () => ({
      ...base('l2va', 6),
      frames: { first: '', last: 'https://example.com/broken-glass.png' },
      doc: doc({
        style: 'Live-action, cinematic',
        soundscape: 'Fingertips tap the glass before it scrapes across the tabletop, falls, and breaks with a sharp crash. Small fragments scatter and gradually stop sliding across the floor.',
        music: 'A low electronic pulse at a slow tempo, ending immediately after the glass breaks.',
      }),
      rows: [
        shot('a close shot begins with an intact drinking glass near the edge of a dark wooden table, while the same hand and sleeve visible in <Picture 1> approach from the right.'),
        camera('Push In', 'small', 'slow', 'as the fingertips strike the rim'),
        visual(
          'The glass tips, falls, and hits the floor with a sharp impact; cracks spread through it as fragments slide outward. Toward the end, the moving pieces lose momentum and settle into the exact broken arrangement, hand position, camera angle, lighting, and final composition established by <Picture 1>.',
        ),
      ],
    }),
  },
  ref2va: {
    label: 'Ref2VA: sitcom coffee shop (complete example)',
    build: () => {
      const p1 = asset('image', 'https://example.com/coffee-shop.png');
      const p2 = asset('image', 'https://example.com/samoyed-1.png');
      const p3 = asset('image', 'https://example.com/samoyed-2.png');
      const p4 = asset('image', 'https://example.com/samoyed-3.png');
      const v1 = asset('video', 'https://example.com/blonde-woman.mp4');
      const v2 = asset('video', 'https://example.com/young-man.mp4');
      const a1 = asset('audio', 'https://example.com/voice.mp3');
      return {
        ...base('ref2va', 8),
        assets: [p1, p2, p3, p4, v1, v2, a1],
        doc: doc({
          styleOpening: 'The target video uses a realistic multi-camera sitcom style with warm indoor lighting.',
          tasks: ['reference generation', 'audio reference'],
          summary:
            'The target video shows <Subject 3> eating a cookie in <Subject 1>. <Subject 4> enters with <Subject 2>, which lunges toward the cookie. The three-shot exchange uses <Audio 1> as the voice-timbre reference for <Subject 3> and ends with a canned audience laugh.',
          soundscape: 'Soft indoor coffee-shop room tone continues throughout the scene.',
        }),
        rows: [
          define(
            'subject',
            '',
            'the coffee-shop environment in <Picture 1>, featuring an exposed brick wall, an orange tufted sofa with patterned pillows, a neon sign, and a wooden coffee table.',
            'fully_preserved',
            'the exposed brick wall, orange tufted sofa, patterned pillows, neon sign, and wooden coffee table are retained.',
            'appears in [Shot 1], [Shot 2], [Shot 3]',
          ),
          define(
            'subject',
            '',
            'the fluffy white Samoyed in <Picture 2>, <Picture 3>, and <Picture 4>, with thick white fur, pointed ears, a dark nose, and a curved tail.',
            'fully_preserved',
            "the Samoyed's thick white fur, pointed ears, dark nose, and curved tail are retained.",
          ),
          define(
            'subject',
            '',
            'the young blonde woman in <Video 1>, with long blonde hair and a light-pink button-down shirt with rolled-up sleeves.',
            'fully_preserved',
            "the blonde woman's identity, long hair, and light-pink shirt are retained.",
          ),
          define(
            'subject',
            '',
            'the young man in <Video 2>, with short wavy brown hair and a dark-grey hoodie with drawstrings.',
            'fully_preserved',
            "the young man's short wavy brown hair and dark-grey hoodie are retained.",
          ),
          define(
            'audio',
            a1.id,
            'the voice-timbre reference for <Subject 3> (S1), containing a spoken English vocal layer.',
            'reference',
            'its vocal timbre guides the dialogue delivery of <Subject 3> without copying the original signal.',
          ),
          shot(
            'A medium shot establishes <Subject 1>, the coffee shop with its exposed brick wall, orange tufted sofa, patterned pillows, neon sign, and wooden coffee table.',
          ),
          visual(
            '<Subject 3> (S1), the young woman with long blonde hair and a light-pink button-down shirt with rolled-up sleeves, sits on the sofa holding a chocolate-chip cookie. From the left, <Subject 4>, the young man with short wavy brown hair and a dark-grey hoodie with drawstrings, enters holding the leash of <Subject 2>, the thick-furred white Samoyed with pointed ears, a dark nose, and a curved tail. The dog lunges toward the cookie and pulls the leash taut.',
          ),
          speech(
            '<Subject 3>',
            'S1',
            'jerks her hand back and, using the clear youthful voice timbre referenced from <Audio 1>, exclaims with light annoyance,',
            'Hey! Watch your dog!',
          ),
          visual('She closes her lips and guards the cookie while <Subject 4> pulls the dog back.'),
          shot(
            'a close-up of <Subject 4> (S2), the young man in the dark-grey hoodie from Shot 1, sitting beside <Subject 3> on the sofa and holding <Subject 2> securely in his arms.',
            '3',
            'the shot cuts to',
          ),
          speech('<Subject 4>', 'S2', 'says in a casual young male voice with a playful tone and an easy conversational pace,', 'He just likes cookies more than me.'),
          visual("He closes his mouth into an apologetic smile and strokes the dog's thick white fur."),
          shot(
            'a close-up of <Subject 3> (S1), the blonde woman in the light-pink shirt from Shot 1. Her annoyance softens as she looks toward the Samoyed.',
            '5',
            'the shot cuts to',
          ),
          speech('<Subject 3>', 'S1', 'replies in the same clear youthful voice referenced from <Audio 1> with an amused cadence,', 'Well, he has good taste at least.'),
          visual('She smiles and raises the cookie in a small toast-like gesture.'),
          row('sound', { text: 'A classic canned audience laugh begins immediately after the line and continues through the final frame.' }),
        ],
      };
    },
  },
};
