import React from 'react';

export function LifeBadge({ life }) {
  if (life.level === 'expired') return <span className="badge expired">已超寿命 {life.remaining < 0 ? `(超 ${-life.remaining})` : ''}</span>;
  if (life.level === 'warning') return <span className="badge warning">寿命预警 · 剩 {life.remaining.toLocaleString()}</span>;
  return <span className="badge normal">正常 · 剩 {life.remaining.toLocaleString()}</span>;
}

export function ShotsCell({ current, rated, life }) {
  const cls = life.level === 'expired' ? 'expired' : life.level === 'warning' ? 'warning' : '';
  return (
    <div className="shots-cell">
      <div>
        <span className="num">{current.toLocaleString()}</span>
        <span className="muted"> / {rated.toLocaleString()}</span>
      </div>
      <span className={`progress ${cls}`}><i style={{ width: `${Math.min(100, life.ratio * 100).toFixed(1)}%` }} /></span>
      <span className="pct">{(life.ratio * 100).toFixed(1)}%</span>
    </div>
  );
}

const VERDICT = {
  pass: { label: '合格', cls: 'verdict-pass' },
  concession: { label: '让步接收', cls: 'verdict-concession' },
  reject: { label: '不合格', cls: 'verdict-reject' }
};

export function VerdictBadge({ verdict }) {
  if (!verdict) return <span className="badge verdict-pending">待判定</span>;
  const v = VERDICT[verdict];
  return <span className={`badge ${v.cls}`}>{v.label}</span>;
}

export function RepairStatusBadge({ status }) {
  if (status === 'accepted') return <span className="badge closed">已关单</span>;
  if (status === 'returned') return <span className="badge returned">回厂待验收</span>;
  return <span className="badge repair">改模/送修中</span>;
}

/** 小型受控表单 hook */
export function useForm(initial) {
  const [values, setValues] = React.useState(initial);
  const set = (k, v) => setValues((s) => ({ ...s, [k]: v }));
  const reset = () => setValues(initial);
  const bind = (k) => ({
    value: values[k] ?? '',
    onChange: (e) => set(k, e.target.value)
  });
  return { values, set, reset, bind };
}

export function AlertBox({ error, success }) {
  return (
    <>
      {error && <div className="alert error">⛔ {error}</div>}
      {success && <div className="alert success">✅ {success}</div>}
    </>
  );
}
