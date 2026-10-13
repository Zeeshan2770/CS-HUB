-- =====================================================================
-- CS12 portal: complete schema for a NEW, EMPTY Supabase project.
-- Run once in: Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to run again (uses IF NOT EXISTS / CREATE OR REPLACE / DROP IF EXISTS).
-- =====================================================================
begin;

create schema if not exists private;
grant usage on schema private to anon, authenticated;

-- New tables/functions in `public` must be granted explicitly (least privilege).
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;

-- ---------------------------------------------------------------------
-- 1. Types and tables
-- ---------------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('student','teacher','content_editor','admin','super_admin');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.question_source as enum ('original','supplementary');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role public.user_role not null default 'student',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chapters (
  id text primary key,
  number int not null unique,
  title text not null,
  summary text,
  source_pdf text,
  source_pages int,
  estimated_minutes int check (estimated_minutes is null or estimated_minutes > 0),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sections (
  id text primary key,
  chapter_id text not null references public.chapters(id) on delete cascade,
  title text not null,
  order_index int not null,
  published boolean not null default false,
  review_status text not null default 'unreviewed' check (review_status in ('unreviewed','in_review','verified')),
  estimated_minutes int check (estimated_minutes is null or estimated_minutes > 0),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists last_section_id text references public.sections(id) on delete set null,
  add column if not exists tz text not null default 'UTC' check (char_length(tz) <= 64);

create table if not exists public.lesson_blocks (
  id uuid primary key default gen_random_uuid(),
  section_id text not null references public.sections(id) on delete cascade,
  order_index int not null,
  block_type text not null check (block_type = any (array['objectives','definition','paragraph','subheading',
      'tidbit','code_pair','code_single','short_question','long_question','table','image'])),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  source_page int,
  created_at timestamptz not null default now()
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  chapter_id text not null references public.chapters(id) on delete cascade,
  section_id text references public.sections(id) on delete set null,
  question text not null check (char_length(question) between 3 and 2000),
  options jsonb not null,
  correct_answer int not null,
  explanation text,
  difficulty text default 'medium' check (difficulty in ('easy','medium','hard')),
  source_type public.question_source not null default 'original',
  source_page int,
  tags text[] default '{}',
  created_at timestamptz not null default now(),
  constraint questions_options_valid check (
    jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6
    and correct_answer >= 0 and correct_answer < jsonb_array_length(options))
);

create table if not exists public.lesson_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  section_id text not null references public.sections(id) on delete cascade,
  completed boolean not null default false,
  completed_at timestamptz,
  last_opened_at timestamptz not null default now(),
  primary key (user_id, section_id)
);

create table if not exists public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  section_id text not null references public.sections(id) on delete cascade,
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  constraint bookmarks_user_section_key unique (user_id, section_id)
);

create table if not exists public.flagged_questions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, question_id)
);

create table if not exists public.saved_code (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  code text not null check (char_length(code) <= 20000),
  updated_at timestamptz not null default now()
);

create table if not exists public.question_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  selected_answer int not null,
  is_correct boolean not null,
  attempted_at timestamptz not null default now()
);

create table if not exists public.study_goals (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  weekly_lessons_target int not null default 5 check (weekly_lessons_target between 1 and 100),
  updated_at timestamptz not null default now()
);

create table if not exists public.study_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  chapter_id text references public.chapters(id) on delete set null,
  section_id text references public.sections(id) on delete set null,
  due_date date,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null check (mode in ('practice','timed')),
  chapter_ids text[] not null default '{}',
  question_ids uuid[] not null,
  started_at timestamptz not null default now(),
  expires_at timestamptz,
  submitted_at timestamptz,
  status text not null default 'in_progress' check (status in ('in_progress','submitted','expired')),
  score int,
  total int not null
);

