-- ============================================================
-- 参考資料：作成されるテーブルの構造
--
-- 新規にテーブルを作る場合、このSQLを手動実行する必要はありません。
-- バックエンド（FastAPI）の起動時に SQLAlchemy が自動的に
-- 以下と同じ内容のテーブルを作成します（init_db関数）。
--
-- ただし、Render上で「既にテーブルが存在する」状態のまま
-- backend/app/db.py のモデルに新しいカラムを追加した場合、
-- init_db() は既存テーブルへのカラム追加（マイグレーション）を
-- 行わないため、手動でNeonのSQL Editorから ALTER TABLE を
-- 実行する必要があります（このSQLを実行しないと、その新しい
-- カラムを参照するAPIが500エラーになります）。
--
-- 現時点で必要なマイグレーション（未実行の場合は実行してください）:
--   ALTER TABLE horses ADD COLUMN IF NOT EXISTS history JSONB;
--   ALTER TABLE horses ADD COLUMN IF NOT EXISTS current_weight INTEGER DEFAULT 0;
--   ALTER TABLE horses ADD COLUMN IF NOT EXISTS current_impost FLOAT DEFAULT 0.0;
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
  current_weight integer default 0,
  current_impost float default 0.0,
  result_rank varchar default '',
  note text default '',
  factors jsonb not null default '{"waku":0,"jockey":0,"pedigree":0,"time":0,"condition":0,"form":0,"season":3}',
  history jsonb default '{"前走":null,"前々走":null,"3走前":null,"4走前":null}',
  created_at timestamp default now()
);

create index if not exists idx_horses_race_id on horses(race_id);
create index if not exists idx_races_date on races(date);
