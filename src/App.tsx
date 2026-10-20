import { useMemo, useRef, useState } from 'react';
import { compile } from './compile';
import { EXAMPLES } from './examples';
import { lint } from './lint';
import { Inputs, Issues, Output, Settings } from './Panels';
import { Sheet } from './Sheet';
import { MODES } from './spec';
import { parseState, useStore } from './store';

export default function App() {
  const [state, dispatch] = useStore();
  const [hoverRow, setHoverRow] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const compiled = useMemo(() => compile(state), [state]);
  const issues = useMemo(() => lint(state, compiled), [state, compiled]);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'hailuo-sheet.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (file?: File) => {
    if (!file) return;
    const s = parseState(await file.text());
    if (s) dispatch({ t: 'load', state: s });
    else alert('That file is not a Hailuo Sheet project.');
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="app">
      <header>
        <div className="brand">
          <b>Hailuo Sheet</b>
          <small>MiniMax H3 prompt events</small>
        </div>
        <nav className="modes">
          {MODES.map((m) => (
            <button key={m.id} className={state.mode === m.id ? 'on' : ''} onClick={() => dispatch({ t: 'settings', patch: { mode: m.id } })}>
              {m.label}
            </button>
          ))}
        </nav>
        <div className="actions">
          <select
            value=""
            onChange={(e) => {
              const ex = EXAMPLES[e.target.value];
              if (ex && (state.rows.length === 0 || confirm('Replace the current sheet with this example?'))) dispatch({ t: 'load', state: ex.build() });
            }}
          >
            <option value="">Load example…</option>
            {Object.entries(EXAMPLES).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <button onClick={exportJson}>Export</button>
          <button onClick={() => fileRef.current?.click()}>Import</button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => importJson(e.target.files?.[0])} />
        </div>
      </header>

      <main>
        <div className="left">
          <Settings state={state} dispatch={dispatch} />
          <Inputs state={state} dispatch={dispatch} />
          <Sheet state={state} issues={issues} dispatch={dispatch} onHover={setHoverRow} />
        </div>
        <aside className="right">
          <Output state={state} compiled={compiled} hoverRow={hoverRow} />
          <Issues issues={issues} dispatch={dispatch} />
        </aside>
      </main>
    </div>
  );
}