create table if not exists public.quiz_answers (
  session_id uuid not null references public.quiz_sessions(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  selected_answer int,
  is_correct boolean not null,
  primary key (session_id, question_id)
);

create table if not exists public.section_revisions (
  id uuid primary key default gen_random_uuid(),
  section_id text not null references public.sections(id) on delete cascade,
  snapshot jsonb not null,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target text,
  details jsonb,
  created_at timestamptz not null default now()
);


-- One row per student per local calendar day with any study activity (drives streaks).
create table if not exists public.study_activity (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  lessons int not null default 0,
  answers int not null default 0,
  primary key (user_id, day)
);

-- Spaced-repetition schedule, one card per student per question (see private.srs_update for the rule).
create table if not exists public.review_cards (
  user_id uuid not null references public.profiles(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  ease numeric(3,2) not null default 2.50 check (ease between 1.30 and 3.00),
  interval_days int not null default 0 check (interval_days between 0 and 180),
  reps int not null default 0,
  lapses int not null default 0,
  due_date date not null,
  last_reviewed date not null,
  primary key (user_id, question_id)
);
create index if not exists idx_review_due on public.review_cards(user_id, due_date);


-- Written (short / long) answers. The server only does an AUTOMATIC KEY-POINT CHECK; the mark is given by a teacher.
create table if not exists public.written_questions (
  id uuid primary key default gen_random_uuid(),
  chapter_id text not null references public.chapters(id) on delete cascade,
  section_id text references public.sections(id) on delete set null,
  kind text not null default 'short' check (kind in ('short','long')),
  prompt text not null check (char_length(prompt) between 3 and 2000),
  model_answer text not null check (char_length(model_answer) between 1 and 6000),
  key_points jsonb not null default '[]'::jsonb,   -- [{"label": "...", "keywords": ["a","b"]}]
  max_marks int not null default 5 check (max_marks between 1 and 50),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  constraint written_key_points_valid check (jsonb_typeof(key_points) = 'array' and jsonb_array_length(key_points) <= 12)
);

create table if not exists public.written_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  question_id uuid not null references public.written_questions(id) on delete cascade,
  answer text not null check (char_length(answer) between 5 and 5000),
  auto_matched jsonb not null default '[]'::jsonb,  -- labels of key points the automatic check found
  auto_total int not null default 0,
  submitted_at timestamptz not null default now(),
  status text not null default 'submitted' check (status in ('submitted','graded')),
  teacher_marks int check (teacher_marks is null or teacher_marks >= 0),
  teacher_feedback text check (teacher_feedback is null or char_length(teacher_feedback) <= 2000),
  graded_by uuid references public.profiles(id) on delete set null,
  graded_at timestamptz
);
create index if not exists idx_written_user on public.written_answers(user_id, submitted_at desc);
create index if not exists idx_written_queue on public.written_answers(status, submitted_at);

create index if not exists idx_sections_chapter on public.sections(chapter_id, order_index);
create index if not exists idx_blocks_section on public.lesson_blocks(section_id, order_index);
create index if not exists idx_questions_chapter on public.questions(chapter_id);
create index if not exists idx_attempts_user on public.question_attempts(user_id, attempted_at desc);
create index if not exists idx_progress_user on public.lesson_progress(user_id);
create index if not exists idx_tasks_user on public.study_tasks(user_id, completed, due_date);
create index if not exists idx_quiz_sessions_user on public.quiz_sessions(user_id, started_at desc);
create index if not exists idx_revisions_section on public.section_revisions(section_id, created_at desc);
create index if not exists idx_audit_created on public.audit_logs(created_at desc);

-- ---------------------------------------------------------------------
-- 2. Role helpers (private schema; not exposed through the API)
-- ---------------------------------------------------------------------
create or replace function private.is_editor_or_above() returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('content_editor','admin','super_admin'));
$$;
create or replace function private.is_admin_or_above() returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('admin','super_admin'));
$$;
create or replace function private.is_teacher_or_above() returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('teacher','content_editor','admin','super_admin'));
$$;
create or replace function private.is_super_admin() returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'super_admin');
$$;
grant execute on function private.is_editor_or_above(), private.is_admin_or_above(), private.is_super_admin(), private.is_teacher_or_above()
  to anon, authenticated;


-- Student's local "today" using the timezone saved on their profile (falls back to UTC if invalid).
create or replace function private.local_today(p_user uuid) returns date
language plpgsql stable security definer set search_path to 'public' as $$
declare z text; d date;
begin
  select tz into z from profiles where id = p_user;
  begin
    d := (now() at time zone coalesce(z, 'UTC'))::date;
  exception when others then
    d := (now() at time zone 'UTC')::date;
  end;
  return d;
end; $$;

create or replace function private.activity_from_progress() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  insert into study_activity (user_id, day, lessons) values (new.user_id, private.local_today(new.user_id), 1)
  on conflict (user_id, day) do update set lessons = study_activity.lessons + 1;
  return new;
end; $$;

create or replace function private.activity_from_attempt() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  insert into study_activity (user_id, day, answers) values (new.user_id, private.local_today(new.user_id), 1)
  on conflict (user_id, day) do update set answers = study_activity.answers + 1;
  return new;
end; $$;

drop trigger if exists trg_activity_progress on public.lesson_progress;
create trigger trg_activity_progress after insert or update on public.lesson_progress
  for each row execute function private.activity_from_progress();
drop trigger if exists trg_activity_attempt on public.question_attempts;
create trigger trg_activity_attempt after insert on public.question_attempts
  for each row execute function private.activity_from_attempt();

