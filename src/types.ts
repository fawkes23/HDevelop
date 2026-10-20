/** The five input modes named by the h3-prompt-writing skill. */
export type ModeId = 't2va' | 'i2va' | 'fl2va' | 'l2va' | 'ref2va';
export type AssetKind = 'image' | 'video' | 'audio';
export type RowType = 'shot' | 'visual' | 'camera' | 'speech' | 'sound' | 'text' | 'define' | 'raw' | 'comment';

export interface Asset {
  id: string;
  kind: AssetKind;
  url: string;
}

export interface Row {
  id: string;
  type: RowType;
  enabled: boolean;
  /** field values, keyed by the block spec's field keys */
  f: Record<string, string>;
}

/** Whole-prompt fields that are not part of the shot timeline. */
export interface Doc {
  /** Base modes: style words written right after [Shot 1], e.g. "Live-action, cinematic". */
  style: string;
  /** Full-reference mode: one or two sentences written before [Shot 1]. */
  styleOpening: string;
  /** Full-reference mode: summary task types, in the order chosen. */
  tasks: string[];
  /** Full-reference mode: summary text after the task-type prefix. */
  summary: string;
  soundscape: string;
  /** The user explicitly asked for complete silence: overall_soundscape becomes N/A. */
  silent: boolean;
  /** Empty means N/A. */
  music: string;
}

export interface State {
  mode: ModeId;
  duration: number;
  aspect: string;
  frames: { first: string; last: string };
  assets: Asset[];
  doc: Doc;
  rows: Row[];
}

export type Action =
  | { t: 'settings'; patch: Partial<Pick<State, 'mode' | 'duration' | 'aspect'>> }
  | { t: 'doc'; patch: Partial<Doc> }
  | { t: 'frame'; which: 'first' | 'last'; url: string }
  | { t: 'addAsset'; asset: Asset }
  | { t: 'setAsset'; id: string; url: string }
  | { t: 'delAsset'; id: string }
  | { t: 'addRow'; row: Row }
  | { t: 'insertRow'; row: Row; index: number }
  | { t: 'delRows'; ids: string[] }
  /** Move a whole shot (its Shot row and the rows under it); cut times stay in timeline order. */
  | { t: 'moveShot'; from: number; to: number }
  | { t: 'field'; id: string; key: string; value: string }
  | { t: 'toggle'; id: string }
  | { t: 'move'; id: string; to: number }
  | { t: 'dup'; id: string; newId: string }
  | { t: 'del'; id: string }
  | { t: 'load'; state: State };

export interface Issue {
  level: 'error' | 'warn' | 'info';
  message: string;
  rowId?: string;
  /**
   * Where to show the message: a field key of the row when `rowId` is set,
   * otherwise a whole-prompt area such as "duration", "soundscape" or "asset:<id>".
   */
  field?: string;
  fix?: { label: string; action: Action };
}

/** A run of compiled text, optionally traced back to the row that produced it. */
export interface Part {
  rowId?: string;
  text: string;
}
export interface Compiled {
  /** One entry per output line; an empty array is a blank line. */
  lines: Part[][];
  text: string;
  /** Shot number (1-based) of every active row, for the sheet. */
  shotOf: Record<string, number>;
  /** Text of each shot, used by lint and retention analysis. */
  shots: string[];
  /** The description body (integrated_multimodal_description / detailed_description). */
  description: string;
}
