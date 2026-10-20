import { AMPLITUDE, CAMERA_FIXED, CAMERA_MOTION, SPEED, TRANSITIONS } from './spec';
import type { Asset, Compiled, Part, Row, State } from './types';

const LABEL_FOR_KIND = { image: 'Picture', video: 'Video', audio: 'Audio' } as const;

/** Seconds as S.SS, e.g. 8 -> "8.00" (base-en.txt 2.1). */
export const fmtSeconds = (n: number) => n.toFixed(2);

/** Cut time as MM:SS.mmm, e.g. 3.5 -> "00:03.500" (base-en.txt 4.2). */
export function fmtCut(sec: number): string {
  const ms = Math.round(sec * 1000);
  const m = Math.floor(ms / 60000);
  const s = ((ms % 60000) / 1000).toFixed(3).padStart(6, '0');
  return `${String(m).padStart(2, '0')}:${s}`;
}

/** "<Picture 2>" for the 2nd image asset, etc. null if the asset no longer exists. */
export function assetLabel(assets: Asset[], id: string): string | null {
  const a = assets.find((x) => x.id === id);
  if (!a) return null;
  const n = assets.filter((x) => x.kind === a.kind).indexOf(a) + 1;
  return `<${LABEL_FOR_KIND[a.kind]} ${n}>`;
}

/** Every <Subject N>, <Picture N>, <Video N>, <Audio N> label in a string. */
export const labelRegex = () => /<(Subject|Picture|Video|Audio) (\d+)>/g;