-- Spaced repetition (simplified SM-2). Applied on the server whenever an answer is graded.
--   wrong  : reps = 0, lapses + 1, interval = 1 day, ease - 0.20 (never below 1.30)
--   correct: reps + 1; interval = 1 day (1st), 3 days (2nd), then round(previous interval x ease), max 180;
--            ease + 0.05 (never above 3.00)
--   A correct answer on a card already reviewed TODAY does not advance it (so repeating a question
--   five times in one sitting cannot push it months away).
create or replace function private.srs_update(p_user uuid, p_q uuid, p_correct boolean) returns void
language plpgsql security definer set search_path to 'public' as $$
declare c record; today date := private.local_today(p_user); e numeric; r int; i int; l int;
begin
  select * into c from review_cards where user_id = p_user and question_id = p_q;
  if found and p_correct and c.last_reviewed = today then return; end if;
  e := coalesce(c.ease, 2.5); r := coalesce(c.reps, 0); i := coalesce(c.interval_days, 0); l := coalesce(c.lapses, 0);
  if p_correct then
    r := r + 1;
    i := least(180, case when r = 1 then 1 when r = 2 then 3 else greatest(i + 1, round(i * e)::int) end);
    e := least(e + 0.05, 3.00);
  else
    r := 0; l := l + 1; i := 1; e := greatest(e - 0.20, 1.30);
  end if;
  insert into review_cards (user_id, question_id, ease, interval_days, reps, lapses, due_date, last_reviewed)
  values (p_user, p_q, e, i, r, l, today + i, today)
  on conflict (user_id, question_id) do update
    set ease = excluded.ease, interval_days = excluded.interval_days, reps = excluded.reps, lapses = excluded.lapses,
        due_date = excluded.due_date, last_reviewed = excluded.last_reviewed;
end; $$;

-- ---------------------------------------------------------------------
-- 3. Signup trigger: every new account is a student. Nobody is auto-promoted.
-- ---------------------------------------------------------------------
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, nullif(new.raw_user_meta_data ->> 'full_name', ''), 'student')
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------
-- 4. Triggers: audit + timestamps
-- ---------------------------------------------------------------------
create or replace function private.audit_row() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare rid text;
begin
  rid := coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id');
  insert into public.audit_logs (actor_id, action, target, details)
  values (auth.uid(), tg_op || ' ' || tg_table_name, rid,
          case when tg_op = 'UPDATE' then jsonb_build_object('changed',
                 (select coalesce(jsonb_agg(k), '[]'::jsonb)
                    from jsonb_object_keys(to_jsonb(new)) k
                   where to_jsonb(new) -> k is distinct from to_jsonb(old) -> k))
               else null end);
  return coalesce(new, old);
end; $$;

create or replace function private.audit_role_change() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if new.role is distinct from old.role then
    insert into public.audit_logs (actor_id, action, target, details)
    values (auth.uid(), 'ROLE_CHANGE', new.id::text, jsonb_build_object('from', old.role, 'to', new.role));
  end if;
  return new;
end; $$;

create or replace function private.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end; $$;

create or replace function private.block_touches_section() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  update public.sections set updated_at = now() where id = coalesce(new.section_id, old.section_id);
  return coalesce(new, old);
end; $$;

drop trigger if exists trg_audit_chapters on public.chapters;
create trigger trg_audit_chapters after insert or update or delete on public.chapters for each row execute function private.audit_row();
drop trigger if exists trg_audit_sections on public.sections;
create trigger trg_audit_sections after insert or update or delete on public.sections for each row execute function private.audit_row();
drop trigger if exists trg_audit_questions on public.questions;
create trigger trg_audit_questions after insert or update or delete on public.questions for each row execute function private.audit_row();
drop trigger if exists trg_audit_role on public.profiles;
create trigger trg_audit_role after update of role on public.profiles for each row execute function private.audit_role_change();
drop trigger if exists trg_touch_chapters on public.chapters;
create trigger trg_touch_chapters before update on public.chapters for each row execute function private.touch_updated_at();
drop trigger if exists trg_touch_sections on public.sections;
create trigger trg_touch_sections before update on public.sections for each row execute function private.touch_updated_at();
drop trigger if exists trg_touch_profiles on public.profiles;
create trigger trg_touch_profiles before update on public.profiles for each row execute function private.touch_updated_at();
drop trigger if exists trg_blocks_touch_section on public.lesson_blocks;
create trigger trg_blocks_touch_section after insert or update or delete on public.lesson_blocks
  for each row execute function private.block_touches_section();

-- ---------------------------------------------------------------------
-- 5. Public view: questions WITHOUT answer keys, published content only
-- ---------------------------------------------------------------------
create or replace view public.questions_public as
  select q.id, q.chapter_id, q.section_id, q.question, q.options, q.difficulty,
         q.source_type, q.source_page, q.tags
  from public.questions q
  where q.chapter_id in (select id from public.chapters where published = true)
    and (q.section_id is null or q.section_id in (select id from public.sections where published = true));

create or replace view public.written_questions_public as
  select w.id, w.chapter_id, w.section_id, w.kind, w.prompt, w.max_marks
  from public.written_questions w
  where w.published = true
    and w.chapter_id in (select id from public.chapters where published = true)
    and (w.section_id is null or w.section_id in (select id from public.sections where published = true));

-- ---------------------------------------------------------------------
-- 6. Privileges (first gate) and Row Level Security (second gate)
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;

grant select on public.chapters, public.sections, public.lesson_blocks, public.questions_public to anon, authenticated;
grant insert, update, delete on public.chapters, public.sections, public.lesson_blocks to authenticated;
grant select, insert, update, delete on public.questions to authenticated;   -- RLS: staff only

grant select on public.profiles to authenticated;
grant update (full_name, last_section_id, tz) on public.profiles to authenticated; -- never `role`

