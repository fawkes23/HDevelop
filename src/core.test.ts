import { describe, expect, it } from 'vitest';
import { compile, normalizeMentions } from './compile';
import { EXAMPLES } from './examples';
import { lint } from './lint';
import { buildPayload } from './payload';
import { newRow, reducer } from './store';
import type { State } from './types';

const t2v = () => EXAMPLES.t2v.build();
const ref = () => EXAMPLES.ref2v.build();
const msgs = (s: State) => lint(s, compile(s));
const has = (s: State, level: string, frag: string) => msgs(s).some((i) => i.level === level && i.message.includes(frag));

describe('compile', () => {
  it('builds a t2v prompt in row order and skips comments', () => {
    const { text } = compile(t2v());
    expect(text).toContain('A weathered fisherman');
    expect(text).toContain('Camera: medium shot, slow dolly in, ending on his hands.');
    expect(text).toContain('Sound: Wet rope slapping wood, gulls overhead.');
    expect(text).not.toContain('Start here');
  });

  it('groups consecutive rows by time window and stamps them', () => {
    const { text, groups } = compile(ref());
    expect(groups.map((g) => g.when && `${g.when.start}-${g.when.end}`)).toEqual([null, '0-5', '5-10', '6-9']);
    expect(text).toContain('[0–5s] The main character walks');
    expect(text).toContain('[6–9s] The main character says: "We should have left an hour ago."');
  });

  it('skips reference rows outside ref2v mode', () => {
    const s = { ...ref(), mode: 't2v' as const };
    expect(compile(s).text).not.toContain('Image 1 is the');
  });

  it('normalizes citation style', () => {
    expect(normalizeMentions('@image1 walks past Image 2, not Reimage3', 'plain')).toBe('Image 1 walks past Image 2, not Reimage3');
    expect(normalizeMentions('Image 1 and video2', 'at')).toBe('@Image1 and @Video2');
  });

  it('locked-off camera ignores speed', () => {
    const s = t2v();
    const cam = s.rows.find((r) => r.type === 'camera')!;
    cam.f = { framing: 'wide', movement: 'locked', speed: 'fast', note: '' };
    expect(compile(s).text).toContain('Camera: wide shot, locked-off camera.');
  });
});

