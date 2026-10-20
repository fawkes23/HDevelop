import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  Clapperboard,
  ClipboardPaste,
  Download,
  File,
  FilePlus,
  FileText,
  FolderOpen,
  Library,
  Menu as MenuIcon,
  SlidersHorizontal,
} from 'lucide-react';
import type { Run } from './Block';
import { fieldDomId } from './Block';
import { compile } from './compile';
import { EXAMPLES } from './examples';
import { Inspector } from './Inspector';
import { lint } from './lint';
import { blankProject, parsePrompt } from './parse';
import { PasteDialog, describe } from './PasteDialog';
import { Preview, type Located } from './Preview';
import { groupIds, shotGroups, suggestStart, type ShotGroup } from './shots';
import { MODES } from './spec';
import { newRow, parseState, useStore } from './store';
import { CUT_STEP, insertIndex, nextSpeakerId, shotAt, shotSpans, speakerLanes } from './timeline/geometry';
import { Timeline, type Sel } from './timeline/Timeline';
import type { Action, Issue, RowType, State } from './types';
import { Menu, download } from './ui';
import { Viewer } from './Viewer';

interface Toast {
  message: string;
  undo?: State;
  action?: { label: string; run: () => void };
}

/** Nothing written yet: one empty shot and no sound, look or files. */
const isBlank = (s: State) =>
  s.rows.every((r) => r.type === 'shot' && !(r.f.text ?? '').trim()) &&
  !s.assets.length &&
  !s.doc.soundscape.trim() &&
  !s.doc.music.trim() &&
  !s.doc.style.trim() &&
  !s.doc.styleOpening.trim();

const FORMAT_FIELDS = new Set(['duration', 'aspect', 'style', 'styleOpening', 'frame.first', 'frame.last']);
const REF_FIELDS = new Set(['assets', 'tasks', 'summary']);

/** First field to type into when a new clip is added. */
const FIRST_FIELD: Partial<Record<RowType, string>> = { camera: 'detail', speech: 'who', text: 'text', define: 'def' };

/** Scroll to and focus the first of these elements that exists. */
function focusFirst(ids: string[]): boolean {
  const el = ids.map((id) => document.getElementById(id)).find(Boolean);
  if (!el) return false;
  el.scrollIntoView({ block: 'nearest' });
  const target = el.matches('input, textarea, select, button') ? el : el.querySelector<HTMLElement>('input, textarea, select');
  target?.focus({ preventScroll: true });
  return true;
}

