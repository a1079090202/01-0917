import React, { useEffect, useState } from 'react';
import { api, todayLocal } from '../api.js';
import { VerdictBadge, useForm, AlertBox } from '../components/ui.jsx';

const nextNo = (moldId, trials) => {
  const used = trials.filter((t) => t.mold_id === moldId).map((t) => t.trial_no);
  return (used.length ? Math.max(...used) : 0) + 1;
};

export default function Trials({ molds, machines, refreshMolds }) {
  const { values, bind, set } = useForm({
    mold_id: '', machine_id: '', start_time: '', end_time: '', trial_no: ''
  });
  const [trials, setTrials] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [verdictFor, setVerdictFor] = useState(null);   // 正在录入判定的试模
  const [repairFor, setRepairFor] = useState(null);     // 判定不合格后顺手开改模单
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setTrials(await api.listTrials());
  }
  useEffect(() => { refresh(); }, []);

  function pickMold(id) {
    set('mold_id', id);
    if (id) set('trial_no', String(nextNo(Number(id), trials)));
  }

  async function book(e) {
    e.preventDefault();
    setError(''); setSuccess(''); setBusy(true);
    try {
      await api.bookTrial({
        mold_id: Number(values.mold_id),
        machine_id: Number(values.machine_id),
        start_time: values.start_time,
        end_time: values.end_time,
        trial_no: Number(values.trial_no)
      });
      set('start_time', ''); set('end_time', '');
      await Promise.all([refresh(), refreshMolds()]);
      setSuccess('试模已排上机台');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const moldMap = new Map(molds.map((m) => [m.id, m]));

  return (
    <>
      <div className="panel">
        <h2>排试模</h2>
        <p className="hint">选择模具、机台和时段。同一机台同一时段只能排一副模具；同一副模具同一时段也不能挂两个排期，冲突会被拦下。</p>
        <form className="form-grid" onSubmit={book}>
          <label className="field">模具
            <select value={values.mold_id} onChange={(e) => pickMold(e.target.value)} required>
              <option value="">请选择…</option>
              {molds.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code} · {m.product_name}{m.repair_status ? `（${m.repair_status.label}）` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="field">试模机台
            <select {...bind('machine_id')} required>
              <option value="">请选择…</option>
              {machines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <label className="field">开始时间
            <input type="datetime-local" {...bind('start_time')} required />
          </label>
          <label className="field">结束时间
            <input type="datetime-local" {...bind('end_time')} required />
          </label>
          <label className="field">第几次试模
            <input type="number" min="1" step="1" {...bind('trial_no')} required />
          </label>
          <button className="btn" disabled={busy}>排入计划</button>
        </form>
        <AlertBox error={error} success={success} />
      </div>

      <div className="panel">
        <h2>试模记录</h2>
        <p className="hint">试模完成后录入样件判定；判为不合格必须写问题描述，可直接开出改模单。</p>
        <table className="data">
          <thead>
            <tr>
              <th>时段</th><th>机台</th><th>模具 / 产品</th><th>次数</th>
              <th>判定</th><th>问题描述</th><th>操作</th>
            </tr>
          </thead>
          <tbody>
            {trials.map((t) => (
              <React.Fragment key={t.id}>
                <tr>
                  <td className="mono" style={{ whiteSpace: 'nowrap' }}>{t.start_time}<br />~ {t.end_time}</td>
                  <td>{t.machine_name}</td>
                  <td><strong>{t.mold_code}</strong><br /><span className="muted">{t.product_name}</span></td>
                  <td className="mono">第{t.trial_no}次</td>
                  <td><VerdictBadge verdict={t.verdict} /></td>
                  <td style={{ maxWidth: 260 }}>{t.problem || <span className="muted">—</span>}</td>
                  <td>
                    <div className="row-actions">
                      {!t.verdict && <button className="btn small" onClick={() => setVerdictFor(t)}>录入判定</button>}
                      {t.verdict === 'reject' && !t.repair_id &&
                        <button className="btn small warn" onClick={() => setRepairFor(t)}>开改模单</button>}
                      {t.repair_id && <span className="muted">已开改模单 #{t.repair_id}</span>}
                    </div>
                  </td>
                </tr>
                {verdictFor?.id === t.id && (
                  <tr><td colSpan="7">
                    <VerdictForm
                      trial={t}
                      onCancel={() => setVerdictFor(null)}
                      onDone={async (rejected) => {
                        setVerdictFor(null);
                        await refresh();
                        if (rejected) setRepairFor(rejected);
                      }}
                    />
                  </td></tr>
                )}
                {repairFor?.id === t.id && (
                  <tr><td colSpan="7">
                    <RepairFromTrial
                      trial={t}
                      onCancel={() => setRepairFor(null)}
                      onDone={async () => {
                        setRepairFor(null);
                        await Promise.all([refresh(), refreshMolds()]);
                        setSuccess(`改模单已开出（模具 ${t.mold_code}）`);
                      }}
                    />
                  </td></tr>
                )}
              </React.Fragment>
            ))}
            {!trials.length && <tr><td colSpan="7" className="empty">暂无试模记录</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function VerdictForm({ trial, onDone, onCancel }) {
  const { values, bind } = useForm({ verdict: 'pass', problem: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api.recordVerdict(trial.id, {
        verdict: values.verdict,
        problem: values.verdict === 'reject' ? values.problem.trim() : values.problem.trim() || null
      });
      // 不合格 → 直接接着开改模单
      onDone(values.verdict === 'reject' ? trial : null);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className="inline-form" onSubmit={submit}>
      <label className="field">样件判定
        <select {...bind('verdict')}>
          <option value="pass">合格</option>
          <option value="concession">让步接收</option>
          <option value="reject">不合格</option>
        </select>
      </label>
      {values.verdict === 'reject' && (
        <label className="field" style={{ flex: 2, minWidth: 260 }}>问题描述（必填）
          <input {...bind('problem')} placeholder="如：浇口位置不对，熔接痕落在外观面" required />
        </label>
      )}
      <button className="btn ok small" disabled={busy}>保存判定</button>
      <button type="button" className="btn secondary small" onClick={onCancel}>取消</button>
      {error && <span className="alert error" style={{ marginTop: 0 }}>{error}</span>}
    </form>
  );
}

function RepairFromTrial({ trial, onDone, onCancel }) {
  const { values, bind } = useForm({
    repair_type: 'outsource',
    vendor: '',
    sent_date: todayLocal()
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api.openRepairFromTrial(trial.id, {
        repair_type: values.repair_type,
        vendor: values.repair_type === 'outsource' ? values.vendor.trim() : null,
        sent_date: values.sent_date
      });
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className="inline-form" onSubmit={submit}>
      <strong style={{ alignSelf: 'center' }}>为试模 #{trial.id} 开改模单：</strong>
      <label className="field">改模类型
        <select {...bind('repair_type')}>
          <option value="outsource">委外</option>
          <option value="in_house">厂内</option>
        </select>
      </label>
      {values.repair_type === 'outsource' && (
        <label className="field">委外厂家
          <input {...bind('vendor')} placeholder="厂家名称" required />
        </label>
      )}
      <label className="field">{values.repair_type === 'outsource' ? '送修日期' : '开工日期'}
        <input type="date" {...bind('sent_date')} required />
      </label>
      <button className="btn warn small" disabled={busy}>开单</button>
      <button type="button" className="btn secondary small" onClick={onCancel}>取消</button>
      {error && <span className="alert error" style={{ marginTop: 0 }}>{error}</span>}
    </form>
  );
}
