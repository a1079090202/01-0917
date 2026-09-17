/**
 * 种子数据：8 副模具 / 5 台机台 / 近一个月（2026-08-17 ~ 2026-09-17）的试模、改模、生产记录
 * 其中：M003、M005 委外中；M007 委外回厂待验收；M008 已超寿命；M006 寿命预警中。
 * 运行：npm run seed   （可重复运行，会清空后重建）
 */

const db = require('./db');

const T = (s) => s.replace('T', ' ').slice(0, 16);
const D = (s) => s.slice(0, 10);

db.pragma('foreign_keys = OFF');
db.exec(`
  DELETE FROM repair_rounds;
  DELETE FROM repairs;
  DELETE FROM production_runs;
  DELETE FROM trials;
  DELETE FROM molds;
  DELETE FROM machines;
  DELETE FROM sqlite_sequence;
`);
db.pragma('foreign_keys = ON');

const insertMachine = db.prepare('INSERT INTO machines (name) VALUES (?)');
['1#注塑机', '2#注塑机', '3#注塑机', '4#注塑机', '5#注塑机'].forEach((n) => insertMachine.run(n));

const insertMold = db.prepare(
  'INSERT INTO molds (code, product_name, cavities, rated_life) VALUES (?,?,?,?)'
);
const molds = [
  ['M-BP01', '汽车前保险杠', 1, 300000],
  ['M-IP02', '仪表板本体', 1, 200000],
  ['M-DP03', '车门内板', 2, 500000],
  ['M-RV04', '后视镜外壳', 4, 400000],
  ['M-AC05', '空调出风口', 2, 600000],
  ['M-CH06', '中控杯托', 4, 500000],
  ['M-HL07', '前车灯灯罩', 2, 350000],
  ['M-CL08', '线束固定卡扣', 16, 500000]
];
const moldId = {};
molds.forEach(([code, product, cav, life], i) => {
  moldId[code] = insertMold.run(code, product, cav, life).lastInsertRowid;
});

/* ---------------- 试模排期（机台/时段互不重叠） ---------------- */
const insertTrial = db.prepare(
  `INSERT INTO trials (mold_id, machine_id, start_time, end_time, trial_no, verdict, problem, created_at)
   VALUES (?,?,?,?,?,?,?,?)`
);
function trial(code, machineIdx, day, no, verdict, problem, createdAtDay) {
  return insertTrial.run(
    moldId[code], machineIdx + 1, T(day[0]), T(day[1]), no,
    verdict || null, problem || null, `${createdAtDay || day[0].slice(0, 10)} 08:00`
  ).lastInsertRowid;
}

const t101 = trial('M-BP01', 0, ['2026-08-19T09:00', '2026-08-19T12:00'], 1, 'concession', '边缘轻微飞边，让步接收', '2026-08-19');
const t102 = trial('M-BP01', 1, ['2026-08-26T09:00', '2026-08-26T13:00'], 2, 'reject', '浇口位置偏，熔接痕落在外观面', '2026-08-26');
const t103 = trial('M-BP01', 0, ['2026-09-11T09:00', '2026-09-11T12:00'], 3, 'pass', null, '2026-09-11');

const t201 = trial('M-IP02', 2, ['2026-08-22T14:00', '2026-08-22T17:00'], 1, 'pass', null, '2026-08-22');
const t202 = trial('M-IP02', 3, ['2026-09-10T09:00', '2026-09-10T12:00'], 2, 'reject', '安装柱根部顶白', '2026-09-10');
const t203 = trial('M-IP02', 2, ['2026-09-15T14:00', '2026-09-15T17:00'], 3, 'pass', null, '2026-09-15');

const t301 = trial('M-DP03', 1, ['2026-09-08T13:30', '2026-09-08T16:30'], 1, 'reject', '分型面毛刺、局部冷却不均', '2026-09-08');
const t401 = trial('M-RV04', 3, ['2026-08-28T09:00', '2026-08-28T11:30'], 1, 'pass', null, '2026-08-28');
const t501 = trial('M-AC05', 4, ['2026-09-13T09:30', '2026-09-13T12:00'], 1, 'reject', '叶片根部有气孔，装配卡滞', '2026-09-13');
const t601 = trial('M-CH06', 2, ['2026-09-01T09:00', '2026-09-01T11:00'], 1, 'concession', '皮纹偏浅，与客户确认让步接收', '2026-09-01');
const t701 = trial('M-HL07', 4, ['2026-08-25T13:00', '2026-08-25T16:00'], 1, 'reject', '灯罩内表面有麻点、透光不均', '2026-08-25');
const t801 = trial('M-CL08', 0, ['2026-09-05T09:00', '2026-09-05T10:30'], 1, 'pass', null, '2026-09-05');

/* ---------------- 改模单与轮次 ---------------- */
const insertRepair = db.prepare(
  `INSERT INTO repairs (mold_id, trial_id, repair_type, vendor, status, current_round, created_at)
   VALUES (?,?,?,?,?,?,?)`
);
const insertRound = db.prepare(
  `INSERT INTO repair_rounds (repair_id, round, sent_date, return_date, accepted_date, verdict, note)
   VALUES (?,?,?,?,?,?,?)`
);

