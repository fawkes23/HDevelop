import type { Dispatch } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, Copy, MousePointerClick, Power, Trash2 } from 'lucide-react';
import { RowField, RowFields, fieldDomId, type Run } from './Block';
import { References, Thumb } from './Sections';
import { fmtTime, type ShotGroup } from './shots';
import { ASPECTS, BLOCKS, LIMITS, MODES, MORE_SHOT_BLOCKS, SHOT_BLOCKS, STYLES } from './spec';
import { newRow, uid } from './store';
import { reorderTarget, type Span } from './timeline/geometry';
import type { Sel } from './timeline/Timeline';
import type { Action, Doc, Issue, RowType, State } from './types';
import { AutoTextarea, Disclosure, Field, ICONS, MODE_ICONS, Menu, Messages } from './ui';

const ASPECT_LABELS: Record<string, string> = {
  auto: 'Auto: match the images',
  '21:9': '21:9 · Ultrawide',
  '16:9': '16:9 · Widescreen',
  '4:3': '4:3 · Classic',
  '1:1': '1:1 · Square',
  '3:4': '3:4 · Portrait',
  '9:16': '9:16 · Vertical',
};

interface Props {
  sel: Sel;
  state: State;
  issues: Issue[];
  groups: ShotGroup[];
  spans: Span[];
  dispatch: Dispatch<Action>;
  run: Run;
  setSel: (s: Sel, time?: number) => void;
  onAddClip: (type: RowType, group: number) => void;
  onDeleteShot: (g: ShotGroup) => void;
  focusRowId: string | null;
  setFocusRowId: (id: string | null) => void;
  setActiveRow: (id: string | null) => void;
}

const docIssues = (issues: Issue[], field: string) => issues.filter((i) => !i.rowId && i.field === field);

