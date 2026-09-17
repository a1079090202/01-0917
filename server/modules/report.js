/**
 * 月度统计模块（独立）
 * 按模具汇总指定月份的：试模次数（该月试模排期条数）、不合格试模数、
 * 新开改模单数、改模轮次（该月内开轮/送修的轮次数）。
 */

const db = require('../db');

/** month: 'YYYY-MM' */
function monthlyReport(month) {
  if (!/^\d{4}-\d{2}$/.test(month || '')) {
    const err = new Error('月份格式应为 YYYY-MM');
    err.statusCode = 400;
    throw err;
  }

  return db
    .prepare(
      `
    SELECT mo.id AS mold_id, mo.code AS mold_code, mo.product_name,
           mo.cavities, mo.rated_life,
           (SELECT COALESCE(SUM(shots),0) FROM production_runs pr WHERE pr.mold_id = mo.id) AS current_shots,
           (SELECT COUNT(*) FROM trials t
              WHERE t.mold_id = mo.id AND substr(t.start_time,1,7) = ?) AS trial_count,
           (SELECT COUNT(*) FROM trials t
              WHERE t.mold_id = mo.id AND substr(t.start_time,1,7) = ? AND t.verdict = 'reject') AS reject_count,
           (SELECT COUNT(*) FROM repairs r
              WHERE r.mold_id = mo.id AND substr(r.created_at,1,7) = ?) AS repair_count,
           (SELECT COUNT(*) FROM repair_rounds rr JOIN repairs r2 ON r2.id = rr.repair_id
              WHERE r2.mold_id = mo.id AND substr(rr.sent_date,1,7) = ?) AS repair_rounds
    FROM molds mo
    ORDER BY mo.code
    `
    )
    .all(month, month, month, month);
}

module.exports = { monthlyReport };
