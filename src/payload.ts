import type { State } from './types';

/** H3 outputs 24 FPS (MiniMax-H3 README). */
const FPS = 24;

export interface Payload {
  endpoint: string;
  body: Record<string, unknown>;
  notes: string[];
}

/**
 * Request body for a locally deployed H3-Base, which takes the rewritten prompt
 * directly. Shape copied from scripts/readme/*-h3-base.sh in MiniMax-AI/MiniMax-H3.
 * I2VA, FL2VA and L2VA all run on the FL2VA checkpoint.
 */
export function buildPayload(state: State, prompt: string): Payload {
  const notes: string[] = [];
  const m = state.mode;
  const conditions: Record<string, unknown>[] = [];
  const lastIndex = Math.round(state.duration * FPS) - 1;

  if (m === 'i2va' || m === 'fl2va') {
    conditions.push({ type: 'image', uri: state.frames.first.trim(), role: 'keyframe', frame_index: 0 });
  }
  if (m === 'fl2va' || m === 'l2va') {
    conditions.push({ type: 'image', uri: state.frames.last.trim(), role: 'keyframe', frame_index: lastIndex });
    notes.push(`The repository examples only show frame_index 0. The last-frame index here (${lastIndex}) is derived from 24 FPS × duration.`);
  }
  if (m === 'ref2va') {
    for (const a of state.assets) conditions.push({ type: a.kind, uri: a.url.trim(), role: 'reference' });
    notes.push('Conditions keep asset order, so <Picture N>, <Video N> and <Audio N> map to the Nth file of each type.');
  }

  const body = {
    task: m === 't2va' ? 't2va' : m === 'ref2va' ? 'ref2va' : 'fl2va',
    prompt,
    conditions,
    target: { short_edge: 768, aspect_ratio: state.aspect, duration_seconds: state.duration },
    seed: 0,
  };
  notes.push('H3-Base renders 768p. 2K needs the hosted H3-Regenerate-2K step.');
  return { endpoint: 'POST /v1/videos', body, notes };
}
