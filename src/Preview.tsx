import { useEffect, useRef, useState, type Dispatch } from 'react';
import { CheckCircle2, Download, X } from 'lucide-react';
import { buildPayload } from './payload';
import type { Action, Compiled, Issue, Part, State } from './types';
import { CopyButton, LevelIcon, download } from './ui';

export interface Located {
  where: string;
  go: () => void;
}

const words = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

function PromptLines({
  compiled,
  shotIds,
  activeRow,
  onOpenRow,
}: {
  compiled: Compiled;
  shotIds: Set<string>;
  activeRow: string | null;
  onOpenRow: (id: string) => void;
}) {
  return (
    <div className="prompt-text">
      {compiled.lines.map((line, i) => (
        <p key={i}>
          {runs(line, shotIds).map((run, r) =>
            run.inShot ? (
              <span key={r} className="in-shot">
                {run.parts.map(({ p, k }) => part(p, k))}
              </span>
            ) : (
              run.parts.map(({ p, k }) => part(p, k))
            ),
          )}
        </p>
      ))}
    </div>
  );

  function part(p: Part, k: number) {
    let text: React.ReactNode = p.text;
    // Section names ("overall_soundscape:") in bold for scanning.
    const m = k === 0 ? /^([a-z_]+:)(.*)$/s.exec(p.text) : null;
    if (m) {
      text = (
        <>
          <span className="prompt-key">{m[1]}</span>
          {m[2]}
        </>
      );
    }
    const cls = [p.rowId && p.rowId === activeRow ? 'is-active' : '', p.rowId ? 'from-row' : ''].filter(Boolean).join(' ');
    return (
      <span key={k} className={cls || undefined} onClick={p.rowId ? () => onOpenRow(p.rowId!) : undefined}>
        {text}
      </span>
    );
  }
}

/** Split a line into runs, so a selected shot is highlighted as one continuous span. */
function runs(line: Part[], shotIds: Set<string>) {
  const out: { inShot: boolean; parts: { p: Part; k: number }[] }[] = [];
  line.forEach((p, k) => {
    const prev = line[k - 1];
    const next = line[k + 1];
    // A plain separator between two parts of the same shot joins that run.
    const inShot = p.rowId ? shotIds.has(p.rowId) : !!(prev?.rowId && next?.rowId && shotIds.has(prev.rowId) && shotIds.has(next.rowId));
    const last = out[out.length - 1];
    if (last && last.inShot === inShot) last.parts.push({ p, k });
    else out.push({ inShot, parts: [{ p, k }] });
  });
  return out;
}

export function Preview({
  state,
  compiled,
  issues,
  dispatch,
  locate,
  shotIds,
  activeRow,
  onOpenRow,
  onClose,
  tab,
  setTab,
}: {
  state: State;
  compiled: Compiled;
  issues: Issue[];
  dispatch: Dispatch<Action>;
  locate: (i: Issue) => Located | null;
  shotIds: Set<string>;
  activeRow: string | null;
  onOpenRow: (id: string) => void;
  onClose?: () => void;
  tab: 'prompt' | 'checks' | 'request';
  setTab: (t: 'prompt' | 'checks' | 'request') => void;
}) {
  const body = useRef<HTMLDivElement>(null);
  const [showTips, setShowTips] = useState(true);
  const problems = issues.filter((i) => i.level !== 'info');
  const errors = issues.filter((i) => i.level === 'error').length;
  const payload = buildPayload(state, compiled.text);
  const shown = showTips ? issues : problems;

  // Keep the selected shot in view as the selection changes.
  const firstShotId = [...shotIds][0];
  useEffect(() => {
    if (tab !== 'prompt') return;
    const b = body.current;
    const el = b?.querySelector<HTMLElement>('.in-shot');
    if (!b || !el) return;
    const top = el.getBoundingClientRect().top - b.getBoundingClientRect().top + b.scrollTop;
    if (top < b.scrollTop || top > b.scrollTop + b.clientHeight - 40) b.scrollTop = Math.max(0, top - 24);
  }, [firstShotId, tab]);

  const tabs: { id: typeof tab; label: string; count?: number }[] = [
    { id: 'prompt', label: 'Prompt' },
    { id: 'checks', label: 'Checks', count: problems.length },
    { id: 'request', label: 'API request' },
  ];

  return (
    <>
      <div className="preview-head">
        <h2 id="preview-title">Your prompt</h2>
        <CopyButton text={compiled.text} label="Copy prompt" />
        {onClose && (
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Close prompt" onClick={onClose}>
            <X size={18} />
          </button>
        )}
      </div>
      <div className="tabs preview-tabs" role="tablist" aria-label="Prompt views">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={'tab-' + t.id}
            aria-selected={tab === t.id}
            aria-controls="preview-panel"
            className="tab"
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.count !== undefined && <span className={'count' + (errors ? ' error' : '')}>{t.count}</span>}
          </button>
        ))}
      </div>
      <div className="preview-body" ref={body} id="preview-panel" role="tabpanel" aria-labelledby={'tab-' + tab} tabIndex={0}>
        {tab === 'prompt' && <PromptLines compiled={compiled} shotIds={shotIds} activeRow={activeRow} onOpenRow={onOpenRow} />}

        {tab === 'checks' && (
          <>
            <label className="inline-check" style={{ marginBottom: 8 }}>
              <input type="checkbox" checked={showTips} onChange={(e) => setShowTips(e.target.checked)} />
              Show tips as well as problems
            </label>
            {shown.length === 0 ? (
              <p className="all-clear">
                <CheckCircle2 size={18} /> Nothing to fix. The prompt follows the H3 format.
              </p>
            ) : (
              <ul className="checks">
                {shown.map((i, k) => {
                  const loc = locate(i);
                  return (
                    <li key={k} className={'check-item ' + i.level}>
                      <LevelIcon level={i.level} />
                      <div className="check-body">
                        <span>{i.message}</span>
                        <div className="check-actions">
                          {loc && (
                            <button type="button" className="link-btn" onClick={loc.go}>
                              Go to {loc.where}
                            </button>
                          )}
                          {i.fix && (
                            <button type="button" className="link-btn" onClick={() => dispatch(i.fix!.action)}>
                              {i.fix.label}
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        {tab === 'request' && (
          <>
            <p className="muted small" style={{ marginBottom: 8 }}>
              Body for a self-hosted H3-Base server, which takes this prompt directly.
            </p>
            <div className="request-endpoint">{payload.endpoint}</div>
            <pre className="code">{JSON.stringify(payload.body, null, 2)}</pre>
            <ul className="notes">
              {payload.notes.map((n, k) => (
                <li key={k}>{n}</li>
              ))}
            </ul>
          </>
        )}
      </div>
      <div className="preview-foot">
        <span>
          {words(compiled.text)} words · {compiled.text.length} characters
        </span>
        {tab === 'request' ? (
          <CopyButton text={JSON.stringify(payload.body, null, 2)} label="Copy request" className="btn btn-ghost btn-sm" />
        ) : (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => download('h3-prompt.txt', compiled.text, 'text/plain')}>
            <Download size={16} /> Download .txt
          </button>
        )}
      </div>
    </>
  );
}
