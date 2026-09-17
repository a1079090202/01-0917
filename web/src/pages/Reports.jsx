import React, { useEffect, useState } from 'react';
import { api, thisMonthLocal } from '../api.js';
import { LifeBadge } from '../components/ui.jsx';

export default function Reports() {
  const [month, setMonth] = useState(thisMonthLocal());
  const [rows, setRows] = useState(null);

  async function load(m) {
    const data = await api.monthly(m);
    setRows(data.rows);
  }
  useEffect(() => { load(month); }, []);

  const totals = rows
    ? {
        trials: rows.reduce((s, r) => s + r.trial_count, 0),
        rejects: rows.reduce((s, r) => s + r.reject_count, 0),
        repairs: rows.reduce((s, r) => s + r.repair_count, 0),
        rounds: rows.reduce((s, r) => s + r.repair_rounds, 0)
      }
    : null;

  return (
    <>
      <div className="panel">
        <h2>月度试模 / 改模统计（按模具）</h2>
        <p className="hint">按试模排期的开始日期、改模轮次的送修日期归属月份统计。</p>
        <form className="form-grid" style={{ gridTemplateColumns: '220px auto' }} onSubmit={(e) => { e.preventDefault(); load(month); }}>
          <label className="field">统计月份
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </label>
          <button className="btn" type="submit">生成统计</button>
        </form>

        {totals && (
          <div className="stat-row" style={{ marginTop: 14 }}>
            <div className="stat-card"><div className="v">{totals.trials}</div><div className="k">{month} 试模次数</div></div>
            <div className="stat-card warn"><div className="v">{totals.rejects}</div><div className="k">不合格试模</div></div>
            <div className="stat-card warn"><div className="v">{totals.repairs}</div><div className="k">新开改模单</div></div>
            <div className="stat-card"><div className="v">{totals.rounds}</div><div className="k">改模轮次合计</div></div>
          </div>
        )}

        {rows && (
          <table className="data">
            <thead>
              <tr>
                <th>模具编号</th><th>产品</th>
                <th>试模次数</th><th>其中不合格</th><th>新开改模单</th><th>改模轮次</th>
                <th>当前模次</th><th>寿命</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const ratio = r.current_shots / r.rated_life;
                const life = ratio >= 1
                  ? { level: 'expired', ratio, remaining: r.rated_life - r.current_shots }
                  : ratio >= 0.8
                    ? { level: 'warning', ratio, remaining: r.rated_life - r.current_shots }
                    : { level: 'normal', ratio, remaining: r.rated_life - r.current_shots };
                return (
                  <tr key={r.mold_id}>
                    <td><strong>{r.mold_code}</strong></td>
                    <td>{r.product_name}</td>
                    <td className="mono">{r.trial_count}</td>
                    <td className="mono">{r.reject_count > 0
                      ? <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{r.reject_count}</span>
                      : 0}</td>
                    <td className="mono">{r.repair_count}</td>
                    <td className="mono">{r.repair_rounds > 0
                      ? <span style={{ color: 'var(--warn)', fontWeight: 600 }}>{r.repair_rounds}</span>
                      : 0}</td>
                    <td className="mono">{r.current_shots.toLocaleString()} / {r.rated_life.toLocaleString()}</td>
                    <td><LifeBadge life={life} /></td>
                  </tr>
                );
              })}
              {!rows.length && <tr><td colSpan="8" className="empty">该月无数据</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
