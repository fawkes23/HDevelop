import { useEffect, useReducer } from 'react';
import { BLOCKS, MODES, optionsFor } from './spec';
import { EXAMPLES } from './examples';
import type { Action, Row, RowType, State } from './types';

const KEY = 'hailuo-sheet:v2';

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);

export function newRow(type: RowType): Row {
  const f: Record<string, string> = {};
  for (const fd of BLOCKS[type].fields) f[fd.key] = fd.default ?? '';
  return { id: uid(), type, enabled: true, f };
}

export function reducer(s: State, a: Action): State {
  switch (a.t) {
    case 'settings':
      return { ...s, ...a.patch };
    case 'doc':
      return { ...s, doc: { ...s.doc, ...a.patch } };
    case 'frame':
      return { ...s, frames: { ...s.frames, [a.which]: a.url } };
    case 'addAsset':
      return { ...s, assets: [...s.assets, a.asset] };
    case 'setAsset':
      return { ...s, assets: s.assets.map((x) => (x.id === a.id ? { ...x, url: a.url } : x)) };
    case 'delAsset':
      return {
        ...s,
        assets: s.assets.filter((x) => x.id !== a.id),
        // keep rows, but clear the dangling pointer so lint can point at it
        rows: s.rows.map((r) => (r.f.asset === a.id ? { ...r, f: { ...r.f, asset: '' } } : r)),
      };
    case 'addRow':
      return { ...s, rows: [...s.rows, a.row] };
    case 'insertRow': {
      const rows = s.rows.slice();
      rows.splice(Math.max(0, Math.min(rows.length, a.index)), 0, a.row);
      return { ...s, rows };
    }
    case 'delRows':
      return { ...s, rows: s.rows.filter((r) => !a.ids.includes(r.id)) };
    case 'moveShot':
      return moveShot(s, a.from, a.to);
    case 'field':
      return { ...s, rows: s.rows.map((r) => (r.id === a.id ? { ...r, f: dependents(r, { ...r.f, [a.key]: a.value }, a.key) } : r)) };
    case 'toggle':
      return { ...s, rows: s.rows.map((r) => (r.id === a.id ? { ...r, enabled: !r.enabled } : r)) };
    case 'move': {
      const from = s.rows.findIndex((r) => r.id === a.id);
      if (from < 0) return s;
      const to = Math.max(0, Math.min(s.rows.length - 1, a.to));
      if (from === to) return s;
      const rows = s.rows.slice();
      const [item] = rows.splice(from, 1);
      rows.splice(to, 0, item);
      return { ...s, rows };
    }
    case 'dup': {
      const i = s.rows.findIndex((r) => r.id === a.id);
      if (i < 0) return s;
      const src = s.rows[i];
      const rows = s.rows.slice();
      rows.splice(i + 1, 0, { ...src, id: a.newId, f: { ...src.f } });
      return { ...s, rows };
    }
    case 'del':
      return { ...s, rows: s.rows.filter((r) => r.id !== a.id) };
    case 'load':
      return a.state;
  }
}

/**
 * Reorder shot groups. Reference labels keep their relative order (they compile
 * on their own), and cut times stay where they were on the timeline, so moving a
 * shot earlier swaps its place in the sequence rather than its timestamp.
 */
function moveShot(s: State, from: number, to: number): State {
  const groups: Row[][] = [];
  const defines: Row[] = [];
  for (const r of s.rows) {
    if (r.type === 'define') defines.push(r);
    else if (r.type === 'shot' || !groups.length) groups.push([r]);
    else groups[groups.length - 1].push(r);
  }
  if (from < 0 || from >= groups.length || to < 0 || to >= groups.length || from === to) return s;
  if (groups.some((g) => g[0].type !== 'shot')) return s; // implicit first shot: nothing safe to swap
  const times = groups.map((g) => g[0].f.at ?? '');
  const [moved] = groups.splice(from, 1);
  groups.splice(to, 0, moved);
  const reordered = groups.map((g, i) => [{ ...g[0], f: { ...g[0].f, at: times[i] } }, ...g.slice(1)]);
  return { ...s, rows: [...defines, ...reordered.flat()] };
}

/** Reset fields whose options depend on the field that just changed (e.g. marker on label kind). */
function dependents(row: Row, f: Record<string, string>, changed: string): Record<string, string> {
  const out = { ...f };
  for (const fd of BLOCKS[row.type].fields) {
    if (fd.optionsBy?.key === changed) {
      const opts = optionsFor(fd, out);
      if (!opts.some((o) => o.value === out[fd.key])) out[fd.key] = opts[0]?.value ?? '';
    }
    if (fd.assetKindBy?.key === changed) out[fd.key] = '';
  }
  return out;
}

function valid(x: unknown): x is State {
  const s = x as State;
  return (
    !!s &&
    Array.isArray(s.rows) &&
    Array.isArray(s.assets) &&
    !!s.frames &&
    !!s.doc &&
    MODES.some((m) => m.id === s.mode) &&
    s.rows.every((r) => r && typeof r.type === 'string' && r.type in BLOCKS)
  );
}

export function parseState(json: string): State | null {
  try {
    const x = JSON.parse(json);
    return valid(x) ? x : null;
  } catch {
    return null;
  }
}

function initial(): State {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) {
      const s = parseState(saved);
      if (s) return s;
    }
  } catch {
    /* storage unavailable: start from the example */
  }
  return EXAMPLES.t2va.build();
}

export function useStore() {
  const [state, dispatch] = useReducer(reducer, undefined, initial);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state]);
  return [state, dispatch] as const;
}
