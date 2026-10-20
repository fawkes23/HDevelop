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
  label: string;
  help: string;
  needsFirst: boolean;
  needsLast: boolean;
  usesRefs: boolean;
}

export const MODES: ModeSpec[] = [
  {
    id: 't2va',
    label: 'T2VA',
    help: 'Text only. Build the full audiovisual timeline from text. No image-alignment instruction.',
    needsFirst: false,
    needsLast: false,
    usesRefs: false,
  },
  {
    id: 'i2va',
    label: 'I2VA',
    help: '<Picture 1> is the first frame at 0.00 s. Anchor on it, then describe the action onset, development and result.',
    needsFirst: true,
    needsLast: false,
    usesRefs: false,
  },
  {
    id: 'fl2va',
    label: 'FL2VA',
    help: 'Picture 1 opens, Picture 2 ends. Describe the continuous path between them. Generally a single shot.',
    needsFirst: true,
    needsLast: true,
    usesRefs: false,
  },
  {
    id: 'l2va',
    label: 'L2VA',
    help: '<Picture 1> is the last frame of the final shot. Infer a plausible opening and converge onto it.',
    needsFirst: false,
    needsLast: true,
    usesRefs: false,
  },
  {
    id: 'ref2va',
    label: 'Ref2VA',
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
  { value: 'Zoom In', label: 'Zoom In', phrase: 'zooms in' },
  { value: 'Zoom Out', label: 'Zoom Out', phrase: 'zooms out' },
  { value: 'Push In', label: 'Push In', phrase: 'pushes in' },
  { value: 'Pull Out', label: 'Pull Out', phrase: 'pulls out' },
  { value: 'Pan Left', label: 'Pan Left', phrase: 'pans left' },
  { value: 'Pan Right', label: 'Pan Right', phrase: 'pans right' },
  { value: 'Truck Left', label: 'Truck Left', phrase: 'trucks left' },
  { value: 'Truck Right', label: 'Truck Right', phrase: 'trucks right' },
  { value: 'Tilt Up', label: 'Tilt Up', phrase: 'tilts up' },
  { value: 'Tilt Down', label: 'Tilt Down', phrase: 'tilts down' },
  { value: 'Pedestal Up', label: 'Pedestal Up', phrase: 'pedestals up' },
  { value: 'Pedestal Down', label: 'Pedestal Down', phrase: 'pedestals down' },
  { value: 'Arc Shot', label: 'Arc Shot', phrase: 'moves in an arc shot' },
  { value: 'Tracking Shot', label: 'Tracking Shot', phrase: 'follows in a tracking shot' },
  { value: 'Static Shot', label: 'Static Shot', phrase: 'holds a static shot' },
  { value: 'Shake Slightly', label: 'Shake Slightly', phrase: 'shakes slightly' },
  { value: 'Shake Strongly', label: 'Shake Strongly', phrase: 'shakes strongly' },
  { value: 'POV', label: 'POV', phrase: 'takes a POV shot' },
  { value: 'Roll Clockwise', label: 'Roll Clockwise', phrase: 'rolls clockwise' },
  { value: 'Roll Counterclockwise', label: 'Roll Counterclockwise', phrase: 'rolls counterclockwise' },
];
/** Motions where amplitude and speed have no meaning. */
export const CAMERA_FIXED = new Set(['Static Shot', 'POV']);

/** Medium amplitude and normal speed are omitted, per the guide. */
export const AMPLITUDE: Opt[] = [
  { value: '', label: 'medium (omitted)' },
  { value: 'small', label: 'small', phrase: 'with small amplitude' },
  { value: 'large', label: 'large', phrase: 'with large amplitude' },
];
export const SPEED: Opt[] = [
  { value: '', label: 'normal (omitted)' },
  { value: 'slow', label: 'slow', phrase: 'at slow speed' },
  { value: 'fast', label: 'fast', phrase: 'at fast speed' },
];

/** base-en.txt 4.2. The last three only when the user explicitly asks for them. */
export const TRANSITIONS: Opt[] = [
  { value: 'the camera cuts to', label: 'the camera cuts to' },
  { value: 'the shot cuts to', label: 'the shot cuts to' },
  { value: 'the shot transitions to', label: 'the shot transitions to' },
  { value: 'the shot changes to', label: 'the shot changes to' },
  { value: 'the shot switches to', label: 'the shot switches to' },
  { value: 'the shot transitions with a cross-dissolve to', label: 'cross-dissolve (explicit request)' },
  { value: 'the shot transitions with a fade to', label: 'fade (explicit request)' },
  { value: 'the shot transitions with a wipe to', label: 'wipe (explicit request)' },
];
export const EXPLICIT_ONLY_TRANSITIONS = new Set(TRANSITIONS.slice(5).map((o) => o.value));

/** base-en.txt 4.4: dialogue crossing a cut, or truncated by the end of the video. */
export const CONTINUITY: Opt[] = [
  { value: '', label: 'self-contained' },
  { value: 'next', label: 'continues into next shot (<scenetrans>)' },
  { value: 'prev', label: 'continued from previous shot (<scenetrans>)' },
  { value: 'cutoff', label: 'cut off by the end of the video (<cutoff>)' },
];

export const PRONOUNS: Opt[] = [
  { value: 'their', label: 'their' },
  { value: 'his', label: 'his' },
  { value: 'her', label: 'her' },
  { value: 'its', label: 'its' },
];

/** ref-en.txt 2: reference label kinds. */
export const LABEL_KINDS: Opt[] = [
  { value: 'subject', label: '<Subject N>' },
  { value: 'picture', label: '<Picture N>' },
  { value: 'video', label: '<Video N>' },
  { value: 'audio', label: '<Audio N>' },
];

/** ref-en.txt 4.1 / 4.2: fixed relationship markers. */
export const VISUAL_MARKERS: Opt[] = [
  { value: 'fully_preserved', label: 'fully_preserved' },
  { value: 'partially_preserved', label: 'partially_preserved' },
  { value: 'attribute_transfer', label: 'attribute_transfer' },
  { value: 'weak_reference', label: 'weak_reference' },
];
export const AUDIO_MARKERS: Opt[] = [
  { value: 'fully_copy', label: 'fully_copy' },
  { value: 'partially_copy', label: 'partially_copy' },
  { value: 'reference', label: 'reference' },
  { value: 'weak_reference', label: 'weak_reference' },
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
}

export interface BlockSpec {
  type: RowType;
  label: string;
  color: string;
  hint: string;
  fields: FieldSpec[];
}

const MARKERS_BY_KIND = { subject: VISUAL_MARKERS, picture: VISUAL_MARKERS, video: VISUAL_MARKERS, audio: AUDIO_MARKERS };

export const BLOCKS: Record<RowType, BlockSpec> = {
  shot: {
    type: 'shot',
    label: 'Shot',
    color: '#0f766e',
    hint: 'Starts [Shot N]: composition and what is in frame. Later shots need a strictly increasing cut time',
    fields: [
      { key: 'at', label: 'Cut at (s)', kind: 'number', placeholder: '3.5' },
      { key: 'transition', label: 'Cut', kind: 'select', options: TRANSITIONS, default: TRANSITIONS[0].value },
      {
        key: 'text',
        label: 'Composition',
        kind: 'long',
        placeholder: 'a medium-wide shot frames a baker opening the shutters of a small street bakery before sunrise.',
        grow: true,
      },
    ],
  },
  visual: {
    type: 'visual',
    label: 'Visual',
    color: '#d97706',
    hint: 'Subjects, appearance, environment, lighting, actions and reactions, as seen in this shot',
    fields: [{ key: 'text', label: 'Visual', kind: 'long', placeholder: 'She folds the letter along its existing crease.', grow: true }],
  },
  camera: {
    type: 'camera',
    label: 'Camera',
    color: '#0284c7',
    hint: 'Motion type + amplitude + speed, written as a natural English action',
    fields: [
      { key: 'motion', label: 'Motion', kind: 'select', options: CAMERA_MOTION, default: 'Push In' },
      { key: 'amplitude', label: 'Amplitude', kind: 'select', options: AMPLITUDE, default: '', hideIf: { key: 'motion', values: [...CAMERA_FIXED] } },
      { key: 'speed', label: 'Speed', kind: 'select', options: SPEED, default: '', hideIf: { key: 'motion', values: [...CAMERA_FIXED] } },
      { key: 'detail', label: 'Toward / while', kind: 'text', placeholder: 'toward the folded letter in her hands', grow: true },
    ],
  },
  speech: {
    type: 'speech',
    label: 'Speech',
    color: '#059669',
    hint: 'Dialogue, singing or voiceover with a stable speaker ID (S1), wrapped in <d>[Language] …</d>',
    fields: [
      { key: 'who', label: 'Speaker', kind: 'text', placeholder: 'The young woman with a quiet, breathy voice' },
      { key: 'id', label: 'ID', kind: 'text', placeholder: 'S1', default: 'S1' },
      { key: 'voiceover', label: 'Voice', kind: 'select', default: '', options: [{ value: '', label: 'on-screen' }, { value: 'yes', label: 'off-screen voiceover' }] },
      { key: 'verb', label: 'Action + verb', kind: 'text', placeholder: 'says:', default: 'says:', hideIf: { key: 'voiceover', values: ['yes'] } },
      { key: 'pronoun', label: 'Lips', kind: 'select', options: PRONOUNS, default: 'their', showIf: { key: 'voiceover', values: ['yes'] } },
      { key: 'lang', label: 'Language', kind: 'text', placeholder: 'English', default: 'English' },
      { key: 'line', label: 'Words (verbatim)', kind: 'long', placeholder: 'I get off at the next station.', grow: true },
      { key: 'continuity', label: 'Across cuts', kind: 'select', options: CONTINUITY, default: '' },
    ],
  },
  sound: {
    type: 'sound',
    label: 'Sound',
    color: '#16a34a',
    hint: 'Diegetic sound synchronized to this shot (an impact, a ringing phone, a radio the characters hear)',
    fields: [{ key: 'text', label: 'Sound', kind: 'long', placeholder: 'The entrance bell rings once.', grow: true }],
  },
  text: {
    type: 'text',
    label: 'On-screen text',
    color: '#9333ea',
    hint: 'Visible banner, sign, label, subtitle or neon text, quoted verbatim in its original language',
    fields: [
      { key: 'before', label: 'Before', kind: 'text', placeholder: 'A red neon sign reading' },
      { key: 'text', label: 'Text (verbatim)', kind: 'text', placeholder: '营业中' },
      { key: 'after', label: 'After', kind: 'text', placeholder: 'glows above the doorway.', grow: true },
    ],
  },
  define: {
    type: 'define',
    label: 'Reference label',
    color: '#db2777',
    hint: 'Ref2VA only: one line in subject_definitions and one in retention_analysis',
    fields: [
      { key: 'kind', label: 'Label', kind: 'select', options: LABEL_KINDS, default: 'subject' },
      {
        key: 'asset',
        label: 'Asset',
        kind: 'asset',
        showIf: { key: 'kind', values: ['picture', 'video', 'audio'] },
        assetKindBy: { key: 'kind', map: { picture: 'image', video: 'video', audio: 'audio' } },
      },
      { key: 'def', label: '… is', kind: 'long', placeholder: 'the young woman in <Picture 1>, with long dark hair, a blue cardigan, and a thin silver necklace.', grow: true },
      {
        key: 'where',
        label: 'Parenthetical',
        kind: 'text',
        placeholder: 'subject: auto "appears in [Shot N]" · picture: [Shot 1] first frame · video: cut and pacing structure',
        showIf: { key: 'kind', values: ['subject', 'picture', 'video'] },
      },
      { key: 'marker', label: 'Marker', kind: 'select', optionsBy: { key: 'kind', map: MARKERS_BY_KIND }, default: 'fully_preserved' },
      { key: 'note', label: 'Retention', kind: 'text', placeholder: 'her identity, long dark hair and blue cardigan are retained.', grow: true },
    ],
  },
  raw: {
    type: 'raw',
    label: 'Raw text',
    color: '#475569',
    hint: 'Escape hatch: inserted into the current shot exactly as written',
    fields: [{ key: 'text', label: 'Text', kind: 'long', placeholder: 'Anything, inserted as written', grow: true }],
  },
  comment: {
    type: 'comment',
    label: 'Comment',
    color: '#94a3b8',
    hint: 'A note to yourself. Never added to the prompt',
    fields: [{ key: 'text', label: 'Note', kind: 'text', placeholder: 'Try a slower push-in next time', grow: true }],
  },
};

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
