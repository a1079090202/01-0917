import React, { useEffect, useState } from 'react';
import { api, todayLocal } from '../api.js';
import { LifeBadge, useForm, AlertBox } from '../components/ui.jsx';

export default function Runs({ molds, refreshMolds }) {
  const { values, bind, set } = useForm({
    mold_id: '', run_date: todayLocal(), shots: '', note: '', confirmed_by: ''
  });
  const [runs, setRuns] = useState([]);
  const [feedback, setFeedback] = useState({ error: '', success: '' });
  const [busy, setBusy] = useState(false);

  const selected = molds.find((m) => m.id === Number(values.mold_id));
  // 预估本次累计后的寿命状态（仅前端提示，真正拦截在后端 life 模块）
  const addShots = Number(values.shots) || 0;
  const projected = selected && Number.isInteger(addShots) && addShots > 0
    ? { ...selected, current_shots: selected.current_shots + addShots, life: previewLife(selected, addShots) }
    : null;

  async function refresh() {
    setRuns(await api.listRuns());
  }
  useEffect(() => { refresh(); }, []);

  async function submit(e) {
    e.preventDefault();
    setFeedback({ error: '', success: '' });
    setBusy(true);
    try {
      const result = await api.addRun({
        mold_id: Number(values.mold_id),
        run_date: values.run_date,
        shots: Number(values.shots),
        note: values.note.trim() || null,
        confirmed_by: values.confirmed_by.trim() || null
      });
      set('shots', ''); set('note', ''); set('confirmed_by', '');
      await Promise.all([refresh(), refreshMolds()]);
      const warn = result.life.level === 'expired'
        ? '注意：已超过额定寿命！'
        : result.life.level === 'warning'
          ? `已触发寿命预警（剩余 ${result.life.remaining.toLocaleString()} 模次）`
          : '';
      setFeedback({ error: '', success: `已累计 ${result.mold.current_shots.toLocaleString()} 模次。${warn}` });
    } catch (err) {
      setFeedback({ error: err.message, success: '' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="panel">
        <h2>登记实际生产（累计模次）</h2>
        <p className="hint">
          每次生产登记整数模次，系统自动累计当前模次。达到额定寿命 80% 出预警；
          <strong>超寿命后未经主管填写确认人，系统拒绝登记排产</strong>。改模未闭环的模具同样不能生产。
        </p>
        <form className="form-grid" onSubmit={submit}>
          <label className="field">模具
            <select {...bind('mold_id')} required>
              <option value="">请选择…</option>
              {molds.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code} · {m.product_name}（当前 {m.current_shots.toLocaleString()}/{m.rated_life.toLocaleString()}）
                </option>
              ))}
            </select>
          </label>
          <label className="field">生产日期
            <input type="date" {...bind('run_date')} required />
          </label>
          <label className="field">本次模次（正整数）
            <input type="number" min="1" step="1" {...bind('shots')} required />
          </label>
          <label className="field">备注
            <input {...bind('note')} placeholder="如：夜班生产" />
          </label>
          {projected && projected.life.level === 'expired' && (
            <label className="field">主管确认人（超寿命必填）
              <input {...bind('confirmed_by')} placeholder="主管签字姓名" style={{ borderColor: '#c0392b' }} />
            </label>
          )}
          <button className="btn" disabled={busy}>累计模次</button>
        </form>
        {selected && (
          <p className="hint" style={{ marginTop: 10 }}>
            当前状态：<LifeBadge life={selected.life} />
            {projected && projected.life.level !== 'normal' && (
              <> ｜ 本次登记后：<LifeBadge life={projected.life} /></>
            )}
          </p>
        )}
        <AlertBox {...feedback} />
      </div>

      <div className="panel">
        <h2>生产记录</h2>
        <table className="data">
          <thead>
            <tr><th>日期</th><th>模具</th><th>模次</th><th>主管确认</th><th>备注</th></tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td className="mono">{r.run_date}</td>
                <td>{r.mold_code}</td>
                <td className="mono">+{r.shots.toLocaleString()}</td>
                <td>{r.confirmed_by ? <span className="badge verdict-concession">{r.confirmed_by} 确认</span> : <span className="muted">—</span>}</td>
                <td>{r.note || <span className="muted">—</span>}</td>
              </tr>
            ))}
            {!runs.length && <tr><td colSpan="5" className="empty">暂无生产记录</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

// 与后端 life 模块同一口径（阈值 0.8），仅用于提交前提示
function previewLife(mold, addShots) {
  const shots = mold.current_shots + addShots;
  const ratio = shots / mold.rated_life;
  if (ratio >= 1) return { level: 'expired', label: '已超寿命', ratio, remaining: mold.rated_life - shots };
  if (ratio >= 0.8) return { level: 'warning', label: '寿命预警', ratio, remaining: mold.rated_life - shots };
  return { level: 'normal', label: '正常', ratio, remaining: mold.rated_life - shots };
}