grant select, insert, update, delete on public.lesson_progress, public.bookmarks, public.flagged_questions,
      public.saved_code, public.study_tasks to authenticated;
grant select, insert, update on public.study_goals to authenticated;
grant select on public.question_attempts, public.quiz_sessions, public.quiz_answers to authenticated; -- writes via RPC only
grant select, insert on public.section_revisions to authenticated;
grant select on public.audit_logs to authenticated;
grant select on public.written_questions_public to authenticated;
grant select, insert, update, delete on public.written_questions to authenticated;   -- RLS: staff only (model answers)
grant select on public.written_answers to authenticated;                              -- own, or teachers; writes via functions only
grant select on public.study_activity to authenticated;      -- written only by triggers
grant select, delete on public.review_cards to authenticated; -- written only by grading functions; delete = reset schedule

alter table public.profiles enable row level security;
alter table public.chapters enable row level security;
alter table public.sections enable row level security;
alter table public.lesson_blocks enable row level security;
alter table public.questions enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.bookmarks enable row level security;
alter table public.flagged_questions enable row level security;
alter table public.saved_code enable row level security;
alter table public.question_attempts enable row level security;
alter table public.study_goals enable row level security;
alter table public.study_tasks enable row level security;
alter table public.quiz_sessions enable row level security;
alter table public.quiz_answers enable row level security;
alter table public.section_revisions enable row level security;
alter table public.audit_logs enable row level security;
alter table public.written_questions enable row level security;
alter table public.written_answers enable row level security;
alter table public.study_activity enable row level security;
alter table public.review_cards enable row level security;

-- profiles
drop policy if exists profiles_select_own_or_admin on public.profiles;
create policy profiles_select_own_or_admin on public.profiles for select to authenticated
  using (id = auth.uid() or private.is_admin_or_above());
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- chapters
drop policy if exists chapters_read_published on public.chapters;
create policy chapters_read_published on public.chapters for select
  using (published = true or private.is_editor_or_above());
drop policy if exists chapters_insert_staff on public.chapters;
create policy chapters_insert_staff on public.chapters for insert to authenticated with check (private.is_editor_or_above());
drop policy if exists chapters_update_staff on public.chapters;
create policy chapters_update_staff on public.chapters for update to authenticated using (private.is_editor_or_above());
drop policy if exists chapters_delete_admin on public.chapters;
create policy chapters_delete_admin on public.chapters for delete to authenticated using (private.is_admin_or_above());

-- sections / blocks: visible only when the chapter AND the section are published
drop policy if exists sections_read_published on public.sections;
create policy sections_read_published on public.sections for select
  using ((published = true and exists (select 1 from public.chapters c where c.id = sections.chapter_id and c.published = true))
         or private.is_editor_or_above());
drop policy if exists sections_insert_staff on public.sections;
create policy sections_insert_staff on public.sections for insert to authenticated with check (private.is_editor_or_above());
drop policy if exists sections_update_staff on public.sections;
create policy sections_update_staff on public.sections for update to authenticated using (private.is_editor_or_above());
drop policy if exists sections_delete_staff on public.sections;
create policy sections_delete_staff on public.sections for delete to authenticated using (private.is_editor_or_above());

drop policy if exists lesson_blocks_read_published on public.lesson_blocks;
create policy lesson_blocks_read_published on public.lesson_blocks for select
  using (exists (select 1 from public.sections s join public.chapters c on c.id = s.chapter_id
                  where s.id = lesson_blocks.section_id and s.published = true and c.published = true)
         or private.is_editor_or_above());
drop policy if exists lesson_blocks_insert_staff on public.lesson_blocks;
create policy lesson_blocks_insert_staff on public.lesson_blocks for insert to authenticated with check (private.is_editor_or_above());
drop policy if exists lesson_blocks_update_staff on public.lesson_blocks;
create policy lesson_blocks_update_staff on public.lesson_blocks for update to authenticated using (private.is_editor_or_above());
drop policy if exists lesson_blocks_delete_staff on public.lesson_blocks;
create policy lesson_blocks_delete_staff on public.lesson_blocks for delete to authenticated using (private.is_editor_or_above());

-- questions table holds answer keys: staff only
drop policy if exists questions_read_staff on public.questions;
create policy questions_read_staff on public.questions for select to authenticated using (private.is_editor_or_above());
drop policy if exists questions_insert_staff on public.questions;
create policy questions_insert_staff on public.questions for insert to authenticated with check (private.is_editor_or_above());
drop policy if exists questions_update_staff on public.questions;
create policy questions_update_staff on public.questions for update to authenticated using (private.is_editor_or_above());
drop policy if exists questions_delete_staff on public.questions;
create policy questions_delete_staff on public.questions for delete to authenticated using (private.is_editor_or_above());

