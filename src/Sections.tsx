import { useCallback, useState, type Dispatch, type ReactNode } from 'react';
import { Check, Film, ImageIcon, Music, Plus, Tag, Trash2, Video as VideoIcon, AudioLines } from 'lucide-react';
import { Block, type Run } from './Block';
import { assetLabel } from './compile';
import { fmtTime, groupStart, groupSummary, type ShotGroup } from './shots';
import { ASPECTS, LIMITS, MODES, STYLES, TASK_TYPES } from './spec';
import { newRow, uid } from './store';
import type { Action, AssetKind, Doc, Issue, State } from './types';
import { AutoTextarea, Field, MODE_ICONS, Messages } from './ui';

const ASPECT_LABELS: Record<string, string> = {
  auto: 'Auto: match the images',
  '21:9': '21:9 · Ultrawide',
  '16:9': '16:9 · Widescreen',
  '4:3': '4:3 · Classic',
  '1:1': '1:1 · Square',
  '3:4': '3:4 · Portrait',
  '9:16': '9:16 · Vertical',
};

interface Common {
  state: State;
  issues: Issue[];
  dispatch: Dispatch<Action>;
  backButton: ReactNode;
}

const at = (issues: Issue[], field: string) => issues.filter((i) => !i.rowId && i.field === field);

function Thumb({ url, kind }: { url: string; kind: AssetKind }) {
  const [broken, setBroken] = useState<string | null>(null);
  const Icon = kind === 'image' ? ImageIcon : kind === 'video' ? VideoIcon : AudioLines;
  const show = kind === 'image' && /^https?:\/\//.test(url.trim()) && broken !== url;
  return (
    <span className="thumb" aria-hidden="true">
      {show ? <img src={url} alt="" onError={() => setBroken(url)} /> : <Icon size={20} />}
    </span>
  );
}

/* ---------------------------------------------------------------- Overview */

