import { LIMITS } from '../spec';
import { groupIds, type ShotGroup } from '../shots';
import { normalizeId } from '../compile';
import type { Row, RowType, State } from '../types';

/**
 * Pure layout maths for the timeline. Nothing here touches the DOM, so the
 * rules that the timeline turns into "physics" (cut order, length limits,
 * beat order = prompt order) are unit-tested.
 */

/** Smallest gap between two cuts, and the drag snap step, in seconds. */
export const CUT_STEP = 0.5;

export interface Span {
  start: number;
  end: number;
}

const snap = (t: number, step = CUT_STEP) => Math.round(t / step) * step;

/**
 * Start/end of every shot for display. Missing or out-of-order cut times are
 * placed between their neighbours so the timeline always draws something sane;
 * lint still reports the real problem.
 */
export function shotSpans(groups: ShotGroup[], duration: number): Span[] {
  const starts: number[] = [];
  groups.forEach((g, i) => {
    if (i === 0) return starts.push(0);
    const prev = starts[i - 1];
    const raw = (g.head?.f.at ?? '').trim();
    const t = Number(raw);
    const valid = raw !== '' && Number.isFinite(t) && t > prev && t < duration;
    // Spread invalid ones evenly over the time that is left.
    starts.push(valid ? t : prev + (duration - prev) / (groups.length - i + 1));
  });
  return starts.map((s, i) => ({ start: s, end: i + 1 < starts.length ? starts[i + 1] : Math.max(duration, s) }));
}

/** Where a dragged cut may land: snapped, and at least one step from its neighbours. */
export function clampCut(spans: Span[], i: number, t: number, duration: number): number {
  const lo = spans[i - 1].start + CUT_STEP;
  const hi = (i + 1 < spans.length ? spans[i + 1].start : duration) - CUT_STEP;
  return Math.min(hi, Math.max(lo, snap(t)));
}

/** Where the end of the video may be dragged: whole seconds, 4–15 s, after the last cut. */
export function clampDuration(spans: Span[], t: number): number {
  const lastStart = spans.length ? spans[spans.length - 1].start : 0;
  const min = Math.max(LIMITS.durationMin, Math.ceil(lastStart + CUT_STEP));
  return Math.min(LIMITS.durationMax, Math.max(min, Math.round(t)));
}

/**
 * Beats: inside a shot, its rows are laid out left to right in row order, one
 * column each. Prompt order within a shot is row order, so what you see is the
 * order the prompt reads in.
 */
export function beatSlots(group: ShotGroup, span: Span): Map<string, Span> {
  const out = new Map<string, Span>();
  const n = group.rows.length;
  const w = (span.end - span.start) / Math.max(n, 1);
  group.rows.forEach((r, j) => out.set(r.id, { start: span.start + j * w, end: span.start + (j + 1) * w }));
  return out;
}

export type TrackId = 'camera' | 'action' | 'sound' | 'text' | 'notes' | `speech:${string}`;

export const TRACK_OF: Record<Exclude<RowType, 'shot' | 'define' | 'speech'>, TrackId> = {
  camera: 'camera',
  visual: 'action',
  raw: 'action',
  sound: 'sound',
  text: 'text',
  comment: 'notes',
};

/** The single speaker lane a dialogue line sits on: its first ID ("S1,S2" sits on S1). */
export const laneOf = (r: Row) => normalizeId(r.f.id ?? '').split(',')[0] || 'S1';

export function trackOf(r: Row): TrackId {
  if (r.type === 'speech') return `speech:${laneOf(r)}`;
  return TRACK_OF[r.type as keyof typeof TRACK_OF];
}

export interface Lane {
  id: string;
  /** Label for the lane: how the speaker is first described. */
  who: string;
}

/** Speaker lanes in the order each speaker first speaks. */
export function speakerLanes(state: State): Lane[] {
  const lanes: Lane[] = [];
  for (const r of state.rows) {
    if (r.type !== 'speech') continue;
    const ids = normalizeId(r.f.id ?? '').split(',').filter(Boolean);
    for (const id of ids) if (!lanes.some((l) => l.id === id)) lanes.push({ id, who: '' });
    const lane = lanes.find((l) => l.id === laneOf(r));
    if (lane && !lane.who && ids.length === 1) lane.who = (r.f.who ?? '').trim();
  }
  return lanes;
}

/** The next unused speaker ID. */
export function nextSpeakerId(lanes: Lane[]): string {
  let n = 1;
  while (lanes.some((l) => l.id === `S${n}`)) n++;
  return `S${n}`;
}

/** Which shot a time falls in. */
export function shotAt(spans: Span[], t: number): number {
  const i = spans.findIndex((s) => t < s.end);
  return i < 0 ? spans.length - 1 : i;
}

/** Index in `rows` to insert a new row into `group` before the first beat that starts after time `t`. */
export function insertIndex(rows: Row[], group: ShotGroup, span: Span, t: number, exclude?: string): number {
  const members = group.rows.filter((r) => r.id !== exclude);
  const n = members.length;
  const w = (span.end - span.start) / Math.max(n, 1);
  const k = members.filter((_, j) => span.start + (j + 0.5) * w < t).length;
  if (k < n) return rows.indexOf(members[k]);
  const ids = groupIds(group).filter((id) => id !== exclude);
  const last = ids[ids.length - 1];
  return last ? rows.findIndex((r) => r.id === last) + 1 : rows.length;
}

/**
 * Target for the reducer's `move` action when a clip is dropped at time `t`
 * in `group`: the index in the row list *without* the moved row.
 */
export function dropIndex(state: State, group: ShotGroup, span: Span, id: string, t: number): number {
  const without = state.rows.filter((r) => r.id !== id);
  return insertIndex(without, group, span, t, id);
}

/**
 * Neighbour to swap with for keyboard reordering: the previous/next row that
 * is not a reference label. Swapping with a Shot row moves the clip into the
 * neighbouring shot. Never moves a clip above the first shot.
 */
export function reorderTarget(state: State, id: string, dir: -1 | 1): number | null {
  const rows = state.rows;
  const i = rows.findIndex((r) => r.id === id);
  let j = i + dir;
  while (j >= 0 && j < rows.length && rows[j].type === 'define') j += dir;
  if (j < 0 || j >= rows.length) return null;
  const firstShot = rows.findIndex((r) => r.type === 'shot');
  if (dir < 0 && j === firstShot) return null;
  return j;
}