-- student-owned data: owner only
drop policy if exists progress_own on public.lesson_progress;
create policy progress_own on public.lesson_progress for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists bookmarks_own on public.bookmarks;
create policy bookmarks_own on public.bookmarks for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists flagged_own on public.flagged_questions;
create policy flagged_own on public.flagged_questions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists saved_code_own on public.saved_code;
create policy saved_code_own on public.saved_code for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists study_goals_own on public.study_goals;
create policy study_goals_own on public.study_goals for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists study_tasks_own on public.study_tasks;
create policy study_tasks_own on public.study_tasks for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- graded records: read-only for students; written only by the RPCs below
drop policy if exists attempts_read_own on public.question_attempts;
create policy attempts_read_own on public.question_attempts for select to authenticated using (user_id = auth.uid());
drop policy if exists quiz_sessions_read_own on public.quiz_sessions;
create policy quiz_sessions_read_own on public.quiz_sessions for select to authenticated using (user_id = auth.uid());
drop policy if exists quiz_answers_read_own on public.quiz_answers;
create policy quiz_answers_read_own on public.quiz_answers for select to authenticated
  using (exists (select 1 from public.quiz_sessions s where s.id = session_id and s.user_id = auth.uid()));

drop policy if exists activity_read_own on public.study_activity;
create policy activity_read_own on public.study_activity for select to authenticated using (user_id = auth.uid());
drop policy if exists review_cards_read_own on public.review_cards;
create policy review_cards_read_own on public.review_cards for select to authenticated using (user_id = auth.uid());
drop policy if exists review_cards_delete_own on public.review_cards;
create policy review_cards_delete_own on public.review_cards for delete to authenticated using (user_id = auth.uid());

drop policy if exists written_q_staff_all on public.written_questions;
drop policy if exists written_q_read on public.written_questions;
create policy written_q_read on public.written_questions for select to authenticated using (private.is_teacher_or_above());
drop policy if exists written_q_insert on public.written_questions;
create policy written_q_insert on public.written_questions for insert to authenticated with check (private.is_editor_or_above());
drop policy if exists written_q_update on public.written_questions;
create policy written_q_update on public.written_questions for update to authenticated using (private.is_editor_or_above());
drop policy if exists written_q_delete on public.written_questions;
create policy written_q_delete on public.written_questions for delete to authenticated using (private.is_editor_or_above());
drop policy if exists written_a_read on public.written_answers;
create policy written_a_read on public.written_answers for select to authenticated
  using (user_id = auth.uid() or private.is_teacher_or_above());

-- revisions (staff) and audit log (admins read; nobody writes directly)
drop policy if exists revisions_read_staff on public.section_revisions;
create policy revisions_read_staff on public.section_revisions for select to authenticated using (private.is_editor_or_above());
drop policy if exists revisions_insert_staff on public.section_revisions;
create policy revisions_insert_staff on public.section_revisions for insert to authenticated
  with check (private.is_editor_or_above() and created_by = auth.uid());
drop policy if exists audit_read_admin on public.audit_logs;
create policy audit_read_admin on public.audit_logs for select to authenticated using (private.is_admin_or_above());

-- ---------------------------------------------------------------------
-- 7. RPCs (SECURITY DEFINER; each checks the caller itself)
-- ---------------------------------------------------------------------
create or replace function public.grade_answer(p_question_id uuid, p_selected int)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare q record; ok boolean;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select qq.correct_answer, qq.explanation, jsonb_array_length(qq.options) as n into q
    from public.questions qq join public.questions_public qp on qp.id = qq.id
   where qq.id = p_question_id;
  if not found then raise exception 'question not found' using errcode = 'P0002'; end if;
  if p_selected is null or p_selected < 0 or p_selected >= q.n then
    raise exception 'invalid option' using errcode = '22023';
  end if;
  ok := (p_selected = q.correct_answer);
  insert into public.question_attempts (user_id, question_id, selected_answer, is_correct)
  values (auth.uid(), p_question_id, p_selected, ok);
  perform private.srs_update(auth.uid(), p_question_id, ok);
  return jsonb_build_object('correct', ok, 'correct_answer', q.correct_answer, 'explanation', q.explanation);
end; $$;