export function Overview({
  state,
  issues,
  dispatch,
  backButton,
  groups,
  onOpenShot,
  onAddShot,
}: Common & { groups: ShotGroup[]; onOpenShot: (key: string) => void; onAddShot: () => void }) {
  const mode = MODES.find((m) => m.id === state.mode)!;
  const setDoc = (patch: Partial<Doc>) => dispatch({ t: 'doc', patch });
  const ref = state.mode === 'ref2va';
  const styleWords = state.doc.style.split(',').map((w) => w.trim().toLowerCase());
  const toggleStyle = (w: string) => {
    const parts = state.doc.style.split(',').map((x) => x.trim()).filter(Boolean);
    const has = parts.some((x) => x.toLowerCase() === w.toLowerCase());
    const next = has ? parts.filter((x) => x.toLowerCase() !== w.toLowerCase()) : [...parts, parts.length ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)];
    setDoc({ style: next.join(', ') });
  };

  const frames: { which: 'first' | 'last'; label: string; hint: string }[] = [];
  if (mode.needsFirst) frames.push({ which: 'first', label: state.mode === 'fl2va' ? 'First frame (Picture 1)' : 'First frame (<Picture 1>)', hint: 'The video starts exactly on this image.' });
  if (mode.needsLast)
    frames.push({ which: 'last', label: state.mode === 'fl2va' ? 'Last frame (Picture 2)' : 'Last frame (<Picture 1>)', hint: 'The video ends exactly on this image.' });

  return (
    <div className="editor-inner">
      <header className="page-head">
        {backButton}
        <h1>Overview</h1>
        <p className="muted">Choose the kind of video, its length and its look. Then describe it shot by shot.</p>
      </header>

      <section className="section" aria-labelledby="sec-type">
        <div className="section-head">
          <h2 id="sec-type">What are you starting from?</h2>
        </div>
        <div className="choices" role="radiogroup" aria-labelledby="sec-type">
          {MODES.map((m) => {
            const Icon = MODE_ICONS[m.id];
            const on = m.id === state.mode;
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={on}
                className="choice"
                onClick={() => dispatch({ t: 'settings', patch: { mode: m.id } })}
              >
                <span className="nav-icon">
                  <Icon size={18} />
                </span>
                <span className="choice-text">
                  <span className="choice-title">{m.title}</span>
                  <span className="choice-desc">{m.description}</span>
                </span>
                <span className="choice-code">{m.label}</span>
                <span className="choice-check" aria-hidden="true">
                  {on ? <Check size={18} /> : <span style={{ width: 18, display: 'inline-block' }} />}
                </span>
              </button>
            );
          })}
        </div>
        <p className="muted small">{mode.help}</p>
      </section>

      {frames.length > 0 && (
        <section className="section" aria-labelledby="sec-frames">
          <div className="section-head">
            <h2 id="sec-frames">Images</h2>
            <p className="muted small">Paste a public link (https://…) to each image.</p>
          </div>
          <div className="asset-list">
            {frames.map((f) => (
              <Field key={f.which} label={f.label} hint={f.hint} issues={at(issues, 'frame.' + f.which)} dispatch={dispatch} id={'doc-frame.' + f.which}>
                {(p) => (
                  <div className="url-row" style={{ gridTemplateColumns: '48px minmax(0, 1fr)' }}>
                    <Thumb url={state.frames[f.which]} kind="image" />
                    <input
                      {...p}
                      className="input"
                      type="url"
                      inputMode="url"
                      placeholder="https://…"
                      value={state.frames[f.which]}
                      onChange={(e) => dispatch({ t: 'frame', which: f.which, url: e.target.value })}
                    />
                  </div>
                )}
              </Field>
            ))}
          </div>
        </section>
      )}

      <section className="section" aria-labelledby="sec-format">
        <div className="section-head">
          <h2 id="sec-format">Length and shape</h2>
        </div>
        <div className="field-grid">
          <Field label={`Length: ${state.duration} seconds`} hint={`Between ${LIMITS.durationMin} and ${LIMITS.durationMax} seconds.`} issues={at(issues, 'duration')} dispatch={dispatch} id="doc-duration">
            {(p) => (
              <input
                {...p}
                type="range"
                min={LIMITS.durationMin}
                max={LIMITS.durationMax}
                step={1}
                value={state.duration}
                aria-valuetext={`${state.duration} seconds`}
                onChange={(e) => dispatch({ t: 'settings', patch: { duration: Number(e.target.value) } })}
              />
            )}
          </Field>
          <Field label="Frame shape" hint="Width to height." issues={at(issues, 'aspect')} dispatch={dispatch} id="doc-aspect">
            {(p) => (
              <select {...p} className="select" value={state.aspect} onChange={(e) => dispatch({ t: 'settings', patch: { aspect: e.target.value } })}>
                {ASPECTS.map((a) => (
                  <option key={a} value={a}>
                    {ASPECT_LABELS[a] ?? a}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
      </section>

      <section className="section" aria-labelledby="sec-look">
        <div className="section-head">
          <h2 id="sec-look">Look</h2>
        </div>
        {ref ? (
          <Field
            label="Style"
            hint="One or two sentences. They open the shot descriptions."
            issues={at(issues, 'styleOpening')}
            dispatch={dispatch}
            id="doc-styleOpening"
          >
            {(p) => (
              <AutoTextarea
                {...p}
                value={state.doc.styleOpening}
                placeholder="The target video uses a realistic multi-camera sitcom style with warm indoor lighting."
                onChange={(e) => setDoc({ styleOpening: e.target.value })}
              />
            )}
          </Field>
        ) : (
          <>
            <Field label="Style" hint="A few words that open Shot 1, separated by commas." issues={at(issues, 'style')} dispatch={dispatch} id="doc-style">
              {(p) => <input {...p} className="input" type="text" value={state.doc.style} placeholder="Live-action, cinematic" onChange={(e) => setDoc({ style: e.target.value })} />}
            </Field>
            <div className="suggestions" role="group" aria-label="Common styles">
              <span className="muted small">Common styles:</span>
              {STYLES.map((w) => {
                const on = styleWords.includes(w.toLowerCase());
                return (
                  <button key={w} type="button" className="btn btn-secondary btn-sm" aria-pressed={on} onClick={() => toggleStyle(w)}>
                    {on && <Check size={14} />} {w}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </section>

      <section className="section" aria-labelledby="sec-shots">
        <div className="section-head">
          <h2 id="sec-shots">Shots</h2>
          <p className="muted small">The video is described one shot at a time.</p>
        </div>
        {groups.length > 0 && (
          <ul className="nav-list">
            {groups.map((g, i) => {
              const start = groupStart(g, i);
              return (
                <li key={g.key}>
                  <button type="button" className="nav-item" onClick={() => onOpenShot(g.key)}>
                    <span className="nav-num">{g.number ?? '–'}</span>
                    <span className="nav-text">
                      <span className="nav-title">Shot {g.number ?? '(off)'}</span>
                      <span className="nav-sub">
                        {start !== null ? `${fmtTime(start)} · ` : ''}
                        {groupSummary(g)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="next-step" style={{ borderTop: groups.length ? undefined : 0, paddingTop: groups.length ? undefined : 0 }}>
          {groups.length ? (
            <button type="button" className="btn btn-primary" onClick={() => onOpenShot(groups[0].key)}>
              <Film size={16} /> Continue to Shot 1
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={onAddShot}>
              <Plus size={16} /> Add your first shot
            </button>
          )}
        </div>
      </section>
    </div>
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

/* ------------------------------------------------------------------- Sound */

export function Sound({ state, issues, dispatch, backButton, onReview }: Common & { onReview: () => void }) {
  const setDoc = (patch: Partial<Doc>) => dispatch({ t: 'doc', patch });
  return (
    <div className="editor-inner">
      <header className="page-head">
        {backButton}
        <h1>Sound and music</h1>
        <p className="muted">Sounds for the whole video. Dialogue and one-off sounds belong in the shots.</p>
      </header>

      <section className="section" aria-labelledby="sec-bg">
        <div className="section-head">
          <h2 id="sec-bg">Background sound</h2>
          <p className="muted small">Ambience, sounds of actions and non-verbal sounds like breathing or laughter. One to four sentences.</p>
        </div>
        <Field label="Background sound" hint={<span className="mono">overall_soundscape</span>} issues={at(issues, 'soundscape')} dispatch={dispatch} id="doc-soundscape">
          {(p) => (
            <AutoTextarea
              {...p}
              large
              disabled={state.doc.silent}
              value={state.doc.silent ? 'N/A' : state.doc.soundscape}
              placeholder="Steady rain taps against the café windows while low room ambience continues underneath."
              onChange={(e) => setDoc({ soundscape: e.target.value })}
            />
          )}
        </Field>
        <label className="inline-check">
          <input type="checkbox" checked={state.doc.silent} onChange={(e) => setDoc({ silent: e.target.checked })} />
          The video should be completely silent
        </label>
      </section>

      <section className="section" aria-labelledby="sec-music">
        <div className="section-head">
          <h2 id="sec-music">
            <Music size={18} style={{ verticalAlign: '-3px', marginRight: 8 }} aria-hidden="true" />
            Music
          </h2>
          <p className="muted small">Music only the audience hears. Describe instruments, tempo, rhythm and how it changes, not the mood. Leave empty for no music.</p>
        </div>
        <Field label="Music" hint={<span className="mono">non_diegetic_music</span>} issues={at(issues, 'music')} dispatch={dispatch} id="doc-music">
          {(p) => (
            <AutoTextarea
              {...p}
              value={state.doc.music}
              placeholder="Sparse piano notes at a slow tempo, joined by sustained low strings that gradually increase in volume."
              onChange={(e) => setDoc({ music: e.target.value })}
            />
          )}
        </Field>
      </section>

      <footer className="next-step">
        <span className="muted small">That’s everything. Check the prompt and copy it.</span>
        <button type="button" className="btn btn-primary" onClick={onReview}>
          Review prompt
        </button>
      </footer>
    </div>
  );
}
