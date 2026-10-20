import { describe, expect, it } from 'vitest';
import { compile } from '../compile';
import { EXAMPLES } from '../examples';
import { shotGroups } from '../shots';
import { newRow, reducer } from '../store';
import type { State } from '../types';
import { shortName } from './Timeline';
import { beatSlots, clampCut, clampDuration, dropIndex, nextSpeakerId, reorderTarget, shotSpans, speakerLanes } from './geometry';

const setup = (s: State) => {
  const groups = shotGroups(s, compile(s));
  return { groups, spans: shotSpans(groups, s.duration) };
};

describe('timeline geometry', () => {
  it('shot spans follow the cut times', () => {
    const { spans } = setup(EXAMPLES.t2va.build());
    expect(spans).toEqual([
      { start: 0, end: 5 },
      { start: 5, end: 8 },
    ]);
  });

  it('missing or out-of-order cut times still draw in order', () => {
    const s = EXAMPLES.t2va.build();
    s.rows[3].f.at = '';
    expect(setup(s).spans.map((x) => x.start)).toEqual([0, 4]);
    s.rows[3].f.at = '20';
    expect(setup(s).spans[1].start).toBe(4);
  });

  it('dragging a cut snaps to 0.5 s and cannot cross its neighbours or the end', () => {
    const { spans } = setup(EXAMPLES.ref2va.build()); // cuts at 3 and 5, length 8
    expect(clampCut(spans, 1, 3.74, 8)).toBe(3.5);
    expect(clampCut(spans, 1, 0.2, 8)).toBe(0.5);
    expect(clampCut(spans, 1, 6, 8)).toBe(4.5);
    expect(clampCut(spans, 2, 9, 8)).toBe(7.5);
  });

  it('length drags in whole seconds within 4–15 s and stays after the last cut', () => {
    const { spans } = setup(EXAMPLES.ref2va.build());
    expect(clampDuration(spans, 20)).toBe(15);
    expect(clampDuration(spans, 2)).toBe(6);
    expect(clampDuration(spans, 9.4)).toBe(9);
  });

  it('beats split a shot in row order', () => {
    const s = EXAMPLES.i2va.build();
    const { groups, spans } = setup(s);
    const slots = [...beatSlots(groups[0], spans[0]).values()];
    expect(slots.map((x) => [x.start, x.end])).toEqual([
      [0, 8 / 3],
      [8 / 3, 16 / 3],
      [16 / 3, 8],
    ]);
  });

  it('dropping a clip at a time reorders the prompt to match', () => {
    let s = EXAMPLES.i2va.build();
    const { groups, spans } = setup(s);
    const last = groups[0].rows[2]; // "She folds the letter…"
    s = reducer(s, { t: 'move', id: last.id, to: dropIndex(s, groups[0], spans[0], last.id, 0.1) });
    expect(compile(s).description).toMatch(/^\[Shot 1\] Live-action, cinematic, the young woman .*? She folds the letter along its existing crease\. The camera trucks right/);
  });

  it('dropping into another shot moves the clip there', () => {
    let s = EXAMPLES.t2va.build();
    const { groups, spans } = setup(s);
    const cam = groups[0].rows[0];
    s = reducer(s, { t: 'move', id: cam.id, to: dropIndex(s, groups[1], spans[1], cam.id, 7) });
    expect(compile(s).shots[1]).toContain('The camera pushes in');
    expect(compile(s).shots[0]).not.toContain('The camera pushes in');
  });

  it('keyboard reorder crosses into the neighbouring shot but never above Shot 1', () => {
    let s = EXAMPLES.t2va.build();
    const speech = s.rows[2];
    s = reducer(s, { t: 'move', id: speech.id, to: reorderTarget(s, speech.id, 1)! });
    expect(compile(s).shots[1]).toContain('<d>[English] First batch');
    const cam = s.rows[1];
    expect(reorderTarget(s, cam.id, -1)).toBeNull();
  });

  it('speaker lanes come in first-speaking order, labelled by first description', () => {
    const s = EXAMPLES.ref2va.build();
    expect(speakerLanes(s)).toEqual([
      { id: 'S1', who: '<Subject 3>' },
      { id: 'S2', who: '<Subject 4>' },
    ]);
    expect(nextSpeakerId(speakerLanes(s))).toBe('S3');
    const t = EXAMPLES.t2va.build();
    t.rows.push({ ...newRow('speech'), f: { ...newRow('speech').f, id: 'S1,S2', who: 'They' } });
    expect(speakerLanes(t).map((l) => l.id)).toEqual(['S1', 'S2']);
  });

  it('lane names keep the noun phrase', () => {
    expect(shortName('The middle-aged baker with a calm, slightly raspy voice')).toBe('middle-aged baker');
    expect(shortName('Her reflection moves across the glass while the quiet, breathy young woman')).toBe('breathy young woman');
    expect(shortName('<Subject 3>')).toBe('<Subject 3>');
    expect(shortName('')).toBe('Speaker');
  });
});
