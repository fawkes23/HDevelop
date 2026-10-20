import { compile, defineLabels } from './compile';
import { AMPLITUDE, CAMERA_FIXED, CAMERA_MOTION, LIMITS, MODES, SPEED, STYLES, TRANSITIONS } from './spec';
import { newRow, uid } from './store';
import type { Asset, AssetKind, Doc, ModeId, Row, State } from './types';

/**
 * Read a prompt written in the h3-prompt-writing format back into a project.
 * This is compile.ts in reverse: for prompts in that format,
 * compile(parsePrompt(text).state).text === text.
 *
 * Sound effects and on-screen text compile to plain sentences, so they come
 * back as Action clips; the prompt text is the same either way.
 */

export interface ParseResult {
  state: State;
  summary: { mode: string; shots: number; clips: number; speakers: number; links: number };
}
export type Parsed = ParseResult | { error: string };

const BASE_KEYS = ['integrated_multimodal_description', 'overall_soundscape', 'non_diegetic_music'] as const;
const REF_KEYS = ['subject_definitions', 'summary', 'retention_analysis', 'detailed_description', 'overall_soundscape', 'non_diegetic_music'] as const;
const KIND: Record<string, AssetKind> = { Picture: 'image', Video: 'video', Audio: 'audio' };

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const motionByPhrase = [...CAMERA_MOTION].sort((a, b) => b.phrase!.length - a.phrase!.length);
const CAMERA_RE = new RegExp(
  `^The camera (${motionByPhrase.map((o) => esc(o.phrase!)).join('|')})( with (?:small|large) amplitude)?( at (?:slow|fast) speed)?(.*)$`,
  's',
);
/**
 * A dialogue line: "<who> (S1) <verb> [<scenetrans> ]<d>[Lang] words</d>" plus the
 * optional voiceover, cross-cut and cut-off tails that compile.ts writes.
 * The verb may not contain a sentence end or another speaker ID, so an "(S1)" in
 * a description is not mistaken for a line.
 */
const SPEECH_RE =
  /([^.!?]*?)\s*\((S\d+(?:,S\d+)*)\)\s+((?:(?!<d>|<scenetrans>|\(S\d)[^.!?])*?)\s*(<scenetrans>\s+)?<d>\[([^\]]+)\]\s([\s\S]*?)<\/d>( while (\w+) lips remain completely closed\.)?( <scenetrans> The line continues seamlessly across the cut\.)?( <cutoff>)?/g;