// M-BP01：委外两轮——第1轮验收不合格退回，第2轮合格关单（对应"第三次试模才发现浇口问题"后的整改）
{
  const rid = insertRepair.run(moldId['M-BP01'], t102, 'outsource', '鸿图模塑有限公司', 'accepted', 2, '2026-08-26 15:00').lastInsertRowid;
  insertRound.run(rid, 1, D('2026-08-27'), D('2026-09-01'), null, 'rejected', '回厂试模尺寸仍偏差0.3mm，浇口修正不到位，退回重改');
  insertRound.run(rid, 2, D('2026-09-03'), D('2026-09-08'), D('2026-09-09'), 'accepted', '浇口偏移并抛光，复测合格');
}

// M-IP02：厂内改模一轮关单
{
  const rid = insertRepair.run(moldId['M-IP02'], t202, 'in_house', null, 'accepted', 1, '2026-09-10 14:00').lastInsertRowid;
  insertRound.run(rid, 1, D('2026-09-10'), D('2026-09-12'), D('2026-09-12'), 'accepted', '加大顶出行程并抛光安装柱');
}

// M-DP03：委外中（第1轮验收不合格退回，第2轮 09-15 重新送修，至今未回）——委外中 ①
{
  const rid = insertRepair.run(moldId['M-DP03'], t301, 'outsource', '锐捷精密模具厂', 'open', 2, '2026-09-08 17:00').lastInsertRowid;
  insertRound.run(rid, 1, D('2026-09-09'), D('2026-09-14'), null, 'rejected', '毛刺改善但冷却水路未疏通，退回');
  insertRound.run(rid, 2, D('2026-09-15'), null, null, null, null);
}

// M-AC05：委外中（09-14 送修，至今未回）——委外中 ②
{
  const rid = insertRepair.run(moldId['M-AC05'], t501, 'outsource', '永盛模具维修厂', 'open', 1, '2026-09-13 15:00').lastInsertRowid;
  insertRound.run(rid, 1, D('2026-09-14'), null, null, null, null);
}

// M-HL07：委外回厂待验收（09-16 回厂，尚未验收）——用于演示"不验收就卡住"
{
  const rid = insertRepair.run(moldId['M-HL07'], t701, 'outsource', '华光光学模具厂', 'returned', 1, '2026-08-25 17:00').lastInsertRowid;
  insertRound.run(rid, 1, D('2026-08-26'), D('2026-09-16'), null, null, null);
}

/* ---------------- 实际生产（模次整数累计） ---------------- */
const insertRun = db.prepare(
  'INSERT INTO production_runs (mold_id, run_date, shots, note, confirmed_by) VALUES (?,?,?,?,?)'
);
function runs(code, list) {
  list.forEach(([date, shots, note, by]) =>
    insertRun.run(moldId[code], date, shots, note || null, by || null));
}

runs('M-BP01', [
  ['2026-08-20', 3200], ['2026-08-24', 4100], ['2026-09-12', 3600],
  ['2026-09-14', 2400], ['2026-09-16', 1500]
]); // 合计 14800 / 300000
runs('M-IP02', [
  ['2026-08-25', 5200], ['2026-08-30', 4800], ['2026-09-13', 4200], ['2026-09-16', 3600]
]); // 合计 17800 / 200000
runs('M-DP03', [
  ['2026-08-21', 6400], ['2026-08-28', 7200], ['2026-09-04', 6800]
]); // 合计 20400 / 500000
runs('M-RV04', [
  ['2026-08-31', 9600], ['2026-09-03', 10200], ['2026-09-09', 8800], ['2026-09-15', 9400]
]); // 合计 38000 / 400000
runs('M-AC05', [
  ['2026-08-24', 7200], ['2026-09-02', 7600], ['2026-09-09', 7000]
]); // 合计 21800 / 600000
runs('M-CH06', [
  ['2026-09-02', 86000], ['2026-09-05', 88000], ['2026-09-09', 85000],
  ['2026-09-12', 84000], ['2026-09-15', 78600]
]); // 421600 / 500000 = 84.3% 预警
runs('M-HL07', [
  ['2026-08-27', 6200], ['2026-09-02', 5800], ['2026-09-10', 6400]
]); // 合计 18400 / 350000
runs('M-CL08', [
  ['2026-08-24', 96000], ['2026-08-29', 98000], ['2026-09-03', 99000],
  ['2026-09-08', 102000], ['2026-09-12', 95000],
  ['2026-09-14', 22000, '超寿命后排产，车间主管王建国签字确认', '王建国']
]); // 512000 / 500000 已超寿命

const total = db.prepare('SELECT mold_id, SUM(shots) AS s FROM production_runs GROUP BY mold_id').all();
console.log('种子数据已写入 server/data/molds.db');
console.log('模具 8 副 | 机台 5 台 | 试模', db.prepare('SELECT COUNT(*) c FROM trials').get().c, '次 | 改模单',
  db.prepare('SELECT COUNT(*) c FROM repairs').get().c, '张');
console.log('委外中: M-DP03、M-AC05 | 回厂待验收: M-HL07 | 超寿命: M-CL08 | 预警中: M-CH06');
console.log('各模具当前模次:');
total.forEach((r) => {
  const m = db.prepare('SELECT code, rated_life FROM molds WHERE id = ?').get(r.mold_id);
  console.log(`  ${m.code}  ${r.s}/${m.rated_life}  (${(r.s / m.rated_life * 100).toFixed(1)}%)`);
});
