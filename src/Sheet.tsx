import { useMemo, useRef, useState } from 'react';
import type { Dispatch } from 'react';
import { assetLabel } from './compile';
import { BLOCKS, BLOCK_ORDER, type FieldSpec } from './spec';
import { newRow, uid } from './store';
import type { Action, Issue, Row, State } from './types';

interface RowProps {
  row: Row;
  index: number;
  state: State;
  issues: Issue[];
  dispatch: Dispatch<Action>;
  onHover: (id: string | null) => void;
  dragId: string | null;
  setDragId: (id: string | null) => void;
  total: number;
}

function Field({ spec, row, state, dispatch }: { spec: FieldSpec; row: Row; state: State; dispatch: Dispatch<Action> }) {
  if (spec.showIf && row.f[spec.showIf.key] !== spec.showIf.value) return null;
  const value = row.f[spec.key] ?? '';
  const set = (v: string) => dispatch({ t: 'field', id: row.id, key: spec.key, value: v });
  let input;
  if (spec.kind === 'select') {
    input = (
      <select value={value} onChange={(e) => set(e.target.value)}>
        {spec.options!.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  } else if (spec.kind === 'asset') {
    input = (
      <select value={value} onChange={(e) => set(e.target.value)}>
        <option value="">Choose file…</option>
        {state.assets.map((a) => (
          <option key={a.id} value={a.id}>
            {assetLabel(state.assets, a.id)}
          </option>
        ))}
      </select>
    );
  } else if (spec.kind === 'long') {
    input = (
      <textarea rows={2} value={value} placeholder={spec.placeholder} onChange={(e) => set(e.target.value)} />
    );
  } else {
    input = <input type="text" value={value} placeholder={spec.placeholder} onChange={(e) => set(e.target.value)} />;
  }
  return (
    <label className={'field' + (spec.grow ? ' grow' : '')}>
      <span>{spec.label}</span>
      {input}
    </label>
  );
}

function WhenCell({ row, state, dispatch }: { row: Row; state: State; dispatch: Dispatch<Action> }) {
  const timed = BLOCKS[row.type].timed;
  if (!timed) return <div className="when muted">whole clip</div>;
  const w = row.when;
  return (
    <div className="when">
      <select
        value={w ? 'window' : 'all'}
        onChange={(e) =>
          dispatch({
            t: 'when',
            id: row.id,
            when: e.target.value === 'all' ? null : { start: 0, end: Math.min(state.duration, 5) },
          })
        }
      >
        <option value="all">Whole clip</option>
        <option value="window">Time window</option>
      </select>
      {w && (
        <div className="window">
          <input
            type="number"
            min={0}
            step={0.5}
            value={w.start}
            onChange={(e) => dispatch({ t: 'when', id: row.id, when: { ...w, start: Number(e.target.value) } })}
          />
          <span>→</span>
          <input
            type="number"
            min={0}
            step={0.5}
            value={w.end}
            onChange={(e) => dispatch({ t: 'when', id: row.id, when: { ...w, end: Number(e.target.value) } })}
          />
          <span>s</span>
        </div>
      )}
    </div>
  );
}

function RowView({ row, index, state, issues, dispatch, onHover, dragId, setDragId, total }: RowProps) {
  const spec = BLOCKS[row.type];
  const worst = issues.some((i) => i.level === 'error') ? 'error' : issues.some((i) => i.level === 'warn') ? 'warn' : issues.length ? 'info' : '';
  const ref = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div
      ref={ref}
      id={'row-' + row.id}
      className={'row' + (row.enabled ? '' : ' disabled') + (dragId === row.id ? ' dragging' : '') + (over ? ' over' : '')}
      style={{ ['--c' as string]: spec.color }}
      onMouseEnter={() => onHover(row.id)}
      onMouseLeave={() => onHover(null)}
      onDragOver={(e) => {
        if (dragId) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (dragId && dragId !== row.id) dispatch({ t: 'move', id: dragId, to: index });
        setDragId(null);
      }}
    >
      <div
        className="handle"
        draggable
        title="Drag to reorder"
        onDragStart={(e) => {
          setDragId(row.id);
          e.dataTransfer.effectAllowed = 'move';
          if (ref.current) e.dataTransfer.setDragImage(ref.current, 12, 12);
        }}
        onDragEnd={() => setDragId(null)}
      >
        ⋮⋮
      </div>

      <div className="kind" title={spec.hint}>
        <span className="chip">{spec.label}</span>
        {worst && (
          <span className={'badge ' + worst} title={issues.map((i) => i.message).join('\n')}>
            {issues.length}
          </span>
        )}
      </div>

      <WhenCell row={row} state={state} dispatch={dispatch} />

      <div className="doCell">
        {spec.fields.map((fd) => (
          <Field key={fd.key} spec={fd} row={row} state={state} dispatch={dispatch} />
        ))}
        {issues.length > 0 && (
          <ul className="rowIssues">
            {issues.map((i, k) => (
              <li key={k} className={i.level}>
                {i.message}
                {i.fix && (
                  <button className="link" onClick={() => dispatch(i.fix!.action)}>
                    {i.fix.label}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="tools">
        <button title="Enable / disable" onClick={() => dispatch({ t: 'toggle', id: row.id })}>
          {row.enabled ? '●' : '○'}
        </button>
        <button title="Move up" disabled={index === 0} onClick={() => dispatch({ t: 'move', id: row.id, to: index - 1 })}>
          ▲
        </button>
        <button title="Move down" disabled={index === total - 1} onClick={() => dispatch({ t: 'move', id: row.id, to: index + 1 })}>
          ▼
        </button>
        <button title="Duplicate" onClick={() => dispatch({ t: 'dup', id: row.id, newId: uid() })}>
          ⧉
        </button>
        <button title="Delete" onClick={() => dispatch({ t: 'del', id: row.id })}>
          ✕
        </button>
      </div>
    </div>
  );
}

function AddMenu({ dispatch }: { dispatch: Dispatch<Action> }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const list = useMemo(
    () => BLOCK_ORDER.filter((t) => (BLOCKS[t].label + ' ' + BLOCKS[t].hint).toLowerCase().includes(q.toLowerCase())),
    [q],
  );
  const add = (t: (typeof BLOCK_ORDER)[number]) => {
    dispatch({ t: 'addRow', row: newRow(t) });
    setOpen(false);
    setQ('');
  };
  if (!open) {
    return (
      <button className="add" onClick={() => setOpen(true)}>
        + Add row
      </button>
    );
  }
  return (
    <div className="palette">
      <input
        autoFocus
        placeholder="Search blocks…  (Enter adds the first match, Esc closes)"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
          if (e.key === 'Enter' && list[0]) add(list[0]);
        }}
      />
      <div className="paletteList">
        {list.map((t) => (
          <button key={t} style={{ ['--c' as string]: BLOCKS[t].color }} onClick={() => add(t)}>
            <b>{BLOCKS[t].label}</b>
            <small>{BLOCKS[t].hint}</small>
          </button>
        ))}
        {list.length === 0 && <em className="muted">No matching block</em>}
      </div>
    </div>
  );
}

export function Sheet({
  state,
  issues,
  dispatch,
  onHover,
}: {
  state: State;
  issues: Issue[];
  dispatch: Dispatch<Action>;
  onHover: (id: string | null) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  return (
    <section className="sheet">
      <div className="sheetHead">
        <span />
        <span>Block</span>
        <span>When</span>
        <span>Do</span>
        <span />
      </div>
      {state.rows.length === 0 && <p className="empty">No rows yet. Add one below, or load an example from the top bar.</p>}
      {state.rows.map((r, i) => (
        <RowView
          key={r.id}
          row={r}
          index={i}
          total={state.rows.length}
          state={state}
          issues={issues.filter((x) => x.rowId === r.id)}
          dispatch={dispatch}
          onHover={onHover}
          dragId={dragId}
          setDragId={setDragId}
        />
      ))}
      <AddMenu dispatch={dispatch} />
    </section>
  );
}