/** Text after `key:` up to the next known key at the start of a line. */
function sections(text: string, keys: readonly string[]): Record<string, string> | null {
  const re = new RegExp(`^(${keys.join('|')}):[ \\t]*`, 'gm');
  const hits = [...text.matchAll(re)];
  if (!hits.length) return null;
  const out: Record<string, string> = {};
  hits.forEach((m, i) => {
    const start = m.index! + m[0].length;
    const end = i + 1 < hits.length ? hits[i + 1].index! : text.length;
    out[m[1]] = text.slice(start, end).trim();
  });
  return out;
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?]["”’)\]]?)\s+(?=[A-Z<"“(\[])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function cameraRow(s: string): Row | null {
  const m = CAMERA_RE.exec(s);
  if (!m) return null;
  const motion = motionByPhrase.find((o) => o.phrase === m[1])!;
  const row = newRow('camera');
  const fixed = CAMERA_FIXED.has(motion.value);
  row.f.motion = motion.value;
  let detail = m[4];
  if (fixed) detail = (m[2] ?? '') + (m[3] ?? '') + detail;
  else {
    row.f.amplitude = AMPLITUDE.find((o) => o.phrase && m[2]?.trim() === o.phrase)?.value ?? '';
    row.f.speed = SPEED.find((o) => o.phrase && m[3]?.trim() === o.phrase)?.value ?? '';
  }
  row.f.detail = detail.trim();
  return row;
}

/** Plain sentences → camera clips, with the sentences between them grouped into Action clips. */
function textRows(text: string): Row[] {
  const rows: Row[] = [];
  let pending: string[] = [];
  const flush = () => {
    if (!pending.length) return;
    const r = newRow('visual');
    r.f.text = pending.join(' ');
    rows.push(r);
    pending = [];
  };
  for (const s of sentences(text)) {
    const cam = cameraRow(s);
    if (cam) {
      flush();
      rows.push(cam);
    } else pending.push(s);
  }
  flush();
  return rows;
}

function speechRow(m: RegExpMatchArray): Row {
  const r = newRow('speech');
  const verb = m[3].trim();
  r.f.who = m[1].trim();
  r.f.id = m[2];
  r.f.lang = m[5];
  r.f.line = m[6];
  if (verb === 'says in an off-screen voiceover:') {
    r.f.voiceover = 'yes';
    r.f.pronoun = m[8] || 'their';
  } else r.f.verb = verb;
  r.f.continuity = m[4] ? 'prev' : m[9] ? 'next' : m[10] ? 'cutoff' : '';
  return r;
}

/** The body of one shot: its first sentence is the camera view, the rest become clips. */
function shotBody(body: string): { head: string; rows: Row[] } {
  const parts: ({ text: string } | { speech: RegExpMatchArray })[] = [];
  let last = 0;
  for (const m of body.matchAll(SPEECH_RE)) {
    if (m.index! > last) parts.push({ text: body.slice(last, m.index) });
    parts.push({ speech: m });
    last = m.index! + m[0].length;
  }
  if (last < body.length) parts.push({ text: body.slice(last) });

  let head = '';
  const rows: Row[] = [];
  parts.forEach((p, i) => {
    if ('speech' in p) return rows.push(speechRow(p.speech));
    let text = p.text.trim();
    if (!text) return;
    if (i === 0) {
      const [first, ...rest] = sentences(text);
      head = first;
      text = rest.join(' ');
    }
    rows.push(...textRows(text));
  });
  return { head, rows };
}

/** Split "[Shot 1] … [Shot 2] At 00:03.500, the camera cuts to …" into shot rows and clips. */
function parseShots(text: string, styleOut: { style: string } | null): Row[] {
  const marks = [...text.matchAll(/\[Shot (\d+)\]\s?/g)];
  const rows: Row[] = [];
  marks.forEach((m, i) => {
    let body = text.slice(m.index! + m[0].length, i + 1 < marks.length ? marks[i + 1].index : text.length).trim();
    const shot = newRow('shot');
    if (i === 0) {
      if (styleOut) {
        const words = body.split(', ');
        const known = new Set(STYLES.map((w) => w.toLowerCase()));
        let n = 0;
        while (n < words.length - 1 && known.has(words[n].toLowerCase())) n++;
        if (n) {
          styleOut.style = words.slice(0, n).join(', ');
          body = words.slice(n).join(', ');
        }
      }
    } else {
      const t = /^At (\d+):(\d\d(?:\.\d+)?), /.exec(body);
      if (t) {
        shot.f.at = String(+(Number(t[1]) * 60 + Number(t[2])).toFixed(3));
        body = body.slice(t[0].length);
      }
      const tr = [...TRANSITIONS].sort((a, b) => b.value.length - a.value.length).find((o) => body === o.value || body.startsWith(o.value + ' '));
      if (tr) {
        shot.f.transition = tr.value;
        body = body.slice(tr.value.length).trim();
      }
    }
    const { head, rows: inner } = shotBody(body);
    shot.f.text = head;
    rows.push(shot, ...inner);
  });
  return rows;
}

function instructionMode(line: string): { mode: ModeId; duration?: number } | null {
  if (/^For the target video, at 0\.00 seconds into the target video, <Picture 1> \(from \[Shot 1\]\) is fully referenced\.$/.test(line)) return { mode: 'i2va' };
  const fl = /^How the reference pictures align with the target video — Picture 1 \(from Shot 1\) aligns with the 0\.00-second mark of the target video; Picture 2 \(from Shot \d+\) aligns with the ([\d.]+)-second mark of the target video\.$/.exec(line);
  if (fl) return { mode: 'fl2va', duration: Number(fl[1]) };
  const l = /^How the reference pictures align with the target video — <Picture 1> \(from \[Shot \d+\]\) aligns with the ([\d.]+)-second mark of the target video\.$/.exec(line);
  if (l) return { mode: 'l2va', duration: Number(l[1]) };
  return null;
}

/** Long enough for every cut, at least 8 s, within the 4–15 s range. */
function fitDuration(rows: Row[]): number {
  const cuts = rows.filter((r) => r.type === 'shot').map((r) => Number(r.f.at) || 0);
  const need = Math.ceil(Math.max(0, ...cuts) + 1);
  return Math.min(LIMITS.durationMax, Math.max(8, need));
}

function blankDoc(): Doc {
  return { style: '', styleOpening: '', tasks: [], summary: '', soundscape: '', silent: false, music: '' };
}

function audioSections(doc: Doc, sc: string | undefined, music: string | undefined) {
  if ((sc ?? '').trim() === 'N/A') doc.silent = true;
  else doc.soundscape = (sc ?? '').trim();
  doc.music = (music ?? '').trim() === 'N/A' ? '' : (music ?? '').trim();
}

export function parsePrompt(input: string): Parsed {
  const text = input.replace(/\r\n?/g, '\n').trim();
  if (!text) return { error: 'Paste a prompt first.' };

  /* ---------- full-reference mode ---------- */
  const ref = /^subject_definitions:\s*$/m.test(text) && /^detailed_description:\s*$/m.test(text);
  if (ref) {
    const sec = sections(text, REF_KEYS)!;
    const doc = blankDoc();
    // Assets: as many of each kind as the prompt refers to. Links are filled in afterwards.
    const max: Record<AssetKind, number> = { image: 0, video: 0, audio: 0 };
    for (const m of text.matchAll(/<(Picture|Video|Audio) (\d+)>/g)) max[KIND[m[1]]] = Math.max(max[KIND[m[1]]], Number(m[2]));
    const assets: Asset[] = [];
    (['image', 'video', 'audio'] as AssetKind[]).forEach((k) => {
      for (let i = 0; i < max[k]; i++) assets.push({ id: uid(), kind: k, url: '' });
    });
    const assetFor = (kind: AssetKind, n: number) => assets.filter((a) => a.kind === kind)[n - 1]?.id ?? '';

    const defines: Row[] = [];
    const byLabel = new Map<string, Row>();
    for (const line of (sec.subject_definitions ?? '').split('\n').map((l) => l.trim()).filter(Boolean)) {
      const m = /^<(Subject|Picture|Video|Audio) (\d+)> is (.*)$/s.exec(line);
      if (!m) continue;
      const r = newRow('define');
      r.f.kind = m[1].toLowerCase();
      if (m[1] !== 'Subject') r.f.asset = assetFor(KIND[m[1]], Number(m[2]));
      r.f.def = m[3];
      r.f.marker = m[1] === 'Audio' ? 'reference' : 'fully_preserved';
      r.f.where = '';
      r.f.note = '';
      defines.push(r);
      byLabel.set(`<${m[1]} ${m[2]}>`, r);
    }
    for (const line of (sec.retention_analysis ?? '').split('\n').map((l) => l.trim()).filter(Boolean)) {
      const m = /^(<(?:Subject|Picture|Video|Audio) \d+>)(?: \((.*)\))?: ([a-z_]+)(?: - (.*))?$/s.exec(line);
      const r = m && byLabel.get(m[1]);
      if (!r) continue;
      r.f.where = m[2] ?? '';
      r.f.marker = m[3];
      r.f.note = m[4] ?? '';
    }

    const sm = /^\[([^\]]*)\]\s*([\s\S]*)$/.exec(sec.summary ?? '');
    doc.tasks = sm ? sm[1].split(' + ').map((t) => t.trim()).filter(Boolean) : [];
    doc.summary = sm ? sm[2].trim() : (sec.summary ?? '').trim();

    const desc = sec.detailed_description ?? '';
    const firstShot = desc.search(/\[Shot \d+\]/);
    doc.styleOpening = (firstShot < 0 ? desc : desc.slice(0, firstShot)).trim();
    const shots = firstShot < 0 ? [] : parseShots(desc.slice(firstShot).replace(/\n+(?=\[Shot \d+\])/g, ' '), null);
    audioSections(doc, sec.overall_soundscape, sec.non_diegetic_music);

    const state: State = { mode: 'ref2va', duration: fitDuration(shots), aspect: 'auto', frames: { first: '', last: '' }, assets, doc, rows: [...defines, ...shots] };
    // A subject's "(appears in …)" that matches what the shots say is left to be worked out live.
    const compiled = compile(state);
    const labels = defineLabels(state);
    for (const r of defines) {
      if (r.f.kind !== 'subject' || !r.f.where) continue;
      const auto = compiled.shots.map((t, i) => (t.includes(labels[r.id]) ? `[Shot ${i + 1}]` : '')).filter(Boolean);
      if (auto.length && r.f.where === `appears in ${auto.join(', ')}`) r.f.where = '';
    }
    return finish(state);
  }

  /* ---------- base modes ---------- */
  const sec = sections(text, BASE_KEYS);
  if (!sec || sec.integrated_multimodal_description === undefined) {
    return { error: 'This doesn’t look like an H3 prompt. H3 prompts have sections such as integrated_multimodal_description: or subject_definitions:.' };
  }
  const before = text.slice(0, text.search(/^integrated_multimodal_description:/m)).trim();
  const instr = before ? instructionMode(before.split('\n')[0].trim()) : null;
  const mode: ModeId = instr?.mode ?? 't2va';
  const doc = blankDoc();
  const styleOut = { style: '' };
  const rows = parseShots(sec.integrated_multimodal_description, styleOut);
  doc.style = styleOut.style;
  audioSections(doc, sec.overall_soundscape, sec.non_diegetic_music);
  const state: State = {
    mode,
    duration: instr?.duration ?? fitDuration(rows),
    aspect: mode === 't2va' ? '16:9' : 'auto',
    frames: { first: '', last: '' },
    assets: [],
    doc,
    rows,
  };
  return finish(state);
}

function finish(state: State): ParseResult {
  const mode = MODES.find((m) => m.id === state.mode)!;
  const ids = new Set(state.rows.filter((r) => r.type === 'speech').flatMap((r) => r.f.id.split(',')));
  const links = state.assets.length + (mode.needsFirst ? 1 : 0) + (mode.needsLast ? 1 : 0);
  return {
    state,
    summary: {
      mode: mode.title,
      shots: state.rows.filter((r) => r.type === 'shot').length,
      clips: state.rows.filter((r) => r.type !== 'shot' && r.type !== 'define').length,
      speakers: ids.size,
      links,
    },
  };
}

/** Fallback for plain prose: a text-to-video project with the text as Shot 1's camera view. */
export function proseProject(text: string): State {
  const shot = newRow('shot');
  shot.f.text = text.trim();
  return { mode: 't2va', duration: 8, aspect: '16:9', frames: { first: '', last: '' }, assets: [], doc: blankDoc(), rows: [shot] };
}

/** An empty project with one shot to type into. */
export function blankProject(): State {
  return { mode: 't2va', duration: 8, aspect: '16:9', frames: { first: '', last: '' }, assets: [], doc: blankDoc(), rows: [newRow('shot')] };
}
