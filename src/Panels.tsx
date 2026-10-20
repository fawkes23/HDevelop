import { useState } from 'react';
import type { Dispatch } from 'react';
import { assetLabel, fmtSeconds } from './compile';
import { buildPayload } from './payload';
import { ASPECTS, LIMITS, MODES, STYLES, TASK_TYPES } from './spec';
import { uid } from './store';
import type { Action, AssetKind, Compiled, Doc, Issue, State } from './types';

export function Settings({ state, dispatch }: { state: State; dispatch: Dispatch<Action> }) {
  const mode = MODES.find((m) => m.id === state.mode)!;
  const set = (patch: Partial<Pick<State, 'duration' | 'aspect'>>) => dispatch({ t: 'settings', patch });
  const setDoc = (patch: Partial<Doc>) => dispatch({ t: 'doc', patch });
  const ref = state.mode === 'ref2va';
  return (
    <section className="panel">
      <p className="modeHelp">{mode.help}</p>
      <div className="settings">
        <label>
          <span>Duration</span>
          <div className="inline">
            <input type="range" min={LIMITS.durationMin} max={LIMITS.durationMax} value={state.duration} onChange={(e) => set({ duration: Number(e.target.value) })} />
            <b>{fmtSeconds(state.duration)}s</b>
          </div>
        </label>
        <label>
          <span>Aspect ratio</span>
          <select value={state.aspect} onChange={(e) => set({ aspect: e.target.value })}>
            {ASPECTS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
        {ref ? (
          <label className="grow" title="Established in one or two English sentences before [Shot 1].">
            <span>Style opening</span>
            <input
              type="text"
              value={state.doc.styleOpening}
              placeholder="The target video uses a realistic multi-camera sitcom style with warm indoor lighting."
              onChange={(e) => setDoc({ styleOpening: e.target.value })}
            />
          </label>
        ) : (
          <label className="grow" title="Written right after [Shot 1], before the initial composition.">
            <span>Style</span>
            <input type="text" list="styles" value={state.doc.style} placeholder="Live-action, cinematic" onChange={(e) => setDoc({ style: e.target.value })} />
            <datalist id="styles">
              {STYLES.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          </label>
        )}
      </div>
    </section>
  );
}

export function Inputs({ state, dispatch }: { state: State; dispatch: Dispatch<Action> }) {
  const mode = MODES.find((m) => m.id === state.mode)!;
  if (!mode.needsFirst && !mode.needsLast && !mode.usesRefs) return null;

  if (!mode.usesRefs) {
    const firstLabel = state.mode === 'fl2va' ? 'Picture 1 (first frame)' : '<Picture 1> (first frame)';
    const lastLabel = state.mode === 'fl2va' ? 'Picture 2 (last frame)' : '<Picture 1> (last frame)';
    return (
      <section className="panel">
        <h3>Keyframes</h3>
        {mode.needsFirst && (
          <label className="urlRow">
            <span>{firstLabel}</span>
            <input type="text" placeholder="https://…" value={state.frames.first} onChange={(e) => dispatch({ t: 'frame', which: 'first', url: e.target.value })} />
          </label>
        )}
        {mode.needsLast && (
          <label className="urlRow">
            <span>{lastLabel}</span>
            <input type="text" placeholder="https://…" value={state.frames.last} onChange={(e) => dispatch({ t: 'frame', which: 'last', url: e.target.value })} />
          </label>
        )}
        <p className="muted small">
          {state.mode === 'i2va' && 'First-frame anchor → action onset → continuous development → result or reaction.'}
          {state.mode === 'fl2va' && 'First-frame state → observable intermediate changes → progressively narrowing differences → last-frame state.'}
          {state.mode === 'l2va' && 'Plausible preceding state → explicit action and transition path → gradual convergence in the final shot → last-frame landing.'}
        </p>
      </section>
    );
  }

  const add = (kind: AssetKind) => dispatch({ t: 'addAsset', asset: { id: uid(), kind, url: '' } });
  const counts = {
    image: state.assets.filter((a) => a.kind === 'image').length,
    video: state.assets.filter((a) => a.kind === 'video').length,
    audio: state.assets.filter((a) => a.kind === 'audio').length,
  };
  return (
    <section className="panel">
      <h3>
        Reference assets <small className="muted">{state.assets.length}/{LIMITS.refTotal}</small>
      </h3>
      {state.assets.map((a) => (
        <div className="asset" key={a.id}>
          <b>{assetLabel(state.assets, a.id)}</b>
          <input type="text" placeholder="https://…" value={a.url} onChange={(e) => dispatch({ t: 'setAsset', id: a.id, url: e.target.value })} />
          <button className="icon" title="Remove" onClick={() => dispatch({ t: 'delAsset', id: a.id })}>
            ✕
          </button>
        </div>
      ))}
      <div className="addAssets">
        <button disabled={counts.image >= LIMITS.image} onClick={() => add('image')}>
          + Picture <small>{counts.image}/{LIMITS.image}</small>
        </button>
        <button disabled={counts.video >= LIMITS.video} onClick={() => add('video')}>
          + Video <small>{counts.video}/{LIMITS.video}</small>
        </button>
        <button disabled={counts.audio >= LIMITS.audio} onClick={() => add('audio')}>
          + Audio <small>{counts.audio}/{LIMITS.audio}</small>
        </button>
      </div>
      <p className="muted small">
        A picture used only to define a character, scene, costume or style is cited inside a {'<Subject N>'} definition, not given its own label.
      </p>
    </section>
  );
}

export function Summary({ state, dispatch }: { state: State; dispatch: Dispatch<Action> }) {
  if (state.mode !== 'ref2va') return null;
  const tasks = state.doc.tasks;
  const toggle = (t: string) => dispatch({ t: 'doc', patch: { tasks: tasks.includes(t) ? tasks.filter((x) => x !== t) : [...tasks, t] } });
  return (
    <section className="panel">
      <h3>
        summary <small className="muted">[{tasks.join(' + ') || 'task type'}]</small>
      </h3>
      <div className="tasks">
        {TASK_TYPES.map((t) => (
          <label key={t.value} title={t.hint}>
            <input type="checkbox" checked={tasks.includes(t.value)} onChange={() => toggle(t.value)} /> {t.value}
          </label>
        ))}
      </div>
      <textarea
        rows={3}
        value={state.doc.summary}
        placeholder="One short paragraph: the target video, its main subjects, shot flow and the roles of the reference assets, using only labels already defined."
        onChange={(e) => dispatch({ t: 'doc', patch: { summary: e.target.value } })}
      />
    </section>
  );
}

export function Audio({ state, dispatch }: { state: State; dispatch: Dispatch<Action> }) {
  const setDoc = (patch: Partial<Doc>) => dispatch({ t: 'doc', patch });
  return (
    <section className="panel">
      <h3>
        overall_soundscape <small className="muted">1–{LIMITS.soundscapeSentencesMax} sentences, one paragraph</small>
      </h3>
      <textarea
        rows={3}
        disabled={state.doc.silent}
        value={state.doc.silent ? 'N/A' : state.doc.soundscape}
        placeholder="Ambient sound, physical action sounds and non-verbal human sounds across the whole video. No dialogue, singing or diegetic music."
        onChange={(e) => setDoc({ soundscape: e.target.value })}
      />
      <label className="small">
        <input type="checkbox" checked={state.doc.silent} onChange={(e) => setDoc({ silent: e.target.checked })} /> The user explicitly requested complete silence (N/A)
      </label>
      <h3>
        non_diegetic_music <small className="muted">1–{LIMITS.musicSentencesMax} sentences · empty = N/A</small>
      </h3>
      <textarea
        rows={2}
        value={state.doc.music}
        placeholder="Background music only the audience hears: instrumentation, speed, rhythm, dynamic changes. No mood words."
        onChange={(e) => setDoc({ music: e.target.value })}
      />
    </section>
  );
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function Output({ state, compiled, hoverRow }: { state: State; compiled: Compiled; hoverRow: string | null }) {
  const [tab, setTab] = useState<'prompt' | 'payload'>('prompt');
  const [copied, setCopied] = useState('');
  const payload = buildPayload(state, compiled.text);
  const payloadText = JSON.stringify(payload.body, null, 2);
  const count = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);
  const words = count(compiled.text);
  const descWords = count(compiled.description);
  const doCopy = async (what: string, text: string) => {
    if (await copy(text)) {
      setCopied(what);
      setTimeout(() => setCopied(''), 1200);
    }
  };
  return (
    <section className="panel output">
      <div className="tabs">
        <button className={tab === 'prompt' ? 'on' : ''} onClick={() => setTab('prompt')}>
          Prompt
        </button>
        <button className={tab === 'payload' ? 'on' : ''} onClick={() => setTab('payload')}>
          H3-Base request
        </button>
        <span className="grow" />
        <button onClick={() => doCopy(tab, tab === 'prompt' ? compiled.text : payloadText)}>{copied === tab ? 'Copied' : 'Copy'}</button>
      </div>
      {tab === 'prompt' ? (
        <>
          <div className="compiled">
            {compiled.lines.map((line, i) => (
              <p key={i}>
                {line.length === 0
                  ? '\u00a0'
                  : line.map((p, k) => (
                      <span key={k} className={p.rowId && hoverRow === p.rowId ? 'hl' : ''}>
                        {p.text}
                      </span>
                    ))}
              </p>
            ))}
          </div>
          <div className="stats muted">
            <span>{compiled.text.length} chars</span>
            <span>{words} words</span>
            <span>description: {descWords} words</span>
          </div>
        </>
      ) : (
        <>
          <div className="endpoint">{payload.endpoint}</div>
          <pre>{payloadText}</pre>
          <ul className="notes">
            {payload.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function Issues({ issues, dispatch }: { issues: Issue[]; dispatch: Dispatch<Action> }) {
  const go = (id?: string) => {
    if (!id) return;
    const el = document.getElementById('row-' + id);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.classList.add('flash');
    setTimeout(() => el?.classList.remove('flash'), 900);
  };
  const counts = { error: 0, warn: 0, info: 0 };
  issues.forEach((i) => counts[i.level]++);
  return (
    <section className="panel">
      <h3>
        Checks{' '}
        <small className="muted">
          {counts.error} errors · {counts.warn} warnings · {counts.info} tips
        </small>
      </h3>
      {issues.length === 0 && <p className="ok">Nothing to flag.</p>}
      <ul className="issues">
        {issues.map((i, k) => (
          <li key={k} className={i.level} onClick={() => go(i.rowId)} style={{ cursor: i.rowId ? 'pointer' : 'default' }}>
            <span className="dot" />
            <span>{i.message}</span>
            {i.fix && (
              <button
                className="link"
                onClick={(e) => {
                  e.stopPropagation();
                  dispatch(i.fix!.action);
                }}
              >
                {i.fix.label}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
