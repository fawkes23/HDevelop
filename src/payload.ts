import { assetLabel } from './compile';
import type { State } from './types';

const MAGNIFIC_ASPECT: Record<string, string> = {
  adaptive: 'adaptive',
  '21:9': 'film_horizontal_21_9',
  '16:9': 'widescreen_16_9',
  '4:3': 'classic_4_3',
  '1:1': 'square_1_1',
  '3:4': 'traditional_3_4',
  '9:16': 'social_story_9_16',
};

const EVOLINK_MODEL = {
  t2v: 'minimax-h3-text-to-video',
  i2v: 'minimax-h3-image-to-video',
  flf: 'minimax-h3-image-to-video',
  ref2v: 'minimax-h3-reference-to-video',
} as const;

export interface Payload {
  endpoint: string;
  body: Record<string, unknown>;
  notes: string[];
}

/** Request body for the chosen provider. Field names differ, the modes do not. */
export function buildPayload(state: State, prompt: string): Payload {
  const notes: string[] = [];
  const urls = (kind: string) => state.assets.filter((a) => a.kind === kind).map((a) => a.url.trim());
  const body: Record<string, unknown> = { prompt, duration: state.duration };
  const m = state.mode;

  if (state.provider === 'magnific') {
    const endpoint = `POST /v1/ai/video/minimax-h3-${state.resolution}`;
    if (m === 't2v' || m === 'ref2v') body.aspect_ratio = MAGNIFIC_ASPECT[state.aspect];
    if (m === 'i2v' || m === 'flf') body.image = state.frames.first.trim();
    if (m === 'flf') body.image_end = state.frames.last.trim();
    if (m === 'ref2v') {
      if (urls('image').length) body.reference_images = urls('image');
      if (urls('video').length) body.reference_videos = urls('video');
      if (urls('audio').length) body.reference_audios = urls('audio');
    }
    notes.push('Resolution is chosen by the endpoint, not a body field.');
    if (m === 'i2v' || m === 'flf') notes.push('aspect_ratio omitted: the first frame sets it.');
    return { endpoint, body, notes };
  }

  // evolink
  const out: Record<string, unknown> = { model: EVOLINK_MODEL[m], prompt, quality: '2k', duration: state.duration };
  if (m === 't2v' || m === 'ref2v') out.aspect_ratio = state.aspect;
  if (m === 'i2v' || m === 'flf') out.image_start = state.frames.first.trim();
  if (m === 'flf') out.image_end = state.frames.last.trim();
  if (m === 'ref2v') {
    if (urls('image').length) out.image_urls = urls('image');
    if (urls('video').length) out.video_urls = urls('video');
    if (urls('audio').length) out.audio_urls = urls('audio');
  }
  if (m === 'i2v' || m === 'flf') notes.push('aspect_ratio omitted: this route returns an error if it is sent in image mode.');
  notes.push('Media must be public http(s) URLs. Base64 is not accepted on this route.');
  return { endpoint: 'POST /v1/videos/generations', body: out, notes };
}

/** Handy for the assets panel: "Image 1" etc. */
export const labelFor = (state: State, id: string) => assetLabel(state.assets, id) ?? '?';
