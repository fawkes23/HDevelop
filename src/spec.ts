import type { ModeId, RowType } from './types';

/**
 * Everything the tool "knows" about MiniMax H3 prompts lives here as data.
 *
 * Source of truth: the `h3-prompt-writing` skill in github.com/MiniMax-AI/MiniMax-H3
 * (skills/h3-prompt-writing: SKILL.md, references/base-en.txt, references/ref-en.txt).
 * Input limits come from the same repository's README.
 * Exact strings (instructions, field names, labels, markers, camera vocabulary)
 * are copied from those files; do not paraphrase them.
 */

export interface ModeSpec {
  id: ModeId;
  /** The skill's code for the mode. */
  label: string;
  /** Plain-language name and one-line description for the interface. */
  title: string;
  description: string;
  help: string;
  needsFirst: boolean;
  needsLast: boolean;
  usesRefs: boolean;
}

export const MODES: ModeSpec[] = [
  {
    id: 't2va',
    label: 'T2VA',
    title: 'Text to video',
    description: 'Describe everything in words.',
    help: 'Text only. Build the full audiovisual timeline from text. No image-alignment instruction.',
    needsFirst: false,
    needsLast: false,
    usesRefs: false,
  },
  {
    id: 'i2va',
    label: 'I2VA',
    title: 'Start from an image',
    description: 'Your image becomes the first frame.',
    help: '<Picture 1> is the first frame at 0.00 s. Anchor on it, then describe the action onset, development and result.',
    needsFirst: true,
    needsLast: false,
    usesRefs: false,
  },
  {
    id: 'fl2va',
    label: 'FL2VA',
    title: 'Start and end images',
    description: 'Two images become the first and last frames.',
    help: 'Picture 1 opens, Picture 2 ends. Describe the continuous path between them. Generally a single shot.',
    needsFirst: true,
    needsLast: true,
    usesRefs: false,
  },
  {
    id: 'l2va',
    label: 'L2VA',
    title: 'End on an image',
    description: 'Your image becomes the last frame.',
    help: '<Picture 1> is the last frame of the final shot. Infer a plausible opening and converge onto it.',
    needsFirst: false,
    needsLast: true,
    usesRefs: false,
  },
  {
    id: 'ref2va',
    label: 'Ref2VA',
    title: 'Reference materials',
    description: 'Guide the video with pictures, videos and audio.',
    help: 'Full-reference mode: subject_definitions, summary, retention_analysis, detailed_description, overall_soundscape, non_diegetic_music.',
    needsFirst: false,
    needsLast: false,
    usesRefs: true,
  },
];

/** MiniMax-H3 README: output 4–15 s; Ref2VA input caps. */
export const LIMITS = {
  durationMin: 4,
  durationMax: 15,
  image: 9,
  video: 3,
  audio: 3,
  refTotal: 12,
  /** ref-en.txt 5.2: generation-task detailed_description length. */
  refWordsMin: 350,
  refWordsMax: 500,
  soundscapeSentencesMax: 4,
  musicSentencesMax: 3,
};

