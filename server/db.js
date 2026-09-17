const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'molds.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS machines (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS molds (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  code         TEXT NOT NULL UNIQUE,          -- 模具编号
  product_name TEXT NOT NULL,                 -- 对应产品
  cavities     INTEGER NOT NULL CHECK (cavities > 0),   -- 型腔数
  rated_life   INTEGER NOT NULL CHECK (rated_life > 0), -- 额定模次寿命
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 试模排期：机台 + 时段
CREATE TABLE IF NOT EXISTS trials (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  mold_id    INTEGER NOT NULL REFERENCES molds(id),
  machine_id INTEGER NOT NULL REFERENCES machines(id),
  start_time TEXT NOT NULL,   -- 本地时间 'YYYY-MM-DD HH:mm'
  end_time   TEXT NOT NULL,
  trial_no   INTEGER NOT NULL CHECK (trial_no > 0),     -- 第几次试模
  verdict    TEXT CHECK (verdict IN ('pass','concession','reject')), -- 样件判定
  problem    TEXT,             -- 问题描述
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_trials_time ON trials(start_time, end_time);

-- 改模单（厂内 / 委外），一张单可走多个改模轮次
CREATE TABLE IF NOT EXISTS repairs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  mold_id       INTEGER NOT NULL REFERENCES molds(id),
  trial_id      INTEGER REFERENCES trials(id),
  repair_type   TEXT NOT NULL CHECK (repair_type IN ('in_house','outsource')),
  vendor        TEXT,           -- 委外厂家
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','returned','accepted')),
                                             -- open=改模/送修中  returned=回厂待验收  accepted=验收合格关单
  current_round INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 改模轮次：每退回重改一次新增一行
CREATE TABLE IF NOT EXISTS repair_rounds (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  repair_id     INTEGER NOT NULL REFERENCES repairs(id),
  round         INTEGER NOT NULL,
  sent_date     TEXT NOT NULL,   -- 送修/开工日期
  return_date   TEXT,            -- 回厂日期
  accepted_date TEXT,            -- 验收日期
  verdict       TEXT CHECK (verdict IN ('accepted','rejected')),
  note          TEXT
);

-- 实际生产记录，模次按整数累计
CREATE TABLE IF NOT EXISTS production_runs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  mold_id      INTEGER NOT NULL REFERENCES molds(id),
  run_date     TEXT NOT NULL,
  shots        INTEGER NOT NULL CHECK (shots > 0),
  note         TEXT,
  confirmed_by TEXT,            -- 超寿命排产时的主管确认人
  created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
`);

module.exports = db;
