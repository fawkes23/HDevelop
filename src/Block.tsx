import { useEffect, useRef, useState, type Dispatch } from 'react';
import { ArrowDown, ArrowUp, Copy, GripVertical, MoreHorizontal, Power, Trash2 } from 'lucide-react';
import { assetLabel } from './compile';
import { BLOCKS, fieldVisible, optionsFor, type FieldSpec } from './spec';
import { uid } from './store';
import type { Action, Issue, Row, State } from './types';
import { AutoTextarea, Disclosure, Field, ICONS, Menu, Messages, Segmented } from './ui';

export interface Run {
  (a: Action, undoLabel?: string): void;
}

/** Text shown for a field's current value in a collapsed summary. */
function display(fd: FieldSpec, row: Row, state: State): string {
  const v = row.f[fd.key] ?? '';
  if (fd.kind === 'asset') return v ? (assetLabel(state.assets, v) ?? '') : '';
  if (fd.kind === 'select') return optionsFor(fd, row.f).find((o) => o.value === v)?.label ?? v;
  return v.trim();
}

export const fieldDomId = (rowId: string, key: string) => `f-${rowId}-${key}`;

/** One input for one row field, as described by its FieldSpec. */
export function RowField({
  spec,
  row,
  state,
  issues,
  dispatch,
  large,
}: {
  spec: FieldSpec;
  row: Row;
  state: State;
  issues: Issue[];
  dispatch: Dispatch<Action>;
  large?: boolean;
}) {
  const value = row.f[spec.key] ?? '';
  const set = (v: string) => dispatch({ t: 'field', id: row.id, key: spec.key, value: v });
  const size = spec.narrow ? 'narrow' : spec.kind === 'long' || spec.grow ? 'wide' : '';
  return (
    <Field label={spec.label} hint={spec.hint} issues={issues} dispatch={dispatch} className={size} id={fieldDomId(row.id, spec.key)}>
      {(p) => {
        if (spec.kind === 'select' && spec.control === 'segmented') {
          return <Segmented {...p} label={spec.label} value={value} options={optionsFor(spec, row.f)} onChange={set} />;
        }
        if (spec.kind === 'select') {
          return (
            <select {...p} className="select" value={value} onChange={(e) => set(e.target.value)}>
              {optionsFor(spec, row.f).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          );
        }
        if (spec.kind === 'asset') {
          const kind = spec.assetKindBy?.map[row.f[spec.assetKindBy.key]];
          const options = state.assets.filter((a) => !kind || a.kind === kind);
          return (
            <select {...p} className="select" value={value} onChange={(e) => set(e.target.value)}>
              <option value="">{options.length ? 'Choose a file…' : 'Add a file in “Files” first'}</option>
              {options.map((a) => (
                <option key={a.id} value={a.id}>
                  {assetLabel(state.assets, a.id)} {a.url ? `· ${a.url.split('/').pop()}` : ''}
                </option>
              ))}
            </select>
          );
        }
        if (spec.kind === 'long') {
          return <AutoTextarea {...p} large={large} value={value} placeholder={spec.placeholder} onChange={(e) => set(e.target.value)} />;
        }
        if (spec.kind === 'number') {
          return <input {...p} className="input narrow" type="number" inputMode="decimal" min={0} step={0.5} value={value} placeholder={spec.placeholder} onChange={(e) => set(e.target.value)} />;
        }
        return <input {...p} className="input" type="text" value={value} placeholder={spec.placeholder} onChange={(e) => set(e.target.value)} />;
      }}
    </Field>
  );
}

/** Primary fields always visible; advanced ones behind "More options". */
export function RowFields({
  row,
  state,
  issues,
  dispatch,
  skip = [],
}: {
  row: Row;
  state: State;
  issues: Issue[];
  dispatch: Dispatch<Action>;
  skip?: string[];
}) {
  const fields = BLOCKS[row.type].fields.filter((fd) => !skip.includes(fd.key) && fieldVisible(fd, row.f));
  const primary = fields.filter((fd) => !fd.advanced);
  const advanced = fields.filter((fd) => fd.advanced);
  const forField = (k: string) => issues.filter((i) => i.field === k);
  const changed = advanced
    .filter((fd) => (row.f[fd.key] ?? '') !== (fd.default ?? ''))
    .map((fd) => display(fd, row, state))
    .filter(Boolean);
  const advancedHasIssues = advanced.some((fd) => forField(fd.key).some((i) => i.level !== 'info'));
  return (
    <>
      <div className="field-grid">
        {primary.map((fd) => (
          <RowField key={fd.key} spec={fd} row={row} state={state} issues={forField(fd.key)} dispatch={dispatch} />
        ))}
      </div>
      {advanced.length > 0 && (
        <Disclosure label="More options" summary={changed.join(' · ')} forceOpen={advancedHasIssues}>
          <div className="field-grid">
            {advanced.map((fd) => (
              <RowField key={fd.key} spec={fd} row={row} state={state} issues={forField(fd.key)} dispatch={dispatch} />
            ))}
          </div>
        </Disclosure>
      )}
    </>
  );
}

export interface BlockProps {
  row: Row;
  state: State;
  issues: Issue[];
  dispatch: Dispatch<Action>;
  run: Run;
  /** Indices in state.rows of the neighbours this block can swap with. */
  prevIndex: number | null;
  nextIndex: number | null;
  index: number;
  focusRowId: string | null;
  clearFocus: () => void;
  setActiveRow: (id: string | null) => void;
  drag: { id: string | null; set: (id: string | null) => void; group: string };
}

export function Block({ row, state, issues, dispatch, run, prevIndex, nextIndex, index, focusRowId, clearFocus, setActiveRow, drag }: BlockProps) {
  const spec = BLOCKS[row.type];
  const Icon = ICONS[spec.icon];
  const ref = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState(false);
  const fieldKeys = new Set(spec.fields.map((f) => f.key));
  const blockIssues = issues.filter((i) => !i.field || !fieldKeys.has(i.field) || !fieldVisible(spec.fields.find((f) => f.key === i.field)!, row.f));

  useEffect(() => {
    if (focusRowId !== row.id || !ref.current) return;
    ref.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    ref.current.querySelector<HTMLElement>('textarea, input, select')?.focus({ preventScroll: true });
    clearFocus();
  }, [focusRowId, row.id, clearFocus]);

  return (
    <div
      ref={ref}
      id={'row-' + row.id}
      data-group={drag.group}
      className={'block' + (row.enabled ? '' : ' is-off') + (drag.id === row.id ? ' is-dragging' : '') + (over ? ' is-drop-target' : '')}
      style={{ ['--c' as string]: spec.color }}
      onMouseEnter={() => setActiveRow(row.id)}
      onMouseLeave={() => setActiveRow(null)}
      onFocus={() => setActiveRow(row.id)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setActiveRow(null);
      }}
      onDragOver={(e) => {
        if (drag.id && drag.id !== row.id && document.getElementById('row-' + drag.id)?.dataset.group === drag.group) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (drag.id && drag.id !== row.id) dispatch({ t: 'move', id: drag.id, to: index });
        drag.set(null);
      }}
    >
      <div className="block-head">
        <span
          className="drag-handle hide-narrow"
          draggable
          aria-hidden="true"
          title="Drag to reorder"
          onDragStart={(e) => {
            drag.set(row.id);
            e.dataTransfer.effectAllowed = 'move';
            if (ref.current) e.dataTransfer.setDragImage(ref.current, 16, 16);
          }}
          onDragEnd={() => drag.set(null)}
        >
          <GripVertical size={16} />
        </span>
        <h3 className="block-title">
          {Icon && <Icon size={18} aria-hidden="true" />}
          {spec.label}
        </h3>
        {!row.enabled && <span className="block-off-tag">Turned off</span>}
        <Menu
          items={[
            { label: 'Move up', icon: ArrowUp, disabled: prevIndex === null, onSelect: () => dispatch({ t: 'move', id: row.id, to: prevIndex! }) },
            { label: 'Move down', icon: ArrowDown, disabled: nextIndex === null, onSelect: () => dispatch({ t: 'move', id: row.id, to: nextIndex! }) },
            { label: 'Duplicate', icon: Copy, onSelect: () => dispatch({ t: 'dup', id: row.id, newId: uid() }) },
            {
              label: row.enabled ? 'Turn off' : 'Turn on',
              hint: row.enabled ? 'Keep it, but leave it out of the prompt' : undefined,
              icon: Power,
              onSelect: () => dispatch({ t: 'toggle', id: row.id }),
            },
            { label: 'Delete', icon: Trash2, danger: true, separatorBefore: true, onSelect: () => run({ t: 'del', id: row.id }, `${spec.label} deleted`) },
          ]}
          trigger={(p) => (
            <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label={`${spec.label} options`} title="Options" {...p}>
              <MoreHorizontal size={18} />
            </button>
          )}
        />
      </div>
      <div className="block-body">
        <RowFields row={row} state={state} issues={issues} dispatch={dispatch} />
        <Messages issues={blockIssues} dispatch={dispatch} />
      </div>
    </div>
  );
}
