import type { Compiled, Row, State } from './types';

/** A shot as the editor shows it: its Shot row (if any) and the rows under it. */
export interface ShotGroup {
  key: string;
  head: Row | null;
  /** Rows under the head, in order. Reference labels are not part of any shot. */
  rows: Row[];
  /** Number in the compiled prompt, or null when the shot is turned off. */
  number: number | null;
}

/**
 * Group the flat row list into shots the same way the compiler does: a Shot row
 * starts a group; rows before the first Shot row form an implicit Shot 1.
 */
export function shotGroups(state: State, compiled: Compiled): ShotGroup[] {
  const groups: ShotGroup[] = [];
  for (const r of state.rows) {
    if (r.type === 'define') continue;
    if (r.type === 'shot') {
      groups.push({ key: r.id, head: r, rows: [], number: r.enabled ? (compiled.shotOf[r.id] ?? null) : null });
      continue;
    }
    if (!groups.length) groups.push({ key: 'implicit', head: null, rows: [], number: 1 });
    groups[groups.length - 1].rows.push(r);
  }
  return groups;
}

export const groupIds = (g: ShotGroup) => [...(g.head ? [g.head.id] : []), ...g.rows.map((r) => r.id)];

/** Start time of a group in seconds (0 for the first). */
export function groupStart(g: ShotGroup, index: number): number | null {
  if (index === 0 || !g.head) return 0;
  const at = Number(g.head.f.at);
  return (g.head.f.at ?? '').trim() && Number.isFinite(at) ? at : null;
}

/** One-line description for lists. */
export function groupSummary(g: ShotGroup): string {
  const text = [g.head?.f.text, ...g.rows.map((r) => r.f.text || r.f.line || r.f.detail)].find((t) => (t ?? '').trim());
  if (!text) return 'Nothing described yet';
  const clean = text.replace(/<(Subject|Picture|Video|Audio) (\d+)>/g, '$1 $2').trim();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/** A sensible start time for a new shot appended after the existing ones. */
export function suggestStart(state: State, compiled: Compiled): string {
  const groups = shotGroups(state, compiled);
  if (!groups.length) return '';
  const last = groups.length > 1 ? (groupStart(groups[groups.length - 1], groups.length - 1) ?? 0) : 0;
  const at = Math.round(((last + state.duration) / 2) * 2) / 2;
  return at > last && at < state.duration ? String(at) : '';
}

export const fmtTime = (s: number) => `${+s.toFixed(2)} s`;
