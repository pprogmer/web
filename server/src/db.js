import pg from 'pg'

export const db = new pg.Pool({ connectionString: process.env.DATABASE_URL })

export async function createTables() {
  await db.query(`
    create table if not exists users (
      id serial primary key,
      email text unique not null,
      password text not null,
      role text not null default 'user'
    );

    create table if not exists sessions (
      token text primary key,
      user_id int not null references users(id) on delete cascade
    );

    create table if not exists tasks (
      id serial primary key,
      user_id int not null references users(id) on delete cascade,
      file_name text not null,
      status text not null default 'queued',
      stage text,
      progress int not null default 0,
      error text,
      input bytea not null,
      input_type text not null,
      output bytea,
      created_at timestamptz not null default now(),
      started_at timestamptz,
      finished_at timestamptz
    );

    create table if not exists task_logs (
      id serial primary key,
      task_id int not null references tasks(id) on delete cascade,
      message text not null,
      created_at timestamptz not null default now()
    );
  `)
}

export function addLog(taskId, message) {
  return db.query('insert into task_logs (task_id, message) values ($1, $2)', [taskId, message]).catch(() => {})
}
