import { describe, expect, it } from 'vitest';
import { compile } from './compile';
import { EXAMPLES } from './examples';
import { blankProject, parsePrompt, type ParseResult } from './parse';
import { REPO_PROMPTS } from './repoPrompts';
import { SKILL_CASES } from './skillCases';
import { newRow } from './store';

const ok = (text: string) => {
  const r = parsePrompt(text);
  if ('error' in r) throw new Error(r.error);
  return r as ParseResult;
};
const roundTrip = (text: string) => compile(ok(text).state).text;

describe('parsePrompt round-trips', () => {
  it.each(Object.keys(SKILL_CASES) as (keyof typeof SKILL_CASES)[])('skill case %s', (k) => {
    expect(roundTrip(SKILL_CASES[k])).toBe(SKILL_CASES[k]);
  });

  it.each(Object.keys(EXAMPLES))('example %s', (k) => {
    const text = compile(EXAMPLES[k].build()).text;
    expect(roundTrip(text)).toBe(text);
  });

  // Real prompts sometimes use single line breaks between sections; the app writes the skill's blank lines.
  const lines = (t: string) => t.replace(/\n+/g, '\n');
  it.each(Object.keys(REPO_PROMPTS) as (keyof typeof REPO_PROMPTS)[])('MiniMax repo prompt %s', (k) => {
    expect(lines(roundTrip(REPO_PROMPTS[k]))).toBe(lines(REPO_PROMPTS[k]));
  });

  it('a hand-written I2VA prompt', () => {
    const text = [
      'For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.',
      '',
      'integrated_multimodal_description: [Shot 1] Live-action, cinematic, the young woman shown in <Picture 1> remains beside the rain-covered train window. The camera trucks right with small amplitude at slow speed as she lifts her gaze. The quiet, breathy young woman (S1) says: <d>[English] I get off at the next station.</d> [Shot 2] At 00:05.000, the camera cuts to a close-up of the folded letter.',
      '',
      'overall_soundscape: The train wheels produce a steady metallic rhythm.',
      '',
      'non_diegetic_music: N/A',
    ].join('\n');
    expect(roundTrip(text)).toBe(text);
  });

  it('voiceover, lines across a cut and cut-off speech', () => {
    const s = EXAMPLES.t2va.build();
    s.rows.splice(
      3,
      0,
      { ...newRow('speech'), f: { ...newRow('speech').f, who: 'The man', id: 'S2', voiceover: 'yes', pronoun: 'his', line: 'I still remember', continuity: 'next' } },
    );
    s.rows.push({ ...newRow('speech'), f: { ...newRow('speech').f, who: 'The man', id: 'S2', line: 'that road.', continuity: 'prev' } });
    s.rows.push({ ...newRow('speech'), f: { ...newRow('speech').f, who: 'A child', id: 'S1,S2', verb: 'shout together,', line: 'Wait', continuity: 'cutoff' } });
    const text = compile(s).text;
    expect(roundTrip(text)).toBe(text);
  });
});

describe('parsePrompt reads the structure', () => {
  it('modes, durations and cut times', () => {
    const fl = ok(SKILL_CASES.fl2va).state;
    expect([fl.mode, fl.duration]).toEqual(['fl2va', 8]);
    expect(ok(SKILL_CASES.l2va).state.duration).toBe(6);
    const t = ok(SKILL_CASES.t2va).state;
    expect(t.mode).toBe('t2va');
    expect(t.doc.style).toBe('Live-action, cinematic');
    expect(t.rows.filter((r) => r.type === 'shot').map((r) => r.f.at)).toEqual(['', '5']);
  });

  it('camera sentences become camera clips and lines become dialogue', () => {
    const rows = ok(SKILL_CASES.i2va).state.rows;
    expect(rows.map((r) => r.type)).toEqual(['shot', 'camera', 'speech', 'visual']);
    expect(rows[1].f).toMatchObject({ motion: 'Truck Right', amplitude: 'small', speed: 'slow' });
    expect(rows[2].f).toMatchObject({ id: 'S1', lang: 'English', line: 'I get off at the next station.' });
  });

  it('reference prompts get labels, markers and empty file slots', () => {
    const s = ok(SKILL_CASES.ref2va).state;
    expect(s.assets.map((a) => a.kind)).toEqual(['image', 'image', 'image', 'image', 'video', 'video', 'audio']);
    expect(s.rows.filter((r) => r.type === 'define').map((r) => r.f.marker)).toEqual(['fully_preserved', 'fully_preserved', 'fully_preserved', 'fully_preserved', 'reference']);
    expect(s.doc.tasks).toEqual(['reference generation', 'audio reference']);
  });

  it('rejects plain prose', () => {
    expect('error' in parsePrompt('A cat sits on a windowsill in the rain.')).toBe(true);
  });

  it('a blank project has one empty shot', () => {
    expect(blankProject().rows.map((r) => r.type)).toEqual(['shot']);
  });
});
