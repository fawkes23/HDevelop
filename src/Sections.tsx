import { useCallback, useState, type Dispatch, type ReactNode } from 'react';
import { AudioLines, ImageIcon, Plus, Tag, Trash2, Video as VideoIcon } from 'lucide-react';
import { Block, type Run } from './Block';
import { assetLabel } from './compile';
import { LIMITS, TASK_TYPES } from './spec';
import { newRow, uid } from './store';
import type { Action, AssetKind, Issue, State } from './types';
import { AutoTextarea, Field, Messages } from './ui';

interface Common {
  state: State;
  issues: Issue[];
  dispatch: Dispatch<Action>;
  backButton: ReactNode;
}

const at = (issues: Issue[], field: string) => issues.filter((i) => !i.rowId && i.field === field);

export function Thumb({ url, kind }: { url: string; kind: AssetKind }) {
  const [broken, setBroken] = useState<string | null>(null);
  const Icon = kind === 'image' ? ImageIcon : kind === 'video' ? VideoIcon : AudioLines;
  const show = kind === 'image' && /^https?:\/\//.test(url.trim()) && broken !== url;
  return (
    <span className="thumb" aria-hidden="true">
      {show ? <img src={url} alt="" onError={() => setBroken(url)} /> : <Icon size={20} />}
    </span>
  );
}

/* -------------------------------------------------------------- References */

export function References({
  state,
  issues,
  dispatch,
  backButton,
  run,
  focusRowId,
  setFocusRowId,
  setActiveRow,
}: Common & { run: Run; focusRowId: string | null; setFocusRowId: (id: string | null) => void; setActiveRow: (id: string | null) => void }) {
  const [dragId, setDragId] = useState<string | null>(null);
  const clearFocus = useCallback(() => setFocusRowId(null), [setFocusRowId]);
  const defines = state.rows.filter((r) => r.type === 'define');
  const count = (k: AssetKind) => state.assets.filter((a) => a.kind === k).length;
  const add = (kind: AssetKind) => {
    const id = uid();
    dispatch({ t: 'addAsset', asset: { id, kind, url: '' } });
    requestAnimationFrame(() => document.getElementById('asset-' + id)?.focus());
  };
  const addLabel = () => {
    const row = newRow('define');
    dispatch({ t: 'addRow', row });
    setFocusRowId(row.id);
  };
  const tasks = state.doc.tasks;
  const toggleTask = (t: string) => dispatch({ t: 'doc', patch: { tasks: tasks.includes(t) ? tasks.filter((x) => x !== t) : [...tasks, t] } });
  const kinds: { kind: AssetKind; label: string; max: number }[] = [
    { kind: 'image', label: 'Picture', max: LIMITS.image },
    { kind: 'video', label: 'Video', max: LIMITS.video },
    { kind: 'audio', label: 'Audio', max: LIMITS.audio },
  ];

  return (
    <div className="editor-inner">
      <header className="page-head">
        {backButton}
        <h1>References</h1>
        <p className="muted">Add your files, give the important things in them a label, then sum up how they are used.</p>
      </header>

      <section className="section" aria-labelledby="sec-files">
        <div className="section-head">
          <h2 id="sec-files">1. Files</h2>
          <p className="muted small">
            Up to {LIMITS.image} pictures, {LIMITS.video} videos and {LIMITS.audio} audio clips ({LIMITS.refTotal} in total). Audio can’t be the only file.
          </p>
        </div>
        <Messages issues={at(issues, 'assets')} dispatch={dispatch} id="doc-assets" />
        {state.assets.length > 0 && (
          <div className="asset-list">
            {state.assets.map((a) => (
              <Field key={a.id} label={<span className="asset-label">{assetLabel(state.assets, a.id)}</span>} issues={at(issues, 'asset:' + a.id)} dispatch={dispatch} id={'asset-' + a.id}>
                {(p) => (
                  <div className="url-row">
                    <Thumb url={a.url} kind={a.kind} />
                    <input
                      {...p}
                      className="input"
                      type="url"
                      inputMode="url"
                      placeholder="https://…"
                      value={a.url}
                      onChange={(e) => dispatch({ t: 'setAsset', id: a.id, url: e.target.value })}
                    />
                    <button type="button" className="btn btn-ghost btn-danger" onClick={() => dispatch({ t: 'delAsset', id: a.id })} aria-label={`Remove ${assetLabel(state.assets, a.id)}`}>
                      <Trash2 size={16} /> <span className="hide-narrow">Remove</span>
                    </button>
                  </div>
                )}
              </Field>
            ))}
          </div>
        )}
        <div className="section-actions">
          {kinds.map((k) => (
            <button key={k.kind} type="button" className="btn btn-secondary" disabled={count(k.kind) >= k.max} onClick={() => add(k.kind)}>
              <Plus size={16} /> {k.label}
              <span className="muted small">
                {count(k.kind)}/{k.max}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="section" aria-labelledby="sec-labels">
        <div className="section-head">
          <h2 id="sec-labels">2. Labels</h2>
          <p className="muted small">
            A label like {'<Subject 1>'} names a person, object or place from your files so shots can refer to it. A picture used only to show a character or place goes inside a
            Subject’s description.
          </p>
        </div>
        {defines.length === 0 ? (
          <p className="empty-blocks">No labels yet.</p>
        ) : (
          <div className="blocks">
            {defines.map((r, i) => (
              <Block
                key={r.id}
                row={r}
                state={state}
                issues={issues.filter((x) => x.rowId === r.id)}
                dispatch={dispatch}
                run={run}
                index={state.rows.indexOf(r)}
                prevIndex={i > 0 ? state.rows.indexOf(defines[i - 1]) : null}
                nextIndex={i < defines.length - 1 ? state.rows.indexOf(defines[i + 1]) : null}
                focusRowId={focusRowId}
                clearFocus={clearFocus}
                setActiveRow={setActiveRow}
                drag={{ id: dragId, set: setDragId, group: 'defines' }}
              />
            ))}
          </div>
        )}
        <div className="section-actions">
          <button type="button" className="btn btn-secondary" onClick={addLabel}>
            <Tag size={16} /> Add label
          </button>
        </div>
      </section>

      <section className="section" aria-labelledby="sec-summary">
        <div className="section-head">
          <h2 id="sec-summary">3. Summary</h2>
          <p className="muted small">Tick every way the files are used. They are listed in the order you tick them.</p>
        </div>
        <div className="choices" role="group" aria-labelledby="sec-summary" id="doc-tasks">
          {TASK_TYPES.map((t) => (
            <label key={t.value} className="checkbox-row">
              <input type="checkbox" checked={tasks.includes(t.value)} onChange={() => toggleTask(t.value)} />
              <span className="choice-text">
                <span className="choice-title">{t.value.charAt(0).toUpperCase() + t.value.slice(1)}</span>
                <span className="choice-desc">{t.hint}</span>
              </span>
            </label>
          ))}
        </div>
        <Messages issues={at(issues, 'tasks')} dispatch={dispatch} />
        <Field
          label="Summary"
          hint="One short paragraph about the video and how the files are used. Use only labels you have defined."
          issues={at(issues, 'summary')}
          dispatch={dispatch}
          id="doc-summary"
        >
          {(p) => (
            <AutoTextarea
              {...p}
              large
              value={state.doc.summary}
              placeholder="The target video shows <Subject 1> walking through <Subject 2>…"
              onChange={(e) => dispatch({ t: 'doc', patch: { summary: e.target.value } })}
            />
          )}
        </Field>
      </section>
    </div>
  );
}
