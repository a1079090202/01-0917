import React, { useState } from 'react';
import { api } from '../api.js';
import { LifeBadge, ShotsCell, useForm, AlertBox } from '../components/ui.jsx';

export default function Molds({ molds, refreshMolds }) {
  const { values, bind, reset } = useForm({ code: '', product_name: '', cavities: '', rated_life: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const expired = molds.filter((m) => m.life.level === 'expired').length;
  const warning = molds.filter((m) => m.life.level === 'warning').length;
  const inRepair = molds.filter((m) => m.repair_status).length;

  async function submit(e) {
    e.preventDefault();
    setError(''); setSuccess('');
    try {
      await api.createMold({
        code: values.code.trim(),
        product_name: values.product_name.trim(),
        cavities: Number(values.cavities),
        rated_life: Number(values.rated_life)
      });
      reset();
      await refreshMolds();
      setSuccess('模具已登记');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <div className="stat-row">
        <div className="stat-card"><div className="v">{molds.length}</div><div className="k">在册模具</div></div>
        <div className={`stat-card ${inRepair ? 'warn' : ''}`}><div className="v">{inRepair}</div><div className="k">改模未闭环</div></div>
        <div className={`stat-card ${warning ? 'warn' : ''}`}><div className="v">{warning}</div><div className="k">寿命预警（≥80%）</div></div>
        <div className={`stat-card ${expired ? 'alarm' : ''}`}><div className="v">{expired}</div><div className="k">已超寿命</div></div>
      </div>

      <div className="panel">
        <h2>新模登记</h2>
        <p className="hint">编号、对应产品、型腔数、额定模次寿命；当前模次由实际生产记录自动累计。</p>
        <form className="form-grid" onSubmit={submit}>
          <label className="field">模具编号
            <input {...bind('code')} placeholder="如 M-BP09" required />
          </label>
          <label className="field">对应产品
            <input {...bind('product_name')} placeholder="如 汽车后保险杠" required />
          </label>
          <label className="field">型腔数
            <input type="number" min="1" step="1" {...bind('cavities')} required />
          </label>
          <label className="field">额定模次寿命
            <input type="number" min="1" step="1000" {...bind('rated_life')} placeholder="如 300000" required />
          </label>
          <button className="btn" type="submit">登记模具</button>
        </form>
        <AlertBox error={error} success={success} />
      </div>

      <div className="panel">
        <h2>模具台账</h2>
        <p className="hint">当前模次达到额定寿命 80% 出预警；超寿命的模具排产需主管确认。</p>
        <table className="data">
          <thead>
            <tr>
              <th>编号</th><th>对应产品</th><th>型腔数</th>
              <th>当前模次 / 额定寿命</th><th>寿命状态</th><th>改模状态</th>
            </tr>
          </thead>
          <tbody>
            {molds.map((m) => (
              <tr key={m.id}>
                <td><strong>{m.code}</strong></td>
                <td>{m.product_name}</td>
                <td className="mono">{m.cavities}</td>
                <td><ShotsCell current={m.current_shots} rated={m.rated_life} life={m.life} /></td>
                <td><LifeBadge life={m.life} /></td>
                <td>{m.repair_status
                  ? <span className="badge repair">{m.repair_status.label}</span>
                  : <span className="muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
