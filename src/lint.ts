import { assetLabel, defineLabels, labelRegex, normalizeId, rowActive } from './compile';
import { BLOCKS, CAMERA_FIXED, EXPLICIT_ONLY_TRANSITIONS, LIMITS, MODES, MUSIC_FUNCTION, MUSIC_MOOD, VAGUE } from './spec';
import type { Compiled, Issue, Row, State } from './types';

const isUrl = (u: string) => /^https?:\/\//i.test(u.trim());
const sentences = (t: string) => (t.trim() ? t.trim().split(/(?<=[.!?])\s+/).length : 0);
const words = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

/** Scripts other than Latin, outside <d>…</d> and "…" (the only places another language may appear). */
const NON_ENGLISH = /[\u0400-\u04ff\u0600-\u06ff\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;
const stripAllowed = (t: string) => t.replace(/<d>[\s\S]*?<\/d>/g, '').replace(/"[^"]*"|“[^”]*”/g, '');

/** Old-style mentions this app used to emit. The skill uses <Picture N>, <Video N>, <Audio N>. */
const OLD_MENTION = /(?<![<A-Za-z])@?(Image|Video|Audio)\s?\d{1,2}(?![\d>])/i;

/**
 * Checks derived from the h3-prompt-writing skill. Nothing here blocks editing or copying.
 * `error`: the prompt breaks a hard rule of the skill (or the input caps).
 * `warn`: it departs from the skill's format guidance. `info`: a tip from the skill.
 */
export function lint(state: State, compiled: Compiled): Issue[] {
  const issues: Issue[] = [];
  const push = (i: Issue) => issues.push(i);
  const mode = MODES.find((m) => m.id === state.mode)!;
  const ref = state.mode === 'ref2va';
  const active = state.rows.filter((r) => rowActive(r, state));
  const shotRows = active.filter((r) => r.type === 'shot');
  const nShots = compiled.shots.length;

  /* ---------- settings ---------- */
  if (state.duration < LIMITS.durationMin || state.duration > LIMITS.durationMax) {
    push({
      level: 'error',
      field: 'duration',
      message: `Duration must be ${LIMITS.durationMin}–${LIMITS.durationMax} s.`,
      fix: { label: 'Set to 8 s', action: { t: 'settings', patch: { duration: 8 } } },
    });
  }
  if (state.mode === 't2va' && state.aspect === 'auto') {
    push({
      level: 'warn',
      field: 'aspect',
      message: '"auto" takes the aspect ratio from input images, and T2VA has none.',
      fix: { label: 'Use 16:9', action: { t: 'settings', patch: { aspect: '16:9' } } },
    });
  }

  /* ---------- inputs per mode ---------- */
  if (mode.needsFirst && !state.frames.first.trim()) push({ level: 'error', field: 'frame.first', message: 'First frame is missing.' });
  if (mode.needsLast && !state.frames.last.trim()) push({ level: 'error', field: 'frame.last', message: 'Last frame is missing.' });
  for (const [label, url, used, field] of [
    ['First frame', state.frames.first, mode.needsFirst, 'frame.first'],
    ['Last frame', state.frames.last, mode.needsLast, 'frame.last'],
  ] as const) {
    if (used && url.trim() && !isUrl(url)) push({ level: 'warn', field, message: `${label} is not an http(s) URL.` });
  }

  if (ref) {
    const count = (k: string) => state.assets.filter((a) => a.kind === k).length;
    const nImg = count('image');
    const nVid = count('video');
    const nAud = count('audio');
    if (nImg + nVid === 0) push({ level: 'error', field: 'assets', message: 'Ref2VA needs at least one image or video. Audio cannot be the only input.' });
    if (nImg > LIMITS.image) push({ level: 'error', field: 'assets', message: `Too many images (${nImg}/${LIMITS.image}).` });
    if (nVid > LIMITS.video) push({ level: 'error', field: 'assets', message: `Too many videos (${nVid}/${LIMITS.video}).` });
    if (nAud > LIMITS.audio) push({ level: 'error', field: 'assets', message: `Too many audio clips (${nAud}/${LIMITS.audio}).` });
    if (nImg + nVid + nAud > LIMITS.refTotal) push({ level: 'error', field: 'assets', message: `At most ${LIMITS.refTotal} files across all types (you have ${nImg + nVid + nAud}).` });
    if (nVid + nAud > 0) push({ level: 'info', field: 'assets', message: 'Each reference video and audio clip must be 2–15 s long, and each type totals at most 15 s.' });
    for (const a of state.assets) {
      if (!a.url.trim()) push({ level: 'warn', field: `asset:${a.id}`, message: `${assetLabel(state.assets, a.id)} has no URL yet.` });
      else if (!isUrl(a.url)) push({ level: 'warn', field: `asset:${a.id}`, message: `${assetLabel(state.assets, a.id)} is not an http(s) URL.` });
    }
  } else if (state.assets.length > 0) {
    push({ level: 'info', message: `Reference files are only used in Ref2VA. They are ignored in ${mode.label}.` });
  }

  /* ---------- shots ---------- */
  const firstContent = active.find((r) => r.type !== 'define');
  if (firstContent && firstContent.type !== 'shot') {
    push({ level: 'warn', rowId: firstContent.id, message: 'Start the sheet with a Shot row so [Shot 1] opens with the initial composition.' });
  }
  if (shotRows[0] && (shotRows[0].f.at ?? '').trim() && firstContent === shotRows[0]) {
    push({ level: 'info', rowId: shotRows[0].id, field: 'at', message: '[Shot 1] takes no timestamp. The cut time is ignored.' });
  }
  const timed = firstContent?.type === 'shot' ? shotRows.slice(1) : shotRows;
  let prev = 0;
  for (const r of timed) {
    const raw = (r.f.at ?? '').trim();
    const at = Number(raw);
    if (!raw || !Number.isFinite(at)) {
      push({ level: 'error', rowId: r.id, field: 'at', message: 'Shots after [Shot 1] need a start time.' });
      continue;
    }
    if (at <= prev) push({ level: 'error', rowId: r.id, field: 'at', message: `Start times must strictly increase (this one is ${at}s, the previous is ${prev}s).` });
    if (at >= state.duration) push({ level: 'error', rowId: r.id, field: 'at', message: `A start at ${at}s falls outside the ${state.duration}s video.` });
    if (EXPLICIT_ONLY_TRANSITIONS.has(r.f.transition)) {
      push({ level: 'info', rowId: r.id, field: 'transition', message: 'Cross-dissolve, fade and wipe are for when the user explicitly asks for them.' });
    }
    prev = Math.max(prev, at);
  }
  if (state.mode === 'fl2va' && nShots > 1) {
    push({ level: 'info', message: 'FL2VA generally favors a single shot. Use several only when they are explicitly specified.' });
  }
  for (const r of shotRows) {
    const n = compiled.shotOf[r.id];
    const content = active.some((x) => x !== r && compiled.shotOf[x.id] === n && x.type !== 'define');
    if (!(r.f.text ?? '').trim() && !content) push({ level: 'warn', rowId: r.id, field: 'text', message: `[Shot ${n}] is empty. Describe what the camera sees.` });
  }

  /* ---------- style ---------- */
  if (!ref && nShots && !state.doc.style.trim()) {
    push({ level: 'warn', field: 'style', message: 'State the overall style at the beginning of [Shot 1] (e.g. "Live-action, cinematic").' });
  }
  if (ref && nShots && !state.doc.styleOpening.trim()) {
    push({ level: 'warn', field: 'styleOpening', message: 'Establish the style in one or two sentences before [Shot 1].' });
  }

  /* ---------- keyframes in base modes ---------- */
  if (state.mode === 'i2va' || state.mode === 'l2va') {
    if (!compiled.description.includes('<Picture 1>')) {
      const anchor = state.mode === 'i2va' ? shotRows[0] : shotRows[shotRows.length - 1];
      push({ level: 'warn', rowId: anchor?.id, field: anchor && 'text', message: `Say how <Picture 1> connects to the timeline (it is the ${state.mode === 'i2va' ? 'first' : 'last'} frame).` });
    }
  }
  if (state.mode === 'fl2va') {
    for (const p of ['Picture 1', 'Picture 2']) {
      const anchor = p === 'Picture 1' ? shotRows[0] : shotRows[shotRows.length - 1];
      if (!compiled.description.includes(p)) push({ level: 'warn', rowId: anchor?.id, field: anchor && 'text', message: `Say how ${p} connects to the timeline (${p === 'Picture 1' ? 'opening' : 'ending'} state).` });
    }
  }
  if (!ref) {
    const used = [...compiled.description.matchAll(labelRegex())].map((m) => m[0]).filter((l) => !/^<Picture [12]>$/.test(l));
    if (used.length) push({ level: 'warn', message: `${used[0]} is a full-reference label. Base modes do not use them.` });
  }

  /* ---------- speakers ---------- */
  const assigned: string[] = [];
  const speech = active.filter((r) => r.type === 'speech');
  for (const r of speech) {
    const id = normalizeId(r.f.id ?? '');
    if (!(r.f.line ?? '').trim()) {
      push({ level: 'warn', rowId: r.id, field: 'line', message: 'Add the words they say.' });
      continue;
    }
    if (!(r.f.who ?? '').trim()) push({ level: 'warn', rowId: r.id, field: 'who', message: 'Identify the speaker (who they are, on-screen or not, voice) before the ID.' });
    if (!(r.f.lang ?? '').trim()) push({ level: 'warn', rowId: r.id, field: 'lang', message: 'Add the language tag, e.g. English.' });
    if (!/^S\d+(,S\d+)*$/.test(id)) {
      push({ level: 'error', rowId: r.id, field: 'id', message: 'Speaker ID must look like S1, or S1,S2 for speakers vocalizing together.' });
      continue;
    }
    const ids = id.split(',');
    if (ids.length > 1) {
      const unknown = ids.filter((x) => !assigned.includes(x));
      if (unknown.length) push({ level: 'warn', rowId: r.id, field: 'id', message: `Compound IDs combine already-numbered speakers. ${unknown.join(', ')} has not spoken yet.` });
    } else if (!assigned.includes(id)) {
      const next = `S${assigned.length + 1}`;
      if (id !== next) push({ level: 'warn', rowId: r.id, field: 'id', message: `IDs follow the order speakers first vocalize. This new speaker should be ${next}.` });
      assigned.push(id);
    }
    if (r.f.continuity === 'cutoff' && compiled.shotOf[r.id] !== nShots) {
      push({ level: 'warn', rowId: r.id, field: 'continuity', message: '<cutoff> is for speech truncated by the end of the video, so it belongs in the final shot.' });
    }
    if (r.f.continuity === 'next') {
      const later = speech.find((x) => compiled.shotOf[x.id] === compiled.shotOf[r.id] + 1 && x.f.continuity === 'prev' && normalizeId(x.f.id ?? '') === id);
      if (!later) push({ level: 'warn', rowId: r.id, field: 'continuity', message: 'A line crossing a cut needs its second part in the next shot, marked "continued from previous shot".' });
    }
    if (r.f.continuity === 'prev') {
      const earlier = speech.find((x) => compiled.shotOf[x.id] === compiled.shotOf[r.id] - 1 && x.f.continuity === 'next' && normalizeId(x.f.id ?? '') === id);
      if (!earlier) push({ level: 'warn', rowId: r.id, field: 'continuity', message: 'No first part in the previous shot is marked "continues into next shot".' });
    }
  }

  /* ---------- per row ---------- */
  for (const r of state.rows) {
    if (r.type === 'define' && !ref && r.enabled) {
      push({ level: 'info', rowId: r.id, message: `Reference labels only apply in Ref2VA. Skipped in ${mode.label}.` });
      continue;
    }
    if (!rowActive(r, state)) continue;
    const f = r.f;

    for (const [k, v] of Object.entries(f)) {
      if (k === 'line' || (k === 'text' && r.type === 'text')) continue;
      if (VAGUE.test(v)) push({ level: 'info', rowId: r.id, field: k, message: `"${VAGUE.exec(v)![0]}" is abstract. Prefer concrete visual and audio detail.` });
      if (OLD_MENTION.test(v)) push({ level: 'warn', rowId: r.id, field: k, message: `"${OLD_MENTION.exec(v)![0]}" is not an H3 label. Use <Picture N>, <Video N> or <Audio N>.` });
    }

    if (r.type === 'camera' && CAMERA_FIXED.has(f.motion) && (f.amplitude || f.speed)) {
      push({ level: 'info', rowId: r.id, message: `Amplitude and speed are ignored for ${f.motion}.` });
    }

    if (r.type === 'text' && /["“”]/.test(f.text ?? '')) {
      push({ level: 'info', rowId: r.id, field: 'text', message: 'The text is wrapped in double quotes automatically.' });
    }

    if (r.type === 'define') checkDefine(r, state, compiled, push);

    const filled = BLOCKS[r.type].fields.some((fd) => fd.kind !== 'select' && fd.kind !== 'asset' && fd.kind !== 'number' && (f[fd.key] ?? '').trim());
    if (!filled && r.type !== 'camera' && r.type !== 'shot' && r.type !== 'speech') {
      push({ level: 'info', rowId: r.id, message: 'This block is empty, so it adds nothing to the prompt.' });
    }
  }

  /* ---------- sections ---------- */
  const NON_EN_MSG = 'Write sections in English. Only dialogue and lyrics (inside <d>) and visible scene text (in quotes) keep their language.';
  if (NON_ENGLISH.test(stripAllowed(compiled.text))) push({ level: 'warn', message: NON_EN_MSG });

  if (!state.doc.silent) {
    const sc = state.doc.soundscape.trim();
    if (!sc) push({ level: 'warn', field: 'soundscape', message: 'overall_soundscape is empty. Summarize ambience, physical action sounds and non-verbal human sounds. Use N/A only if complete silence was requested.' });
    if (sentences(sc) > LIMITS.soundscapeSentencesMax) push({ level: 'warn', field: 'soundscape', message: `overall_soundscape should be 1–${LIMITS.soundscapeSentencesMax} sentences in one paragraph.` });
    if (/\n/.test(sc)) push({ level: 'warn', field: 'soundscape', message: 'overall_soundscape should be one continuous paragraph.' });
    if (/<d>|"[^"]+"/.test(sc)) push({ level: 'warn', field: 'soundscape', message: 'Dialogue, singing and diegetic music belong in the description, not overall_soundscape.' });
  }
  const music = state.doc.music.trim();
  if (music && music !== 'N/A') {
    if (sentences(music) > LIMITS.musicSentencesMax) push({ level: 'warn', field: 'music', message: `non_diegetic_music should be 1–${LIMITS.musicSentencesMax} sentences.` });
    if (MUSIC_MOOD.test(music)) push({ level: 'warn', field: 'music', message: `non_diegetic_music: "${MUSIC_MOOD.exec(music)![0]}" is a mood word. Describe instrumentation, speed, rhythm and dynamics instead.` });
    if (MUSIC_FUNCTION.test(music)) push({ level: 'warn', field: 'music', message: 'non_diegetic_music should not explain the emotional function of the score.' });
    if (/<d>/.test(music)) push({ level: 'warn', field: 'music', message: 'Lyrics belong inside <d> in the description, not non_diegetic_music.' });
  }

  if (ref) checkRef(state, compiled, push);

  const order = { error: 0, warn: 1, info: 2 } as const;
  return issues.sort((a, b) => order[a.level] - order[b.level]);
}

function checkDefine(r: Row, state: State, compiled: Compiled, push: (i: Issue) => void) {
  const f = r.f;
  const label = defineLabels(state)[r.id];
  if (f.kind !== 'subject' && !label) {
    push({ level: 'error', rowId: r.id, field: 'asset', message: `Pick the ${f.kind === 'picture' ? 'image' : f.kind} asset this label stands for.` });
    return;
  }
  if (!(f.def ?? '').trim()) push({ level: 'warn', rowId: r.id, field: 'def', message: 'Say what the label denotes, its reference role and the features to follow.' });
  if (!(f.note ?? '').trim()) push({ level: 'info', rowId: r.id, field: 'note', message: 'Describe what is preserved, transferred or reused in retention_analysis.' });
  if (/\(S\d+(,S\d+)*\)/.test(f.note ?? '')) push({ level: 'warn', rowId: r.id, field: 'note', message: 'Do not write speaker IDs (Sx) in retention_analysis.' });
  if (f.kind === 'subject' && !(f.where ?? '').trim() && !compiled.shots.some((t) => t.includes(label))) {
    push({ level: 'warn', rowId: r.id, message: `${label} never appears in detailed_description.` });
  }
  if ((f.kind === 'picture' || f.kind === 'video') && !(f.where ?? '').trim()) {
    push({ level: 'info', rowId: r.id, field: 'where', message: f.kind === 'picture' ? 'Say which shot frame it anchors, e.g. "[Shot 1] first frame".' : 'Say which structure it provides, e.g. "cut and pacing structure".' });
  }
  const speakerIds = new Set(state.rows.filter((x) => x.type === 'speech' && rowActive(x, state)).flatMap((x) => normalizeId(x.f.id ?? '').split(',')));
  for (const m of (f.def ?? '').matchAll(/\((S\d+)\)/g)) {
    if (!speakerIds.has(m[1])) push({ level: 'warn', rowId: r.id, field: 'def', message: `(${m[1]}) is never assigned in detailed_description. Audio definitions reuse speaker IDs but never assign new ones.` });
  }
}

function checkRef(state: State, compiled: Compiled, push: (i: Issue) => void) {
  const labels = defineLabels(state);
  const defined = new Set(Object.values(labels));
  const counts = { Picture: 0, Video: 0, Audio: 0 } as Record<string, number>;
  for (const a of state.assets) counts[{ image: 'Picture', video: 'Video', audio: 'Audio' }[a.kind]]++;

  // every label used anywhere must resolve
  const used = new Map<string, RegExpMatchArray>();
  for (const m of compiled.text.matchAll(labelRegex())) used.set(m[0], m);
  for (const [label, [, kind, n]] of used) {
    if (kind === 'Subject' && !defined.has(label)) push({ level: 'error', message: `${label} is used but never defined in subject_definitions.` });
    if (kind !== 'Subject' && +n > counts[kind]) push({ level: 'error', message: `${label} is used but only ${counts[kind]} ${kind.toLowerCase()} asset(s) exist.` });
  }
  const seen = new Set(Object.values(labels));
  const summaryLabels = [...state.doc.summary.matchAll(labelRegex())].map((m) => m[0]);
  const defText = state.rows.filter((r) => labels[r.id]).map((r) => r.f.def ?? '').join(' ');
  for (const l of summaryLabels) {
    if (!seen.has(l) && !defText.includes(l)) push({ level: 'warn', field: 'summary', message: `summary introduces ${l}. Use only labels defined in subject_definitions.` });
  }
  for (const a of state.assets) {
    const l = assetLabel(state.assets, a.id)!;
    if (!compiled.text.includes(l)) push({ level: 'warn', field: `asset:${a.id}`, message: `${l} is never referenced. Cite it in a definition or where its role applies.` });
  }

  const tasks = state.doc.tasks;
  if (!tasks.length) push({ level: 'warn', field: 'tasks', message: 'summary needs a task-type prefix such as [reference generation].' });
  if (!state.doc.summary.trim()) push({ level: 'warn', field: 'summary', message: 'summary is empty. Summarize the target video and the main reference relationships.' });
  const has = (k: string) => state.rows.some((r) => labels[r.id] && r.f.kind === k);
  if (tasks.includes('keyframe completion') && !has('picture')) push({ level: 'warn', field: 'tasks', message: 'keyframe completion needs a <Picture N> label used as a concrete frame.' });
  if (has('picture') && !tasks.includes('keyframe completion')) push({ level: 'info', field: 'tasks', message: 'A standalone <Picture N> is a frame anchor, which is keyframe completion.' });
  if ((tasks.includes('video editing') || tasks.includes('video continuation')) && !state.assets.some((a) => a.kind === 'video')) {
    push({ level: 'warn', field: 'tasks', message: 'Video editing or continuation needs a source video.' });
  }
  if ((tasks.includes('audio reuse') || tasks.includes('audio reference')) && !has('audio')) {
    push({ level: 'warn', field: 'tasks', message: 'Audio reuse or reference needs an <Audio N> label.' });
  }
  const editing = tasks.includes('video editing');
  if (editing && !/^The target video is an edited version of <Video \d+>\./.test(state.doc.summary.trim())) {
    push({
      level: 'warn',
      field: 'summary',
      message: 'For video editing, begin the summary with "The target video is an edited version of <Video 1>."',
      fix: { label: 'Insert it', action: { t: 'doc', patch: { summary: `The target video is an edited version of <Video 1>. ${state.doc.summary.trim()}`.trim() } } },
    });
  }
  if (!editing && compiled.shots.length) {
    const n = words(compiled.description);
    if (n < LIMITS.refWordsMin || n > LIMITS.refWordsMax) {
      push({ level: 'info', message: `detailed_description is ${n} words. Generation tasks are normally ${LIMITS.refWordsMin}–${LIMITS.refWordsMax}; dialogue-dense content may differ.` });
    }
  }
}
