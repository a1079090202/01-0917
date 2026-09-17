/**
 * 时段占用模块（独立）
 * 排试模时同时校验两类冲突：
 *   1. 同一机台同一时段不能排两副模具；
 *   2. 同一副模具同一时段不能挂在两个排期（产品）上。
 * 半开区间重叠判定：existing.start < new.end AND existing.end > new.start
 */

const db = require('../db');
const { activeRepair } = require('./repairs');

function normalizeTime(s) {
  // 兼容 datetime-local 'YYYY-MM-DDTHH:mm' 与 'YYYY-MM-DD HH:mm'，统一按本地墙钟时间存储比较
  return String(s).replace('T', ' ').slice(0, 16);
}

function findConflicts({ mold_id, machine_id, start_time, end_time, exclude_trial_id }) {
  const start = normalizeTime(start_time);
  const end = normalizeTime(end_time);
  if (!(start > '1970') || !(end > '1970') || start >= end) {
    const err = new Error('起止时间无效（开始须早于结束）');
    err.statusCode = 400;
    throw err;
  }

  const overlap = `t.start_time < ? AND t.end_time > ? AND t.id IS NOT COALESCE(?, -1)`;
  const params = [end, start, exclude_trial_id || null];

  const machineHit = db
    .prepare(`SELECT t.*, m.name AS machine_name, mo.code AS mold_code, mo.product_name
              FROM trials t
              JOIN machines m ON m.id = t.machine_id
              JOIN molds mo ON mo.id = t.mold_id
              WHERE t.machine_id = ? AND ${overlap}`)
    .get(machine_id, ...params);

  const moldHit = db
    .prepare(`SELECT t.*, m.name AS machine_name, mo.code AS mold_code, mo.product_name
              FROM trials t
              JOIN machines m ON m.id = t.machine_id
              JOIN molds mo ON mo.id = t.mold_id
              WHERE t.mold_id = ? AND ${overlap}`)
    .get(mold_id, ...params);

  const conflicts = [];
  if (machineHit) {
    conflicts.push({
      type: 'machine',
      message: `机台「${machineHit.machine_name}」在 ${machineHit.start_time}~${machineHit.end_time} 已排模具 ${machineHit.mold_code}（${machineHit.product_name}），时段冲突`
    });
  }
  if (moldHit) {
    conflicts.push({
      type: 'mold',
      message: `模具 ${moldHit.mold_code} 在 ${moldHit.start_time}~${moldHit.end_time} 已排在机台「${moldHit.machine_name}」，同一副模具不能同时挂两个排期`
    });
  }
  return conflicts;
}

/** 排试模：冲突或改模未闭环一律挡下 */
function bookTrial({ mold_id, machine_id, start_time, end_time, trial_no }) {
  const n = Number(trial_no);
  if (!Number.isInteger(n) || n <= 0) {
    const err = new Error('试模次数必须是正整数');
    err.statusCode = 400;
    throw err;
  }

  const mold = db.prepare('SELECT * FROM molds WHERE id = ?').get(mold_id);
  if (!mold) {
    const err = new Error('模具不存在');
    err.statusCode = 404;
    throw err;
  }
  if (!db.prepare('SELECT id FROM machines WHERE id = ?').get(machine_id)) {
    const err = new Error('机台不存在');
    err.statusCode = 404;
    throw err;
  }

  const busy = activeRepair(mold_id);
  if (busy) {
    const err = new Error(`模具 ${mold.code} 正处于「${busy.statusLabel}」，改模单验收合格前不能排试模`);
    err.statusCode = 409;
    err.code = 'MOLD_IN_REPAIR';
    throw err;
  }

  const conflicts = findConflicts({ mold_id, machine_id, start_time, end_time });
  if (conflicts.length) {
    const err = new Error(conflicts.map((c) => c.message).join('；'));
    err.statusCode = 409;
    err.code = 'SCHEDULE_CONFLICT';
    err.conflicts = conflicts;
    throw err;
  }

  const info = db
    .prepare('INSERT INTO trials (mold_id, machine_id, start_time, end_time, trial_no) VALUES (?,?,?,?,?)')
    .run(mold_id, machine_id, normalizeTime(start_time), normalizeTime(end_time), n);

  return db.prepare('SELECT * FROM trials WHERE id = ?').get(info.lastInsertRowid);
}

/** 试模后录入样件判定；不合格必须写问题描述（用于开改模单） */
function recordVerdict({ trial_id, verdict, problem }) {
  if (!['pass', 'concession', 'reject'].includes(verdict)) {
    const err = new Error('样件判定必须是 合格/让步接收/不合格 之一');
    err.statusCode = 400;
    throw err;
  }
  const trial = db.prepare('SELECT * FROM trials WHERE id = ?').get(trial_id);
  if (!trial) {
    const err = new Error('试模记录不存在');
    err.statusCode = 404;
    throw err;
  }
  if (verdict === 'reject' && !problem) {
    const err = new Error('判定不合格时必须填写问题描述');
    err.statusCode = 400;
    throw err;
  }
  db.prepare('UPDATE trials SET verdict = ?, problem = ? WHERE id = ?').run(verdict, problem || null, trial_id);
  return db.prepare('SELECT * FROM trials WHERE id = ?').get(trial_id);
}

module.exports = { normalizeTime, findConflicts, bookTrial, recordVerdict };