/** "auto" lets the input image(s) set the ratio (H3-Base examples); the rest are from the README. */
export const ASPECTS = ['auto', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'];

/** base-en.txt 4.1: common styles for the start of [Shot 1]. */
export const STYLES = ['Cinematic', 'live-action', '2D-animated', '3D CG', 'claymation', 'watercolor', 'vintage film'];

/** README: stable dialogue languages. Any other language name can be typed. */
export const LANGUAGES = ['English', 'Chinese', 'Arabic', 'French', 'German', 'Italian', 'Japanese', 'Korean', 'Portuguese', 'Russian', 'Spanish'];

export interface Opt {
  value: string;
  label: string;
  phrase?: string;
}

/**
 * base-en.txt 4.3. `value` is the guide's motion-type name; `phrase` is how it is
 * written as a natural English action after "The camera".
 */
export const CAMERA_MOTION: Opt[] = [
  { value: 'Zoom In', label: 'Zoom in (lens magnifies)', phrase: 'zooms in' },
  { value: 'Zoom Out', label: 'Zoom out (lens widens)', phrase: 'zooms out' },
  { value: 'Push In', label: 'Push in (camera moves closer)', phrase: 'pushes in' },
  { value: 'Pull Out', label: 'Pull out (camera moves away)', phrase: 'pulls out' },
  { value: 'Pan Left', label: 'Pan left (turns left)', phrase: 'pans left' },
  { value: 'Pan Right', label: 'Pan right (turns right)', phrase: 'pans right' },
  { value: 'Truck Left', label: 'Truck left (slides left)', phrase: 'trucks left' },
  { value: 'Truck Right', label: 'Truck right (slides right)', phrase: 'trucks right' },
  { value: 'Tilt Up', label: 'Tilt up (looks up)', phrase: 'tilts up' },
  { value: 'Tilt Down', label: 'Tilt down (looks down)', phrase: 'tilts down' },
  { value: 'Pedestal Up', label: 'Pedestal up (rises)', phrase: 'pedestals up' },
  { value: 'Pedestal Down', label: 'Pedestal down (lowers)', phrase: 'pedestals down' },
  { value: 'Arc Shot', label: 'Arc (circles the subject)', phrase: 'moves in an arc shot' },
  { value: 'Tracking Shot', label: 'Tracking (follows the subject)', phrase: 'follows in a tracking shot' },
  { value: 'Static Shot', label: 'Static (stays still)', phrase: 'holds a static shot' },
  { value: 'Shake Slightly', label: 'Shake slightly', phrase: 'shakes slightly' },
  { value: 'Shake Strongly', label: 'Shake strongly', phrase: 'shakes strongly' },
  { value: 'POV', label: 'Point of view (through their eyes)', phrase: 'takes a POV shot' },
  { value: 'Roll Clockwise', label: 'Roll clockwise', phrase: 'rolls clockwise' },
  { value: 'Roll Counterclockwise', label: 'Roll counterclockwise', phrase: 'rolls counterclockwise' },
];
/** Motions where amplitude and speed have no meaning. */
export const CAMERA_FIXED = new Set(['Static Shot', 'POV']);

/** Medium amplitude and normal speed are omitted, per the guide. */
export const AMPLITUDE: Opt[] = [
  { value: '', label: 'Medium' },
  { value: 'small', label: 'Small', phrase: 'with small amplitude' },
  { value: 'large', label: 'Large', phrase: 'with large amplitude' },
];
export const SPEED: Opt[] = [
  { value: '', label: 'Normal' },
  { value: 'slow', label: 'Slow', phrase: 'at slow speed' },
  { value: 'fast', label: 'Fast', phrase: 'at fast speed' },
];

/** base-en.txt 4.2. The last three only when the user explicitly asks for them. */
export const TRANSITIONS: Opt[] = [
  { value: 'the camera cuts to', label: 'Cut (the camera cuts to)' },
  { value: 'the shot cuts to', label: 'Cut (the shot cuts to)' },
  { value: 'the shot transitions to', label: 'Transition (the shot transitions to)' },
  { value: 'the shot changes to', label: 'Change (the shot changes to)' },
  { value: 'the shot switches to', label: 'Switch (the shot switches to)' },
  { value: 'the shot transitions with a cross-dissolve to', label: 'Cross-dissolve (only if asked for)' },
  { value: 'the shot transitions with a fade to', label: 'Fade (only if asked for)' },
  { value: 'the shot transitions with a wipe to', label: 'Wipe (only if asked for)' },
];
export const EXPLICIT_ONLY_TRANSITIONS = new Set(TRANSITIONS.slice(5).map((o) => o.value));

/** base-en.txt 4.4: dialogue crossing a cut, or truncated by the end of the video. */
export const CONTINUITY: Opt[] = [
  { value: '', label: 'Complete line' },
  { value: 'next', label: 'Continues into the next shot' },
  { value: 'prev', label: 'Continues from the previous shot' },
  { value: 'cutoff', label: 'Cut off by the end of the video' },
];

export const PRONOUNS: Opt[] = [
  { value: 'their', label: 'their' },
  { value: 'his', label: 'his' },
  { value: 'her', label: 'her' },
  { value: 'its', label: 'its' },
];

/** ref-en.txt 2: reference label kinds. */
export const LABEL_KINDS: Opt[] = [
  { value: 'subject', label: 'Subject: person, object, place or style' },
  { value: 'picture', label: 'Picture used as an exact frame' },
  { value: 'video', label: 'Video to edit, continue or follow' },
  { value: 'audio', label: 'Audio to copy or follow' },
];

/** ref-en.txt 4.1 / 4.2: fixed relationship markers. */
export const VISUAL_MARKERS: Opt[] = [
  { value: 'fully_preserved', label: 'Keep fully (fully_preserved)' },
  { value: 'partially_preserved', label: 'Keep partly (partially_preserved)' },
  { value: 'attribute_transfer', label: 'Transfer traits to someone else (attribute_transfer)' },
  { value: 'weak_reference', label: 'Loose resemblance only (weak_reference)' },
];
export const AUDIO_MARKERS: Opt[] = [
  { value: 'fully_copy', label: 'Use the whole track (fully_copy)' },
  { value: 'partially_copy', label: 'Use part of it (partially_copy)' },
  { value: 'reference', label: 'Follow its voice or style only (reference)' },
  { value: 'weak_reference', label: 'Loose resemblance only (weak_reference)' },
];

/** ref-en.txt 3: summary task types. */
export const TASK_TYPES: { value: string; hint: string }[] = [
  { value: 'keyframe completion', hint: 'An image is a concrete frame anchor (first, key, last or edited keyframe)' },
  { value: 'reference generation', hint: 'Assets guide character, scene, style, action, camera or storyboard' },
  { value: 'video editing', hint: 'An existing source video is directly modified' },
  { value: 'video continuation', hint: 'New content continues or transitions from a source video' },
  { value: 'audio reuse', hint: 'The same audio signal is reused in full or in part' },
  { value: 'audio reference', hint: 'Only style, timbre, content, texture, beat or continuity is referenced' },
];

/** SKILL.md tips: abstract words to replace with concrete detail. */
export const VAGUE = /\b(cinematic|beautiful)\b/i;

/** base-en.txt 4.7: non_diegetic_music must not use mood words or explain emotional function. */
export const MUSIC_MOOD =
  /\b(sad|happy|joyful|emotional|epic|uplifting|melancholic|melancholy|heartwarming|nostalgic|tense|dramatic|hopeful|romantic|mysterious|cheerful|somber|ominous|inspiring|comforting|cozy|atmosphere|mood)\b/i;
export const MUSIC_FUNCTION = /\b(to evoke|evoking|creates? a sense|enhanc(es|ing) the|conveys?|reflects? (the|her|his|their)|underscor(es|ing) the)\b/i;

export type FieldKind = 'text' | 'long' | 'select' | 'asset' | 'number';

export interface FieldSpec {
  key: string;
  label: string;
  kind: FieldKind;
  placeholder?: string;
  options?: Opt[];
  /** Options that depend on another field's value. */
  optionsBy?: { key: string; map: Record<string, Opt[]> };
  /** For `asset`: which asset kind, taken from another field mapped to a kind. */
  assetKindBy?: { key: string; map: Record<string, string> };
  default?: string;
  showIf?: { key: string; values: string[] };
  hideIf?: { key: string; values: string[] };
  grow?: boolean;
  /** Short explanation shown under the label. */
  hint?: string;
  /** Shown under "More options" instead of always. */
  advanced?: boolean;
  /** Render a select as a row of buttons. */
  control?: 'segmented';
  /** Takes little horizontal space (short codes and numbers). */
  narrow?: boolean;
}

export interface BlockSpec {
  type: RowType;
  label: string;
  color: string;
  hint: string;
  /** Lucide icon name, resolved in the interface. */
  icon: string;
  fields: FieldSpec[];
}

const MARKERS_BY_KIND = { subject: VISUAL_MARKERS, picture: VISUAL_MARKERS, video: VISUAL_MARKERS, audio: AUDIO_MARKERS };

export const BLOCKS: Record<RowType, BlockSpec> = {
  shot: {
    type: 'shot',
    label: 'Shot',
    color: '#0f766e',
    icon: 'Film',
    hint: 'A new camera angle or moment. Every shot after the first starts at a later time',
    fields: [
      { key: 'at', label: 'Starts at', kind: 'number', placeholder: '3.5', hint: 'Seconds from the start of the video' },
      { key: 'transition', label: 'How it begins', kind: 'select', options: TRANSITIONS, default: TRANSITIONS[0].value, advanced: true },
      {
        key: 'text',
        label: 'What the camera sees',
        kind: 'long',
        placeholder: 'a medium-wide shot frames a baker opening the shutters of a small street bakery before sunrise.',
        hint: 'Shot size, who or what is in frame, and where',
        grow: true,
      },
    ],
  },
  visual: {
    type: 'visual',
    label: 'Action',
    color: '#b45309',
    icon: 'Eye',
    hint: 'What people and things do, how they look, the place and the light',
    fields: [{ key: 'text', label: 'What happens', kind: 'long', placeholder: 'She folds the letter along its existing crease.', grow: true }],
  },
  camera: {
    type: 'camera',
    label: 'Camera move',
    color: '#0e7490',
    icon: 'Video',
    hint: 'How the camera moves, how far and how fast',
    fields: [
      { key: 'motion', label: 'Movement', kind: 'select', options: CAMERA_MOTION, default: 'Push In', grow: true },
      { key: 'amplitude', label: 'How far', kind: 'select', control: 'segmented', options: AMPLITUDE, default: '', hideIf: { key: 'motion', values: [...CAMERA_FIXED] } },
      { key: 'speed', label: 'How fast', kind: 'select', control: 'segmented', options: SPEED, default: '', hideIf: { key: 'motion', values: [...CAMERA_FIXED] } },
      { key: 'detail', label: 'Toward or while', kind: 'text', placeholder: 'toward the folded letter in her hands', hint: 'Finishes the sentence "The camera pushes in…"', grow: true },
    ],
  },
  speech: {
    type: 'speech',
    label: 'Dialogue',
    color: '#15803d',
    icon: 'MessageSquareQuote',
    hint: 'Someone speaks, sings or narrates. Words are kept exactly as typed',
    fields: [
      { key: 'who', label: 'Who speaks', kind: 'text', placeholder: 'The young woman with a quiet, breathy voice', hint: 'Describe them and their voice the first time they speak', grow: true },
      { key: 'id', label: 'Speaker ID', kind: 'text', placeholder: 'S1', default: 'S1', hint: 'S1, S2… in speaking order', narrow: true },
      { key: 'line', label: 'Words', kind: 'long', placeholder: 'I get off at the next station.', grow: true },
      { key: 'verb', label: 'How they say it', kind: 'text', placeholder: 'says:', default: 'says:', hint: 'Text between the ID and the words, e.g. "whispers:"', advanced: true, hideIf: { key: 'voiceover', values: ['yes'] } },
      { key: 'lang', label: 'Language', kind: 'text', placeholder: 'English', default: 'English', advanced: true },
      {
        key: 'voiceover',
        label: 'Voice',
        kind: 'select',
        default: '',
        control: 'segmented',
        advanced: true,
        options: [
          { value: '', label: 'Seen speaking' },
          { value: 'yes', label: 'Voiceover' },
        ],
      },
      { key: 'pronoun', label: 'Whose lips stay closed', kind: 'select', options: PRONOUNS, default: 'their', advanced: true, showIf: { key: 'voiceover', values: ['yes'] } },
      { key: 'continuity', label: 'Line across shots', kind: 'select', options: CONTINUITY, default: '', advanced: true },
    ],
  },
  sound: {
    type: 'sound',
    label: 'Sound',
    color: '#4d7c0f',
    icon: 'Volume2',
    hint: 'A sound the characters hear at this moment, like a bell or a radio',
    fields: [{ key: 'text', label: 'What you hear', kind: 'long', placeholder: 'The entrance bell rings once.', grow: true }],
  },
  text: {
    type: 'text',
    label: 'On-screen text',
    color: '#be185d',
    icon: 'Type',
    hint: 'A sign, label or subtitle visible in the frame, kept in its original language',
    fields: [
      { key: 'before', label: 'Where it appears', kind: 'text', placeholder: 'A red neon sign reading', grow: true },
      { key: 'text', label: 'Exact text', kind: 'text', placeholder: '营业中', grow: true },
      { key: 'after', label: 'Then', kind: 'text', placeholder: 'glows above the doorway.', grow: true },
    ],
  },
  define: {
    type: 'define',
    label: 'Reference label',
    color: '#9f1239',
    icon: 'Tag',
    hint: 'Names something from your files so shots can refer to it',
    fields: [
      { key: 'kind', label: 'What it is', kind: 'select', options: LABEL_KINDS, default: 'subject' },
      {
        key: 'asset',
        label: 'File',
        kind: 'asset',
        showIf: { key: 'kind', values: ['picture', 'video', 'audio'] },
        assetKindBy: { key: 'kind', map: { picture: 'image', video: 'video', audio: 'audio' } },
      },
      {
        key: 'def',
        label: 'Description',
        kind: 'long',
        placeholder: 'the young woman in <Picture 1>, with long dark hair, a blue cardigan, and a thin silver necklace.',
        hint: 'Continues "<Subject 1> is …". Name the source files and the features to follow',
        grow: true,
      },
      { key: 'marker', label: 'How closely to follow it', kind: 'select', optionsBy: { key: 'kind', map: MARKERS_BY_KIND }, default: 'fully_preserved' },
      { key: 'note', label: 'What is kept', kind: 'text', placeholder: 'her identity, long dark hair and blue cardigan are retained.', grow: true },
      {
        key: 'where',
        label: 'Where it is used',
        kind: 'text',
        placeholder: 'subject: worked out from the shots · picture: [Shot 1] first frame · video: cut and pacing structure',
        hint: 'Written in brackets after the label in retention_analysis',
        advanced: true,
        grow: true,
        showIf: { key: 'kind', values: ['subject', 'picture', 'video'] },
      },
    ],
  },
  raw: {
    type: 'raw',
    label: 'Raw text',
    color: '#57534e',
    icon: 'Code',
    hint: 'Anything the other blocks can’t express, inserted exactly as written',
    fields: [{ key: 'text', label: 'Text', kind: 'long', placeholder: 'Anything, inserted as written', grow: true }],
  },
  comment: {
    type: 'comment',
    label: 'Note to self',
    color: '#78716c',
    icon: 'StickyNote',
    hint: 'Never added to the prompt',
    fields: [{ key: 'text', label: 'Note', kind: 'long', placeholder: 'Try a slower push-in next time', grow: true }],
  },
};

/** Blocks offered inside a shot, most common first. */
export const SHOT_BLOCKS: RowType[] = ['visual', 'camera', 'speech', 'sound'];
export const MORE_SHOT_BLOCKS: RowType[] = ['text', 'raw', 'comment'];

export const BLOCK_ORDER: RowType[] = ['shot', 'visual', 'camera', 'speech', 'sound', 'text', 'define', 'raw', 'comment'];

/** Field options for a row, resolving `optionsBy`. */
export function optionsFor(fd: FieldSpec, f: Record<string, string>): Opt[] {
  if (fd.optionsBy) return fd.optionsBy.map[f[fd.optionsBy.key]] ?? [];
  return fd.options ?? [];
}

export function fieldVisible(fd: FieldSpec, f: Record<string, string>): boolean {
  if (fd.showIf && !fd.showIf.values.includes(f[fd.showIf.key] ?? '')) return false;
  if (fd.hideIf && fd.hideIf.values.includes(f[fd.hideIf.key] ?? '')) return false;
  return true;
}
