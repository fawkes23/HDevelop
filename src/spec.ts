import type { ModeId, RowType } from './types';

/**
 * Everything the tool "knows" about MiniMax H3 lives here as data, so when the
 * model or a provider changes you edit this file, not the logic.
 *
 * Sources disagree in a few places (noted inline). Where they do, the tool
 * warns instead of blocking.
 */

export interface ModeSpec {
  id: ModeId;
  label: string;
  help: string;
  needsFirst: boolean;
  needsLast: boolean;
  usesRefs: boolean;
}

export const MODES: ModeSpec[] = [
  {
    id: 't2v',
    label: 'Text → video',
    help: 'Prompt only. Describe subject, action, camera, light and sound.',
    needsFirst: false,
    needsLast: false,
    usesRefs: false,
  },
  {
    id: 'i2v',
    label: 'Image → video',
    help: 'First frame is fixed. Describe the motion to add and what must stay the same.',
    needsFirst: true,
    needsLast: false,
    usesRefs: false,
  },
  {
    id: 'flf',
    label: 'First + last frame',
    help: 'Both frames are fixed. Describe how the shot travels between them.',
    needsFirst: true,
    needsLast: true,
    usesRefs: false,
  },
  {
    id: 'ref2v',
    label: 'Reference → video',
    help: 'Up to 9 images, 3 videos, 3 audio clips. Give each file one job and say what to ignore.',
    needsFirst: false,
    needsLast: false,
    usesRefs: true,
  },
];

export const LIMITS = {
  promptChars: 7000,
  promptWordsSoft: 1000, // MiniMax recommendation (~500 Chinese chars)
  durationMin: 4, // Magnific docs say 4-15; EvoLink/Kapwing/Fuser say 5-15
  durationSoftMin: 5,
  durationMax: 15,
  image: 9,
  video: 3,
  audio: 3,
  refTotal: 12, // EvoLink + Fuser: combined cap
};

export const ASPECTS = ['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'];

export interface Opt {
  value: string;
  label: string;
  phrase?: string;
}

export const CAMERA = {
  framing: [
    { value: '', label: '—' },
    { value: 'wide', label: 'Wide', phrase: 'wide shot' },
    { value: 'medium', label: 'Medium', phrase: 'medium shot' },
    { value: 'medium close-up', label: 'Medium close-up', phrase: 'medium close-up' },
    { value: 'close-up', label: 'Close-up', phrase: 'close-up' },
    { value: 'extreme close-up', label: 'Extreme close-up', phrase: 'extreme close-up' },
  ] as Opt[],
  movement: [
    { value: '', label: '—' },
    { value: 'locked', label: 'Locked-off', phrase: 'locked-off camera' },
    { value: 'dolly in', label: 'Dolly in', phrase: 'dolly in' },
    { value: 'dolly out', label: 'Dolly out', phrase: 'dolly out' },
    { value: 'track left', label: 'Track left', phrase: 'track left' },
    { value: 'track right', label: 'Track right', phrase: 'track right' },
    { value: 'pan', label: 'Pan', phrase: 'pan' },
    { value: 'tilt', label: 'Tilt', phrase: 'tilt' },
    { value: 'orbit', label: 'Orbit', phrase: 'orbit around the subject' },
    { value: 'crane', label: 'Crane', phrase: 'crane move' },
    { value: 'handheld', label: 'Handheld', phrase: 'handheld camera' },
    { value: 'rack focus', label: 'Rack focus', phrase: 'rack focus' },
    { value: 'whip pan', label: 'Whip pan', phrase: 'whip pan' },
  ] as Opt[],
  speed: [
    { value: '', label: '—' },
    { value: 'very slow', label: 'Very slow' },
    { value: 'slow', label: 'Slow' },
    { value: 'moderate', label: 'Moderate' },
    { value: 'fast', label: 'Fast' },
  ] as Opt[],
};

export const RETENTION: Opt[] = [
  { value: 'full', label: 'Preserve fully', phrase: 'Keep exactly' },
  { value: 'partial', label: 'Preserve partly', phrase: 'Keep partly' },
  { value: 'transfer', label: 'Transfer attributes only', phrase: 'Take only' },
  { value: 'weak', label: 'Weak reference', phrase: 'Use loosely for' },
];

/** Vague phrases the prompt guides call out as wasted tokens. */
export const VAGUE: { re: RegExp; tip: string }[] = [
  { re: /\bcinematic\b/i, tip: '"cinematic" is vague. Name the lens, light and grade you actually want.' },
  { re: /\bdynamic\b/i, tip: '"dynamic" is vague. Say what moves, how fast, and where it ends.' },
  { re: /\brealistic audio\b|\badd (some )?(realistic )?(sound|audio)\b/i, tip: 'Generic audio requests work poorly. List timed sound events instead.' },
  { re: /\bkeep (the )?\w+ consistent\b/i, tip: 'Name the attributes to keep (hair, jacket, face) instead of "keep consistent".' },
  { re: /\bmake it (look )?(good|better|beautiful|nice)\b/i, tip: 'Describe the look instead of "make it good".' },
];

/** Camera words that read as legacy Hailuo 2.x bracket commands. */
export const LEGACY_BRACKET =
  /^(push in|pull out|pan left|pan right|tilt up|tilt down|zoom in|zoom out|truck left|truck right|tracking shot|static shot|shake|pedestal up|pedestal down|pan|zoom|static|tilt|truck|push|pull)$/i;

