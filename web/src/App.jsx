import React, { useMemo, useState } from 'react';
import { api } from './api.js';
import Molds from './pages/Molds.jsx';
import Trials from './pages/Trials.jsx';
import Repairs from './pages/Repairs.jsx';
import Runs from './pages/Runs.jsx';
import Reports from './pages/Reports.jsx';

const TABS = [
  { key: 'molds', label: '模具台账' },
  { key: 'trials', label: '试模排期' },
  { key: 'repairs', label: '改模管理' },
  { key: 'runs', label: '生产模次' },
  { key: 'reports', label: '月度统计' }
];

export default function App() {
  const [tab, setTab] = useState('molds');
  const [molds, setMolds] = useState([]);
  const [machines, setMachines] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useMemo(
    () => async () => {
      const [ms, mcs] = await Promise.all([api.listMolds(), api.listMachines()]);
      setMolds(ms);
      setMachines(mcs);
    },
    []
  );

  if (!loaded) {
    refresh().then(() => setLoaded(true)).catch((e) => alert(e.message));
  }

  const Page = { molds: Molds, trials: Trials, repairs: Repairs, runs: Runs, reports: Reports }[tab];

  return (
    <>
      <header className="topbar">
        <h1>注塑车间模具台账</h1>
        <span className="sub">试模 · 改模 · 模次寿命闭环管理</span>
      </header>
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </nav>
      <main>
        {loaded && <Page key={tab} molds={molds} machines={machines} refreshMolds={refresh} />}
      </main>
    </>
  );
}
