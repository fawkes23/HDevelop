import { describe, expect, it } from 'vitest';
import { compile, compileRow, fmtCut } from './compile';
import { EXAMPLES } from './examples';
import { lint } from './lint';
import { buildPayload } from './payload';
import { SKILL_CASES } from './skillCases';
import { newRow, reducer } from './store';
import type { Row, State } from './types';

const ex = (k: keyof typeof EXAMPLES) => EXAMPLES[k].build();
const msgs = (s: State) => lint(s, compile(s));
const has = (s: State, level: string, frag: string) => msgs(s).some((i) => i.level === level && i.message.includes(frag));
const mk = (type: Row['type'], f: Record<string, string>): Row => {
  const r = newRow(type);
  return { ...r, f: { ...r.f, ...f } };
};

describe('compile matches the skill verbatim', () => {
  it.each(['i2va', 'fl2va', 'l2va', 'ref2va'] as const)('%s case', (k) => {
    expect(compile(ex(k)).text).toBe(SKILL_CASES[k]);
  });

  it('t2va case keeps the guide structure', () => {
    const { text } = compile(ex('t2va'));
    const want = SKILL_CASES.t2va;
    expect(text.startsWith('integrated_multimodal_description: [Shot 1] Live-action, cinematic, a medium-wide shot frames a baker')).toBe(true);
    expect(text).toContain('(S1) says: <d>[English] First batch of the morning.</d>');
    expect(text).toContain('[Shot 2] At 00:05.000, the camera cuts to a close-up of steam');
    expect(text.split('\n\n').map((p) => p.split(':')[0])).toEqual(want.split('\n\n').map((p) => p.split(':')[0]));
    expect(text.endsWith(want.slice(want.indexOf('\n\noverall_soundscape')))).toBe(true);
  });
});

describe('compile rules', () => {
  it('formats cut times as MM:SS.mmm', () => {
    expect(fmtCut(3.5)).toBe('00:03.500');
    expect(fmtCut(5)).toBe('00:05.000');
    expect(fmtCut(12.25)).toBe('00:12.250');
  });

  it('writes camera motion as natural English, omitting medium amplitude and normal speed', () => {
    expect(compileRow(mk('camera', { motion: 'Push In', amplitude: 'small', speed: 'slow', detail: 'toward the folded letter in her hands' }))).toBe(
      'The camera pushes in with small amplitude at slow speed toward the folded letter in her hands.',
    );
    expect(compileRow(mk('camera', { motion: 'Pan Right', amplitude: 'large', speed: 'fast', detail: ', revealing the open doorway' }))).toBe(
      'The camera pans right with large amplitude at fast speed, revealing the open doorway.',
    );
    expect(compileRow(mk('camera', { motion: 'Static Shot', amplitude: 'large', speed: 'fast', detail: 'as the runner exits the frame' }))).toBe(
      'The camera holds a static shot as the runner exits the frame.',
    );
  });

  it('speech: <d> holds only the language tag and verbatim words', () => {
    expect(compileRow(mk('speech', { who: 'The two children', id: 'S1, S2', verb: 'shout together,', line: 'Wait for us!' }))).toBe(
      'The two children (S1,S2) shout together, <d>[English] Wait for us!</d>',
    );
  });

  it('voiceover uses the exact phrase and states the lips stay closed', () => {
    expect(compileRow(mk('speech', { who: 'The man', id: 'S1', voiceover: 'yes', pronoun: 'his', line: 'I still remember that road.' }))).toBe(
      'The man (S1) says in an off-screen voiceover: <d>[English] I still remember that road.</d> while his lips remain completely closed.',
    );
  });

  it('dialogue across a cut and truncated speech use <scenetrans> and <cutoff>', () => {
    expect(compileRow(mk('speech', { who: 'She', id: 'S1', line: 'I never', continuity: 'next' }))).toContain('</d> <scenetrans> The line continues seamlessly across the cut.');
    expect(compileRow(mk('speech', { who: 'She', id: 'S1', line: 'told you.', continuity: 'prev' }))).toBe('She (S1) says: <scenetrans> <d>[English] told you.</d>');
    expect(compileRow(mk('speech', { who: 'She', id: 'S1', line: 'Wait', continuity: 'cutoff' }))).toBe('She (S1) says: <d>[English] Wait</d> <cutoff>');
  });

  it('quotes on-screen text verbatim', () => {
    expect(compileRow(mk('text', { before: 'A red neon sign reading', text: '营业中', after: 'glows above the doorway.' }))).toBe(
      'A red neon sign reading "营业中" glows above the doorway.',
    );
  });

  it('FL2VA and L2VA instructions name the final shot and the S.SS duration', () => {
    const s = ex('fl2va');
    s.duration = 10;
    s.rows.push(mk('shot', { at: '6', text: 'a wide shot.' }));
    expect(compile(s).text.split('\n')[0]).toBe(
      'How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot 2) aligns with the 10.00-second mark of the target video.',
    );
  });

  it('T2VA has no instruction line', () => {
    expect(compile(ex('t2va')).text.startsWith('integrated_multimodal_description:')).toBe(true);
  });

  it('empty music is N/A, silent soundscape is N/A', () => {
    const s = ex('t2va');
    s.doc = { ...s.doc, music: '', silent: true };
    const { text } = compile(s);
    expect(text).toContain('overall_soundscape: N/A');
    expect(text).toContain('non_diegetic_music: N/A');
  });

  it('subject retention lists the shots the label appears in', () => {
    const s = ex('ref2va');
    expect(compile(s).text).toContain('<Subject 2> (appears in [Shot 1], [Shot 2]): fully_preserved');
  });

  it('reference labels are skipped outside Ref2VA', () => {
    const s = { ...ex('ref2va'), mode: 't2va' as const };
    expect(compile(s).text).not.toContain('subject_definitions');
  });

  it('disabled rows are ignored', () => {
    const s = ex('i2va');
    s.rows = s.rows.map((r) => ({ ...r, enabled: false }));
    expect(compile(s).description).toBe('');
  });
});