create or replace function public.start_quiz(p_mode text, p_chapter_ids text[], p_count int default 10, p_minutes int default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare ids uuid[]; sid uuid; exp timestamptz;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_mode not in ('practice','timed') then raise exception 'bad mode' using errcode = '22023'; end if;
  p_count := least(greatest(coalesce(p_count, 10), 1), 50);
  select array_agg(id) into ids from (
    select id from public.questions_public
    where (p_chapter_ids is null or cardinality(p_chapter_ids) = 0 or chapter_id = any (p_chapter_ids))
    order by random() limit p_count) s;
  if ids is null then raise exception 'no questions available' using errcode = 'P0002'; end if;
  if p_mode = 'timed' then
    exp := now() + make_interval(mins => least(greatest(coalesce(p_minutes, cardinality(ids)), 1), 180));
  end if;
  insert into public.quiz_sessions (user_id, mode, chapter_ids, question_ids, expires_at, total)
  values (auth.uid(), p_mode, coalesce(p_chapter_ids, '{}'), ids, exp, cardinality(ids))
  returning id into sid;
  return jsonb_build_object('session_id', sid, 'mode', p_mode, 'expires_at', exp, 'started_at', now(),
    'questions', (select jsonb_agg(to_jsonb(qp) - 'tags' order by array_position(ids, qp.id))
                    from public.questions_public qp where qp.id = any (ids)));
end; $$;

-- Resume an interrupted session (answer keys still withheld)
create or replace function public.resume_quiz(p_session uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare s record;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into s from public.quiz_sessions where id = p_session and user_id = auth.uid() for update;
  if not found then raise exception 'session not found' using errcode = 'P0002'; end if;
  if s.status <> 'in_progress' then return jsonb_build_object('status', s.status); end if;
  if s.expires_at is not null and now() > s.expires_at + interval '30 seconds' then
    update public.quiz_sessions set status = 'expired' where id = s.id;
    return jsonb_build_object('status', 'expired');
  end if;
  return jsonb_build_object('status', 'in_progress', 'session_id', s.id, 'mode', s.mode,
    'expires_at', s.expires_at, 'started_at', s.started_at,
    'questions', (select jsonb_agg(to_jsonb(qp) - 'tags' order by array_position(s.question_ids, qp.id))
                    from public.questions_public qp where qp.id = any (s.question_ids)));
end; $$;

-- Server-side grading. p_answers: {"<question_uuid>": <option index>, ...}
create or replace function public.submit_quiz(p_session uuid, p_answers jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare s record; qid uuid; sel int; q record; sc int := 0; ok boolean;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into s from public.quiz_sessions where id = p_session and user_id = auth.uid() for update;
  if not found then raise exception 'session not found' using errcode = 'P0002'; end if;
  if s.status <> 'in_progress' then raise exception 'already %', s.status using errcode = '55000'; end if;
  if s.expires_at is not null and now() > s.expires_at + interval '30 seconds' then
    update public.quiz_sessions set status = 'expired' where id = s.id;
    return jsonb_build_object('expired', true);
  end if;
  foreach qid in array s.question_ids loop
    sel := case when p_answers ? qid::text and jsonb_typeof(p_answers -> qid::text) = 'number'
                then (p_answers ->> qid::text)::int else null end;
    select correct_answer, jsonb_array_length(options) n into q from public.questions where id = qid;
    if sel is not null and (sel < 0 or sel >= q.n) then sel := null; end if;
    ok := (sel is not null and sel = q.correct_answer);
    if ok then sc := sc + 1; end if;
    insert into public.quiz_answers (session_id, question_id, selected_answer, is_correct) values (s.id, qid, sel, ok);
    if sel is not null then
      insert into public.question_attempts (user_id, question_id, selected_answer, is_correct) values (auth.uid(), qid, sel, ok);
      perform private.srs_update(auth.uid(), qid, ok);
    end if;
  end loop;
  update public.quiz_sessions set status = 'submitted', submitted_at = now(), score = sc where id = s.id;
  return jsonb_build_object('expired', false, 'score', sc, 'total', s.total);
end; $$;

-- Full review of a SUBMITTED session (answers + explanations revealed only now)
create or replace function public.quiz_review(p_session uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare s record;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into s from public.quiz_sessions where id = p_session and user_id = auth.uid();
  if not found then raise exception 'session not found' using errcode = 'P0002'; end if;
  if s.status <> 'submitted' then raise exception 'not submitted' using errcode = '55000'; end if;
  return jsonb_build_object(
    'session', to_jsonb(s) - 'question_ids',
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'question_id', a.question_id, 'chapter_id', q.chapter_id, 'question', q.question, 'options', q.options,
        'selected', a.selected_answer, 'correct', a.is_correct, 'correct_answer', q.correct_answer,
        'explanation', q.explanation) order by array_position(s.question_ids, a.question_id))
      from public.quiz_answers a join public.questions q on q.id = a.question_id where a.session_id = s.id), '[]'::jsonb));
end; $$;

create or replace function public.admin_set_user_role(p_user uuid, p_role public.user_role)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not private.is_super_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'cannot change your own role' using errcode = '42501'; end if;
  update public.profiles set role = p_role where id = p_user;
  if not found then raise exception 'user not found' using errcode = 'P0002'; end if;
end; $$;

create or replace function public.admin_dashboard_stats()
returns jsonb language plpgsql security definer set search_path to 'public' as $$
begin
  if not private.is_editor_or_above() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'students',            (select count(*) from profiles where role = 'student'),
    'active_students_7d',  (select count(distinct u) from (
                              select user_id u from lesson_progress where last_opened_at > now() - interval '7 days'
                              union select user_id from question_attempts where attempted_at > now() - interval '7 days') a),
    'published_chapters',  (select count(*) from chapters where published),
    'published_sections',  (select count(*) from sections where published),
    'draft_sections',      (select count(*) from sections where not published),
    'unverified_sections', (select count(*) from sections where review_status <> 'verified'),
    'questions',           (select count(*) from questions),
    'quizzes_submitted',   (select count(*) from quiz_sessions where status = 'submitted'),
    'question_attempts',   (select count(*) from question_attempts),
    'written_waiting',     (select count(*) from written_answers where status = 'submitted'));
