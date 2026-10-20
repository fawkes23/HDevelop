import { useEffect, useReducer } from 'react';
import { BLOCKS } from './spec';
import { EXAMPLES } from './examples';
import type { Action, Row, RowType, State } from './types';

const KEY = 'hailuo-sheet:v1';

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);

export function newRow(type: RowType): Row {
  const f: Record<string, string> = {};
  for (const fd of BLOCKS[type].fields) f[fd.key] = fd.default ?? '';
  return { id: uid(), type, enabled: true, when: null, f };
}

export function reducer(s: State, a: Action): State {
  switch (a.t) {
    case 'settings':
      return { ...s, ...a.patch };
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
    case 'field':
      return { ...s, rows: s.rows.map((r) => (r.id === a.id ? { ...r, f: { ...r.f, [a.key]: a.value } } : r)) };
    case 'when':
      return { ...s, rows: s.rows.map((r) => (r.id === a.id ? { ...r, when: a.when } : r)) };
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
      rows.splice(i + 1, 0, { ...src, id: a.newId, f: { ...src.f }, when: src.when ? { ...src.when } : null });
      return { ...s, rows };
    }
    case 'del':
      return { ...s, rows: s.rows.filter((r) => r.id !== a.id) };
    case 'load':
      return a.state;
  }
}

function valid(x: unknown): x is State {
  const s = x as State;
  return !!s && Array.isArray(s.rows) && Array.isArray(s.assets) && !!s.frames && typeof s.mode === 'string';
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
  return EXAMPLES.t2v.build();
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
