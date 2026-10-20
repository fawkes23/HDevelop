import type { Asset, ModeId, Row, RowType, State, TimeWindow } from './types';

let n = 0;
const id = (p: string) => `${p}${++n}`;

function row(type: RowType, f: Record<string, string>, when: TimeWindow | null = null): Row {
  return { id: id('r'), type, enabled: true, when, f };
}
const asset = (kind: Asset['kind'], url: string): Asset => ({ id: id('a'), kind, url });

const base = (mode: ModeId): State => ({
  mode,
  provider: 'magnific',
  citeStyle: 'plain',
  duration: 8,
  aspect: mode === 'i2v' || mode === 'flf' ? 'adaptive' : '16:9',
  resolution: '2k',
  frames: { first: '', last: '' },
  assets: [],
  rows: [],
});

export const EXAMPLES: Record<string, { label: string; build: () => State }> = {
  t2v: {
    label: 'Text → video: fisherman',
    build: () => ({
      ...base('t2v'),
      rows: [
        row('comment', { text: 'Start here, then add time windows to split into shots.' }),
        row('subject', { text: 'A weathered fisherman in a yellow raincoat, grey beard, rope-scarred hands' }),
        row('action', { text: 'He hauls a wet net over the gunwale and drops it on the deck, water streaming off the mesh' }),
        row('camera', { framing: 'medium', movement: 'dolly in', speed: 'slow', note: 'ending on his hands' }),
        row('light', { text: 'Low sun from camera left, hard shadows, 35mm film grain' }),
        row('sound', { kind: 'effects', speaker: '', text: 'Wet rope slapping wood, gulls overhead' }),
        row('limits', { text: 'Single continuous shot, no cuts, no text overlays.' }),
      ],
    }),
  },
  i2v: {
    label: 'Image → video: portrait',
    build: () => ({
      ...base('i2v'),
      frames: { first: 'https://example.com/portrait.png', last: '' },
      rows: [
        row('action', { text: 'She turns her head toward the window and smiles slightly, hair settling over one shoulder' }),
        row('camera', { framing: 'medium close-up', movement: 'dolly in', speed: 'very slow', note: 'about 10 cm closer by the end' }),
        row('limits', { text: 'Keep her face, hairstyle, jacket and the room exactly as in the first frame. Single shot, no cuts.' }),
      ],
    }),
  },
  flf: {
    label: 'First + last frame: day to night',
    build: () => ({
      ...base('flf'),
      frames: { first: 'https://example.com/city-day.png', last: 'https://example.com/city-night.png' },
      rows: [
        row('action', { text: 'Daylight fades to dusk, streetlights flicker on one by one, traffic trails stretch along the avenue' }),
        row('camera', { framing: 'wide', movement: 'locked', speed: '', note: 'tripod, no movement' }),
        row('limits', { text: 'Keep the buildings and framing identical to both frames.' }),
      ],
    }),
  },
  ref2v: {
    label: 'Reference → video: character + motion + voice',
    build: () => {
      const img = asset('image', 'https://example.com/hero.png');
      const img2 = asset('image', 'https://example.com/street.png');
      const vid = asset('video', 'https://example.com/hand-motion.mp4');
      const aud = asset('audio', 'https://example.com/voice.mp3');
      return {
        ...base('ref2v'),
        duration: 10,
        aspect: 'adaptive',
        assets: [img, img2, vid, aud],
        rows: [
          row('reference', { asset: img.id, role: 'main character', retention: 'full', keep: 'face, short black hair, red jacket', ignore: 'background' }),
          row('reference', { asset: img2.id, role: 'location', retention: 'transfer', keep: 'buildings, wet asphalt, neon signs', ignore: 'people, cars' }),
          row('reference', { asset: vid.id, role: 'motion reference', retention: 'transfer', keep: 'hand gesture timing', ignore: 'actor, setting, lighting, camera movement' }),
          row('reference', { asset: aud.id, role: 'voice', retention: 'partial', keep: 'tone and pace', ignore: 'background noise' }),
          row('action', { text: 'The main character walks down the street and raises her hand, copying the gesture timing' }, { start: 0, end: 5 }),
          row('camera', { framing: 'medium', movement: 'track left', speed: 'slow', note: 'matching her walking pace' }, { start: 0, end: 5 }),
          row('action', { text: 'She stops under a neon sign and looks straight into the lens' }, { start: 5, end: 10 }),
          row('camera', { framing: 'close-up', movement: 'locked', speed: '', note: '' }, { start: 5, end: 10 }),
          row('sound', { kind: 'dialogue', speaker: 'the main character', text: 'We should have left an hour ago.' }, { start: 6, end: 9 }),
        ],
      };
    },
  },
};