describe('lint', () => {
  it('has no errors or warnings on the skill cases', () => {
    for (const k of Object.keys(EXAMPLES)) {
      const bad = msgs(ex(k)).filter((i) => i.level !== 'info');
      expect(bad, k).toEqual([]);
    }
  });

  it('duration is 4–15 s', () => {
    expect(has({ ...ex('t2va'), duration: 3 }, 'error', 'Duration must be 4–15')).toBe(true);
    expect(has({ ...ex('t2va'), duration: 4 }, 'error', 'Duration')).toBe(false);
  });

  it('keyframe modes require their frames', () => {
    expect(has({ ...ex('i2va'), frames: { first: '', last: '' } }, 'error', 'First frame is missing')).toBe(true);
    expect(has({ ...ex('fl2va'), frames: { first: 'https://a/b.png', last: '' } }, 'error', 'Last frame is missing')).toBe(true);
    expect(has({ ...ex('l2va'), frames: { first: '', last: '' } }, 'error', 'Last frame is missing')).toBe(true);
  });

  it('cut times: required, strictly increasing, inside the video', () => {
    const s = ex('t2va');
    s.rows.push(mk('shot', { at: '', text: 'a wide shot.' }));
    expect(has(s, 'error', 'need a start time')).toBe(true);
    s.rows[s.rows.length - 1].f.at = '4';
    expect(has(s, 'error', 'strictly increase')).toBe(true);
    s.rows[s.rows.length - 1].f.at = '9';
    expect(has(s, 'error', 'outside the 8s video')).toBe(true);
  });

  it('speaker IDs follow first-vocal order; compound IDs need known speakers', () => {
    const s = ex('t2va');
    s.rows.push(mk('speech', { who: 'A boy', id: 'S3', line: 'Hi.' }));
    expect(has(s, 'warn', 'should be S2')).toBe(true);
    s.rows.push(mk('speech', { who: 'They', id: 'S1,S4', line: 'Hi.' }));
    expect(has(s, 'warn', 'S4 has not spoken yet')).toBe(true);
    s.rows.push(mk('speech', { who: 'X', id: 'Bob', line: 'Hi.' }));
    expect(has(s, 'error', 'must look like S1')).toBe(true);
  });

  it('a line crossing a cut needs both parts', () => {
    const s = ex('t2va');
    s.rows.splice(2, 0, mk('speech', { who: 'He', id: 'S1', line: 'One', continuity: 'next' }));
    expect(has(s, 'warn', 'second part in the next shot')).toBe(true);
    s.rows.push(mk('speech', { who: 'He', id: 'S1', line: 'two.', continuity: 'prev' }));
    expect(has(s, 'warn', 'second part in the next shot')).toBe(false);
  });

  it('flags old-style mentions and abstract words', () => {
    const s = ex('ref2va');
    s.rows.push(mk('visual', { text: '@image1 walks past a beautiful wall.' }));
    expect(has(s, 'warn', 'is not an H3 label')).toBe(true);
    expect(has(s, 'info', '"beautiful" is abstract')).toBe(true);
  });

  it('non_diegetic_music: no mood words, at most 3 sentences', () => {
    const s = ex('t2va');
    s.doc = { ...s.doc, music: 'A sad piano.' };
    expect(has(s, 'warn', 'mood word')).toBe(true);
    s.doc = { ...s.doc, music: 'Piano. Strings. Drums. Bass.' };
    expect(has(s, 'warn', '1–3 sentences')).toBe(true);
  });

  it('overall_soundscape: required unless silence was requested, at most 4 sentences', () => {
    const s = ex('t2va');
    s.doc = { ...s.doc, soundscape: '' };
    expect(has(s, 'warn', 'overall_soundscape is empty')).toBe(true);
    s.doc = { ...s.doc, silent: true };
    expect(has(s, 'warn', 'overall_soundscape')).toBe(false);
  });

  it('sections must be English outside <d> and quotes', () => {
    const s = ex('t2va');
    s.rows.push(mk('visual', { text: '她笑了。' }));
    expect(has(s, 'warn', 'Write sections in English')).toBe(true);
    s.rows.pop();
    s.rows.push(mk('speech', { who: 'She', id: 'S2', lang: 'Chinese', line: '你好。' }));
    expect(has(s, 'warn', 'Write sections in English')).toBe(false);
  });

  it('Ref2VA: unresolved labels, input caps, audio-only input', () => {
    const s = ex('ref2va');
    s.rows.push(mk('visual', { text: '<Subject 9> waves at <Picture 7>.' }));
    expect(has(s, 'error', '<Subject 9> is used but never defined')).toBe(true);
    expect(has(s, 'error', '<Picture 7> is used but only 4')).toBe(true);
    expect(has({ ...s, assets: s.assets.filter((a) => a.kind === 'audio') }, 'error', 'Audio cannot be the only input')).toBe(true);
    const many = { ...s, assets: [...s.assets, ...Array.from({ length: 6 }, (_, i) => ({ id: 'x' + i, kind: 'image' as const, url: 'https://a/' + i }))] };
    expect(has(many, 'error', 'Too many images')).toBe(true);
    expect(has(many, 'error', 'At most 12 files')).toBe(true);
  });

  it('Ref2VA: no speaker IDs in retention_analysis; video editing summary opening has a fix', () => {
    const s = ex('ref2va');
    s.rows[0].f.note = '<Subject 1> (S1) is kept.';
    expect(has(s, 'warn', 'Do not write speaker IDs')).toBe(true);
    s.doc = { ...s.doc, tasks: ['video editing'] };
    const issue = msgs(s).find((i) => i.message.includes('edited version'))!;
    expect(reducer(s, issue.fix!.action).doc.summary.startsWith('The target video is an edited version of <Video 1>.')).toBe(true);
  });
});

