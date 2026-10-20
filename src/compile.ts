import { BLOCKS, CAMERA, RETENTION } from './spec';
import type { Asset, CiteStyle, Compiled, Group, Row, State, TimeWindow } from './types';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const fmt = (n: number) => String(+n.toFixed(2));
export const fmtWindow = (w: TimeWindow) => `[${fmt(w.start)}–${fmt(w.end)}s]`;
const whenKey = (w: TimeWindow | null) => (w ? `${w.start}-${w.end}` : '');

/** "Image 2" for the 2nd image asset, etc. null if the asset no longer exists. */
export function assetLabel(assets: Asset[], id: string): string | null {
  const a = assets.find((x) => x.id === id);
  if (!a) return null;
  const n = assets.filter((x) => x.kind === a.kind).indexOf(a) + 1;
  return `${cap(a.kind)} ${n}`;
}

/** Matches "Image 1", "image1", "@Image1", "Video 2", "Audio 3". */
export const mentionRegex = () => /(?<![A-Za-z])@?(Image|Video|Audio)\s?(\d{1,2})(?!\d)/gi;

export function normalizeMentions(text: string, style: CiteStyle): string {
  return text.replace(mentionRegex(), (_m, k: string, n: string) => {
    const kind = cap(k.toLowerCase());
    return style === 'at' ? `@${kind}${n}` : `${kind} ${n}`;
  });
}

function sentence(t: string): string {
  const s = t.trim();
  if (!s) return '';
  return /[.!?…"”)\]]$/.test(s) ? s : s + '.';
}

const stripQuotes = (s: string) => s.trim().replace(/^["“”']+|["“”']+$/g, '');

export function compileRow(row: Row, state: State): string {
  const f = row.f;
  switch (row.type) {
    case 'subject':
    case 'action':
    case 'light':
    case 'limits':
      return sentence(f.text ?? '');
    case 'raw':
      return (f.text ?? '').trim();
    case 'camera': {
      const framing = CAMERA.framing.find((o) => o.value === f.framing)?.phrase;
      const move = CAMERA.movement.find((o) => o.value === f.movement);
      const speed = f.movement && f.movement !== 'locked' ? f.speed : '';
      const parts = [
        framing,
        move?.phrase ? `${speed ? speed + ' ' : ''}${move.phrase}` : undefined,
        (f.note ?? '').trim() || undefined,
      ].filter(Boolean) as string[];
      return parts.length ? `Camera: ${parts.join(', ')}.` : '';
    }
    case 'sound': {
      const text = stripQuotes(f.text ?? '');
      if (!text) return '';
      if (f.kind === 'dialogue') {
        const who = (f.speaker ?? '').trim();
        return `${who ? cap(who) + ' says' : 'Spoken line'}: "${text}"`;
      }
      if (f.kind === 'music') return `Music: ${sentence(text)}`;
      return `Sound: ${sentence(text)}`;
    }
    case 'reference': {
      const label = f.asset ? assetLabel(state.assets, f.asset) : null;
      if (!label) return '';
      const out: string[] = [];
      const role = (f.role ?? '').trim();
      out.push(role ? `${label} is the ${role}.` : `${label}.`);
      const keep = (f.keep ?? '').trim();
      if (keep) {
        const verb = RETENTION.find((o) => o.value === f.retention)?.phrase ?? 'Keep';
        out.push(`${verb}: ${keep}.`);
      }
      const ignore = (f.ignore ?? '').trim();
      if (ignore) out.push(`Ignore: ${ignore}.`);
      return out.join(' ');
    }
    case 'comment':
      return '';
  }
}

/** Whether a row contributes to the prompt in the current mode. */
export function rowActive(row: Row, state: State): boolean {
  if (!row.enabled || row.type === 'comment') return false;
  if (row.type === 'reference' && state.mode !== 'ref2v') return false;
  return true;
}

export function compile(state: State): Compiled {
  const groups: Group[] = [];
  for (const row of state.rows) {
    if (!rowActive(row, state)) continue;
    const raw = compileRow(row, state);
    if (!raw) continue;
    const text = normalizeMentions(raw, state.citeStyle);
    const when = BLOCKS[row.type].timed ? row.when : null;
    const last = groups[groups.length - 1];
    if (last && whenKey(last.when) === whenKey(when)) last.parts.push({ rowId: row.id, text });
    else groups.push({ when, parts: [{ rowId: row.id, text }] });
  }
  const text = groups
    .map((g) => (g.when ? fmtWindow(g.when) + ' ' : '') + g.parts.map((p) => p.text).join(' '))
    .join('\n\n');
  return { groups, text };
}