end; $$;

create or replace function public.admin_list_students(p_search text default null, p_limit int default 25, p_offset int default 0)
returns table (id uuid, email text, full_name text, role public.user_role, created_at timestamptz,
               completed_sections bigint, last_active timestamptz, total_count bigint)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not private.is_admin_or_above() then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select p.id, p.email, p.full_name, p.role, p.created_at,
         (select count(*) from lesson_progress lp where lp.user_id = p.id and lp.completed),
         (select max(lp.last_opened_at) from lesson_progress lp where lp.user_id = p.id),
         count(*) over ()
    from profiles p
   where coalesce(p_search, '') = '' or p.email ilike '%' || p_search || '%' or p.full_name ilike '%' || p_search || '%'
   order by p.created_at desc
   limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end; $$;

create or replace function public.save_section_revision(p_section text, p_note text default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare rid uuid;
begin
  if not private.is_editor_or_above() then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into section_revisions (section_id, snapshot, note, created_by)
  select p_section,
         jsonb_build_object('section', to_jsonb(s), 'blocks',
           coalesce((select jsonb_agg(to_jsonb(b) order by b.order_index) from lesson_blocks b where b.section_id = s.id), '[]'::jsonb)),
         p_note, auth.uid()
    from sections s where s.id = p_section
  returning id into rid;
  if rid is null then raise exception 'section not found' using errcode = 'P0002'; end if;
  insert into audit_logs (actor_id, action, target, details) values (auth.uid(), 'SAVE_REVISION', p_section, jsonb_build_object('revision', rid));
  return rid;
end; $$;

create or replace function public.restore_section_revision(p_revision uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare r record;
begin
  if not private.is_editor_or_above() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into r from section_revisions where id = p_revision;
  if not found then raise exception 'revision not found' using errcode = 'P0002'; end if;
  perform public.save_section_revision(r.section_id, 'auto: before restore');
  delete from lesson_blocks where section_id = r.section_id;
  insert into lesson_blocks (section_id, order_index, block_type, content, source_page)
  select r.section_id, (b ->> 'order_index')::int, b ->> 'block_type', b -> 'content', nullif(b ->> 'source_page','')::int
    from jsonb_array_elements(r.snapshot -> 'blocks') b;
  insert into audit_logs (actor_id, action, target, details) values (auth.uid(), 'RESTORE_REVISION', r.section_id, jsonb_build_object('revision', p_revision));
end; $$;

-- Submit a written answer. The server runs the AUTOMATIC KEY-POINT CHECK (whole-word / whole-phrase matches of the
-- keywords the author listed) and returns the model answer. It never produces a mark: only a teacher does (grade_written).
create or replace function public.submit_written(p_question uuid, p_answer text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare q record; kp jsonb; matched jsonb := '[]'::jsonb; kw text; hit boolean; ans text; rid uuid; total int := 0; n_recent int;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  ans := trim(coalesce(p_answer, ''));
  if char_length(ans) < 5 then raise exception 'answer too short' using errcode = '22023'; end if;
  if char_length(ans) > 5000 then raise exception 'answer too long' using errcode = '22023'; end if;
  select count(*) into n_recent from written_answers where user_id = auth.uid() and submitted_at > now() - interval '1 minute';
  if n_recent >= 10 then raise exception 'too many submissions, wait a minute' using errcode = '54000'; end if;
  select w.* into q from written_questions w join written_questions_public p on p.id = w.id where w.id = p_question;
  if not found then raise exception 'question not found' using errcode = 'P0002'; end if;
  for kp in select * from jsonb_array_elements(q.key_points) loop
    total := total + 1; hit := false;
    for kw in select jsonb_array_elements_text(coalesce(kp -> 'keywords', '[]'::jsonb)) loop
      if char_length(trim(kw)) > 0 and ans ~* ('\m' || regexp_replace(trim(kw), '([.*+?^${}()|\[\]\\])', '\\\1', 'g') || '\M') then hit := true; exit; end if;
    end loop;
    if hit then matched := matched || to_jsonb(kp ->> 'label'); end if;
  end loop;
  insert into written_answers (user_id, question_id, answer, auto_matched, auto_total)
  values (auth.uid(), p_question, ans, matched, total) returning id into rid;
  return jsonb_build_object('id', rid, 'matched', matched, 'total', total,
    'points', (select coalesce(jsonb_agg(k ->> 'label'), '[]'::jsonb) from jsonb_array_elements(q.key_points) k),
    'model_answer', q.model_answer);
end; $$;

-- Teacher marking. Only teachers (and above) may call it; marks are bounded by the question's maximum.
create or replace function public.grade_written(p_answer uuid, p_marks int, p_feedback text default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare a record; mx int;
begin
  if not private.is_teacher_or_above() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into a from written_answers where id = p_answer for update;
  if not found then raise exception 'answer not found' using errcode = 'P0002'; end if;
  select max_marks into mx from written_questions where id = a.question_id;
  if p_marks is null or p_marks < 0 or p_marks > mx then raise exception 'marks must be between 0 and %', mx using errcode = '22023'; end if;
  if a.user_id = auth.uid() then raise exception 'you cannot mark your own answer' using errcode = '42501'; end if;
  update written_answers set status = 'graded', teacher_marks = p_marks, teacher_feedback = nullif(trim(coalesce(p_feedback, '')), ''),
         graded_by = auth.uid(), graded_at = now() where id = p_answer;
  insert into audit_logs (actor_id, action, target, details)
  values (auth.uid(), 'GRADE_WRITTEN', p_answer::text, jsonb_build_object('marks', p_marks, 'max', mx, 'student', a.user_id));
end; $$;

-- A student's own written answer, with the model answer revealed (only after they have submitted something).
create or replace function public.my_written(p_question uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare q record;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select w.* into q from written_questions w join written_questions_public p on p.id = w.id where w.id = p_question;
  if not found then raise exception 'question not found' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'submissions', (select coalesce(jsonb_agg(to_jsonb(a) - 'user_id' order by a.submitted_at desc), '[]'::jsonb)
                     from written_answers a where a.user_id = auth.uid() and a.question_id = p_question),
    'model_answer', case when exists (select 1 from written_answers a where a.user_id = auth.uid() and a.question_id = p_question) then q.model_answer end,
    'points', case when exists (select 1 from written_answers a where a.user_id = auth.uid() and a.question_id = p_question)
                   then (select coalesce(jsonb_agg(k ->> 'label'), '[]'::jsonb) from jsonb_array_elements(q.key_points) k) end);
end; $$;

-- Study streak from study_activity (local days). The streak stays alive if you studied yesterday but not yet today.
create or replace function public.my_streak() returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare today date; d date; prev date; run int := 0; best int := 0; cur int := 0;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  today := private.local_today(auth.uid());
  for d in select day from study_activity where user_id = auth.uid() order by day loop
    if prev is not null and d = prev + 1 then run := run + 1; else run := 1; end if;
    if run > best then best := run; end if;
    prev := d;
  end loop;
  if prev is not null and prev >= today - 1 then cur := run; end if;
  return jsonb_build_object('current', cur, 'longest', best, 'today', today,
    'active_today', exists (select 1 from study_activity where user_id = auth.uid() and day = today),
    'recent_days', (select coalesce(jsonb_agg(day order by day), '[]'::jsonb) from study_activity
                     where user_id = auth.uid() and day > today - 14));
end; $$;

-- Full-text-ish search over lesson text. SECURITY INVOKER: RLS hides drafts from students.
create or replace function public.search_content(p_query text, p_chapter text default null, p_limit int default 40)
returns table (section_id text, chapter_id text, section_title text, snippet text)
language plpgsql stable set search_path to 'public' as $$
declare t text := lower(trim(coalesce(p_query, ''))); pat text;
begin
  if char_length(t) < 2 then return; end if;
  pat := '%' || replace(replace(replace(t, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
  select s.id, s.chapter_id, s.title,
         substr(x.txt, greatest(position(t in lower(x.txt)) - 60, 1), 200)
    from lesson_blocks b
    join sections s on s.id = b.section_id
   cross join lateral (select regexp_replace(b.content::text, '[{}\[\]"\\]', ' ', 'g') as txt) x
   where lower(x.txt) like pat and (p_chapter is null or s.chapter_id = p_chapter)
   order by s.chapter_id, s.order_index, b.order_index
   limit least(greatest(p_limit, 1), 100);
end; $$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.search_content(text, text, int) to anon, authenticated;
grant execute on function public.grade_answer(uuid, int), public.start_quiz(text, text[], int, int),
  public.resume_quiz(uuid), public.submit_quiz(uuid, jsonb), public.quiz_review(uuid),
  public.admin_set_user_role(uuid, public.user_role), public.admin_dashboard_stats(),
  public.admin_list_students(text, int, int), public.save_section_revision(text, text),
  public.restore_section_revision(uuid), public.my_streak(),
  public.submit_written(uuid, text), public.grade_written(uuid, int, text), public.my_written(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 8. Storage: public-read bucket for lesson images; only editors upload.
--    SVG is deliberately not allowed (it can carry scripts).
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lesson-assets', 'lesson-assets', true, 5242880, array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists lesson_assets_read on storage.objects;
create policy lesson_assets_read on storage.objects for select using (bucket_id = 'lesson-assets');
drop policy if exists lesson_assets_insert on storage.objects;
create policy lesson_assets_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'lesson-assets' and private.is_editor_or_above());
drop policy if exists lesson_assets_update on storage.objects;
create policy lesson_assets_update on storage.objects for update to authenticated
  using (bucket_id = 'lesson-assets' and private.is_editor_or_above());
drop policy if exists lesson_assets_delete on storage.objects;
create policy lesson_assets_delete on storage.objects for delete to authenticated
  using (bucket_id = 'lesson-assets' and private.is_admin_or_above());

commit;
