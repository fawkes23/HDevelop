import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronDown, ChevronLeft, Clapperboard, Download, FileText, FolderOpen, Menu as MenuIcon, Upload } from 'lucide-react';
import type { Run } from './Block';
import { compile } from './compile';
import { EXAMPLES } from './examples';
import { lint } from './lint';
import { Preview, type Located } from './Preview';
import { Overview, References, Sound } from './Sections';
import { ShotEditor } from './ShotEditor';
import { groupIds, shotGroups, suggestStart, type ShotGroup } from './shots';
import { Sidebar, viewKey, type Counts, type View } from './Sidebar';
import { BLOCKS } from './spec';
import { newRow, parseState, useStore } from './store';
import type { Action, Issue, State } from './types';
import { Menu, download, useMedia } from './ui';

interface Toast {
  message: string;
  undo?: State;
  tone?: 'error';
}

const DOC_AREAS: Record<string, { view: View['kind']; where: string }> = {
  duration: { view: 'overview', where: 'Overview' },
  aspect: { view: 'overview', where: 'Overview' },
  style: { view: 'overview', where: 'Overview' },
  styleOpening: { view: 'overview', where: 'Overview' },
  'frame.first': { view: 'overview', where: 'Overview' },
  'frame.last': { view: 'overview', where: 'Overview' },
  assets: { view: 'refs', where: 'References' },
  tasks: { view: 'refs', where: 'References' },
  summary: { view: 'refs', where: 'References' },
  soundscape: { view: 'sound', where: 'Sound and music' },
  music: { view: 'sound', where: 'Sound and music' },
};

/** Scroll to and focus an element once the next view has rendered. */
function reveal(...ids: string[]) {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const el = ids.map((id) => document.getElementById(id)).find(Boolean);
      if (!el) return;
      el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      const target = el.matches('input, textarea, select, button') ? el : el.querySelector<HTMLElement>('input, textarea, select');
      target?.focus({ preventScroll: true });
      const block = el.closest('.block');
      if (block) {
        block.classList.add('is-flash');
        setTimeout(() => block.classList.remove('is-flash'), 1000);
      }
    }),
  );
}

