import React, { useEffect, useState } from 'react';
import { api, todayLocal } from '../api.js';
import { RepairStatusBadge, AlertBox } from '../components/ui.jsx';

export default function Repairs({ molds, refreshMolds }) {
  const [repairs, setRepairs] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [feedback, setFeedback] = useState({ error: '', success: '' });

  async function refresh() {
    setRepairs(await api.listRepairs());
    if (openId) setDetail(await api.repairDetail(openId));
  }
  useEffect(() => { refresh(); }, []);

  async function act(fn, okMsg) {
    setFeedback({ error: '', success: '' });
    try {
      await fn();
      setFeedback({ error: '', success: okMsg });
      await Promise.all([refresh(), refreshMolds()]);
    } catch (err) {
      setFeedback({ error: err.message, success: '' });
    }
  }

  async function toggle(id) {
    if (openId === id) { setOpenId(null); setDetail(null); return; }
    setOpenId(id);
    setDetail(await api.repairDetail(id));
  }

  return (
    <>
      <div className="panel">
        <h2>改模单</h2>
        <p className="hint">
          委外单流程：开单送修 → 回厂登记 → <strong>必须验收</strong>：合格才关单；不合格退回重改并自动增加一个改模轮次。
          回厂不验收，模具会一直停在「待验收」，不能排试模也不能排产。
        </p>
        <AlertBox {...feedback} />
        <table className="data">
          <thead>
            <tr>
              <th>#</th><th>模具 / 产品</th><th>类型</th><th>委外厂家</th>
              <th>当前轮次</th><th>状态</th><th>操作</th>
            </tr>
          </thead>
          <tbody>
            {repairs.map((r) => (
              <React.Fragment key={r.id}>
                <tr>
                  <td className="mono">{r.id}</td>
                  <td><strong>{r.mold_code}</strong><br /><span className="muted">{r.product_name}</span></td>
                  <td>{r.repair_type === 'outsource'
                    ? <span className="tag-outsource">委外</span>
                    : <span className="tag-inhouse">厂内</span>}</td>
                  <td>{r.vendor || <span className="muted">—</span>}</td>
                  <td className="mono">第 {r.current_round} 轮（共 {r.total_rounds} 轮）</td>
                  <td><RepairStatusBadge status={r.status} /></td>
                  <td>
                    <div className="row-actions">
                      <button className="btn small secondary" onClick={() => toggle(r.id)}>
                        {openId === r.id ? '收起' : '处理 / 明细'}
                      </button>
                    </div>
                  </td>
                </tr>
                {openId === r.id && detail && (
                  <tr><td colSpan="7" style={{ background: '#fafcfe' }}>
                    <RepairDetail repair={detail} onAction={act} />
                  </td></tr>
                )}
              </React.Fragment>
            ))}
            {!repairs.length && <tr><td colSpan="7" className="empty">暂无改模单（不合格的试模可在「试模排期」页直接开单）</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function RepairDetail({ repair, onAction }) {
  return (
    <div style={{ padding: '6px 4px' }}>
      <ul className="rounds">
        {repair.rounds.map((rd) => (
          <li key={rd.id}>
            <strong>第 {rd.round} 轮：</strong>
            {repair.repair_type === 'outsource' ? '送修' : '开工'} {rd.sent_date}
            {rd.return_date ? ` ｜ 回厂 ${rd.return_date}` : ' ｜ 未回厂'}
            {rd.verdict === 'accepted' && ` ｜ ✅ 验收合格 ${rd.accepted_date || ''}`}
            {rd.verdict === 'rejected' && ' ｜ ⛔ 验收不合格，已退回重改'}
            {!rd.verdict && rd.return_date && ' ｜ 待验收'}
            {rd.note ? ` ｜ 备注：${rd.note}` : ''}
          </li>
        ))}
      </ul>

      {repair.status === 'open' && (
        <ReturnForm repair={repair} onAction={onAction} />
      )}
      {repair.status === 'returned' && (
        <AcceptForm repair={repair} onAction={onAction} />
      )}
      {repair.status === 'accepted' && (
        <p className="muted" style={{ margin: '8px 0 0' }}>该改模单已验收合格并关单。</p>
      )}
    </div>
  );
}

function ReturnForm({ repair, onAction }) {
  const [date, setDate] = useState(todayLocal());
  return (
    <div className="inline-form">
      <label className="field">{repair.repair_type === 'outsource' ? '回厂日期（必填）' : '完工日期（必填）'}
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <button className="btn small" onClick={() =>
        onAction(() => api.markReturned(repair.id, { return_date: date }),
          repair.repair_type === 'outsource' ? '已登记回厂，等待验收（未验收不能关单、不能排产）' : '已登记完工，等待验收')}>
        登记{repair.repair_type === 'outsource' ? '回厂' : '完工'}
      </button>
    </div>
  );
}

function AcceptForm({ repair, onAction }) {
  const [date, setDate] = useState(todayLocal());
  const [note, setNote] = useState('');
  const [rejectDate, setRejectDate] = useState(todayLocal());
  return (
    <div style={{ marginTop: 10 }}>
      <div className="inline-form">
        <label className="field">验收日期
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field" style={{ flex: 2, minWidth: 240 }}>验收备注
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="尺寸/外观复测情况" />
        </label>
        <button className="btn ok small" onClick={() =>
          onAction(() => api.acceptRepair(repair.id, { accepted_date: date, note }), '验收合格，改模单已关闭')}>
          验收合格 · 关单
        </button>
      </div>
      <div className="inline-form" style={{ borderColor: '#f0c4bd' }}>
        <label className="field">{repair.repair_type === 'outsource' ? '重新送修日期' : '重新开工日期'}
          <input type="date" value={rejectDate} onChange={(e) => setRejectDate(e.target.value)} />
        </label>
        <button className="btn danger small" onClick={() =>
          onAction(() => api.rejectRepair(repair.id, { sent_date: rejectDate, note: note || '验收不合格退回重改' }),
            `验收不合格，已退回并开启第 ${repair.current_round + 1} 轮`)}>
          验收不合格 · 退回重改（轮次 +1）
        </button>
      </div>
    </div>
  );
}
