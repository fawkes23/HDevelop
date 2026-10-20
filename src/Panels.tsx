import { useState } from 'react';
import type { Dispatch } from 'react';
import { assetLabel, fmtWindow } from './compile';
import { buildPayload } from './payload';
import { ASPECTS, LIMITS, MODES, PROVIDERS } from './spec';
import { uid } from './store';
import type { Action, AssetKind, Compiled, Issue, State } from './types';

export function Settings({ state, dispatch }: { state: State; dispatch: Dispatch<Action> }) {
  const mode = MODES.find((m) => m.id === state.mode)!;
  const set = (patch: Partial<State>) => dispatch({ t: 'settings', patch });
  return (
    <section className="panel">
      <p className="modeHelp">{mode.help}</p>
      <div className="settings">
        <label>
          <span>Duration</span>
          <div className="inline">
            <input type="range" min={LIMITS.durationMin} max={LIMITS.durationMax} value={state.duration} onChange={(e) => set({ duration: Number(e.target.value) })} />
            <b>{state.duration}s</b>
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
        <label>
          <span>Resolution</span>
          <select value={state.resolution} onChange={(e) => set({ resolution: e.target.value as State['resolution'] })}>
            <option value="768p">768p</option>
            <option value="2k">2K</option>
          </select>
        </label>
        <label>
          <span>Provider format</span>
          <select value={state.provider} onChange={(e) => set({ provider: e.target.value as State['provider'] })}>
            {Object.entries(PROVIDERS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label title="Providers disagree. Typed mentions like 'Image 1' or '@image1' are rewritten to this style in the compiled prompt only.">
          <span>Cite style</span>
          <select value={state.citeStyle} onChange={(e) => set({ citeStyle: e.target.value as State['citeStyle'] })}>
            <option value="plain">Image 1</option>
            <option value="at">@Image1</option>
          </select>
        </label>
      </div>
    </section>
  );
}

export function Inputs({ state, dispatch }: { state: State; dispatch: Dispatch<Action> }) {
  const mode = MODES.find((m) => m.id === state.mode)!;
  if (!mode.needsFirst && !mode.usesRefs) return null;

  if (!mode.usesRefs) {
    return (
      <section className="panel">
        <h3>Frames</h3>
        <label className="urlRow">
          <span>First frame</span>
          <input type="text" placeholder="https://…" value={state.frames.first} onChange={(e) => dispatch({ t: 'frame', which: 'first', url: e.target.value })} />
        </label>
        {mode.needsLast && (
          <label className="urlRow">
            <span>Last frame</span>
            <input type="text" placeholder="https://…" value={state.frames.last} onChange={(e) => dispatch({ t: 'frame', which: 'last', url: e.target.value })} />
          </label>
        )}
        <p className="muted small">Frames fix the shot, so the prompt should describe motion and what to preserve, not the scene.</p>
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
        References <small className="muted">{state.assets.length}/{LIMITS.refTotal}</small>
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
          + Image <small>{counts.image}/{LIMITS.image}</small>
        </button>
        <button disabled={counts.video >= LIMITS.video} onClick={() => add('video')}>
          + Video <small>{counts.video}/{LIMITS.video}</small>
        </button>
        <button disabled={counts.audio >= LIMITS.audio} onClick={() => add('audio')}>
          + Audio <small>{counts.audio}/{LIMITS.audio}</small>
        </button>
      </div>
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
  const words = compiled.text.trim() ? compiled.text.trim().split(/\s+/).length : 0;
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
          API request
        </button>
        <span className="grow" />
        <button onClick={() => doCopy(tab, tab === 'prompt' ? compiled.text : payloadText)}>{copied === tab ? 'Copied' : 'Copy'}</button>
      </div>
      {tab === 'prompt' ? (
        <>
          <div className="compiled">
            {compiled.groups.length === 0 && <em className="muted">The compiled prompt appears here as you add rows.</em>}
            {compiled.groups.map((g, i) => (
              <p key={i}>
                {g.when && <span className="stamp">{fmtWindow(g.when)} </span>}
                {g.parts.map((p) => (
                  <span key={p.rowId} className={hoverRow === p.rowId ? 'hl' : ''}>
                    {p.text}{' '}
                  </span>
                ))}
              </p>
            ))}
          </div>
          <div className="stats muted">
            <span className={compiled.text.length > LIMITS.promptChars ? 'bad' : ''}>
              {compiled.text.length}/{LIMITS.promptChars} chars
            </span>
            <span>{words} words</span>
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
