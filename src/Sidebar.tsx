import { AlertCircle, AlertTriangle, LayoutList, Library, Music, Plus } from 'lucide-react';
import { fmtTime, groupStart, groupSummary, type ShotGroup } from './shots';
import { MODES } from './spec';
import type { State } from './types';

export type View = { kind: 'overview' } | { kind: 'refs' } | { kind: 'sound' } | { kind: 'shot'; key: string };
export type Counts = Record<string, { error: number; warn: number }>;

export const viewKey = (v: View) => (v.kind === 'shot' ? 'shot:' + v.key : v.kind);

function Status({ c }: { c?: { error: number; warn: number } }) {
  if (!c || (!c.error && !c.warn)) return null;
  if (c.error) {
    return (
      <span className="nav-status">
        <AlertCircle size={12} aria-hidden="true" /> {c.error} to fix
      </span>
    );
  }
  return (
    <span className="nav-status warn">
      <AlertTriangle size={12} aria-hidden="true" /> {c.warn} to check
    </span>
  );
}

export function Sidebar({
  state,
  groups,
  view,
  counts,
  onNavigate,
  onAddShot,
}: {
  state: State;
  groups: ShotGroup[];
  view: View | null;
  counts: Counts;
  onNavigate: (v: View) => void;
  onAddShot: () => void;
}) {
  const mode = MODES.find((m) => m.id === state.mode)!;
  const current = view ? viewKey(view) : '';
  const item = (v: View, icon: React.ReactNode, title: string, sub: string) => {
    const k = viewKey(v);
    return (
      <li>
        <button type="button" className="nav-item" aria-current={current === k || undefined} onClick={() => onNavigate(v)}>
          {icon}
          <span className="nav-text">
            <span className="nav-title">{title}</span>
            <span className="nav-sub">{sub}</span>
            <Status c={counts[k]} />
          </span>
        </button>
      </li>
    );
  };

  return (
    <nav aria-label="Sections">
      <div className="nav-section">
        <ul className="nav-list">
          {item(
            { kind: 'overview' },
            <span className="nav-icon">
              <LayoutList size={16} />
            </span>,
            'Overview',
            `${mode.title} · ${state.duration} s · ${state.aspect}`,
          )}
          {state.mode === 'ref2va' &&
            item(
              { kind: 'refs' },
              <span className="nav-icon">
                <Library size={16} />
              </span>,
              'References',
              `${state.assets.length} file${state.assets.length === 1 ? '' : 's'} · ${state.rows.filter((r) => r.type === 'define').length} labels`,
            )}
        </ul>
      </div>

      <div className="nav-section">
        <div className="nav-heading">
          <span id="shots-heading">Shots</span>
          <span>{groups.length}</span>
        </div>
        <ul className="nav-list" aria-labelledby="shots-heading">
          {groups.map((g, i) => {
            const start = groupStart(g, i);
            const v: View = { kind: 'shot', key: g.key };
            return (
              <li key={g.key}>
                <button type="button" className="nav-item" aria-current={current === viewKey(v) || undefined} onClick={() => onNavigate(v)}>
                  <span className="nav-num" aria-hidden="true">
                    {g.number ?? '–'}
                  </span>
                  <span className="nav-text">
                    <span className="nav-title">
                      {g.number ? `Shot ${g.number}` : 'Shot (off)'}
                      {start !== null && <span className="muted small"> · {fmtTime(start)}</span>}
                    </span>
                    <span className="nav-sub">{groupSummary(g)}</span>
                    <Status c={counts[viewKey(v)]} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <button type="button" className="btn btn-dashed nav-add" onClick={onAddShot}>
          <Plus size={16} /> Add shot
        </button>
      </div>

      <div className="nav-section">
        <ul className="nav-list">
          {item(
            { kind: 'sound' },
            <span className="nav-icon">
              <Music size={16} />
            </span>,
            'Sound and music',
            state.doc.silent ? 'Silent' : state.doc.music.trim() ? 'Background sound and music' : 'Background sound, no music',
          )}
        </ul>
      </div>
    </nav>
  );
}