describe('payload', () => {
  it('H3-Base request shape per mode', () => {
    expect(buildPayload(ex('t2va'), 'x').body).toMatchObject({ task: 't2va', conditions: [], target: { short_edge: 768, aspect_ratio: '16:9', duration_seconds: 8 } });
    const i2va = buildPayload(ex('i2va'), 'x').body;
    expect(i2va).toMatchObject({ task: 'fl2va', conditions: [{ type: 'image', role: 'keyframe', frame_index: 0 }] });
    const fl = buildPayload(ex('fl2va'), 'x').body.conditions as { frame_index: number }[];
    expect(fl.map((c) => c.frame_index)).toEqual([0, 191]);
    const ref = buildPayload(ex('ref2va'), 'x').body;
    expect(ref.task).toBe('ref2va');
    expect((ref.conditions as { type: string }[]).map((c) => c.type)).toEqual(['image', 'image', 'image', 'image', 'video', 'video', 'audio']);
  });
});

describe('reducer', () => {
  it('moves, duplicates, clears dangling assets, resets markers on label kind change', () => {
    let s = ex('ref2va');
    const first = s.rows[0].id;
    s = reducer(s, { t: 'move', id: first, to: 2 });
    expect(s.rows[2].id).toBe(first);
    s = reducer(s, { t: 'dup', id: first, newId: 'copy' });
    expect(s.rows.some((r) => r.id === 'copy')).toBe(true);
    const audioRow = s.rows.find((r) => r.f.kind === 'audio')!;
    s = reducer(s, { t: 'delAsset', id: audioRow.f.asset });
    expect(has(s, 'error', 'Pick the audio asset')).toBe(true);
    s = reducer(s, { t: 'field', id: 'copy', key: 'kind', value: 'audio' });
    expect(s.rows.find((r) => r.id === 'copy')!.f.marker).toBe('fully_copy');
  });
});
