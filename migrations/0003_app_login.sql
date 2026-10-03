create table if not exists app_login (
  email text primary key,
  password_hash text not null,
  user_id text not null,
  created_at timestamptz not null default now()
);