/** [3–6s], [3-6], [Shot 2] are legitimate bracket use in H3 prompts. */
export const TIMESTAMP_BRACKET = /^\s*(shot\s*\d+|\d+(\.\d+)?\s*[–-]\s*\d+(\.\d+)?\s*s?)\s*$/i;

export type FieldKind = 'text' | 'long' | 'select' | 'asset';

export interface FieldSpec {
  key: string;
  label: string;
  kind: FieldKind;
  placeholder?: string;
  options?: Opt[];
  default?: string;
  showIf?: { key: string; value: string };
  grow?: boolean;
}

export interface BlockSpec {
  type: RowType;
  label: string;
  color: string;
  hint: string;
  timed: boolean;
  fields: FieldSpec[];
}

export const BLOCKS: Record<RowType, BlockSpec> = {
  reference: {
    type: 'reference',
    label: 'Reference',
    color: '#db2777',
    hint: 'Give a reference file one job, and say what to keep and ignore',
    timed: false,
    fields: [
      { key: 'asset', label: 'File', kind: 'asset' },
      { key: 'role', label: 'Is the…', kind: 'text', placeholder: 'main character / motion reference / voice', grow: true },
      { key: 'retention', label: 'Carry over', kind: 'select', options: RETENTION, default: 'full' },
      { key: 'keep', label: 'Attributes', kind: 'text', placeholder: 'face, red jacket, scar on left cheek', grow: true },
      { key: 'ignore', label: 'Ignore', kind: 'text', placeholder: 'background, lighting, camera movement', grow: true },
    ],
  },
  subject: {
    type: 'subject',
    label: 'Subject',
    color: '#6366f1',
    hint: 'Who or what is in frame, plus every detail that must not change',
    timed: false,
    fields: [{ key: 'text', label: 'Subject', kind: 'long', placeholder: 'A weathered fisherman in a yellow raincoat, grey beard, left hand missing two fingers', grow: true }],
  },
  action: {
    type: 'action',
    label: 'Action',
    color: '#d97706',
    hint: 'A physical event with materials and forces, not a vague verb',
    timed: true,
    fields: [{ key: 'text', label: 'Happens', kind: 'long', placeholder: 'He hauls a net over the gunwale, water streaming off the rope, and drops it on the deck', grow: true }],
  },
  camera: {
    type: 'camera',
    label: 'Camera',
    color: '#0284c7',
    hint: 'Shot size, ONE move, amplitude and speed',
    timed: true,
    fields: [
      { key: 'framing', label: 'Framing', kind: 'select', options: CAMERA.framing, default: '' },
      { key: 'movement', label: 'Move', kind: 'select', options: CAMERA.movement, default: '' },
      { key: 'speed', label: 'Speed', kind: 'select', options: CAMERA.speed, default: '' },
      { key: 'note', label: 'Detail', kind: 'text', placeholder: 'ends on his hands, 20 cm closer', grow: true },
    ],
  },
  light: {
    type: 'light',
    label: 'Light',
    color: '#ca8a04',
    hint: 'Source, direction, time of day, film character',
    timed: true,
    fields: [{ key: 'text', label: 'Lighting', kind: 'long', placeholder: 'Low sun from camera left, hard shadows, 35mm film grain', grow: true }],
  },
  sound: {
    type: 'sound',
    label: 'Sound',
    color: '#059669',
    hint: 'Dialogue (name the speaker), effects, music',
    timed: true,
    fields: [
      {
        key: 'kind',
        label: 'Kind',
        kind: 'select',
        default: 'effects',
        options: [
          { value: 'dialogue', label: 'Dialogue' },
          { value: 'effects', label: 'Effects' },
          { value: 'music', label: 'Music' },
        ],
      },
      { key: 'speaker', label: 'Speaker', kind: 'text', placeholder: 'the fisherman', showIf: { key: 'kind', value: 'dialogue' } },
      { key: 'text', label: 'Sound', kind: 'text', placeholder: 'Wet rope slapping wood, gulls overhead', grow: true },
    ],
  },
  limits: {
    type: 'limits',
    label: 'Limits',
    color: '#dc2626',
    hint: 'There is no negative prompt, so write constraints as plain sentences',
    timed: false,
    fields: [{ key: 'text', label: 'Constraint', kind: 'text', placeholder: 'No cuts. Single continuous shot. No text overlays.', grow: true }],
  },
  raw: {
    type: 'raw',
    label: 'Raw text',
    color: '#475569',
    hint: 'Escape hatch: anything the other blocks cannot express',
    timed: true,
    fields: [{ key: 'text', label: 'Text', kind: 'long', placeholder: 'Anything, inserted as written', grow: true }],
  },
  comment: {
    type: 'comment',
    label: 'Comment',
    color: '#94a3b8',
    hint: 'A note to yourself. Never added to the prompt',
    timed: false,
    fields: [{ key: 'text', label: 'Note', kind: 'text', placeholder: 'Try a slower dolly next time', grow: true }],
  },
};

export const BLOCK_ORDER: RowType[] = ['reference', 'subject', 'action', 'camera', 'light', 'sound', 'limits', 'raw', 'comment'];

export const PROVIDERS = {
  magnific: 'Magnific (Freepik) API',
  evolink: 'EvoLink API',
} as const;