export default function App() {
  const [state, dispatch, source] = useStore();
  const compiled = useMemo(() => compile(state), [state]);
  const issues = useMemo(() => lint(state, compiled), [state, compiled]);
  const groups = useMemo(() => shotGroups(state, compiled), [state, compiled]);
  const spans = useMemo(() => shotSpans(groups, state.duration), [groups, state.duration]);
  const lanes = useMemo(() => speakerLanes(state), [state]);

  const [sel, setSelRaw] = useState<Sel>(() => (groups[0] ? { kind: 'shot', key: groups[0].key } : { kind: 'format' }));
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [tab, setTab] = useState<'prompt' | 'checks' | 'request'>('prompt');
  const [toast, setToast] = useState<Toast | null>(null);
  const [focusRowId, setFocusRowId] = useState<string | null>(null);
  const [activeRow, setActiveRow] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Elements to focus after the next render (a new clip's first field, a check's target).
  const [pendingFocus, setPendingFocus] = useState<string[] | null>(null);
  const reveal = useCallback((...ids: string[]) => setPendingFocus(ids), []);
  useEffect(() => {
    if (pendingFocus && focusFirst(pendingFocus)) setPendingFocus(null);
  });
  const mode = MODES.find((m) => m.id === state.mode)!;

  const setSel = useCallback((s: Sel, t?: number) => {
    setSelRaw(s);
    if (t !== undefined) setTime(t);
  }, []);

  // The shot the editor is "in": the selected shot, the selected clip's shot, or the one under the playhead.
  const selGroup = useMemo(() => {
    if (sel?.kind === 'shot') return groups.findIndex((g) => g.key === sel.key);
    if (sel?.kind === 'row') {
      const i = groups.findIndex((g) => g.head?.id === sel.id || g.rows.some((r) => r.id === sel.id));
      if (i >= 0) return i;
    }
    return groups.length ? shotAt(spans, Math.min(time, state.duration - 0.001)) : -1;
  }, [sel, groups, spans, time, state.duration]);

  /* ---------- play ---------- */
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let raf = 0;
    setTime((t) => (t >= state.duration - 0.05 ? 0 : t));
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setTime((t) => {
        const next = t + dt;
        if (next >= state.duration) {
          setPlaying(false);
          return state.duration;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, state.duration]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' || e.repeat) return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, button, [contenteditable], [role="slider"], [role="radio"]')) return;
      e.preventDefault();
      setPlaying((p) => !p);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

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

  /* ---------- editing actions ---------- */
  const addClip = (type: RowType, gi: number, lane?: string) => {
    const g = groups[gi];
    if (!g) return;
    const row = newRow(type);
    if (type === 'speech') {
      const l = lanes.find((x) => x.id === lane) ?? lanes[0];
      row.f.id = l?.id ?? 'S1';
      row.f.who = l?.who ?? '';
    }
    dispatch({ t: 'insertRow', row, index: insertIndex(state.rows, g, spans[gi], spans[gi].end + 1) });
    setSel({ kind: 'row', id: row.id });
    const key = type === 'speech' && row.f.who ? 'line' : (FIRST_FIELD[type] ?? 'text');
    reveal(fieldDomId(row.id, key));
  };

  const addSpeaker = () => {
    const gi = selGroup >= 0 ? selGroup : 0;
    const g = groups[gi];
    if (!g) return;
    const row = newRow('speech');
    row.f.id = nextSpeakerId(lanes);
    dispatch({ t: 'insertRow', row, index: insertIndex(state.rows, g, spans[gi], spans[gi].end + 1) });
    setSel({ kind: 'row', id: row.id });
    reveal(fieldDomId(row.id, 'who'));
  };

  const addShot = () => {
    const row = newRow('shot');
    if (groups.length) {
      const at = suggestStart(state, compiled);
      if (!at) return setToast({ message: 'There is no room for another shot. Make the video longer by dragging the end of the timeline.' });
      row.f.at = at;
    }
    dispatch({ t: 'addRow', row });
    setSel({ kind: 'shot', key: row.id }, Number(row.f.at || 0));
    reveal(fieldDomId(row.id, 'text'));
  };

  const split = () => {
    if (!groups.length) return addShot();
    const t = Math.round(time / CUT_STEP) * CUT_STEP;
    const gi = shotAt(spans, Math.min(time, state.duration - 0.001));
    const s = spans[gi];
    if (t < s.start + CUT_STEP || t > s.end - CUT_STEP) {
      return setToast({ message: 'Move the playhead inside a shot, at least half a second from its edges, to split it.' });
    }
    const row = newRow('shot');
    row.f.at = String(t);
    dispatch({ t: 'insertRow', row, index: insertIndex(state.rows, groups[gi], s, s.end + 1) });
    setSel({ kind: 'shot', key: row.id }, t);
    reveal(fieldDomId(row.id, 'text'));
  };

  const deleteShot = (g: ShotGroup) => {
    const i = groups.indexOf(g);
    const neighbour = groups[i + 1] ?? groups[i - 1];
    run({ t: 'delRows', ids: groupIds(g) }, `${g.number ? `Shot ${g.number}` : 'Shot'} deleted`);
    setSel(neighbour ? { kind: 'shot', key: neighbour.key } : { kind: 'format' });
  };

  /* ---------- issues → places ---------- */
  const locate = useCallback(
    (i: Issue): Located | null => {
      const go = (s: Sel, ...anchors: string[]) => () => {
        setSel(s);
        setDrawer(false);
        reveal(...anchors);
      };
      if (i.rowId) {
        const row = state.rows.find((r) => r.id === i.rowId);
        if (!row) return null;
        const anchor = i.field ? fieldDomId(row.id, i.field) : 'row-' + row.id;
        if (row.type === 'define') return state.mode === 'ref2va' ? { where: 'References', go: go({ kind: 'refs' }, anchor, 'row-' + row.id) } : null;
        const g = groups.find((x) => x.head?.id === row.id || x.rows.includes(row));
        if (!g) return null;
        if (row.type === 'shot') return { where: `Shot ${g.number ?? ''}`.trim(), go: go({ kind: 'shot', key: g.key }, anchor) };
        return { where: `Shot ${g.number ?? '–'} · clip`, go: go({ kind: 'row', id: row.id }, anchor, 'row-' + row.id) };
      }
      const f = i.field ?? '';
      if (FORMAT_FIELDS.has(f)) return { where: 'Format', go: go({ kind: 'format' }, 'doc-' + f) };
      if (f === 'soundscape' || f === 'music') return { where: f === 'music' ? 'Music' : 'Background sound', go: go({ kind: f }, 'doc-' + f) };
      if (state.mode === 'ref2va' && (REF_FIELDS.has(f) || f.startsWith('asset:'))) {
        return { where: 'References', go: go({ kind: 'refs' }, f.startsWith('asset:') ? 'asset-' + f.slice(6) : 'doc-' + f) };
      }
      return null;
    },
    [state, groups, setSel, reveal],
  );

  const [paste, setPaste] = useState<string | null>(null);
  const loadState = (s: State, message: string) => {
    setToast({ message, undo: state });
    dispatch({ t: 'load', state: s });
    const first = s.rows.find((r) => r.type === 'shot');
    setSel(first ? { kind: 'shot', key: first.id } : { kind: 'format' }, 0);
    setPlaying(false);
    setPaste(null);
  };
  const newBlank = () => {
    const s = blankProject();
    loadState(s, 'New blank project');
    reveal(fieldDomId(s.rows[0].id, 'text'));
  };

  // Say where the project on screen came from, so it never seems to appear from nowhere.
  useEffect(() => {
    setToast({
      message: source === 'saved' ? 'Restored your last project from this browser.' : 'This is an example project.',
      action: { label: 'Start new', run: newBlank },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pasting outside a text field: load straight into a blank project, otherwise ask first.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest?.('input, textarea, select, [contenteditable]')) return;
      const text = e.clipboardData?.getData('text') ?? '';
      if (!text.trim()) return;
      e.preventDefault();
      const r = parsePrompt(text);
      if (isBlank(state) && !('error' in r)) loadState(r.state, `Loaded: ${describe(r.summary)}`);
      else setPaste(text);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  });
  const importJson = async (file?: File) => {
    if (!file) return;
    const s = parseState(await file.text());
    if (s) loadState(s, `Opened ${file.name}`);
    else setToast({ message: 'That file isn’t a Hailuo Sheet project.' });
    if (fileRef.current) fileRef.current.value = '';
  };
  const exportJson = () => download('hailuo-sheet.json', JSON.stringify(state, null, 2), 'application/json');

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(false);
    document.addEventListener('keydown', onKey);
    document.querySelector<HTMLElement>('.drawer .btn')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [drawer]);

  const problems = issues.filter((i) => i.level !== 'info');
  const errors = problems.filter((i) => i.level === 'error').length;
  const formatIssues = issues.filter((i) => i.level !== 'info' && !i.rowId && FORMAT_FIELDS.has(i.field ?? '')).length;
  const shotIds = new Set(selGroup >= 0 && groups[selGroup] ? groupIds(groups[selGroup]) : []);
  const style = state.mode === 'ref2va' ? '' : state.doc.style.trim();
  const openDrawer = (t: typeof tab) => {
    setTab(t);
    setDrawer(true);
  };

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Clapperboard size={16} />
          </span>
          <span className="hide-narrow">Hailuo Sheet</span>
        </div>
        <button type="button" className={'format-chip' + (sel?.kind === 'format' ? ' is-selected' : '')} aria-pressed={sel?.kind === 'format'} onClick={() => setSel({ kind: 'format' })}>
          <SlidersHorizontal size={16} aria-hidden="true" />
          <span className="format-main">{mode.title}</span>
          <span className="format-meta">
            {state.aspect} · {state.duration} s{style && ` · ${style}`}
          </span>
          {formatIssues > 0 && <AlertTriangle size={14} className="format-warn" aria-label={`${formatIssues} to check`} />}
        </button>
        {state.mode === 'ref2va' && (
          <button type="button" className={'btn btn-ghost' + (sel?.kind === 'refs' ? ' is-on' : '')} aria-pressed={sel?.kind === 'refs'} onClick={() => setSel({ kind: 'refs' })}>
            <Library size={16} /> References <span className="count">{state.assets.length}</span>
          </button>
        )}
        <div className="topbar-spacer" />
        <div className="topbar-actions">
          <Menu
            items={[
              { label: 'Blank project', hint: 'Start from one empty shot', icon: File, onSelect: newBlank },
              { label: 'From an H3 prompt…', hint: 'Paste a prompt and it becomes a timeline', icon: ClipboardPaste, onSelect: () => setPaste('') },
            ]}
            trigger={(t) => (
              <button type="button" className="btn btn-secondary" {...t}>
                <FilePlus size={16} /> New
              </button>
            )}
          />
          <button type="button" className="btn btn-ghost" onClick={() => openDrawer('checks')}>
            {errors ? <AlertCircle size={16} className="text-error" /> : <AlertTriangle size={16} />}
            <span className="hide-narrow">Problems</span>
            <span className={'count' + (errors ? ' error' : '')}>{problems.length}</span>
          </button>
          <button type="button" className="btn btn-primary" onClick={() => openDrawer('prompt')}>
            <FileText size={16} /> Prompt
          </button>
          <Menu
            items={[
              ...Object.values(EXAMPLES).map((v) => ({ label: v.label, icon: BookOpen, onSelect: () => loadState(v.build(), 'Example loaded') })),
              { label: 'Import project…', icon: FolderOpen, separatorBefore: true, onSelect: () => fileRef.current?.click() },
              { label: 'Export project', icon: Download, onSelect: exportJson },
            ]}
            trigger={(t) => (
              <button type="button" className="btn btn-ghost" aria-label="Project menu" {...t}>
                <MenuIcon size={16} /> <span className="hide-narrow">Project</span>
              </button>
            )}
          />
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => importJson(e.target.files?.[0])} />
        </div>
      </header>

      <main className="studio">
        <div className="studio-top">
          <Viewer
            state={state}
            groups={groups}
            spans={spans}
            time={time}
            playing={playing}
            dispatch={dispatch}
            onSelectShot={(key) => setSel({ kind: 'shot', key })}
            onPaste={isBlank(state) ? () => setPaste('') : undefined}
          />
          <Inspector
            sel={sel}
            state={state}
            issues={issues}
            groups={groups}
            spans={spans}
            dispatch={dispatch}
            run={run}
            setSel={setSel}
            onAddClip={addClip}
            onDeleteShot={deleteShot}
            focusRowId={focusRowId}
            setFocusRowId={setFocusRowId}
            setActiveRow={setActiveRow}
          />
        </div>
        <Timeline
          state={state}
          groups={groups}
          spans={spans}
          lanes={lanes}
          issues={issues}
          sel={sel}
          selGroup={selGroup}
          setSel={setSel}
          time={time}
          setTime={setTime}
          playing={playing}
          setPlaying={setPlaying}
          dispatch={dispatch}
          run={run}
          onAddShot={addShot}
          onSplit={split}
          onAddClip={addClip}
          onAddSpeaker={addSpeaker}
          onEdit={() => reveal(...(sel?.kind === 'row' ? [`row-${sel.id}`] : []), 'insp-first')}
        />
      </main>

      {drawer && (
        <>
          <div className="scrim" onClick={() => setDrawer(false)} />
          <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="preview-title">
            <Preview
              state={state}
              compiled={compiled}
              issues={issues}
              dispatch={dispatch}
              locate={locate}
              shotIds={shotIds}
              activeRow={sel?.kind === 'row' ? sel.id : activeRow}
              onOpenRow={(id) => locate({ level: 'info', message: '', rowId: id })?.go()}
              onClose={() => setDrawer(false)}
              tab={tab}
              setTab={setTab}
            />
          </div>
        </>
      )}

      {paste !== null && <PasteDialog initial={paste} onLoad={loadState} onClose={() => setPaste(null)} />}

      {toast && (
        <div className="toast" role="status">
          <span>{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setToast(null);
                toast.action!.run();
              }}
            >
              {toast.action.label}
            </button>
          )}
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
          <button type="button" className="btn btn-sm" onClick={() => setToast(null)}>
            OK
          </button>
        </div>
      )}
    </>
  );
}
