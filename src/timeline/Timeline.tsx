import { useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch } from 'react';
import { AlertCircle, AlertTriangle, Pause, Play, Plus, Scissors, UserPlus } from 'lucide-react';
import type { Run } from '../Block';
import { groupSummary, type ShotGroup } from '../shots';
import { AMPLITUDE, BLOCKS, CAMERA_MOTION, SPEED } from '../spec';
import type { Action, Issue, Row, RowType, State } from '../types';
import { ICONS } from '../ui';
import { beatSlots, clampCut, clampDuration, dropIndex, laneOf, reorderTarget, shotAt, trackOf, type Lane, type Span, type TrackId } from './geometry';

export type Sel =
  | { kind: 'shot'; key: string }
  | { kind: 'row'; id: string }
  | { kind: 'format' }
  | { kind: 'soundscape' }
  | { kind: 'music' }
  | { kind: 'refs' }
  | null;

const MIN_PPS = 56;
const LABEL_W = 184;

interface Props {
  state: State;
  groups: ShotGroup[];
  spans: Span[];
  lanes: Lane[];
  issues: Issue[];
  sel: Sel;
  selGroup: number;
  setSel: (s: Sel, time?: number) => void;
  time: number;
  setTime: (t: number) => void;
  playing: boolean;
  setPlaying: (p: boolean) => void;
  dispatch: Dispatch<Action>;
  run: Run;
  onAddShot: () => void;
  onSplit: () => void;
  onAddClip: (type: RowType, group: number, lane?: string) => void;
  onAddSpeaker: () => void;
  onEdit: () => void;
}

/** "The middle-aged baker with a calm voice" -> "middle-aged baker". */
export const shortName = (who: string) =>
  who
    .replace(/^(the|a|an)\s+/i, '')
    .split(/\s+(?:with|who|in|wearing)\s+|,/i)[0]
    .trim() || 'Speaker';

const fmt = (t: number) => {
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
};

/** Short text shown on a clip. */
export function clipText(r: Row): string {
  const f = r.f;
  switch (r.type) {
    case 'camera': {
      const m = CAMERA_MOTION.find((o) => o.value === f.motion)?.value ?? 'Camera';
      const extra = [AMPLITUDE.find((o) => o.value === f.amplitude && o.value)?.label, SPEED.find((o) => o.value === f.speed && o.value)?.label].filter(Boolean);
      return [m.charAt(0) + m.slice(1).toLowerCase(), ...extra.map((x) => x!.toLowerCase())].join(' · ');
    }
    case 'speech':
      return f.line?.trim() ? `“${f.line.trim()}”` : 'No words yet';
    case 'text':
      return f.text?.trim() ? `“${f.text.trim()}”` : 'No text yet';
    default:
      return (f.text ?? '').trim() || 'Empty';
  }
}

function Marker({ issues }: { issues: Issue[] }) {
  const err = issues.filter((i) => i.level === 'error').length;
  const warn = issues.filter((i) => i.level === 'warn').length;
  if (!err && !warn) return null;
  const Icon = err ? AlertCircle : AlertTriangle;
  return (
    <span className={'clip-marker ' + (err ? 'error' : 'warn')} aria-label={`${err || warn} ${err ? 'to fix' : 'to check'}`}>
      <Icon size={13} aria-hidden="true" />
      {err || warn}
    </span>
  );
}

const TRACKS: { id: TrackId; label: string; type: RowType }[] = [
  { id: 'camera', label: 'Camera', type: 'camera' },
  { id: 'action', label: 'Action', type: 'visual' },
];
const LOWER_TRACKS: { id: TrackId; label: string; type: RowType }[] = [
  { id: 'sound', label: 'Sound', type: 'sound' },
  { id: 'text', label: 'On-screen text', type: 'text' },
];