function Head({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: React.ReactNode }) {
  return (
    <header className="insp-head">
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <div className="insp-title-row">
        <h2>{title}</h2>
        {children}
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ Shot */

function ShotPanel({ p, index }: { p: Props; index: number }) {
  const { state, issues, groups, spans, dispatch } = p;
  const g = groups[index];
  const head = g.head;
  const span = spans[index];
  const hi = head ? issues.filter((i) => i.rowId === head.id) : [];
  const at = (k: string) => hi.filter((i) => i.field === k);
  const other = hi.filter((i) => !i.field || !['at', 'text', 'transition'].includes(i.field));
  const canMove = groups.every((x) => x.head);
  const addHeading = () => {
    const row = newRow('shot');
    dispatch({ t: 'insertRow', row, index: state.rows.indexOf(g.rows[0]) });
    p.setSel({ kind: 'shot', key: row.id });
  };

  return (
    <>
      <Head eyebrow={`${fmtTime(span.start)} – ${fmtTime(span.end)}`} title={g.number ? `Shot ${g.number}` : 'Shot (turned off)'}>
        <Menu
          items={[
            { label: 'Move earlier', icon: ArrowLeft, disabled: !canMove || index === 0, onSelect: () => dispatch({ t: 'moveShot', from: index, to: index - 1 }) },
            { label: 'Move later', icon: ArrowRight, disabled: !canMove || index === groups.length - 1, onSelect: () => dispatch({ t: 'moveShot', from: index, to: index + 1 }) },
            ...(head
              ? [{ label: head.enabled ? 'Turn off shot' : 'Turn on shot', icon: Power, onSelect: () => dispatch({ t: 'toggle', id: head.id }) }]
              : []),
            { label: 'Delete shot', icon: Trash2, danger: true, separatorBefore: true, onSelect: () => p.onDeleteShot(g) },
          ]}
          trigger={(t) => (
            <button type="button" className="btn btn-secondary btn-sm" {...t}>
              Shot <ChevronDown size={16} />
            </button>
          )}
        />
      </Head>

      {!head && (
        <div className="notice" role="note">
          <div className="notice-body">
            <span>These details come before the first shot, so there is no camera view for them yet.</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={addHeading}>
              Add camera view
            </button>
          </div>
        </div>
      )}

      {head && (
        <div className="insp-body">
          <div className="field">
            <label className="field-label" htmlFor={fieldDomId(head.id, 'text')}>
              What the camera sees
            </label>
            <span className="field-hint">Shot size, who or what is in frame, and where. You can also type straight onto the viewer.</span>
            <AutoTextarea
              id={fieldDomId(head.id, 'text')}
              large
              value={head.f.text ?? ''}
              placeholder={BLOCKS.shot.fields[2].placeholder}
              onChange={(e) => dispatch({ t: 'field', id: head.id, key: 'text', value: e.target.value })}
            />
            <Messages issues={at('text')} dispatch={dispatch} />
          </div>

          {index === 0 ? (
            <p className="muted small">Starts at the beginning of the video.</p>
          ) : (
            <RowField
              spec={{ ...BLOCKS.shot.fields[0], hint: 'Seconds. Or drag the cut on the timeline.' }}
              row={head}
              state={state}
              issues={at('at')}
              dispatch={dispatch}
            />
          )}

          {index > 0 && (
            <Disclosure
              label="How the shot begins"
              summary={BLOCKS.shot.fields[1].options!.find((o) => o.value === head.f.transition)?.label}
              forceOpen={at('transition').length > 0}
            >
              <div className="field-grid">
                <RowField spec={BLOCKS.shot.fields[1]} row={head} state={state} issues={at('transition')} dispatch={dispatch} />
              </div>
            </Disclosure>
          )}
          <Messages issues={other} dispatch={dispatch} />
        </div>
      )}

      <div className="insp-section">
        <span className="field-label">Add to this shot</span>
        <div className="add-bar-buttons">
          {SHOT_BLOCKS.map((t) => {
            const Icon = ICONS[BLOCKS[t].icon];
            return (
              <button key={t} type="button" className="btn btn-secondary btn-sm" style={{ ['--c' as string]: BLOCKS[t].color }} onClick={() => p.onAddClip(t, index)}>
                <Icon size={16} aria-hidden="true" /> {BLOCKS[t].label}
              </button>
            );
          })}
          <Menu
            align="left"
            items={MORE_SHOT_BLOCKS.map((t) => ({ label: BLOCKS[t].label, hint: BLOCKS[t].hint, icon: ICONS[BLOCKS[t].icon], onSelect: () => p.onAddClip(t, index) }))}
            trigger={(t) => (
              <button type="button" className="btn btn-ghost btn-sm" {...t}>
                More <ChevronDown size={16} />
              </button>
            )}
          />
        </div>
        {g.rows.length > 0 && <p className="muted small">{g.rows.length} item{g.rows.length === 1 ? '' : 's'} in this shot. Select one on the timeline to edit it.</p>}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------- Row */

function RowPanel({ p, id }: { p: Props; id: string }) {
  const { state, issues, groups, dispatch, run } = p;
  const row = state.rows.find((r) => r.id === id)!;
  const spec = BLOCKS[row.type];
  const Icon = ICONS[spec.icon];
  const ri = issues.filter((i) => i.rowId === row.id);
  const keys = new Set(spec.fields.map((f) => f.key));
  const loose = ri.filter((i) => !i.field || !keys.has(i.field));
  const gi = groups.findIndex((g) => g.rows.includes(row));
  const g = groups[gi];
  const prev = reorderTarget(state, row.id, -1);
  const next = reorderTarget(state, row.id, 1);

  return (
    <>
      <Head eyebrow={g ? `In Shot ${g.number ?? '–'}` : row.type === 'define' ? 'Reference label' : undefined} title={spec.label}>
        <Menu
          items={[
            ...(row.type !== 'define'
              ? [
                  { label: 'Move earlier', hint: 'Or drag it on the timeline', icon: ArrowLeft, disabled: prev === null, onSelect: () => dispatch({ t: 'move', id: row.id, to: prev! }) },
                  { label: 'Move later', icon: ArrowRight, disabled: next === null, onSelect: () => dispatch({ t: 'move', id: row.id, to: next! }) },
                ]
              : []),
            {
              label: 'Duplicate',
              icon: Copy,
              onSelect: () => {
                const newId = uid();
                dispatch({ t: 'dup', id: row.id, newId });
                p.setSel({ kind: 'row', id: newId });
              },
            },
            { label: row.enabled ? 'Turn off' : 'Turn on', hint: row.enabled ? 'Keep it, but leave it out of the prompt' : undefined, icon: Power, onSelect: () => dispatch({ t: 'toggle', id: row.id }) },
            {
              label: 'Delete',
              icon: Trash2,
              danger: true,
              separatorBefore: true,
              onSelect: () => {
                run({ t: 'del', id: row.id }, `${spec.label} deleted`);
                p.setSel(g ? { kind: 'shot', key: g.key } : null);
              },
            },
          ]}
          trigger={(t) => (
            <button type="button" className="btn btn-secondary btn-sm" {...t}>
              Edit <ChevronDown size={16} />
            </button>
          )}
        />
      </Head>
      <div className="insp-body" id={'row-' + row.id} style={{ ['--c' as string]: spec.color }}>
        <p className="insp-kind">
          <Icon size={16} aria-hidden="true" /> {spec.hint}
        </p>
        {!row.enabled && (
          <div className="notice" role="note">
            <div className="notice-body">
              <span>Turned off. It is kept, but left out of the prompt.</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => dispatch({ t: 'toggle', id: row.id })}>
                Turn on
              </button>
            </div>
          </div>
        )}
        <RowFields row={row} state={state} issues={ri} dispatch={dispatch} />
        <Messages issues={loose} dispatch={dispatch} />
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- Format */

function FormatPanel({ p }: { p: Props }) {
  const { state, issues, dispatch } = p;
  const mode = MODES.find((m) => m.id === state.mode)!;
  const setDoc = (patch: Partial<Doc>) => dispatch({ t: 'doc', patch });
  const ref = state.mode === 'ref2va';
  const words = state.doc.style.split(',').map((w) => w.trim().toLowerCase());
  const toggleStyle = (w: string) => {
    const parts = state.doc.style.split(',').map((x) => x.trim()).filter(Boolean);
    const has = parts.some((x) => x.toLowerCase() === w.toLowerCase());
    const next = has ? parts.filter((x) => x.toLowerCase() !== w.toLowerCase()) : [...parts, parts.length ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)];
    setDoc({ style: next.join(', ') });
  };
  const frames: { which: 'first' | 'last'; label: string }[] = [];
  if (mode.needsFirst) frames.push({ which: 'first', label: state.mode === 'fl2va' ? 'First frame (Picture 1)' : 'First frame (<Picture 1>)' });
  if (mode.needsLast) frames.push({ which: 'last', label: state.mode === 'fl2va' ? 'Last frame (Picture 2)' : 'Last frame (<Picture 1>)' });

  return (
    <>
      <Head title="Format" eyebrow="The whole video" />
      <div className="insp-body">
        <div className="field">
          <span className="field-label" id="lbl-type">
            Starting point
          </span>
          <div className="choices compact" role="radiogroup" aria-labelledby="lbl-type">
            {MODES.map((m) => {
              const Icon = MODE_ICONS[m.id];
              const on = m.id === state.mode;
              return (
                <button key={m.id} type="button" role="radio" aria-checked={on} className="choice" onClick={() => dispatch({ t: 'settings', patch: { mode: m.id } })}>
                  <Icon size={16} aria-hidden="true" />
                  <span className="choice-text">
                    <span className="choice-title">{m.title}</span>
                  </span>
                  {on && <Check size={16} className="choice-check" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
          <span className="field-hint">{mode.description}</span>
        </div>

        {frames.map((f) => (
          <Field key={f.which} label={f.label} issues={docIssues(issues, 'frame.' + f.which)} dispatch={dispatch} id={'doc-frame.' + f.which}>
            {(a) => (
              <div className="url-row" style={{ gridTemplateColumns: '48px minmax(0, 1fr)' }}>
                <Thumb url={state.frames[f.which]} kind="image" />
                <input {...a} className="input" type="url" inputMode="url" placeholder="https://…" value={state.frames[f.which]} onChange={(e) => dispatch({ t: 'frame', which: f.which, url: e.target.value })} />
              </div>
            )}
          </Field>
        ))}

        <Field label={`Length: ${state.duration} seconds`} hint="Or drag the end of the timeline." issues={docIssues(issues, 'duration')} dispatch={dispatch} id="doc-duration">
          {(a) => (
            <input
              {...a}
              type="range"
              min={LIMITS.durationMin}
              max={LIMITS.durationMax}
              value={state.duration}
              aria-valuetext={`${state.duration} seconds`}
              onChange={(e) => dispatch({ t: 'settings', patch: { duration: Number(e.target.value) } })}
            />
          )}
        </Field>

        <Field label="Frame shape" issues={docIssues(issues, 'aspect')} dispatch={dispatch} id="doc-aspect">
          {(a) => (
            <select {...a} className="select" value={state.aspect} onChange={(e) => dispatch({ t: 'settings', patch: { aspect: e.target.value } })}>
              {ASPECTS.map((x) => (
                <option key={x} value={x}>
                  {ASPECT_LABELS[x] ?? x}
                </option>
              ))}
            </select>
          )}
        </Field>

        {ref ? (
          <Field label="Look" hint="One or two sentences that open the shot descriptions." issues={docIssues(issues, 'styleOpening')} dispatch={dispatch} id="doc-styleOpening">
            {(a) => (
              <AutoTextarea
                {...a}
                value={state.doc.styleOpening}
                placeholder="The target video uses a realistic multi-camera sitcom style with warm indoor lighting."
                onChange={(e) => setDoc({ styleOpening: e.target.value })}
              />
            )}
          </Field>
        ) : (
          <>
            <Field label="Look" hint="A few words that open Shot 1." issues={docIssues(issues, 'style')} dispatch={dispatch} id="doc-style">
              {(a) => <input {...a} className="input" type="text" value={state.doc.style} placeholder="Live-action, cinematic" onChange={(e) => setDoc({ style: e.target.value })} />}
            </Field>
            <div className="suggestions" role="group" aria-label="Common looks">
              {STYLES.map((w) => {
                const on = words.includes(w.toLowerCase());
                return (
                  <button key={w} type="button" className="btn btn-secondary btn-sm" aria-pressed={on} onClick={() => toggleStyle(w)}>
                    {on && <Check size={14} />} {w}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ Beds */

function BedPanel({ p, kind }: { p: Props; kind: 'soundscape' | 'music' }) {
  const { state, issues, dispatch } = p;
  const setDoc = (patch: Partial<Doc>) => dispatch({ t: 'doc', patch });
  if (kind === 'soundscape') {
    return (
      <>
        <Head title="Background sound" eyebrow="Plays under the whole video" />
        <div className="insp-body">
          <Field
            label="What you hear throughout"
            hint="Ambience, sounds of actions, breathing or laughter. One to four sentences. Dialogue goes in the shots."
            issues={docIssues(issues, 'soundscape')}
            dispatch={dispatch}
            id="doc-soundscape"
          >
            {(a) => (
              <AutoTextarea
                {...a}
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
        </div>
      </>
    );
  }
  return (
    <>
      <Head title="Music" eyebrow="Only the audience hears it" />
      <div className="insp-body">
        <Field
          label="Score"
          hint="Instruments, tempo, rhythm and how it changes, not the mood. One to three sentences. Leave empty for no music."
          issues={docIssues(issues, 'music')}
          dispatch={dispatch}
          id="doc-music"
        >
          {(a) => (
            <AutoTextarea
              {...a}
              large
              value={state.doc.music}
              placeholder="Sparse piano notes at a slow tempo, joined by sustained low strings that gradually increase in volume."
              onChange={(e) => setDoc({ music: e.target.value })}
            />
          )}
        </Field>
      </div>
    </>
  );
}

/* ----------------------------------------------------------------- Entry */

export function Inspector(p: Props) {
  const { sel, groups } = p;
  let body: React.ReactNode;
  if (sel?.kind === 'shot') {
    const i = groups.findIndex((g) => g.key === sel.key);
    body = i >= 0 ? <ShotPanel p={p} index={i} key={sel.key} /> : null;
  } else if (sel?.kind === 'row' && p.state.rows.some((r) => r.id === sel.id)) {
    body = <RowPanel p={p} id={sel.id} key={sel.id} />;
  } else if (sel?.kind === 'format') {
    body = <FormatPanel p={p} />;
  } else if (sel?.kind === 'soundscape' || sel?.kind === 'music') {
    body = <BedPanel p={p} kind={sel.kind} />;
  } else if (sel?.kind === 'refs') {
    body = (
      <References
        state={p.state}
        issues={p.issues}
        dispatch={p.dispatch}
        backButton={null}
        run={p.run}
        focusRowId={p.focusRowId}
        setFocusRowId={p.setFocusRowId}
        setActiveRow={p.setActiveRow}
      />
    );
  }
  return (
    <aside className={'inspector' + (sel?.kind === 'refs' ? ' is-wide' : '')} aria-label="Inspector">
      {body ?? (
        <div className="insp-empty">
          <MousePointerClick size={24} aria-hidden="true" />
          <p>Select a shot or a clip on the timeline to edit it.</p>
          {groups.length > 0 && <p className="muted small">Tip: drag clips to reorder them, and drag the line between two shots to move the cut.</p>}
        </div>
      )}
    </aside>
  );
}
