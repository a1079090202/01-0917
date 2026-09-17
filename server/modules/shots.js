/**
 * 模次累计模块（独立）
 * 每次实际生产登记一条 production_runs，当前模次 = 累计 SUM(shots)，模次按整数。
 * 累计后调用寿命预警模块返回最新状态；超寿命登记须主管确认。
 */

const db = require('../db');
const { lifeStatus, assertSchedulable } = require('./life');
const { activeRepair } = require('./repairs');

function toPositiveInt(value, field = '模次') {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    const err = new Error(`${field}必须是正整数`);
    err.statusCode = 400;
    throw err;
  }
  return n;
}

function currentShots(moldId) {
  const row = db
    .prepare('SELECT COALESCE(SUM(shots),0) AS total FROM production_runs WHERE mold_id = ?')
    .get(moldId);
  return row.total;
}

function getMold(moldId) {
  const mold = db.prepare('SELECT * FROM molds WHERE id = ?').get(moldId);
  if (!mold) {
    const err = new Error('模具不存在');
    err.statusCode = 404;
    throw err;
  }
  return { ...mold, current_shots: currentShots(moldId) };
}

/** 登记一次实际生产并累计模次 */
function addRun({ mold_id, run_date, shots, note, confirmed_by }) {
  const n = toPositiveInt(shots);
  if (!run_date) {
    const err = new Error('生产日期不能为空');
    err.statusCode = 400;
    throw err;
  }

  const mold = getMold(mold_id);

  // 委外中 / 待验收 / 厂内改模中的模具不能排产
  const busy = activeRepair(mold_id);
  if (busy) {
    const err = new Error(`模具 ${mold.code} 正处于「${busy.statusLabel}」，改模单未关闭不能排产`);
    err.statusCode = 409;
    err.code = 'MOLD_IN_REPAIR';
    throw err;
  }

  // 超寿命必须主管确认
  assertSchedulable(mold, { confirmedBy: confirmed_by });

  const info = db
    .prepare('INSERT INTO production_runs (mold_id, run_date, shots, note, confirmed_by) VALUES (?,?,?,?,?)')
    .run(mold_id, run_date, n, note || null, confirmed_by || null);

  const after = getMold(mold_id);
  return { run_id: info.lastInsertRowid, mold: after, life: lifeStatus(after) };
}

module.exports = { currentShots, getMold, addRun, toPositiveInt };