export default function App() {
  const [state, dispatch] = useStore();
  const compiled = useMemo(() => compile(state), [state]);
  const issues = useMemo(() => lint(state, compiled), [state, compiled]);
  const groups = useMemo(() => shotGroups(state, compiled), [state, compiled]);

  const wide = useMedia('(min-width: 1240px)');
  const narrow = useMedia('(max-width: 759px)');

  const [view, setView] = useState<View>({ kind: 'overview' });
  const [showNav, setShowNav] = useState(true);
  const [docked, setDocked] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tab, setTab] = useState<'prompt' | 'checks' | 'request'>('prompt');
  const [activeRow, setActiveRow] = useState<string | null>(null);
  const [focusRowId, setFocusRowId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const promptBtn = useRef<HTMLButtonElement>(null);

  // Fall back gracefully when the selected shot or section disappears.
  const shotIndex = view.kind === 'shot' ? groups.findIndex((g) => g.key === view.key) : -1;
  const current: View =
    (view.kind === 'shot' && shotIndex < 0) || (view.kind === 'refs' && state.mode !== 'ref2va') ? { kind: 'overview' } : view;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const run: Run = useCallback(
    (a: Action, undoLabel?: string) => {
      if (undoLabel) setToast({ message: undoLabel, undo: state });
      dispatch(a);
    },
    [state, dispatch],
  );

  const navigate = useCallback(
    (v: View) => {
      setView(v);
      if (narrow) setShowNav(false);
      window.scrollTo({ top: 0 });
    },
    [narrow],
  );

  const addShot = () => {
    const row = newRow('shot');
    row.f.at = suggestStart(state, compiled);
    dispatch({ t: 'addRow', row });
    navigate({ kind: 'shot', key: row.id });
    setFocusRowId(row.id);
  };

  const deleteShot = (g: ShotGroup) => {
    const i = groups.indexOf(g);
    const neighbour = groups[i + 1] ?? groups[i - 1];
    run({ t: 'delRows', ids: groupIds(g) }, `${g.number ? `Shot ${g.number}` : 'Shot'} deleted`);
    setView(neighbour ? { kind: 'shot', key: neighbour.key } : { kind: 'overview' });
  };

  const openReview = () => {
    setTab('prompt');
    if (wide) {
      setDocked(true);
      reveal('preview-panel');
    } else setDrawerOpen(true);
  };

  /** Where an issue lives, as a section to open and an element to focus. */
  const locate = useCallback(
    (i: Issue): (Located & { view: View }) | null => {
      const go = (v: View, ...anchors: string[]) => () => {
        navigate(v);
        if (!wide) setDrawerOpen(false);
        reveal(...anchors);
      };
      if (i.rowId) {
        const row = state.rows.find((r) => r.id === i.rowId);
        if (!row) return null;
        const anchor = i.field ? `f-${row.id}-${i.field}` : 'row-' + row.id;
        if (row.type === 'define') {
          if (state.mode !== 'ref2va') return null;
          const v: View = { kind: 'refs' };
          return { view: v, where: 'References', go: go(v, anchor, 'row-' + row.id) };
        }
        const g = groups.find((x) => x.head?.id === row.id || x.rows.includes(row));
        if (!g) return null;
        const v: View = { kind: 'shot', key: g.key };
        const label = g.number ? `Shot ${g.number}` : 'shot';
        const where = row.type === 'shot' ? label : `${label} · ${BLOCKS[row.type].label}`;
        return { view: v, where, go: go(v, anchor, 'row-' + row.id) };
      }
      const area = i.field && (DOC_AREAS[i.field] ?? (i.field.startsWith('asset:') ? { view: 'refs', where: 'References' } : null));
      if (!area || (area.view === 'refs' && state.mode !== 'ref2va')) return null;
      const v = { kind: area.view } as View;
      const anchor = i.field!.startsWith('asset:') ? 'asset-' + i.field!.slice(6) : 'doc-' + i.field;
      return { view: v, where: area.where, go: go(v, anchor) };
    },
    [state, groups, navigate, wide],
  );

  const counts = useMemo(() => {
    const c: Counts = {};
    for (const i of issues) {
      if (i.level === 'info') continue;
      const loc = locate(i);
      if (!loc) continue;
      const k = viewKey(loc.view);
      c[k] ??= { error: 0, warn: 0 };
      c[k][i.level]++;
    }
    return c;
  }, [issues, locate]);

  const openRow = (id: string) => {
    const loc = locate({ level: 'info', message: '', rowId: id });
    loc?.go();
  };

  const loadState = (s: State, message: string) => {
    setToast({ message, undo: state });
    dispatch({ t: 'load', state: s });
    setView({ kind: 'overview' });
    if (narrow) setShowNav(true);
  };

  const importJson = async (file?: File) => {
    if (!file) return;
    const s = parseState(await file.text());
    if (s) loadState(s, `Opened ${file.name}`);
    else setToast({ message: 'That file isn’t a Hailuo Sheet project.', tone: 'error' });
    if (fileRef.current) fileRef.current.value = '';
  };
  const exportJson = () => download('hailuo-sheet.json', JSON.stringify(state, null, 2), 'application/json');

  // Drawer: Escape closes, focus returns to the button that opened it.
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.activeElement as HTMLElement | null;
    document.querySelector<HTMLElement>('.drawer .btn')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawerOpen(false);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      (prev ?? promptBtn.current)?.focus();
    };
  }, [drawerOpen]);
  useEffect(() => {
    if (wide) setDrawerOpen(false);
  }, [wide]);

  const problems = issues.filter((i) => i.level !== 'info').length;
  const errors = issues.filter((i) => i.level === 'error').length;
  const shotIds = new Set(current.kind === 'shot' && shotIndex >= 0 ? groupIds(groups[shotIndex]) : []);

  const exampleItems = Object.values(EXAMPLES).map((v) => ({ label: v.label, onSelect: () => loadState(v.build(), 'Example loaded') }));
  const backButton = narrow ? (
    <button type="button" className="btn btn-ghost btn-sm back-btn" onClick={() => setShowNav(true)}>
      <ChevronLeft size={16} /> All sections
    </button>
  ) : null;

  const preview = (onClose?: () => void) => (
    <Preview
      state={state}
      compiled={compiled}
      issues={issues}
      dispatch={dispatch}
      locate={locate}
      shotIds={shotIds}
      activeRow={activeRow}
      onOpenRow={openRow}
      onClose={onClose}
      tab={tab}
      setTab={setTab}
    />
  );

  const common = { state, issues, dispatch, backButton };
  let editor: React.ReactNode;
  if (current.kind === 'shot') {
    editor = (
      <ShotEditor
        groups={groups}
        index={shotIndex}
        state={state}
        issues={issues}
        dispatch={dispatch}
        run={run}
        focusRowId={focusRowId}
        setFocusRowId={setFocusRowId}
        setActiveRow={setActiveRow}
        onSelect={(key) => navigate({ kind: 'shot', key })}
        onAddShot={addShot}
        onDeleteShot={deleteShot}
        onOverview={() => {
          navigate({ kind: 'overview' });
          reveal('doc-style');
        }}
        onReview={openReview}
        backButton={backButton}
      />
    );
  } else if (current.kind === 'refs') {
    editor = <References {...common} run={run} focusRowId={focusRowId} setFocusRowId={setFocusRowId} setActiveRow={setActiveRow} />;
  } else if (current.kind === 'sound') {
    editor = <Sound {...common} onReview={openReview} />;
  } else {
    editor = <Overview {...common} groups={groups} onOpenShot={(key) => navigate({ kind: 'shot', key })} onAddShot={addShot} />;
  }

  const promptLabel = wide ? (docked ? 'Hide prompt' : 'Show prompt') : 'Prompt';

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Clapperboard size={16} />
          </span>
          Hailuo Sheet
        </div>
        <div className="topbar-spacer" />
        <div className="topbar-actions">
          {!narrow ? (
            <>
              <Menu
                items={exampleItems}
                trigger={(p) => (
                  <button type="button" className="btn btn-ghost" {...p}>
                    <BookOpen size={16} /> Examples <ChevronDown size={16} />
                  </button>
                )}
              />
              <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
                <Upload size={16} /> Import
              </button>
              <button type="button" className="btn btn-ghost" onClick={exportJson}>
                <Download size={16} /> Export
              </button>
            </>
          ) : (
            <Menu
              items={[
                ...exampleItems.map((e) => ({ ...e, label: 'Example: ' + e.label })),
                { label: 'Import project…', icon: FolderOpen, separatorBefore: true, onSelect: () => fileRef.current?.click() },
                { label: 'Export project', icon: Download, onSelect: exportJson },
              ]}
              trigger={(p) => (
                <button type="button" className="btn btn-ghost" {...p}>
                  <MenuIcon size={16} /> Project
                </button>
              )}
            />
          )}
          <button
            ref={promptBtn}
            type="button"
            className={'btn ' + (wide ? 'btn-secondary' : 'btn-primary')}
            aria-pressed={wide ? docked : undefined}
            onClick={() => (wide ? setDocked(!docked) : setDrawerOpen(true))}
          >
            <FileText size={16} /> {promptLabel}
            {problems > 0 && (
              <span className={'count' + (errors ? ' error' : '')} aria-label={`${problems} checks`}>
                {problems}
              </span>
            )}
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => importJson(e.target.files?.[0])} />
        </div>
      </header>

      <div className={'layout' + (wide && docked ? ' with-preview' : '')}>
        {(!narrow || showNav) && (
          <aside className="sidebar">
            <Sidebar state={state} groups={groups} view={narrow ? null : current} counts={counts} onNavigate={navigate} onAddShot={addShot} />
          </aside>
        )}
        {(!narrow || !showNav) && <main className="editor">{editor}</main>}
        {wide && docked && (
          <aside className="preview-pane" aria-labelledby="preview-title">
            {preview()}
          </aside>
        )}
      </div>

      {!wide && drawerOpen && (
        <>
          <div className="scrim" onClick={() => setDrawerOpen(false)} />
          <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="preview-title">
            {preview(() => setDrawerOpen(false))}
          </div>
        </>
      )}

      {toast && (
        <div className="toast" role="status">
          <span>{toast.message}</span>
          {toast.undo && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                dispatch({ t: 'load', state: toast.undo! });
                setToast(null);
              }}
            >
              Undo
            </button>
          )}
          <button type="button" className="btn btn-sm" aria-label="Dismiss" onClick={() => setToast(null)}>
            OK
          </button>
        </div>
      )}
    </>
  );
}
