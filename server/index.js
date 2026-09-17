const path = require('path');
const express = require('express');
const db = require('./db');
const lifeMod = require('./modules/life');
const shotsMod = require('./modules/shots');
const scheduleMod = require('./modules/schedule');
const repairsMod = require('./modules/repairs');
const reportMod = require('./modules/report');

const app = express();
app.use(express.json());

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ---------------- 机台 ---------------- */
app.get('/api/machines', wrap((req, res) => {
  res.json(db.prepare('SELECT * FROM machines ORDER BY id').all());
}));

app.post('/api/machines', wrap((req, res) => {
  const { name } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: '机台名称不能为空' });
  }
  const info = db.prepare('INSERT INTO machines (name) VALUES (?)').run(String(name).trim());
  res.status(201).json(db.prepare('SELECT * FROM machines WHERE id = ?').get(info.lastInsertRowid));
}));

/* ---------------- 模具台账 ---------------- */
function moldWithState(m) {
  const current_shots = shotsMod.currentShots(m.id);
  const enriched = { ...m, current_shots };
  const active = repairsMod.activeRepair(m.id);
  return {
    ...enriched,
    life: lifeMod.lifeStatus(enriched),
    repair_status: active ? { id: active.id, status: active.status, label: active.statusLabel } : null
  };
}

app.get('/api/molds', wrap((req, res) => {
  const molds = db.prepare('SELECT * FROM molds ORDER BY code').all().map(moldWithState);
  res.json(molds);
}));

app.get('/api/molds/:id', wrap((req, res) => {
  const m = db.prepare('SELECT * FROM molds WHERE id = ?').get(req.params.id);
  if (!m) return res.status(404).json({ error: '模具不存在' });
  res.json(moldWithState(m));
}));

app.post('/api/molds', wrap((req, res) => {
  const { code, product_name, cavities, rated_life } = req.body || {};
  if (!code || !product_name) return res.status(400).json({ error: '编号和对应产品必填' });
  const c = Number(cavities);
  const life = Number(rated_life);
  if (!Number.isInteger(c) || c <= 0) return res.status(400).json({ error: '型腔数必须是正整数' });
  if (!Number.isInteger(life) || life <= 0) return res.status(400).json({ error: '额定模次寿命必须是正整数' });
  const info = db
    .prepare('INSERT INTO molds (code, product_name, cavities, rated_life) VALUES (?,?,?,?)')
    .run(String(code).trim(), product_name, c, life);
  res.status(201).json(moldWithState(db.prepare('SELECT * FROM molds WHERE id = ?').get(info.lastInsertRowid)));
}));

/* ---------------- 试模排期 ---------------- */
app.get('/api/trials', wrap((req, res) => {
  const rows = db
    .prepare(
      `SELECT t.*, m.name AS machine_name, mo.code AS mold_code, mo.product_name,
              r.id AS repair_id
       FROM trials t
       JOIN machines m ON m.id = t.machine_id
       JOIN molds mo ON mo.id = t.mold_id
       LEFT JOIN repairs r ON r.trial_id = t.id
       ORDER BY t.start_time DESC, t.id DESC`
    )
    .all();
  res.json(rows);
}));

app.post('/api/trials', wrap((req, res) => {
  const trial = scheduleMod.bookTrial(req.body || {});
  res.status(201).json(trial);
}));

app.post('/api/trials/:id/verdict', wrap((req, res) => {
  const trial = scheduleMod.recordVerdict({ ...(req.body || {}), trial_id: Number(req.params.id) });
  res.json(trial);
}));

/** 判定不合格后顺手开改模单（也可单独 POST /api/repairs） */
app.post('/api/trials/:id/repair', wrap((req, res) => {
  const trial = db.prepare('SELECT * FROM trials WHERE id = ?').get(req.params.id);
  if (!trial) return res.status(404).json({ error: '试模记录不存在' });
  if (trial.verdict !== 'reject') {
    return res.status(409).json({ error: '只有判定不合格的试模才能开改模单' });
  }
  const repair = repairsMod.createRepair({
    mold_id: trial.mold_id,
    trial_id: trial.id,
    repair_type: (req.body || {}).repair_type,
    vendor: (req.body || {}).vendor,
    sent_date: (req.body || {}).sent_date
  });
  res.status(201).json(repair);
}));

/* ---------------- 改模 ---------------- */
app.get('/api/repairs', wrap((req, res) => {
  const rows = db
    .prepare(
      `SELECT r.*, mo.code AS mold_code, mo.product_name,
              (SELECT COUNT(*) FROM repair_rounds rr WHERE rr.repair_id = r.id) AS total_rounds
       FROM repairs r JOIN molds mo ON mo.id = r.mold_id
       ORDER BY r.id DESC`
    )
    .all()
    .map((r) => ({ ...r, status_label: repairsMod.statusLabel(r) }));
  res.json(rows);
}));

app.get('/api/repairs/:id', wrap((req, res) => {
  res.json(repairsMod.detail(Number(req.params.id)));
}));

app.post('/api/repairs', wrap((req, res) => {
  res.status(201).json(repairsMod.createRepair(req.body || {}));
}));

app.post('/api/repairs/:id/return', wrap((req, res) => {
  res.json(repairsMod.markReturned({ ...(req.body || {}), repair_id: Number(req.params.id) }));
}));

app.post('/api/repairs/:id/accept', wrap((req, res) => {
  res.json(repairsMod.accept({ ...(req.body || {}), repair_id: Number(req.params.id) }));
}));

app.post('/api/repairs/:id/reject', wrap((req, res) => {
  res.json(repairsMod.reject({ ...(req.body || {}), repair_id: Number(req.params.id) }));
}));

/* ---------------- 生产模次 ---------------- */
app.get('/api/runs', wrap((req, res) => {
  const { mold_id } = req.query;
  const sql = `
    SELECT pr.*, mo.code AS mold_code
    FROM production_runs pr JOIN molds mo ON mo.id = pr.mold_id
    ${mold_id ? 'WHERE pr.mold_id = ?' : ''}
    ORDER BY pr.run_date DESC, pr.id DESC`;
  res.json(mold_id ? db.prepare(sql).all(mold_id) : db.prepare(sql).all());
}));

app.post('/api/runs', wrap((req, res) => {
  const result = shotsMod.addRun(req.body || {});
  res.status(201).json(result);
}));

/* ---------------- 月度统计 ---------------- */
app.get('/api/reports/monthly', wrap((req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  res.json({ month, rows: reportMod.monthlyReport(month) });
}));

/* ---------------- 错误处理 ---------------- */
app.use((err, req, res, next) => {
  const status = err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || '服务器错误', code: err.code, conflicts: err.conflicts });
});

/* 生产模式托管前端构建产物 */
app.use(express.static(path.join(__dirname, '..', 'dist')));
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'), (err) => {
    if (err) res.status(200).send('前端尚未构建：开发模式请运行 npm run dev，或先 npm run build。');
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`模具台账服务已启动: http://localhost:${PORT}`);
});
