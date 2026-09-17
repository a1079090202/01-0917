/**
 * 改模轮次模块（独立）
 * 流程：开单(第1轮, open) -> 回厂登记(returned, 待验收) -> 验收
 *   - 合格：accepted，关单
 *   - 不合格：本轮记 rejected，新增下一轮(open)，改模轮次 +1
 * 委外单未填回厂日期不能验收；厂内单同样必须验收后才关单。
 */

const db = require('../db');

const STATUS_LABEL = {
  open: '改模/送修中',
  returned: '回厂待验收',
  accepted: '验收合格已关单'
};

function activeRepair(moldId) {
  const repair = db
    .prepare("SELECT * FROM repairs WHERE mold_id = ? AND status != 'accepted' ORDER BY id DESC LIMIT 1")
    .get(moldId);
  if (!repair) return null;
  return { ...repair, statusLabel: statusLabel(repair) };
}

function statusLabel(repair) {
  if (repair.status === 'open') {
    return repair.repair_type === 'outsource' ? `委外中（第${repair.current_round}轮送修）` : `厂内改模中（第${repair.current_round}轮）`;
  }
  if (repair.status === 'returned') {
    return repair.repair_type === 'outsource' ? `委外回厂待验收（第${repair.current_round}轮）` : `厂内改模待验收（第${repair.current_round}轮）`;
  }
  return STATUS_LABEL.accepted;
}

function getRepair(id) {
  const repair = db.prepare('SELECT * FROM repairs WHERE id = ?').get(id);
  if (!repair) {
    const err = new Error('改模单不存在');
    err.statusCode = 404;
    throw err;
  }
  return repair;
}

function detail(id) {
  const repair = getRepair(id);
  const rounds = db.prepare('SELECT * FROM repair_rounds WHERE repair_id = ? ORDER BY round').all(id);
  const mold = db.prepare('SELECT code, product_name FROM molds WHERE id = ?').get(repair.mold_id);
  return { ...repair, status_label: statusLabel(repair), mold, rounds };
}

/** 开出改模单（可由不合格试模触发） */
function createRepair({ mold_id, trial_id, repair_type, vendor, sent_date }) {
  if (!mold_id) throw badRequest('请选择模具');
  if (!['in_house', 'outsource'].includes(repair_type)) throw badRequest('改模类型必须是厂内或委外');
  if (!sent_date) throw badRequest('请填写送修/开工日期');
  if (repair_type === 'outsource' && !vendor) throw badRequest('委外改模必须填写委外厂家');

  const mold = db.prepare('SELECT code FROM molds WHERE id = ?').get(mold_id);
  if (!mold) throw badRequest('模具不存在');
  if (activeRepair(mold_id)) throw conflict(`模具 ${mold.code} 已有未关闭的改模单，请先处理`);

  const tx = db.transaction(() => {
    const info = db
      .prepare('INSERT INTO repairs (mold_id, trial_id, repair_type, vendor, status, current_round) VALUES (?,?,?,?,?,1)')
      .run(mold_id, trial_id || null, repair_type, vendor || null, 'open');
    const repairId = info.lastInsertRowid;
    db.prepare('INSERT INTO repair_rounds (repair_id, round, sent_date) VALUES (?,1,?)').run(repairId, sent_date);
    return repairId;
  });

  return detail(tx());
}

/** 委外回厂登记（厂内改模完工同样登记），进入待验收 */
function markReturned({ repair_id, return_date }) {
  if (!return_date) throw badRequest('请填写回厂/完工日期');
  const repair = getRepair(repair_id);
  if (repair.status !== 'open') throw conflict(`当前状态为「${statusLabel(repair)}」，不能登记回厂`);

  db.transaction(() => {
    db.prepare("UPDATE repairs SET status = 'returned' WHERE id = ?").run(repair_id);
    db.prepare('UPDATE repair_rounds SET return_date = ? WHERE repair_id = ? AND round = ?')
      .run(return_date, repair_id, repair.current_round);
  })();
  return detail(repair_id);
}

/** 验收合格 -> 关单 */
function accept({ repair_id, accepted_date, note }) {
  if (!accepted_date) throw badRequest('请填写验收日期');
  const repair = getRepair(repair_id);
  if (repair.status !== 'returned') {
    throw conflict(`改模单当前为「${statusLabel(repair)}」，委外回厂登记后才能验收`);
  }

  db.transaction(() => {
    db.prepare("UPDATE repairs SET status = 'accepted' WHERE id = ?").run(repair_id);
    db.prepare(
      'UPDATE repair_rounds SET verdict = ?, accepted_date = ?, note = COALESCE(?, note) WHERE repair_id = ? AND round = ?'
    ).run('accepted', accepted_date, note || null, repair_id, repair.current_round);
  })();
  return detail(repair_id);
}

/** 验收不合格 -> 退回重改，记一轮 */
function reject({ repair_id, sent_date, note }) {
  if (!sent_date) throw badRequest('请填写重新送修/开工日期');
  const repair = getRepair(repair_id);
  if (repair.status !== 'returned') throw conflict('只有待验收的改模单能退回重改');

  const nextRound = repair.current_round + 1;
  db.transaction(() => {
    db.prepare("UPDATE repairs SET status = 'open', current_round = ? WHERE id = ?").run(nextRound, repair_id);
    db.prepare(
      'UPDATE repair_rounds SET verdict = ?, accepted_date = ?, note = COALESCE(?, note) WHERE repair_id = ? AND round = ?'
    ).run('rejected', null, note || null, repair_id, repair.current_round);
    db.prepare('INSERT INTO repair_rounds (repair_id, round, sent_date, note) VALUES (?,?,?,?)')
      .run(repair_id, nextRound, sent_date, note || null);
  })();
  return detail(repair_id);
}

function badRequest(msg) {
  const err = new Error(msg);
  err.statusCode = 400;
  return err;
}
function conflict(msg) {
  const err = new Error(msg);
  err.statusCode = 409;
  return err;
}

module.exports = {
  STATUS_LABEL,
  statusLabel,
  activeRepair,
  detail,
  createRepair,
  markReturned,
  accept,
  reject
};