function sentence(t: string): string {
  const s = t.trim();
  if (!s) return '';
  return /[.!?…"”)\]>]$/.test(s) ? s : s + '.';
}

/** "S1", "S1, S2" -> "S1,S2". */
export const normalizeId = (id: string) => id.replace(/\s+/g, '').toUpperCase();

/** Whether a row contributes to the prompt in the current mode. */
export function rowActive(row: Row, state: State): boolean {
  if (!row.enabled || row.type === 'comment') return false;
  if (row.type === 'define' && state.mode !== 'ref2va') return false;
  return true;
}

/** Labels of active `define` rows, keyed by row id. Subjects are numbered in sheet order. */
export function defineLabels(state: State): Record<string, string> {
  const out: Record<string, string> = {};
  let subjects = 0;
  for (const r of state.rows) {
    if (r.type !== 'define' || !rowActive(r, state)) continue;
    if (r.f.kind === 'subject') out[r.id] = `<Subject ${++subjects}>`;
    else {
      const label = r.f.asset ? assetLabel(state.assets, r.f.asset) : null;
      const want = r.f.kind.charAt(0).toUpperCase() + r.f.kind.slice(1);
      if (label && label.startsWith(`<${want} `)) out[r.id] = label;
    }
  }
  return out;
}

export function compileRow(row: Row): string {
  const f = row.f;
  switch (row.type) {
    case 'visual':
    case 'sound':
      return sentence(f.text ?? '');
    case 'raw':
      return (f.text ?? '').trim();
    case 'camera': {
      const motion = CAMERA_MOTION.find((o) => o.value === f.motion);
      if (!motion) return '';
      const fixed = CAMERA_FIXED.has(motion.value);
      const amp = fixed ? undefined : AMPLITUDE.find((o) => o.value === f.amplitude)?.phrase;
      const speed = fixed ? undefined : SPEED.find((o) => o.value === f.speed)?.phrase;
      let s = ['The camera', motion.phrase, amp, speed].filter(Boolean).join(' ');
      const detail = (f.detail ?? '').trim();
      if (detail) s += /^[,.;:]/.test(detail) ? detail : ' ' + detail;
      return sentence(s);
    }
    case 'speech': {
      const line = (f.line ?? '').trim();
      if (!line) return '';
      const vo = f.voiceover === 'yes';
      const who = (f.who ?? '').trim();
      const id = normalizeId(f.id ?? '');
      const verb = vo ? 'says in an off-screen voiceover:' : (f.verb ?? '').trim() || 'says:';
      const lang = (f.lang ?? '').trim() || 'English';
      // <d> holds only the language tag and the verbatim words; continuity markers
      // sit at the connecting point, just outside it.
      let s = [who, id && `(${id})`, verb].filter(Boolean).join(' ') + ' ';
      if (f.continuity === 'prev') s += '<scenetrans> ';
      s += `<d>[${lang}] ${line}</d>`;
      if (vo) s += ` while ${f.pronoun || 'their'} lips remain completely closed.`;
      if (f.continuity === 'next') s += ' <scenetrans> The line continues seamlessly across the cut.';
      if (f.continuity === 'cutoff') s += ' <cutoff>';
      return s;
    }
    case 'text': {
      const text = (f.text ?? '').trim();
      if (!text) return '';
      return sentence([(f.before ?? '').trim(), `"${text}"`, (f.after ?? '').trim()].filter(Boolean).join(' '));
    }
    case 'shot':
    case 'define':
    case 'comment':
      return '';
  }
}

/** The mode's alignment instruction (base-en.txt 2.1), or '' for T2VA and Ref2VA. */
export function instruction(state: State, lastShot: number): string {
  const S = fmtSeconds(state.duration);
  switch (state.mode) {
    case 'i2va':
      return 'For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.';
    case 'fl2va':
      return `How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot ${lastShot}) aligns with the ${S}-second mark of the target video.`;
    case 'l2va':
      return `How the reference pictures align with the target video — <Picture 1> (from [Shot ${lastShot}]) aligns with the ${S}-second mark of the target video.`;
    default:
      return '';
  }
}

interface Shot {
  parts: Part[];
}

function buildShots(state: State, shotOf: Record<string, number>): Shot[] {
  const ref = state.mode === 'ref2va';
  const style = state.doc.style.trim();
  const shots: Shot[] = [];
  const open = (rowId: string | undefined, body: string) => {
    const n = shots.length + 1;
    let head = `[Shot ${n}]`;
    if (n === 1) {
      if (!ref && style) head += ` ${style},`;
    } else {
      const row = state.rows.find((r) => r.id === rowId);
      const at = Number(row?.f.at);
      const transition = row?.f.transition || TRANSITIONS[0].value;
      head += ` At ${fmtCut(Number.isFinite(at) ? at : 0)}, ${transition}`;
    }
    shots.push({ parts: [{ rowId, text: body ? `${head} ${body}` : head }] });
  };
  for (const row of state.rows) {
    if (!rowActive(row, state) || row.type === 'define') continue;
    if (row.type === 'shot') {
      open(row.id, (row.f.text ?? '').trim());
      shotOf[row.id] = shots.length;
      continue;
    }
    const text = compileRow(row);
    if (!shots.length) open(undefined, '');
    shotOf[row.id] = shots.length;
    if (text) shots[shots.length - 1].parts.push({ rowId: row.id, text });
  }
  return shots;
}

/** Join parts with single spaces, keeping each part's row id for highlighting. */
function spaced(parts: Part[]): Part[] {
  const out: Part[] = [];
  parts.forEach((p, i) => {
    if (i) out.push({ text: ' ' });
    out.push(p);
  });
  return out;
}
const plain = (parts: Part[]) => parts.map((p) => p.text).join('');

export function soundscapeText(state: State): string {
  return state.doc.silent ? 'N/A' : state.doc.soundscape.trim();
}
export function musicText(state: State): string {
  return state.doc.music.trim() || 'N/A';
}

export function compile(state: State): Compiled {
  const shotOf: Record<string, number> = {};
  const shots = buildShots(state, shotOf);
  const shotTexts = shots.map((s) => plain(spaced(s.parts)));
  const lines: Part[][] = [];
  const blank = () => lines.push([]);
  let description: string;

  if (state.mode !== 'ref2va') {
    const instr = instruction(state, Math.max(1, shots.length));
    if (instr) {
      lines.push([{ text: instr }]);
      blank();
    }
    const body = spaced(shots.flatMap((s) => s.parts));
    description = plain(body);
    lines.push([{ text: 'integrated_multimodal_description: ' }, ...body]);
    blank();
    lines.push([{ text: `overall_soundscape: ${soundscapeText(state)}` }]);
    blank();
    lines.push([{ text: `non_diegetic_music: ${musicText(state)}` }]);
  } else {
    const labels = defineLabels(state);
    const defs = state.rows.filter((r) => labels[r.id]);

    lines.push([{ text: 'subject_definitions:' }]);
    for (const r of defs) {
      const def = (r.f.def ?? '').trim().replace(/^is\s+/i, '');
      lines.push([{ rowId: r.id, text: `${labels[r.id]} is ${sentence(def)}`.trim() }]);
    }
    blank();

    lines.push([{ text: 'summary:' }]);
    const prefix = state.doc.tasks.length ? `[${state.doc.tasks.join(' + ')}]` : '';
    lines.push([{ text: [prefix, state.doc.summary.trim()].filter(Boolean).join(' ') }]);
    blank();

    lines.push([{ text: 'retention_analysis:' }]);
    for (const r of defs) {
      const label = labels[r.id];
      const where = r.f.kind === 'audio' ? '' : (r.f.where ?? '').trim();
      let paren = where ? ` (${where})` : '';
      if (!where && r.f.kind === 'subject') {
        const inShots = shotTexts.map((t, i) => (t.includes(label) ? `[Shot ${i + 1}]` : '')).filter(Boolean);
        if (inShots.length) paren = ` (appears in ${inShots.join(', ')})`;
      }
      const note = sentence(r.f.note ?? '');
      lines.push([{ rowId: r.id, text: `${label}${paren}: ${r.f.marker}${note ? ' - ' + note : ''}` }]);
    }
    blank();

    lines.push([{ text: 'detailed_description:' }]);
    const opening = sentence(state.doc.styleOpening);
    if (opening) lines.push([{ text: opening }]);
    for (const s of shots) lines.push(spaced(s.parts));
    description = [opening, ...shotTexts].filter(Boolean).join('\n');
    blank();

    lines.push([{ text: 'overall_soundscape:' }]);
    lines.push([{ text: soundscapeText(state) }]);
    blank();
    lines.push([{ text: 'non_diegetic_music:' }]);
    lines.push([{ text: musicText(state) }]);
  }

  const text = lines.map(plain).join('\n');
  return { lines, text, shotOf, shots: shotTexts, description };
}
