export type ModeId = 't2v' | 'i2v' | 'flf' | 'ref2v';
export type AssetKind = 'image' | 'video' | 'audio';
export type RowType =
  | 'subject'
  | 'action'
  | 'camera'
  | 'light'
  | 'sound'
  | 'reference'
  | 'limits'
  | 'raw'
  | 'comment';
export type Provider = 'magnific' | 'evolink';
export type CiteStyle = 'plain' | 'at';

export interface Asset {
  id: string;
  kind: AssetKind;
  url: string;
}

export interface TimeWindow {
  start: number;
  end: number;
}

export interface Row {
  id: string;
  type: RowType;
  enabled: boolean;
  /** null = applies to the whole clip */
  when: TimeWindow | null;
  /** field values, keyed by the block spec's field keys */
  f: Record<string, string>;
}

export interface State {
  mode: ModeId;
  provider: Provider;
  citeStyle: CiteStyle;
  duration: number;
  aspect: string;
  resolution: '768p' | '2k';
  frames: { first: string; last: string };
  assets: Asset[];
  rows: Row[];
}

export type Action =
  | { t: 'settings'; patch: Partial<Omit<State, 'rows' | 'assets' | 'frames'>> }
  | { t: 'frame'; which: 'first' | 'last'; url: string }
  | { t: 'addAsset'; asset: Asset }
  | { t: 'setAsset'; id: string; url: string }
  | { t: 'delAsset'; id: string }
  | { t: 'addRow'; row: Row }
  | { t: 'field'; id: string; key: string; value: string }
  | { t: 'when'; id: string; when: TimeWindow | null }
  | { t: 'toggle'; id: string }
  | { t: 'move'; id: string; to: number }
  | { t: 'dup'; id: string; newId: string }
  | { t: 'del'; id: string }
  | { t: 'load'; state: State };

export interface Issue {
  level: 'error' | 'warn' | 'info';
  message: string;
  rowId?: string;
  fix?: { label: string; action: Action };
}

export interface Part {
  rowId: string;
  text: string;
}
export interface Group {
  when: TimeWindow | null;
  parts: Part[];
}
export interface Compiled {
  groups: Group[];
  text: string;
}