describe('lint', () => {
  it('is quiet on the shipped examples (no errors)', () => {
    for (const ex of Object.values(EXAMPLES)) {
      const s = ex.build();
      expect(msgs(s).filter((i) => i.level === 'error')).toEqual([]);
    }
  });

  it('t2v rejects adaptive aspect and offers a fix', () => {
    const s = { ...t2v(), aspect: 'adaptive' };
    const issue = msgs(s).find((i) => i.message.includes('adaptive'))!;
    expect(issue.level).toBe('error');
    expect(reducer(s, issue.fix!.action).aspect).toBe('16:9');
  });

  it('i2v and flf require frames', () => {
    expect(has({ ...EXAMPLES.i2v.build(), frames: { first: '', last: '' } }, 'error', 'First frame is missing')).toBe(true);
    expect(has({ ...EXAMPLES.flf.build(), frames: { first: 'https://a/b.png', last: '' } }, 'error', 'Last frame is missing')).toBe(true);
  });

  it('ref2v: audio-only, over-limit and uncited references', () => {
    const s = ref();
    expect(has({ ...s, assets: s.assets.filter((a) => a.kind === 'audio') }, 'error', 'at least one image or video')).toBe(true);

    const many = { ...s, assets: [...s.assets, ...Array.from({ length: 10 }, (_, i) => ({ id: 'x' + i, kind: 'image' as const, url: 'https://a/' + i }))] };
    expect(has(many, 'error', 'Too many images')).toBe(true);
    expect(has(many, 'error', 'capped at 12')).toBe(true);

    const uncited = { ...s, rows: s.rows.filter((r) => !(r.type === 'reference' && r.f.asset === s.assets[2].id)) };
    expect(has(uncited, 'warn', 'Video 1 is never cited')).toBe(true);
  });

  it('flags citing a file that does not exist', () => {
    const s = ref();
    s.rows.push({ ...newRow('raw'), f: { text: 'Image 7 waves.' } });
    expect(has(s, 'error', 'cites Image 7')).toBe(true);
  });

  it('camera rules: two moves in one shot, chained "then", legacy brackets', () => {
    const s = t2v();
    s.rows.push({ ...newRow('camera'), f: { framing: '', movement: 'pan', speed: 'fast', note: 'then tilt up' } });
    expect(has(s, 'warn', 'second camera move')).toBe(true);
    expect(has(s, 'warn', '"then" chains moves')).toBe(true);
    s.rows.push({ ...newRow('raw'), f: { text: 'A bird flies. [Push in, Pan left]' } });
    expect(has(s, 'info', 'Hailuo 2.x bracket')).toBe(true);
    s.rows.push({ ...newRow('raw'), f: { text: '[3–6s] timestamps are fine' } });
    expect(msgs(s).filter((i) => i.message.includes('3–6s')).length).toBe(0);
  });

  it('time windows beyond the clip', () => {
    const s = ref();
    s.duration = 8;
    expect(has(s, 'warn', 'clip is 8s')).toBe(true);
  });

  it('overlap tip only for partial overlaps, not nested windows', () => {
    const s = ref();
    expect(has(s, 'info', 'partly overlaps')).toBe(false); // dialogue 6–9 sits inside shot 5–10
    s.rows.push({ ...newRow('action'), f: { text: 'A bird lands.' }, when: { start: 8, end: 10 } });
    s.rows.push({ ...newRow('action'), f: { text: 'It flies off.' }, when: { start: 9, end: 12 } });
    s.duration = 12;
    expect(has(s, 'info', 'partly overlaps')).toBe(true);
  });

  it('flags empty prompt and over-length prompt', () => {
    expect(has({ ...t2v(), rows: [] }, 'error', 'The prompt is empty')).toBe(true);
    const long = t2v();
    long.rows.push({ ...newRow('raw'), f: { text: 'x'.repeat(7001) } });
    expect(has(long, 'error', 'The limit is 7000')).toBe(true);
  });

  it('disabled rows are ignored by compile and lint', () => {
    const s = ref();
    s.rows = s.rows.map((r) => ({ ...r, enabled: false }));
    expect(compile(s).text).toBe('');
  });
});

describe('payload', () => {
  it('magnific ref2v uses reference_* arrays and the resolution endpoint', () => {
    const s = ref();
    const p = buildPayload(s, 'x');
    expect(p.endpoint).toBe('POST /v1/ai/video/minimax-h3-2k');
    expect(p.body.reference_images).toHaveLength(2);
    expect(p.body.reference_videos).toHaveLength(1);
    expect(p.body.reference_audios).toHaveLength(1);
    expect(p.body.aspect_ratio).toBe('adaptive');
  });

  it('i2v omits aspect_ratio on both providers', () => {
    const s = EXAMPLES.i2v.build();
    expect(buildPayload(s, 'x').body.aspect_ratio).toBeUndefined();
    expect(buildPayload({ ...s, provider: 'evolink' }, 'x').body.aspect_ratio).toBeUndefined();
    expect(buildPayload({ ...s, provider: 'evolink' }, 'x').body.model).toBe('minimax-h3-image-to-video');
  });

  it('flf sends both frames', () => {
    const b = buildPayload(EXAMPLES.flf.build(), 'x').body;
    expect(b.image).toBeTruthy();
    expect(b.image_end).toBeTruthy();
  });
});

describe('reducer', () => {
  it('moves, duplicates and clears dangling asset pointers', () => {
    let s = ref();
    const first = s.rows[0].id;
    s = reducer(s, { t: 'move', id: first, to: 2 });
    expect(s.rows[2].id).toBe(first);
    s = reducer(s, { t: 'dup', id: first, newId: 'copy' });
    expect(s.rows.some((r) => r.id === 'copy')).toBe(true);
    const assetId = s.assets[0].id;
    s = reducer(s, { t: 'delAsset', id: assetId });
    expect(s.rows.filter((r) => r.f.asset === assetId)).toHaveLength(0);
    expect(has(s, 'error', 'Pick a reference file')).toBe(true);
  });
});
