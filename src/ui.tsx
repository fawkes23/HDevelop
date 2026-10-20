import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRightFromLine,
  ArrowRightToLine,
  Check,
  ChevronRight,
  Code,
  Eye,
  Film,
  Info,
  Library,
  MessageSquareQuote,
  MoveHorizontal,
  StickyNote,
  Tag,
  Type,
  Video,
  Volume2,
  type LucideIcon,
} from 'lucide-react';
import type { Dispatch } from 'react';
import type { Action, Issue } from './types';

/** Icons referenced by name from spec.ts. */
export const ICONS: Record<string, LucideIcon> = {
  Film,
  Eye,
  Video,
  MessageSquareQuote,
  Volume2,
  Type,
  Tag,
  Code,
  StickyNote,
  ArrowRightFromLine,
  ArrowRightToLine,
  MoveHorizontal,
  Library,
};

export const MODE_ICONS: Record<string, LucideIcon> = {
  t2va: Type,
  i2va: ArrowRightFromLine,
  fl2va: MoveHorizontal,
  l2va: ArrowRightToLine,
  ref2va: Library,
};

const LEVEL_ICON = { error: AlertCircle, warn: AlertTriangle, info: Info } as const;
const LEVEL_WORD = { error: 'Error', warn: 'Warning', info: 'Tip' } as const;

export function LevelIcon({ level, size = 16 }: { level: Issue['level']; size?: number }) {
  const Icon = LEVEL_ICON[level];
  return <Icon size={size} aria-label={LEVEL_WORD[level]} role="img" />;
}

/** Validation messages for one control or block. Icon + text, never color alone. */
export function Messages({ issues, dispatch, id }: { issues: Issue[]; dispatch: Dispatch<Action>; id?: string }) {
  if (!issues.length) return null;
  return (
    <ul className="messages" id={id}>
      {issues.map((i, k) => (
        <li key={k} className={'msg ' + i.level}>
          <LevelIcon level={i.level} size={14} />
          <span>
            {i.message}
            {i.fix && (
              <>
                {' '}
                <button type="button" className="link-btn msg-fix" onClick={() => dispatch(i.fix!.action)}>
                  {i.fix.label}
                </button>
              </>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Label + hint + control + messages, wired up for screen readers. */
export function Field({
  label,
  hint,
  issues = [],
  dispatch,
  className = '',
  id: fixedId,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  issues?: Issue[];
  dispatch: Dispatch<Action>;
  className?: string;
  /** Stable DOM id for the control, so checks can jump to it. */
  id?: string;
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode;
}) {
  const autoId = useId();
  const id = fixedId ?? autoId;
  const hintId = hint ? id + '-hint' : undefined;
  const msgId = issues.length ? id + '-msg' : undefined;
  const describedBy = [hintId, msgId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={'field ' + className}>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {hint && (
        <span className="field-hint" id={hintId}>
          {hint}
        </span>
      )}
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': issues.some((i) => i.level === 'error') || undefined })}
      <Messages issues={issues} dispatch={dispatch} id={msgId} />
    </div>
  );
}

/** Textarea that grows with its content. */
export function AutoTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { large?: boolean }) {
  const { large, className = '', ...rest } = props;
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 2 + 'px';
  }, [props.value]);
  return <textarea ref={ref} rows={large ? 3 : 2} className={`textarea ${large ? 'large' : ''} ${className}`} {...rest} />;
}

/** A row of mutually exclusive buttons (radio group). Arrow keys move the choice. */
export function Segmented({
  value,
  options,
  onChange,
  label,
  ...rest
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  label?: string;
  id?: string;
  'aria-describedby'?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onKey = (e: React.KeyboardEvent) => {
    const i = options.findIndex((o) => o.value === value);
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = options[(i + step + options.length) % options.length];
    onChange(next.value);
    requestAnimationFrame(() => (ref.current?.querySelector('[aria-checked="true"]') as HTMLElement | null)?.focus());
  };
  return (
    <div className="segmented" role="radiogroup" aria-label={label} ref={ref} onKeyDown={onKey} {...rest}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** "More options" style progressive disclosure. */
export function Disclosure({
  label,
  summary,
  defaultOpen = false,
  forceOpen = false,
  children,
}: {
  label: string;
  summary?: string;
  defaultOpen?: boolean;
  /** Open when something inside needs attention. */
  forceOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);
  return (
    <div>
      <button type="button" className="disclosure-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <ChevronRight size={16} />
        {label}
        {!open && summary && <span className="disclosure-summary">· {summary}</span>}
      </button>
      <div id={id} className="disclosure-body" hidden={!open}>
        {children}
      </div>
    </div>
  );
}

export interface MenuItem {
  label: string;
  hint?: string;
  icon?: LucideIcon;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  separatorBefore?: boolean;
}

/** Button that opens a list of actions. Keyboard: arrows, Home/End, Escape. */
export function Menu({
  trigger,
  items,
  align = 'right',
}: {
  trigger: (props: { onClick: () => void; 'aria-haspopup': 'menu'; 'aria-expanded': boolean; ref: React.Ref<HTMLButtonElement> }) => ReactNode;
  items: MenuItem[];
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const first = list.current?.querySelector<HTMLButtonElement>('.menu-item:not(:disabled)');
    first?.focus();
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) btn.current?.focus();
  };
  const onKey = (e: React.KeyboardEvent) => {
    const els = [...(list.current?.querySelectorAll<HTMLButtonElement>('.menu-item:not(:disabled)') ?? [])];
    const i = els.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') return close();
    if (e.key === 'Tab') return setOpen(false);
    let next = -1;
    if (e.key === 'ArrowDown') next = (i + 1) % els.length;
    if (e.key === 'ArrowUp') next = (i - 1 + els.length) % els.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = els.length - 1;
    if (next >= 0) {
      e.preventDefault();
      els[next]?.focus();
    }
  };

  return (
    <div className="menu-wrap" ref={wrap}>
      {trigger({ onClick: () => setOpen(!open), 'aria-haspopup': 'menu', 'aria-expanded': open, ref: btn })}
      {open && (
        <div className={'menu' + (align === 'left' ? ' align-left' : '')} role="menu" ref={list} onKeyDown={onKey}>
          {items.map((it, k) => (
            <div key={k}>
              {it.separatorBefore && <div className="menu-sep" role="separator" />}
              <button
                type="button"
                role="menuitem"
                className={'menu-item' + (it.danger ? ' danger' : '')}
                disabled={it.disabled}
                onClick={() => {
                  close();
                  it.onSelect();
                }}
              >
                {it.icon && <it.icon size={16} />}
                <span>
                  {it.label}
                  {it.hint && <small>{it.hint}</small>}
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Copy-to-clipboard button with success and failure feedback. */
export function CopyButton({ text, label, className = 'btn btn-primary' }: { text: string; label: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle');
  useEffect(() => {
    if (state === 'idle') return;
    const t = setTimeout(() => setState('idle'), 1600);
    return () => clearTimeout(t);
  }, [state]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('done');
    } catch {
      setState('failed');
    }
  };
  return (
    <button type="button" className={className + (state === 'done' ? ' is-success' : '')} onClick={copy} aria-live="polite">
      {state === 'done' ? <Check size={16} /> : state === 'failed' ? <AlertCircle size={16} /> : null}
      {state === 'done' ? 'Copied' : state === 'failed' ? 'Copy failed' : label}
    </button>
  );
}

export function useMedia(query: string): boolean {
  const get = () => typeof window !== 'undefined' && window.matchMedia(query).matches;
  const [match, setMatch] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

export function download(name: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
