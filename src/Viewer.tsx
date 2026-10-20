import { useLayoutEffect, useRef, useState, type Dispatch } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Circle, Eye, Maximize2, Minimize2, RotateCcw, RotateCw, Vibrate, Video } from 'lucide-react';
import { MODES } from './spec';
import type { ShotGroup } from './shots';
import { beatSlots, shotAt, type Span } from './timeline/geometry';
import { clipText } from './timeline/Timeline';
import type { Action, State } from './types';

/** A glyph and a motion class for each camera move (the class only animates while playing). */
const MOTION: Record<string, { icon: typeof Video; cls: string }> = {
  'Zoom In': { icon: Maximize2, cls: 'mv-in' },
  'Push In': { icon: Maximize2, cls: 'mv-in' },
  'Zoom Out': { icon: Minimize2, cls: 'mv-out' },
  'Pull Out': { icon: Minimize2, cls: 'mv-out' },
  'Pan Left': { icon: ArrowLeft, cls: 'mv-left' },
  'Truck Left': { icon: ArrowLeft, cls: 'mv-left' },
  'Pan Right': { icon: ArrowRight, cls: 'mv-right' },
  'Truck Right': { icon: ArrowRight, cls: 'mv-right' },
  'Tracking Shot': { icon: ArrowRight, cls: 'mv-right' },
  'Tilt Up': { icon: ArrowUp, cls: 'mv-up' },
  'Pedestal Up': { icon: ArrowUp, cls: 'mv-up' },
  'Tilt Down': { icon: ArrowDown, cls: 'mv-down' },
  'Pedestal Down': { icon: ArrowDown, cls: 'mv-down' },
  'Arc Shot': { icon: RotateCw, cls: 'mv-arc' },
  'Roll Clockwise': { icon: RotateCw, cls: 'mv-roll' },
  'Roll Counterclockwise': { icon: RotateCcw, cls: 'mv-roll-ccw' },
  'Shake Slightly': { icon: Vibrate, cls: 'mv-shake' },
  'Shake Strongly': { icon: Vibrate, cls: 'mv-shake-strong' },
  'Static Shot': { icon: Circle, cls: '' },
  POV: { icon: Eye, cls: '' },
};

const RATIO: Record<string, number> = { '21:9': 21 / 9, '16:9': 16 / 9, '4:3': 4 / 3, '1:1': 1, '3:4': 3 / 4, '9:16': 9 / 16 };

/** Largest frame of the given ratio that fits the stage. */
function useFrameSize(ratio: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const cs = getComputedStyle(el);
      const w = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const h = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const width = Math.max(0, Math.min(w, h * ratio));
      setSize({ width, height: width / ratio });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ratio]);
  return [ref, size] as const;
}

export function Viewer({
  state,
  groups,
  spans,
  time,
  playing,
  dispatch,
  onSelectShot,
}: {
  state: State;
  groups: ShotGroup[];
  spans: Span[];
  time: number;
  playing: boolean;
  dispatch: Dispatch<Action>;
  onSelectShot: (key: string) => void;
}) {
  const mode = MODES.find((m) => m.id === state.mode)!;
  const [stageRef, size] = useFrameSize(RATIO[state.aspect] ?? 16 / 9);
  if (!groups.length) {
    return (
      <section className="viewer" aria-label="Viewer">
        <div className="viewer-stage" ref={stageRef}>
          <div className="frame is-empty" style={size}>
            <p className="frame-empty">Add a shot on the timeline to start.</p>
          </div>
        </div>
      </section>
    );
  }
  const gi = shotAt(spans, Math.min(time, state.duration - 0.001));
  const g = groups[gi];
  const span = spans[gi];
  const slots = beatSlots(g, span);
  const active = g.rows.find((r) => {
    const s = slots.get(r.id)!;
    return time >= s.start && time < s.end;
  });
  const camera = g.rows.find((r) => r.type === 'camera' && r.enabled);
  const motion = camera ? MOTION[camera.f.motion] : undefined;
  const speech = active?.type === 'speech' && active.enabled ? active : null;
  const beat = active && active.enabled && ['visual', 'sound', 'raw'].includes(active.type) ? active : null;
  const signs = g.rows.filter((r) => r.type === 'text' && r.enabled && (r.f.text ?? '').trim());

  // Keyframe images sit on the first/last frame of the video.
  const first = mode.needsFirst && gi === 0 ? state.frames.first.trim() : '';
  const last = mode.needsLast && gi === groups.length - 1 ? state.frames.last.trim() : '';
  const showLast = last && (!first || time >= span.start + (span.end - span.start) / 2);
  const image = showLast ? last : first;
  const style = state.mode === 'ref2va' ? state.doc.styleOpening.trim() : state.doc.style.trim();
  const MotionIcon = motion?.icon ?? Video;

  return (
    <section className="viewer" aria-label="Viewer">
      <div className="viewer-stage" ref={stageRef}>
        <div className="frame" style={size}>
          <div
            key={g.key + (playing ? ':play' : '')}
            className={'frame-content' + (playing && motion ? ' ' + motion.cls : '')}
            style={{ animationDuration: `${Math.max(0.5, span.end - span.start)}s` }}
          >
            {image && <img className="frame-image" src={image} alt={showLast ? 'Last frame' : 'First frame'} />}
          </div>

          <div className="frame-top">
            <button type="button" className="frame-chip" onClick={() => onSelectShot(g.key)}>
              Shot {g.number ?? '–'} · {+span.start.toFixed(2)}–{+span.end.toFixed(2)} s
            </button>
            {gi === 0 && style && <span className="frame-chip is-quiet">{style}</span>}
            {image && <span className="frame-chip is-quiet">{showLast ? 'Ends on this image' : 'Starts on this image'}</span>}
          </div>

          <div className={'frame-script' + (image ? ' on-image' : '')}>
            {g.head ? (
              <textarea
                className="frame-text"
                aria-label={`What the camera sees in Shot ${g.number ?? ''}`}
                value={g.head.f.text ?? ''}
                placeholder="Describe what the camera sees…"
                onChange={(e) => dispatch({ t: 'field', id: g.head!.id, key: 'text', value: e.target.value })}
                onFocus={() => onSelectShot(g.key)}
                rows={3}
              />
            ) : (
              <p className="frame-text is-placeholder">This shot has no camera view yet.</p>
            )}
            {beat && <p className="frame-beat">{clipText(beat)}</p>}
          </div>

          {signs.length > 0 && (
            <div className="frame-signs">
              {signs.map((r) => (
                <span key={r.id} className="frame-sign">
                  “{r.f.text.trim()}”
                </span>
              ))}
            </div>
          )}

          {camera && (
            <div className="frame-camera" aria-label={'Camera: ' + clipText(camera)}>
              <MotionIcon size={16} aria-hidden="true" /> {clipText(camera)}
            </div>
          )}

          {speech && (speech.f.line ?? '').trim() && (
            <p className="frame-subtitle">
              <span className="frame-speaker">{(speech.f.who ?? '').trim() || speech.f.id}</span>
              {speech.f.voiceover === 'yes' && <em> (voiceover)</em>} {speech.f.line.trim()}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