export function Timeline(p: Props) {
  const { state, groups, spans, lanes, issues, sel, selGroup, setSel, time, setTime, playing, setPlaying, dispatch, run } = p;
  const contentRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [scrub, setScrub] = useState<string | null>(null);

  useLayoutEffect(() => {
    const el = contentRef.current?.closest('.tl-scroll') as HTMLElement | null;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth - LABEL_W - 16));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pps = Math.max(MIN_PPS, width / state.duration);
  const total = state.duration * pps;
  const x = (t: number) => t * pps;
  // While dragging the end, keep the scale fixed so the timeline does not rescale under the pointer.
  const frozenPps = useRef<number | null>(null);
  const timeAt = (clientX: number) => {
    const r = contentRef.current!.getBoundingClientRect();
    return Math.max(0, (clientX - r.left) / (frozenPps.current ?? pps));
  };

  const slots = useMemo(() => {
    const m = new Map<string, { span: Span; group: number }>();
    groups.forEach((g, gi) => beatSlots(g, spans[gi]).forEach((span, id) => m.set(id, { span, group: gi })));
    return m;
  }, [groups, spans]);

  const issuesFor = (id: string) => issues.filter((i) => i.rowId === id);
  const selectedRow = sel?.kind === 'row' ? sel.id : null;
  const hasNotes = state.rows.some((r) => r.type === 'comment');

  /* ---------- dragging clips ---------- */
  const start = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);
  const onClipDown = (e: React.PointerEvent, r: Row) => {
    if (e.button !== 0) return;
    start.current = { id: r.id, x: e.clientX, y: e.clientY, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onClipMove = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.moved && Math.hypot(dx, dy) < 5) return;
    s.moved = true;
    setDrag({ id: s.id, dx, dy });
  };
  const onClipUp = (e: React.PointerEvent, r: Row) => {
    const s = start.current;
    start.current = null;
    setDrag(null);
    if (!s) return;
    if (!s.moved) {
      setSel({ kind: 'row', id: r.id }, slots.get(r.id)?.span.start);
      return;
    }
    const t = timeAt(e.clientX);
    const gi = shotAt(spans, Math.min(t, state.duration - 0.001));
    dispatch({ t: 'move', id: r.id, to: dropIndex(state, groups[gi], spans[gi], r.id, t) });
    if (r.type === 'speech') {
      const track = document
        .elementsFromPoint(e.clientX, e.clientY)
        .map((el) => (el as HTMLElement).dataset?.track)
        .find(Boolean);
      const lane = track?.startsWith('speech:') ? track.slice(7) : null;
      if (lane && lane !== laneOf(r)) {
        const rest = (r.f.id ?? '').replace(/\s+/g, '').split(',').slice(1);
        dispatch({ t: 'field', id: r.id, key: 'id', value: [lane, ...rest.filter((x) => x !== lane)].join(',') });
      }
    }
    setSel({ kind: 'row', id: r.id });
  };
  const onClipKey = (e: React.KeyboardEvent, r: Row) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      run({ t: 'del', id: r.id }, `${BLOCKS[r.type].label} deleted`);
      setSel(null);
    } else if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      const to = reorderTarget(state, r.id, e.key === 'ArrowLeft' ? -1 : 1);
      if (to !== null) dispatch({ t: 'move', id: r.id, to });
      requestAnimationFrame(() => document.getElementById('clip-' + r.id)?.focus());
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const el = e.currentTarget as HTMLElement;
      const sib = (e.key === 'ArrowLeft' ? el.previousElementSibling : el.nextElementSibling) as HTMLElement | null;
      if (sib?.classList.contains('clip')) sib.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      setSel({ kind: 'row', id: r.id }, slots.get(r.id)?.span.start);
      p.onEdit();
    }
  };

  /* ---------- scrubbing, cuts and length ---------- */
  const startScrub = (e: React.PointerEvent, what: string) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setScrub(what);
    frozenPps.current = what === 'end' ? pps : null;
    if (what === 'ruler') setTime(Math.min(state.duration, timeAt(e.clientX)));
  };
  const moveScrub = (e: React.PointerEvent) => {
    if (!scrub) return;
    const t = timeAt(e.clientX);
    if (scrub === 'ruler') setTime(Math.min(state.duration, t));
    else if (scrub === 'end') {
      const d = clampDuration(spans, t);
      if (d !== state.duration) dispatch({ t: 'settings', patch: { duration: d } });
    } else {
      const i = Number(scrub.slice(4));
      const head = groups[i].head!;
      const at = String(clampCut(spans, i, t, state.duration));
      if (head.f.at !== at) dispatch({ t: 'field', id: head.id, key: 'at', value: at });
    }
  };
  const endScrub = () => {
    setScrub(null);
    frozenPps.current = null;
  };
  const seamKey = (e: React.KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowLeft' ? -0.5 : e.key === 'ArrowRight' ? 0.5 : 0;
    if (!step) return;
    e.preventDefault();
    const head = groups[i].head!;
    dispatch({ t: 'field', id: head.id, key: 'at', value: String(clampCut(spans, i, spans[i].start + step, state.duration)) });
  };
  const endKey = (e: React.KeyboardEvent) => {
    const step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    if (!step) return;
    e.preventDefault();
    dispatch({ t: 'settings', patch: { duration: clampDuration(spans, state.duration + step) } });
  };

  // Keep the playhead visible while playing.
  useEffect(() => {
    if (!playing) return;
    const sc = contentRef.current?.closest('.tl-scroll');
    if (!sc) return;
    const px = x(time) + LABEL_W;
    if (px > sc.scrollLeft + sc.clientWidth - 40 || px < sc.scrollLeft + LABEL_W) sc.scrollLeft = px - LABEL_W - 40;
  });

  /* ---------- rendering ---------- */
  const clip = (r: Row) => {
    const slot = slots.get(r.id);
    if (!slot) return null;
    const spec = BLOCKS[r.type];
    const Icon = ICONS[spec.icon];
    const w = x(slot.span.end - slot.span.start) - 4;
    const isDrag = drag?.id === r.id;
    const compound = r.type === 'speech' && (r.f.id ?? '').includes(',');
    return (
      <button
        key={r.id}
        id={'clip-' + r.id}
        type="button"
        className={'clip' + (selectedRow === r.id ? ' is-selected' : '') + (r.enabled ? '' : ' is-off') + (isDrag ? ' is-dragging' : '')}
        style={{
          left: x(slot.span.start) + 2,
          width: Math.max(w, 24),
          ['--c' as string]: spec.color,
          transform: isDrag ? `translate(${drag.dx}px, ${drag.dy}px)` : undefined,
        }}
        aria-label={`${spec.label}: ${clipText(r)}${r.enabled ? '' : ' (turned off)'}`}
        aria-pressed={selectedRow === r.id}
        onPointerDown={(e) => onClipDown(e, r)}
        onPointerMove={onClipMove}
        onPointerUp={(e) => onClipUp(e, r)}
        onPointerCancel={() => {
          start.current = null;
          setDrag(null);
        }}
        onKeyDown={(e) => onClipKey(e, r)}
        onClick={(e) => {
          // Keyboard activation (Space); pointer clicks are handled on pointer up.
          if (e.detail === 0) setSel({ kind: 'row', id: r.id }, slots.get(r.id)?.span.start);
        }}
      >
        {r.type === 'speech' && r.f.continuity === 'prev' && <span className="clip-cont" title="Continues from the previous shot">↩</span>}
        <Icon size={14} aria-hidden="true" />
        {w > 56 && <span className="clip-text">{clipText(r)}</span>}
        {compound && <span className="clip-badge">{r.f.id.replace(/\s+/g, '').replace(/,/g, '+')}</span>}
        {r.type === 'speech' && r.f.continuity === 'next' && <span className="clip-cont" title="Continues into the next shot">↪</span>}
        {r.type === 'speech' && r.f.continuity === 'cutoff' && <span className="clip-cont" title="Cut off by the end">✂</span>}
        <Marker issues={issuesFor(r.id)} />
      </button>
    );
  };

  const placeholder = (track: TrackId, type: RowType, label: string, lane?: string) => {
    if (selGroup < 0 || !groups[selGroup]) return null;
    const has = groups[selGroup].rows.some((r) => trackOf(r) === track);
    if (has) return null;
    const s = spans[selGroup];
    return (
      <button
        type="button"
        className="clip-add"
        style={{ left: x(s.start) + 2, width: Math.max(x(s.end - s.start) - 4, 24) }}
        onClick={() => p.onAddClip(type, selGroup, lane)}
      >
        <Plus size={14} aria-hidden="true" /> {x(s.end - s.start) > 110 && label}
      </button>
    );
  };

  const track = (id: TrackId, label: React.ReactNode, type: RowType, addLabel: string, lane?: string, labelText?: string) => (
    <div className="tl-track" key={id}>
      <div className="tl-label">
        <span className="tl-label-text">{label}</span>
        <button
          type="button"
          className="btn btn-ghost btn-sm btn-icon"
          aria-label={`Add ${labelText ?? addLabel} to Shot ${selGroup + 1}`}
          title={`Add to Shot ${selGroup + 1}`}
          disabled={selGroup < 0}
          onClick={() => p.onAddClip(type, selGroup, lane)}
        >
          <Plus size={16} />
        </button>
      </div>
      <div className="tl-lane" data-track={id} style={{ width: total }}>
        {state.rows.filter((r) => r.type !== 'shot' && r.type !== 'define' && trackOf(r) === id).map(clip)}
        {placeholder(id, type, addLabel, lane)}
      </div>
    </div>
  );

  const bed = (kind: 'soundscape' | 'music', label: string, text: string, empty: string) => {
    const on = sel?.kind === kind;
    const field = kind;
    const bedIssues = issues.filter((i) => !i.rowId && i.field === field);
    return (
      <div className="tl-track">
        <div className="tl-label">
          <span className="tl-label-text">{label}</span>
        </div>
        <div className="tl-lane" style={{ width: total }}>
          <button
            type="button"
            className={'bed' + (on ? ' is-selected' : '') + (text ? '' : ' is-empty')}
            style={{ width: total - 4, ['--c' as string]: kind === 'music' ? '#7c3aed' : '#4d7c0f' }}
            aria-pressed={on}
            onClick={() => setSel({ kind })}
          >
            <span className="clip-text">{text || empty}</span>
            <Marker issues={bedIssues} />
          </button>
        </div>
      </div>
    );
  };

  const ticks = Array.from({ length: Math.floor(state.duration) + 1 }, (_, i) => i);
  const band = selGroup >= 0 && spans[selGroup];

  return (
    <section className="timeline" aria-label="Timeline">
      <div className="tl-toolbar">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPlaying(!playing)} aria-pressed={playing}>
          {playing ? <Pause size={16} /> : <Play size={16} />} {playing ? 'Pause' : 'Play'}
        </button>
        <span className="tl-time" aria-live="off">
          {fmt(time)} <span className="muted">/ {fmt(state.duration)}</span>
        </span>
        <span className="tl-spacer" />
        <button type="button" className="btn btn-ghost btn-sm" onClick={p.onSplit} title="Start a new shot at the playhead">
          <Scissors size={16} /> Split at playhead
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={p.onAddShot}>
          <Plus size={16} /> Add shot
        </button>
      </div>

      <div className="tl-scroll">
        <div className="tl-grid" style={{ width: total + LABEL_W + 16 }}>
          {/* Ruler */}
          <div className="tl-track tl-ruler-row">
            <div className="tl-label" />
            <div
              className="tl-ruler"
              ref={contentRef}
              style={{ width: total }}
              onPointerDown={(e) => startScrub(e, 'ruler')}
              onPointerMove={moveScrub}
              onPointerUp={endScrub}
            >
              {ticks.map((t) => (
                <span key={t} className="tick" style={{ left: x(t) }}>
                  {t}s
                </span>
              ))}
              <span
                className={'tl-end' + (scrub === 'end' ? ' is-active' : '')}
                style={{ left: total }}
                role="slider"
                tabIndex={0}
                aria-label="Video length"
                aria-valuemin={4}
                aria-valuemax={15}
                aria-valuenow={state.duration}
                aria-valuetext={`${state.duration} seconds`}
                title="Drag to change the length"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  startScrub(e, 'end');
                }}
                onPointerMove={moveScrub}
                onPointerUp={endScrub}
                onKeyDown={endKey}
              >
                <span className="tl-end-label">{state.duration} s</span>
              </span>
            </div>
          </div>

          {/* Shots */}
          <div className="tl-track tl-shots-row">
            <div className="tl-label">
              <span className="tl-label-text">Shots</span>
            </div>
            <div className="tl-lane" style={{ width: total }}>
              {groups.map((g, i) => {
                const s = spans[i];
                const on = (sel?.kind === 'shot' && sel.key === g.key) || false;
                const shotIssues = g.head ? issuesFor(g.head.id) : [];
                return (
                  <button
                    key={g.key}
                    type="button"
                    className={'shot-clip' + (on ? ' is-selected' : '') + (i === selGroup ? ' is-current' : '') + (g.head && !g.head.enabled ? ' is-off' : '')}
                    style={{ left: x(s.start) + 2, width: Math.max(x(s.end - s.start) - 4, 24) }}
                    aria-pressed={on}
                    aria-label={`Shot ${g.number ?? '(off)'}, ${groupSummary(g)}`}
                    onClick={() => setSel({ kind: 'shot', key: g.key }, s.start)}
                    onDoubleClick={p.onEdit}
                  >
                    <span className="shot-num">{g.number ?? '–'}</span>
                    {x(s.end - s.start) > 70 && <span className="clip-text">{groupSummary(g)}</span>}
                    <Marker issues={shotIssues} />
                  </button>
                );
              })}
              {groups.map((g, i) =>
                i > 0 && g.head ? (
                  <span
                    key={'seam' + g.key}
                    className={'tl-seam' + (scrub === 'seam' + i ? ' is-active' : '')}
                    style={{ left: x(spans[i].start) }}
                    role="slider"
                    tabIndex={0}
                    aria-label={`Cut between Shot ${i} and Shot ${i + 1}`}
                    aria-valuenow={spans[i].start}
                    aria-valuetext={`${spans[i].start} seconds`}
                    title="Drag to move the cut"
                    onPointerDown={(e) => startScrub(e, 'seam' + i)}
                    onPointerMove={moveScrub}
                    onPointerUp={endScrub}
                    onKeyDown={(e) => seamKey(e, i)}
                  >
                    {scrub === 'seam' + i && <span className="tl-seam-time">{spans[i].start} s</span>}
                  </span>
                ) : null,
              )}
            </div>
          </div>

          {TRACKS.map((t) => track(t.id, t.label, t.type, BLOCKS[t.type].label))}

          {lanes.map((l) =>
            track(
              `speech:${l.id}`,
              <>
                <span className="lane-who" title={l.who}>
                  {shortName(l.who)}
                </span>
                <span className="lane-id">{l.id}</span>
              </>,
              'speech',
              'Dialogue',
              l.id,
              `a line for ${l.id}`,
            ),
          )}
          <div className="tl-track tl-addrow">
            <div className="tl-label">
              <button type="button" className="btn btn-ghost btn-sm" onClick={p.onAddSpeaker} disabled={selGroup < 0}>
                <UserPlus size={16} /> {lanes.length ? 'Add speaker' : 'Add dialogue'}
              </button>
            </div>
            <div className="tl-lane" style={{ width: total }} />
          </div>

          {LOWER_TRACKS.map((t) => track(t.id, t.label, t.type, BLOCKS[t.type].label))}
          {hasNotes && track('notes', 'Notes', 'comment', BLOCKS.comment.label)}

          {bed('soundscape', 'Background', state.doc.silent ? 'Silent (N/A)' : state.doc.soundscape.trim(), 'Add background sound')}
          {bed('music', 'Music', state.doc.music.trim(), 'No music (N/A). Add some')}

          {/* Overlays: selected shot band and playhead */}
          <div className="tl-overlay" style={{ left: LABEL_W, width: total }} aria-hidden="true">
            {band && <div className="tl-band" style={{ left: x(band.start), width: x(band.end - band.start) }} />}
            <div className="tl-playhead" style={{ left: x(time) }} />
          </div>
        </div>
      </div>
    </section>
  );
}
