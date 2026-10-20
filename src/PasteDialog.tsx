import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ClipboardPaste, Info, X } from 'lucide-react';
import { parsePrompt, proseProject, type ParseResult } from './parse';
import type { State } from './types';

export function describe(r: ParseResult['summary']): string {
  const parts = [r.mode, `${r.shots} shot${r.shots === 1 ? '' : 's'}`, `${r.clips} clip${r.clips === 1 ? '' : 's'}`];
  if (r.speakers) parts.push(`${r.speakers} speaker${r.speakers === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

/** Paste an H3 prompt and turn it into a project. */
export function PasteDialog({ initial, onLoad, onClose }: { initial: string; onLoad: (s: State, message: string) => void; onClose: () => void }) {
  const [text, setText] = useState(initial);
  const area = useRef<HTMLTextAreaElement>(null);
  const result = useMemo(() => (text.trim() ? parsePrompt(text) : null), [text]);

  useEffect(() => {
    area.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const ok = result && !('error' in result) ? result : null;
  const links = ok?.summary.links ?? 0;

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="paste-title">
        <div className="modal-head">
          <h2 id="paste-title">
            <ClipboardPaste size={18} aria-hidden="true" /> New project from an H3 prompt
          </h2>
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <p className="muted small">Paste a prompt in the MiniMax H3 format. It is split into shots, camera moves, dialogue and sound on the timeline.</p>
        <textarea
          ref={area}
          className="textarea mono paste-area"
          value={text}
          aria-label="H3 prompt"
          placeholder={'integrated_multimodal_description: [Shot 1] Live-action, cinematic, a medium-wide shot frames…\n\noverall_soundscape: …\n\nnon_diegetic_music: …'}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="paste-status" aria-live="polite">
          {ok && (
            <p className="msg success">
              <CheckCircle2 size={16} aria-hidden="true" /> Recognised: {describe(ok.summary)}
            </p>
          )}
          {ok && links > 0 && (
            <p className="msg info">
              <Info size={16} aria-hidden="true" /> Prompts don’t contain image or file links. You’ll add {links === 1 ? 'one link' : `${links} links`} afterwards.
            </p>
          )}
          {result && 'error' in result && (
            <p className="msg warn">
              <Info size={16} aria-hidden="true" /> {result.error}
            </p>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          {result && 'error' in result && (
            <button type="button" className="btn btn-secondary" onClick={() => onLoad(proseProject(text), 'Started a project with your text as Shot 1')}>
              Use it as Shot 1
            </button>
          )}
          <button type="button" className="btn btn-primary" disabled={!ok} onClick={() => ok && onLoad(ok.state, `Loaded: ${describe(ok.summary)}`)}>
            Load prompt
          </button>
        </div>
      </div>
    </>
  );
}
