-- Per-account library so a signed-in email can restore songs on another device.
-- user_id matches Better Auth's "user"."id" (text, not uuid).

create table if not exists library_snapshot (
  user_id text primary key references "user" ("id") on delete cascade,
  payload text not null,
  updated_at timestamptz not null default now()
);

create table if not exists library_blob (
  user_id text not null references "user" ("id") on delete cascade,
  track_id text not null,
  part integer not null,
  payload text not null,
  primary key (user_id, track_id, part)
);

create index if not exists library_blob_user_idx on library_blob (user_id);
