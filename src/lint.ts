import { mentionRegex, rowActive } from './compile';
import { BLOCKS, LEGACY_BRACKET, LIMITS, MODES, TIMESTAMP_BRACKET, VAGUE } from './spec';
import type { Compiled, Issue, Row, State } from './types';

const isUrl = (u: string) => /^https?:\/\//i.test(u.trim());

/**
 * Every rule is a suggestion: nothing here blocks editing or copying.
 * `error` means the provider will probably reject the request.
 * `warn` means it will probably waste a generation. `info` is a tip.
 */
export function lint(state: State, compiled: Compiled): Issue[] {
  const issues: Issue[] = [];
  const push = (i: Issue) => issues.push(i);
  const mode = MODES.find((m) => m.id === state.mode)!;
  const active = state.rows.filter((r) => rowActive(r, state));

  /* ---------- settings ---------- */
  if (state.duration < LIMITS.durationMin || state.duration > LIMITS.durationMax) {
    push({
      level: 'error',
      message: `Duration must be ${LIMITS.durationMin}–${LIMITS.durationMax} s.`,
      fix: { label: 'Set to 5 s', action: { t: 'settings', patch: { duration: 5 } } },
    });
  } else if (state.duration < LIMITS.durationSoftMin) {
    push({ level: 'info', message: 'Some providers list the minimum as 5 s, not 4 s. If it is rejected, use 5.' });
  }

  if (state.mode === 't2v' && state.aspect === 'adaptive') {
    push({
      level: 'error',
      message: '"adaptive" aspect ratio only works with reference images. It is rejected for text-only requests.',
      fix: { label: 'Use 16:9', action: { t: 'settings', patch: { aspect: '16:9' } } },
    });
  }
  if ((state.mode === 'i2v' || state.mode === 'flf') && state.aspect !== 'adaptive') {
    push({ level: 'info', message: 'Aspect ratio comes from the first frame in this mode, so the setting is not sent.' });
  }
  if (state.provider === 'evolink' && state.resolution === '768p') {
    push({
      level: 'error',
      message: 'The EvoLink route only accepts 2K.',
      fix: { label: 'Use 2K', action: { t: 'settings', patch: { resolution: '2k' } } },
    });
  }

  /* ---------- inputs per mode ---------- */
  if (mode.needsFirst && !state.frames.first.trim()) push({ level: 'error', message: 'First frame is missing.' });
  if (mode.needsLast && !state.frames.last.trim()) push({ level: 'error', message: 'Last frame is missing.' });
  for (const [label, url] of [
    ['First frame', state.frames.first],
    ['Last frame', state.frames.last],
  ] as const) {
    const used = label === 'First frame' ? mode.needsFirst : mode.needsLast;
    if (used && url.trim() && !isUrl(url)) {
      push({ level: 'warn', message: `${label} is not an http(s) URL. Providers need a public URL, so local files must be uploaded first.` });
    }
  }

  if (mode.usesRefs) {
    const count = (k: string) => state.assets.filter((a) => a.kind === k).length;
    const nImg = count('image');
    const nVid = count('video');
    const nAud = count('audio');
    if (nImg + nVid === 0) {
      push({ level: 'error', message: 'Reference mode needs at least one image or video. Audio alone is not enough.' });
    }
    if (nImg > LIMITS.image) push({ level: 'error', message: `Too many images (${nImg}/${LIMITS.image}).` });
    if (nVid > LIMITS.video) push({ level: 'error', message: `Too many videos (${nVid}/${LIMITS.video}).` });
    if (nAud > LIMITS.audio) push({ level: 'error', message: `Too many audio clips (${nAud}/${LIMITS.audio}).` });
    if (nImg + nVid + nAud > LIMITS.refTotal) {
      push({ level: 'error', message: `Combined references are capped at ${LIMITS.refTotal} (you have ${nImg + nVid + nAud}).` });
    }
    if (nVid > 0) {
      push({ level: 'info', message: 'Reference video duration is billed (added to output length, capped at 15 s), even if the video is never cited.' });
    }
    for (const a of state.assets) {
      if (!a.url.trim()) push({ level: 'warn', message: 'A reference file has no URL yet.' });
      else if (!isUrl(a.url)) push({ level: 'warn', message: `"${a.url.slice(0, 40)}" is not an http(s) URL. Providers need a public URL.` });
    }
    // citations
    const cited = new Set<string>();
    for (const m of compiled.text.matchAll(mentionRegex())) cited.add(`${m[1].toLowerCase()}${+m[2]}`);
    for (const k of ['image', 'video', 'audio'] as const) {
      const n = count(k);
      for (let i = 1; i <= n; i++) {
        if (!cited.has(`${k}${i}`)) {
          push({ level: 'warn', message: `${k[0].toUpperCase() + k.slice(1)} ${i} is never cited. Uncited references still count toward limits${k === 'video' ? ' and price' : ''}.` });
        }
      }
    }
    for (const c of cited) {
      const m = /^(image|video|audio)(\d+)$/.exec(c)!;
      if (+m[2] > count(m[1])) push({ level: 'error', message: `The prompt cites ${m[1][0].toUpperCase() + m[1].slice(1)} ${m[2]} but only ${count(m[1])} exist.` });
    }
  } else {
    if (state.assets.length > 0) push({ level: 'info', message: `Reference files are ignored in ${mode.label} mode.` });
  }

  /* ---------- prompt size ---------- */
  const text = compiled.text;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  if (!text.trim()) push({ level: 'error', message: 'The prompt is empty.' });
  if (text.length > LIMITS.promptChars) push({ level: 'error', message: `Prompt is ${text.length} characters. The limit is ${LIMITS.promptChars}.` });
  else if (words > LIMITS.promptWordsSoft) push({ level: 'warn', message: `Prompt is ${words} words. MiniMax recommends staying under about ${LIMITS.promptWordsSoft}.` });
  if (text.trim() && !active.some((r) => r.type === 'camera')) {
    push({ level: 'info', message: 'No camera row. The model will pick its own camera move.' });
  }

  /* ---------- time windows ---------- */
  const windows = new Map<string, { start: number; end: number; rows: Row[] }>();
  for (const r of active) {
    if (!BLOCKS[r.type].timed || !r.when) continue;
    const { start, end } = r.when;
    if (!(start < end)) push({ level: 'error', rowId: r.id, message: 'Time window must end after it starts.' });
    else if (end > state.duration) {
      push({
        level: 'warn',
        rowId: r.id,
        message: `Window ends at ${end}s but the clip is ${state.duration}s.`,
        fix: { label: `Clip to ${state.duration}s`, action: { t: 'when', id: r.id, when: { start: Math.min(start, state.duration - 0.5), end: state.duration } } },
      });
    }
    const k = `${start}-${end}`;
    const w = windows.get(k) ?? { start, end, rows: [] };
    w.rows.push(r);
    windows.set(k, w);
  }
  const ws = [...windows.values()].sort((a, b) => a.start - b.start);
  // Only partial overlaps are suspicious. A window fully inside another
  // (a line of dialogue inside a shot) is normal nesting.
  for (let i = 0; i < ws.length; i++) {
    for (let j = i + 1; j < ws.length; j++) {
      const a = ws[i];
      const b = ws[j];
      const overlap = b.start < a.end && a.start < b.end;
      const nested = (b.start >= a.start && b.end <= a.end) || (a.start >= b.start && a.end <= b.end);
      if (overlap && !nested) {
        push({ level: 'info', rowId: b.rows[0].id, message: `Window ${b.start}–${b.end}s partly overlaps ${a.start}–${a.end}s. Shots would be ambiguous, and timecodes are only approximate in practice.` });
      }
    }
  }

  /* ---------- camera: one move per shot ---------- */
  const camPerWindow = new Map<string, Row[]>();
  for (const r of active.filter((x) => x.type === 'camera')) {
    const k = r.when ? `${r.when.start}-${r.when.end}` : 'all';
    camPerWindow.set(k, [...(camPerWindow.get(k) ?? []), r]);
  }
  for (const rows of camPerWindow.values()) {
    for (const r of rows.slice(1)) {
      push({ level: 'warn', rowId: r.id, message: 'A second camera move in the same shot. Chained moves tend to come back as hard cuts. Give it its own time window.' });
    }
  }

  /* ---------- per row ---------- */
  let seenNonRef = false;
  for (const r of state.rows) {
    if (r.type === 'reference' && state.mode !== 'ref2v' && r.enabled) {
      push({ level: 'info', rowId: r.id, message: `Reference rows only apply in Reference → video mode. Skipped in ${mode.label}.` });
      continue;
    }
    if (!rowActive(r, state)) continue;
    const f = r.f;

    // legacy brackets + vague words, across every text field
    for (const v of Object.values(f)) {
      for (const m of v.matchAll(/\[([^\]]+)\]/g)) {
        const inner = m[1];
        if (TIMESTAMP_BRACKET.test(inner)) continue;
        if (LEGACY_BRACKET.test(inner.trim().split(/[,\s]+/).slice(0, 2).join(' ')) || LEGACY_BRACKET.test(inner.trim())) {
          push({ level: 'info', rowId: r.id, message: `"[${inner}]" looks like a Hailuo 2.x bracket camera command. H3 guides mostly recommend plain film language ("slow dolly in"), though one source still lists [pan]/[zoom]/[static] tags. Test both.` });
        }
      }
      for (const vg of VAGUE) if (vg.re.test(v)) push({ level: 'info', rowId: r.id, message: vg.tip });
    }

    if (r.type === 'camera') {
      if (!f.framing && !f.movement && !(f.note ?? '').trim()) push({ level: 'warn', rowId: r.id, message: 'Empty camera row. It adds nothing to the prompt.' });
      if (f.speed === 'fast') push({ level: 'info', rowId: r.id, message: 'Very fast motion leaves the model less room to keep clean geometry.' });
      if (/\b(then|followed by|and then)\b/i.test(f.note ?? '')) {
        push({ level: 'warn', rowId: r.id, message: '"then" chains moves, which often become separate shots with hard cuts. Use one move per time window.' });
      }
      if (/\bdynamic\b|\btracking shot\b/i.test(f.note ?? '')) {
        push({ level: 'info', rowId: r.id, message: 'Do not mix subject motion and camera motion in one phrase. Put subject motion in an Action row.' });
      }
    }

    if (r.type === 'sound' && f.kind === 'dialogue' && !(f.speaker ?? '').trim() && (f.text ?? '').trim()) {
      push({ level: 'warn', rowId: r.id, message: 'Name the speaker so the line is assigned to the right character.' });
    }

    if (r.type === 'reference') {
      if (!f.asset || !state.assets.some((a) => a.id === f.asset)) {
        push({ level: 'error', rowId: r.id, message: 'Pick a reference file for this row.' });
      } else {
        if (!(f.role ?? '').trim()) push({ level: 'warn', rowId: r.id, message: 'Give this file one clear job (e.g. "main character", "motion reference").' });
        if (!(f.ignore ?? '').trim()) push({ level: 'info', rowId: r.id, message: 'Say what to ignore. Broad references without exclusions are a common cause of drift.' });
        if (f.retention !== 'weak' && !(f.keep ?? '').trim()) push({ level: 'info', rowId: r.id, message: 'List the attributes to preserve. "Keep it consistent" is too vague.' });
      }
      if (seenNonRef) push({ level: 'info', rowId: r.id, message: 'References usually go first in the prompt.' });
    } else if (r.type !== 'comment') {
      seenNonRef = true;
    }

    const filled = BLOCKS[r.type].fields.some((fd) => fd.kind !== 'select' && fd.kind !== 'asset' && (f[fd.key] ?? '').trim());
    if (!filled && r.type !== 'camera' && r.type !== 'reference') {
      push({ level: 'info', rowId: r.id, message: 'Empty row. It adds nothing to the prompt.' });
    }
  }

  const order = { error: 0, warn: 1, info: 2 } as const;
  return issues.sort((a, b) => order[a.level] - order[b.level]);
}
