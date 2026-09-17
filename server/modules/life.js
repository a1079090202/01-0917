/**
 * 寿命预警模块（独立）
 * 阈值：当前模次 >= 额定寿命 80% 出预警；>= 100% 为超寿命。
 * 只做纯计算，不碰数据库，方便被模次累计 / 排产等模块复用。
 */

const WARN_RATIO = 0.8;

function lifeStatus(mold) {
  const ratio = mold.current_shots / mold.rated_life;
  if (ratio >= 1) {
    return { level: 'expired', label: '已超寿命', ratio, remaining: mold.rated_life - mold.current_shots };
  }
  if (ratio >= WARN_RATIO) {
    return { level: 'warning', label: '寿命预警', ratio, remaining: mold.rated_life - mold.current_shots };
  }
  return { level: 'normal', label: '正常', ratio, remaining: mold.rated_life - mold.current_shots };
}

/** 超寿命模具排产前必须有主管确认，否则抛错 */
function assertSchedulable(mold, { confirmedBy } = {}) {
  const st = lifeStatus(mold);
  if (st.level === 'expired' && !confirmedBy) {
    const err = new Error(`模具 ${mold.code} 已达额定寿命（${mold.current_shots}/${mold.rated_life}），未经主管确认不能排产`);
    err.statusCode = 409;
    err.code = 'LIFE_EXPIRED';
    throw err;
  }
  return st;
}

module.exports = { WARN_RATIO, lifeStatus, assertSchedulable };
