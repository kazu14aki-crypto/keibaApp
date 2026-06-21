-- ============================================================
-- 参考資料：作成されるテーブルの構造
--
-- このSQLを手動実行する必要はありません。
-- バックエンド（FastAPI）の起動時に SQLAlchemy が自動的に
-- 以下と同じ内容のテーブルを作成します（init_db関数）。
--
-- 万一テーブル構造を手動確認・調整したい場合の参考としてご利用ください。
-- ============================================================

create table if not exists races (
  id uuid primary key,
  name varchar not null,
  date date,
  track varchar not null default '東京',
  surface varchar not null default '芝',
  distance integer not null default 2000,
  condition varchar not null default '良',
  grade varchar default '',
  memo text default '',
  created_at timestamp default now()
);

create table if not exists horses (
  id uuid primary key,
  race_id uuid not null references races(id) on delete cascade,
  num integer not null default 1,
  waku integer not null default 1,
  name varchar default '',
  jockey varchar default '',
  pedigree varchar default '',
  style varchar default '先行',
  last_time varchar default '',
  last_3f varchar default '',
  result_rank varchar default '',
  note text default '',
  factors jsonb not null default '{"waku":0,"jockey":0,"pedigree":0,"time":0,"condition":0,"form":0}',
  created_at timestamp default now()
);

create index if not exists idx_horses_race_id on horses(race_id);
create index if not exists idx_races_date on races(date);
