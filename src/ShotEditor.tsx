import { useCallback, useState, type Dispatch } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, FileText, Plus, Power, Settings2, Trash2 } from 'lucide-react';
import { Block, RowField, fieldDomId, type Run } from './Block';
import { fmtTime, groupIds, groupStart, type ShotGroup } from './shots';
import { BLOCKS, MORE_SHOT_BLOCKS, SHOT_BLOCKS } from './spec';
import { newRow } from './store';
import type { Action, Issue, Row, RowType, State } from './types';
import { Disclosure, ICONS, Menu, Messages } from './ui';

interface Props {
  groups: ShotGroup[];
  index: number;
  state: State;
  issues: Issue[];
  dispatch: Dispatch<Action>;
  run: Run;
  focusRowId: string | null;
  setFocusRowId: (id: string | null) => void;
  setActiveRow: (id: string | null) => void;
  onSelect: (key: string) => void;
  onAddShot: () => void;
  onDeleteShot: (g: ShotGroup) => void;
  onOverview: () => void;
  onReview: () => void;
  backButton: React.ReactNode;
}

export function ShotEditor({
  groups,
  index,
  state,
  issues,
  dispatch,
  run,
  focusRowId,
  setFocusRowId,
  setActiveRow,
  onSelect,
  onAddShot,
  onDeleteShot,
  onOverview,
  onReview,
  backButton,
}: Props) {
  const g = groups[index];
  const head = g.head;
  const [dragId, setDragId] = useState<string | null>(null);
  const clearFocus = useCallback(() => setFocusRowId(null), [setFocusRowId]);
  const label = g.number ? `Shot ${g.number}` : 'Shot (turned off)';
  const start = groupStart(g, index);
  const nextStart = index + 1 < groups.length ? groupStart(groups[index + 1], index + 1) : state.duration;
  const prevStart = index > 0 ? groupStart(groups[index - 1], index - 1) : null;
  const canMove = groups.every((x) => x.head);
  const rowIndex = (r: Row) => state.rows.indexOf(r);
  const headIssues = head ? issues.filter((i) => i.rowId === head.id) : [];
  const headField = (k: string) => headIssues.filter((i) => i.field === k);
  const headOther = headIssues.filter((i) => !i.field || !['at', 'text', 'transition'].includes(i.field));

  const addBlock = (type: RowType) => {
    const row = newRow(type);
    const ids = groupIds(g);
    const last = ids.length ? state.rows.findIndex((r) => r.id === ids[ids.length - 1]) : state.rows.length - 1;
    dispatch({ t: 'insertRow', row, index: last + 1 });
    setFocusRowId(row.id);
  };

  const addHeading = () => {
    const row = newRow('shot');
    dispatch({ t: 'insertRow', row, index: rowIndex(g.rows[0]) });
    onSelect(row.id);
    setFocusRowId(row.id);
  };

  const headTextRef = useCallback(
    (el: HTMLTextAreaElement | null) => {
      if (el && head && focusRowId === head.id) {
        el.focus();
        setFocusRowId(null);
      }
    },
    [focusRowId, head, setFocusRowId],
  );

  return (
    <div className="editor-inner">
      <header className="page-head">
        {backButton}
        <span className="eyebrow">
          Shot {index + 1} of {groups.length}
          {start !== null && nextStart !== null && ` · ${+start.toFixed(2)}–${fmtTime(nextStart)}`}
        </span>
        <div className="page-head-row">
          <h1>{label}</h1>
          <div className="page-actions">
            <Menu
              items={[
                {
                  label: 'Move earlier',
                  icon: ArrowUp,
                  disabled: !canMove || index === 0,
                  onSelect: () => dispatch({ t: 'moveShot', from: index, to: index - 1 }),
                },
                {
                  label: 'Move later',
                  icon: ArrowDown,
                  disabled: !canMove || index === groups.length - 1,
                  onSelect: () => dispatch({ t: 'moveShot', from: index, to: index + 1 }),
                },
                ...(head
                  ? [
                      {
                        label: head.enabled ? 'Turn off shot' : 'Turn on shot',
                        hint: head.enabled ? 'Its details join the previous shot' : undefined,
                        icon: Power,
                        onSelect: () => dispatch({ t: 'toggle', id: head.id }),
                      },
                    ]
                  : []),
              ]}
              trigger={(p) => (
                <button type="button" className="btn btn-secondary btn-sm" {...p}>
                  Arrange <ChevronDown size={16} />
                </button>
              )}
            />
            <button type="button" className="btn btn-secondary btn-sm btn-danger" onClick={() => onDeleteShot(g)}>
              <Trash2 size={16} /> Delete shot
            </button>
          </div>
        </div>
      </header>

      {!head && (
        <div className="notice" role="note">
          <Settings2 size={16} />
          <div className="notice-body">
            <span>This shot has details but no description of what the camera sees.</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={addHeading}>
              Add camera view
            </button>
          </div>
        </div>
      )}
      {head && !head.enabled && (
        <div className="notice" role="note">
          <Power size={16} />
          <div className="notice-body">
            <span>This shot is turned off. Its details are added to the previous shot instead.</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => dispatch({ t: 'toggle', id: head.id })}>
              Turn on shot
            </button>
          </div>
        </div>
      )}

      {head && (
        <section className="section" aria-label="Shot setup">
          <div className="shot-meta">
            {index === 0 ? (
              <div className="field">
                <span className="field-label">Starts at</span>
                <span>The beginning of the video (0 s)</span>
                <Messages issues={headField('at')} dispatch={dispatch} />
              </div>
            ) : (
              <RowField
                spec={{
                  ...BLOCKS.shot.fields[0],
                  hint: `In seconds. After ${prevStart !== null ? fmtTime(prevStart) : 'the previous shot'} and before ${fmtTime(state.duration)}.`,
                }}
                row={head}
                state={state}
                issues={headField('at')}
                dispatch={dispatch}
              />
            )}
          </div>
          {index === 0 && state.mode !== 'ref2va' && (
            <p className="style-note">
              {state.doc.style.trim() ? <>The prompt opens this shot with your look, “{state.doc.style.trim()}”. </> : <>No look is set yet. </>}
              <button type="button" className="link-btn" onClick={onOverview}>
                Change look
              </button>
            </p>
          )}
          <div className="field">
            <label className="field-label" htmlFor={fieldDomId(head.id, 'text')}>
              What the camera sees
            </label>
            <span className="field-hint">
              Shot size, who or what is in frame, and where.
              {index === 0 && state.mode !== 'ref2va' && state.doc.style.trim() && ' Start in lowercase: your look comes first.'}
            </span>
            <textarea
              ref={headTextRef}
              id={fieldDomId(head.id, 'text')}
              className="textarea large"
              rows={4}
              value={head.f.text ?? ''}
              placeholder={BLOCKS.shot.fields[2].placeholder}
              aria-invalid={headField('text').some((i) => i.level === 'error') || undefined}
              onChange={(e) => dispatch({ t: 'field', id: head.id, key: 'text', value: e.target.value })}
            />
            <Messages issues={headField('text')} dispatch={dispatch} />
          </div>
          {index > 0 && (
            <Disclosure
              label="Advanced settings"
              summary={BLOCKS.shot.fields[1].options!.find((o) => o.value === head.f.transition)?.label}
              forceOpen={headField('transition').length > 0}
            >
              <div className="field-grid">
                <RowField spec={BLOCKS.shot.fields[1]} row={head} state={state} issues={headField('transition')} dispatch={dispatch} />
              </div>
            </Disclosure>
          )}
          <Messages issues={headOther} dispatch={dispatch} />
        </section>
      )}

      <section className="section" aria-labelledby="in-shot">
        <div className="section-head">
          <h2 id="in-shot">In this shot</h2>
          <p className="muted small">Add what happens, camera moves, dialogue and sounds, in the order they happen.</p>
        </div>
        {g.rows.length === 0 ? (
          <p className="empty-blocks">Nothing added yet. Start with an action or a line of dialogue.</p>
        ) : (
          <div className="blocks">
            {g.rows.map((r, i) => (
              <Block
                key={r.id}
                row={r}
                state={state}
                issues={issues.filter((x) => x.rowId === r.id)}
                dispatch={dispatch}
                run={run}
                index={rowIndex(r)}
                prevIndex={i > 0 ? rowIndex(g.rows[i - 1]) : null}
                nextIndex={i < g.rows.length - 1 ? rowIndex(g.rows[i + 1]) : null}
                focusRowId={focusRowId}
                clearFocus={clearFocus}
                setActiveRow={setActiveRow}
                drag={{ id: dragId, set: setDragId, group: g.key }}
              />
            ))}
          </div>
        )}
        <div className="add-bar">
          <span className="field-label">Add to this shot</span>
          <div className="add-bar-buttons">
            {SHOT_BLOCKS.map((t) => {
              const Icon = ICONS[BLOCKS[t].icon];
              return (
                <button key={t} type="button" className="btn btn-secondary" style={{ ['--c' as string]: BLOCKS[t].color }} onClick={() => addBlock(t)}>
                  <Icon size={16} aria-hidden="true" /> {BLOCKS[t].label}
                </button>
              );
            })}
            <Menu
              align="left"
              items={MORE_SHOT_BLOCKS.map((t) => ({ label: BLOCKS[t].label, hint: BLOCKS[t].hint, icon: ICONS[BLOCKS[t].icon], onSelect: () => addBlock(t) }))}
              trigger={(p) => (
                <button type="button" className="btn btn-ghost" {...p}>
                  More <ChevronDown size={16} />
                </button>
              )}
            />
          </div>
        </div>
      </section>

      <footer className="next-step">
        {index < groups.length - 1 ? (
          <button type="button" className="btn btn-secondary" onClick={() => onSelect(groups[index + 1].key)}>
            Next: Shot {index + 2}
          </button>
        ) : (
          <button type="button" className="btn btn-secondary" onClick={onAddShot}>
            <Plus size={16} /> Add another shot
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={onReview}>
          <FileText size={16} /> Review prompt
        </button>
      </footer>
    </div>
  );
}
