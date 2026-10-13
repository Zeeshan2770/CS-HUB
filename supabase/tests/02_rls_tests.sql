-- Executes attacks and permitted actions as real DB roles against the migrated schema.
\set ON_ERROR_STOP on
drop schema if exists tst cascade;
create schema tst;
create table tst.results(n serial, label text, pass boolean, detail text);
create table tst.ctx(k text primary key, v text);
create table tst.ids(id text primary key, v text);
insert into tst.ids values ('A','11111111-1111-1111-1111-111111111111'),('B','22222222-2222-2222-2222-222222222222'),('E','33333333-3333-3333-3333-333333333333'),('AD','44444444-4444-4444-4444-444444444444'),('S','55555555-5555-5555-5555-555555555555'),('F','66666666-6666-6666-6666-666666666666'),('Q1','aaaaaaaa-0000-0000-0000-000000000001'),('Q2','aaaaaaaa-0000-0000-0000-000000000002'),('Q3','aaaaaaaa-0000-0000-0000-000000000003');
grant usage on schema tst to public; grant all on tst.ctx to public;

create function tst.run(p_label text, p_sql text, p_role text, p_uid uuid, p_kind text, p_expected text default null)
returns void language plpgsql as $$
declare val text; n bigint; err text; ok boolean; k text;
begin
  foreach k in array array['AD','A','B','E','S','F','Q1','Q2','Q3'] loop
    p_sql := replace(p_sql, '{'||k||'}', quote_literal((select i.v from tst.ids i where i.id=k)));
  end loop;
  begin
    perform set_config('request.jwt.claims', case when p_uid is null then '{}' else json_build_object('sub', p_uid, 'role', p_role)::text end, true);
    execute format('set local role %I', p_role);
    if p_kind = 'scalar' then execute p_sql into val;
    else execute p_sql; get diagnostics n = row_count; end if;
    execute 'reset role';
  exception when others then
    err := sqlerrm;
  end;
  execute 'reset role';
  ok := case p_kind
    when 'ok'     then err is null
    when 'error'  then err is not null and (p_expected is null or err ilike '%'||p_expected||'%')
    when 'rows'   then err is null and n = p_expected::bigint
    when 'scalar' then err is null and val is not distinct from p_expected end;
  insert into tst.results(label, pass, detail) values (p_label, ok, coalesce(err, val, n::text));
end $$;

-- ---- seed (as postgres) ----
insert into auth.users(id,email) values
 ('11111111-1111-1111-1111-111111111111','a@t.io'),('22222222-2222-2222-2222-222222222222','b@t.io'),
 ('33333333-3333-3333-3333-333333333333','e@t.io'),('44444444-4444-4444-4444-444444444444','ad@t.io'),
 ('55555555-5555-5555-5555-555555555555','s@t.io'),('66666666-6666-6666-6666-666666666666','f@t.io');
update profiles set role='content_editor' where id='33333333-3333-3333-3333-333333333333';
update profiles set role='admin'          where id='44444444-4444-4444-4444-444444444444';
update profiles set role='super_admin'    where id='55555555-5555-5555-5555-555555555555';
insert into chapters(id,number,title,source_pdf,source_pages,published) values ('c1',1,'Pub','x.pdf',1,true),('c2',2,'Unpub','y.pdf',1,false);
insert into sections(id,chapter_id,title,order_index,published) values ('s1','c1','S1',1,true),('s2','c1','S2 draft',2,false),('s3','c2','S3',1,true);
insert into lesson_blocks(section_id,order_index,block_type,content) values ('s1',1,'paragraph','{"text":"ORIGINAL"}'),('s2',1,'paragraph','{"text":"draft"}');
insert into questions(id,chapter_id,section_id,question,options,correct_answer,explanation) values
 ('aaaaaaaa-0000-0000-0000-000000000001','c1','s1','Q1?','["a","b","c"]',1,'because b'),
 ('aaaaaaaa-0000-0000-0000-000000000002','c1','s2','Q2 draft section?','["a","b"]',0,'x'),
 ('aaaaaaaa-0000-0000-0000-000000000003','c2',null,'Q3 unpub chapter?','["a","b"]',0,'x');


-- ===== signup / role escalation =====
select tst.run('first signup is NOT auto super_admin', 'select role::text from profiles where id={A}', 'postgres', null, 'scalar', 'student');
select tst.run('student cannot set own role', 'update profiles set role=''super_admin'' where id={A}', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'error', 'permission denied');
select tst.run('student cannot insert profile row with role', 'insert into profiles(id,role) values ({A},''super_admin'')', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'error', 'permission denied');
select tst.run('student can update own full_name', 'update profiles set full_name=''A'' where id={A}', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'rows', '1');
select tst.run('student cannot edit another profile', 'update profiles set full_name=''hax'' where id={B}', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'rows', '0');
select tst.run('student sees only own profile', 'select count(*) from profiles', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'scalar', '1');
select tst.run('admin sees all profiles', 'select count(*) from profiles', 'authenticated', '44444444-4444-4444-4444-444444444444'::uuid, 'scalar', '6');
select tst.run('content editor cannot list students', 'select count(*) from profiles', 'authenticated', '33333333-3333-3333-3333-333333333333'::uuid, 'scalar', '1');
select tst.run('anon cannot read profiles', 'select count(*) from profiles', 'anon', null, 'error', 'permission denied');
select tst.run('editor cannot change roles', 'select admin_set_user_role({B},''admin'')', 'authenticated', '33333333-3333-3333-3333-333333333333'::uuid, 'error', 'forbidden');
select tst.run('admin cannot change roles', 'select admin_set_user_role({B},''admin'')', 'authenticated', '44444444-4444-4444-4444-444444444444'::uuid, 'error', 'forbidden');
select tst.run('super_admin cannot change own role', 'select admin_set_user_role({S},''student'')', 'authenticated', '55555555-5555-5555-5555-555555555555'::uuid, 'error', 'own role');
select tst.run('super_admin can promote a student', 'select admin_set_user_role({F},''teacher'')', 'authenticated', '55555555-5555-5555-5555-555555555555'::uuid, 'ok');
select tst.run('role change audited', 'select count(*) from audit_logs where action=''ROLE_CHANGE'' and details->>''to''=''teacher''', 'postgres', null, 'scalar', '1');

-- ===== public content visibility =====
select tst.run('anon sees only published chapters', 'select count(*) from chapters', 'anon', null, 'scalar', '1');
select tst.run('anon sees only published sections', 'select count(*) from sections', 'anon', null, 'scalar', '1');
select tst.run('anon cannot see draft-section blocks', 'select count(*) from lesson_blocks where section_id=''s2''', 'anon', null, 'scalar', '0');
select tst.run('anon cannot read questions table (answer keys)', 'select count(*) from questions', 'anon', null, 'error', 'permission denied');
select tst.run('student sees 0 rows of questions table', 'select count(*) from questions', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'scalar', '0');
select tst.run('editor sees all questions', 'select count(*) from questions', 'authenticated', '33333333-3333-3333-3333-333333333333'::uuid, 'scalar', '3');
select tst.run('questions_public hides draft-section + unpublished-chapter questions', 'select count(*) from questions_public', 'anon', null, 'scalar', '1');
select tst.run('questions_public exposes no answer key column', 'select count(*) from information_schema.columns where table_name=''questions_public'' and column_name in (''correct_answer'',''explanation'')', 'postgres', null, 'scalar', '0');

-- ===== grading & attempts =====
select tst.run('student cannot forge attempt rows', 'insert into question_attempts(user_id,question_id,selected_answer,is_correct) values ({A},{Q1},1,true)', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'error', 'permission denied');
select tst.run('anon cannot call grade_answer', 'select grade_answer({Q1},1)', 'anon', null, 'error', 'permission denied');
select tst.run('grade_answer correct', 'select (grade_answer({Q1},1)->>''correct'')', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'scalar', 'true');
select tst.run('grade_answer wrong', 'select (grade_answer({Q1},0)->>''correct'')', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'scalar', 'false');
select tst.run('grade_answer rejects draft-section question', 'select grade_answer({Q2},0)', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'error', 'not found');
select tst.run('grade_answer rejects unpublished-chapter question', 'select grade_answer({Q3},0)', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'error', 'not found');
select tst.run('grade_answer rejects out-of-range option', 'select grade_answer({Q1},9)', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'error', 'invalid option');
select tst.run('attempts recorded server-side (2)', 'select count(*) from question_attempts', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'scalar', '2');
select tst.run('other student cannot see my attempts', 'select count(*) from question_attempts', 'authenticated', '22222222-2222-2222-2222-222222222222'::uuid, 'scalar', '0');

-- ===== quiz sessions =====
select tst.run('start timed quiz', 'insert into tst.ctx select ''sid'', (start_quiz(''timed'', array[''c1''], 5, 1) ->> ''session_id'')', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'ok');
select tst.run('start_quiz leaks no answer key', 'insert into tst.ctx select ''qj'', start_quiz(''practice'', array[''c1''], 5, null)::text', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'ok');
select tst.run('  ...quiz payload has no correct_answer', 'select (v like ''%correct_answer%'')::text from tst.ctx where k=''qj''', 'postgres', null, 'scalar', 'false');
select tst.run('  ...quiz only contains the 1 eligible question', 'select cardinality(question_ids)::text from quiz_sessions where id=(select v::uuid from tst.ctx where k=''sid'')', 'postgres', null, 'scalar', '1');
select tst.run('student cannot insert quiz_sessions directly', 'insert into quiz_sessions(user_id,mode,question_ids,total) values ({A},''practice'',array[{Q1}::uuid],1)', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'error', 'permission denied');
select tst.run('student cannot edit own score', 'update quiz_sessions set score=99', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'error', 'permission denied');
select tst.run('other student cannot submit my session', 'select submit_quiz((select v::uuid from tst.ctx where k=''sid''), ''{}''::jsonb)', 'authenticated', '22222222-2222-2222-2222-222222222222'::uuid, 'error', 'not found');
select tst.run('submit_quiz graded server-side (score 1/1)', 'select (submit_quiz((select v::uuid from tst.ctx where k=''sid''), jsonb_build_object({Q1}::text,1)) ->> ''score'')', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'scalar', '1');
select tst.run('double submit rejected', 'select submit_quiz((select v::uuid from tst.ctx where k=''sid''), ''{}''::jsonb)', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'error', 'already');
insert into quiz_sessions(id,user_id,mode,question_ids,expires_at,total) values ('bbbbbbbb-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','timed',array['aaaaaaaa-0000-0000-0000-000000000001'::uuid], now() - interval '5 minutes',1);
select tst.run('late submission returns expired flag', 'select (submit_quiz(''bbbbbbbb-0000-0000-0000-000000000001'', jsonb_build_object({Q1}::text,1)) ->> ''expired'')', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'scalar', 'true');
select tst.run('expired session marked expired', 'select status from quiz_sessions where id=''bbbbbbbb-0000-0000-0000-000000000001''', 'postgres', null, 'scalar', 'expired');

-- ===== student-owned data =====
select tst.run('student writes own progress', 'insert into lesson_progress(user_id,section_id,completed) values ({A},''s1'',true)', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'rows', '1');
select tst.run('student cannot write progress for someone else', 'insert into lesson_progress(user_id,section_id,completed) values ({B},''s1'',true)', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'error', 'row-level security');
select tst.run('other student cannot read my progress', 'select count(*) from lesson_progress', 'authenticated', '22222222-2222-2222-2222-222222222222'::uuid, 'scalar', '0');
select tst.run('editor cannot read student progress', 'select count(*) from lesson_progress', 'authenticated', '33333333-3333-3333-3333-333333333333'::uuid, 'scalar', '0');
select tst.run('student: bookmark once', 'insert into bookmarks(user_id,section_id) values ({A},''s1'')', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'rows', '1');
select tst.run('student: duplicate bookmark rejected', 'insert into bookmarks(user_id,section_id) values ({A},''s1'')', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'error', 'duplicate');
select tst.run('student study task own', 'insert into study_tasks(user_id,title) values ({A},''Revise ch1'')', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'rows', '1');
select tst.run('student cannot create task for another', 'insert into study_tasks(user_id,title) values ({B},''x'')', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'error', 'row-level security');
select tst.run('other student cannot see my tasks', 'select count(*) from study_tasks', 'authenticated', '22222222-2222-2222-2222-222222222222'::uuid, 'scalar', '0');

-- ===== content admin / audit =====
select tst.run('student cannot edit chapters', 'update chapters set title=''hax''', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'rows', '0');
select tst.run('student cannot insert lesson_blocks', 'insert into lesson_blocks(section_id,order_index,block_type,content) values (''s1'',9,''paragraph'',''{}'')', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'error', 'row-level security');
select tst.run('editor can edit chapter', 'update chapters set title=''Pub v2'' where id=''c1''', 'authenticated', '33333333-3333-3333-3333-333333333333'::uuid, 'rows', '1');
select tst.run('chapter edit audited with actor', 'select count(*) from audit_logs where action=''UPDATE chapters'' and actor_id={E}', 'postgres', null, 'scalar', '1');
select tst.run('editor cannot delete chapter', 'delete from chapters where id=''c2''', 'authenticated', '33333333-3333-3333-3333-333333333333'::uuid, 'rows', '0');
select tst.run('editor cannot forge audit rows', 'insert into audit_logs(action) values (''x'')', 'authenticated', '33333333-3333-3333-3333-333333333333'::uuid, 'error', 'permission denied');
select tst.run('editor cannot read audit log', 'select count(*) from audit_logs', 'authenticated', '33333333-3333-3333-3333-333333333333'::uuid, 'scalar', '0');
select tst.run('admin can read audit log', 'select (count(*) > 0)::text from audit_logs', 'authenticated', '44444444-4444-4444-4444-444444444444'::uuid, 'scalar', 'true');
select tst.run('nobody can delete audit rows', 'delete from audit_logs', 'authenticated', '55555555-5555-5555-5555-555555555555'::uuid, 'error', 'permission denied');
select tst.run('student cannot call admin stats', 'select admin_dashboard_stats()', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'error', 'forbidden');
select tst.run('editor gets admin stats (real counts)', 'select (admin_dashboard_stats() ->> ''published_chapters'')', 'authenticated', '33333333-3333-3333-3333-333333333333'::uuid, 'scalar', '1');

-- ===== revisions =====
select tst.run('student cannot save revision', 'select save_section_revision(''s1'',''x'')', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'error', 'forbidden');
select tst.run('editor saves revision', 'select save_section_revision(''s1'',''before edit'')', 'authenticated', '33333333-3333-3333-3333-333333333333'::uuid, 'ok');
update lesson_blocks set content='{"text":"CHANGED"}' where section_id='s1';
select tst.run('editor restores revision', 'select restore_section_revision((select id from section_revisions where section_id=''s1'' order by created_at asc limit 1))', 'authenticated', '33333333-3333-3333-3333-333333333333'::uuid, 'ok');
select tst.run('restore brought back original block', 'select content->>''text'' from lesson_blocks where section_id=''s1''', 'postgres', null, 'scalar', 'ORIGINAL');
select tst.run('student cannot read revisions', 'select count(*) from section_revisions', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'scalar', '0');

-- ===== storage =====
select tst.run('student cannot upload lesson asset', 'insert into storage.objects(bucket_id,name) values (''lesson-assets'',''a.png'')', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'error', 'row-level security');
select tst.run('editor can upload lesson asset', 'insert into storage.objects(bucket_id,name) values (''lesson-assets'',''a.png'')', 'authenticated', '33333333-3333-3333-3333-333333333333'::uuid, 'rows', '1');
select tst.run('anyone can read lesson assets', 'select count(*) from storage.objects where bucket_id=''lesson-assets''', 'anon', null, 'scalar', '1');
select tst.run('bucket rejects SVG (not in allow-list)', 'select (not ''image/svg+xml'' = any(allowed_mime_types))::text from storage.buckets where id=''lesson-assets''', 'postgres', null, 'scalar', 'true');
select tst.run('admin can delete chapter (cascade + audit trigger on DELETE)', 'delete from chapters where id=''c2''', 'authenticated', '44444444-4444-4444-4444-444444444444'::uuid, 'rows', '1');

insert into quiz_sessions(id,user_id,mode,question_ids,expires_at,total) values ('cccccccc-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','timed',array['aaaaaaaa-0000-0000-0000-000000000001'::uuid], now() + interval '10 minutes',1);

-- ===== new in schema.sql: search, resume, review, student list, constraints =====
select tst.run('anon search finds published text', 'select count(*) from search_content(''original'')', 'anon', null, 'scalar', '1');
select tst.run('anon search cannot see draft text', 'select count(*) from search_content(''draft'')', 'anon', null, 'scalar', '0');
select tst.run('editor search sees draft text', 'select count(*) from search_content(''draft'')', 'authenticated', '33333333-3333-3333-3333-333333333333'::uuid, 'scalar', '1');
select tst.run('search: wildcard input is escaped', 'select count(*) from search_content(''%%'')', 'anon', null, 'scalar', '0');
select tst.run('resume_quiz returns in-progress session', 'select (resume_quiz(''cccccccc-0000-0000-0000-000000000001'') ->> ''status'')', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'scalar', 'in_progress');
select tst.run('resume_quiz: other student cannot resume', 'select resume_quiz(''cccccccc-0000-0000-0000-000000000001'')', 'authenticated', '22222222-2222-2222-2222-222222222222'::uuid, 'error', 'not found');
select tst.run('quiz_review refuses in-progress session', 'select quiz_review(''cccccccc-0000-0000-0000-000000000001'')', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'error', 'not submitted');
select tst.run('quiz_review returns answer key after submit', 'select (quiz_review((select v::uuid from tst.ctx where k=''sid'')) -> ''items'' -> 0 ->> ''correct_answer'')', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'scalar', '1');
select tst.run('quiz_review: other student denied', 'select quiz_review((select v::uuid from tst.ctx where k=''sid''))', 'authenticated', '22222222-2222-2222-2222-222222222222'::uuid, 'error', 'not found');
select tst.run('student cannot list students via RPC', 'select count(*) from admin_list_students()', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'error', 'forbidden');
select tst.run('admin lists students with search', 'select count(*) from admin_list_students(''a@t'')', 'authenticated', '44444444-4444-4444-4444-444444444444'::uuid, 'scalar', '1');
select tst.run('DB rejects question with bad answer index', 'insert into questions(chapter_id,question,options,correct_answer) values (''c1'',''Bad?'',''["a","b"]'',5)', 'authenticated', '33333333-3333-3333-3333-333333333333'::uuid, 'error', 'questions_options_valid');
select tst.run('DB rejects question with one option', 'insert into questions(chapter_id,question,options,correct_answer) values (''c1'',''Bad?'',''["a"]'',0)', 'authenticated', '33333333-3333-3333-3333-333333333333'::uuid, 'error', 'questions_options_valid');
select tst.run('DB rejects non-object block content', 'insert into lesson_blocks(section_id,order_index,block_type,content) values (''s1'',8,''paragraph'',''"str"'')', 'authenticated', '33333333-3333-3333-3333-333333333333'::uuid, 'error', 'check');
select tst.run('image block type accepted', 'insert into lesson_blocks(section_id,order_index,block_type,content) values (''s1'',7,''image'',''{"url":"https://x/y.png"}'')', 'authenticated', '33333333-3333-3333-3333-333333333333'::uuid, 'rows', '1');
select tst.run('student saves own code snippet', 'insert into saved_code(user_id,title,code) values ({A},''t'',''print(1)'')', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'rows', '1');
select tst.run('student cannot see others snippets', 'select count(*) from saved_code', 'authenticated', '22222222-2222-2222-2222-222222222222'::uuid, 'scalar', '0');
select tst.run('student flags a question', 'insert into flagged_questions(user_id,question_id) values ({A},{Q1})', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'rows', '1');

-- ===== spaced repetition (simplified SM-2) =====
select tst.run('SRS: wrong answer creates a card due tomorrow (interval 1, lapses 1)', 'select interval_days||''/''||lapses||''/''||reps from review_cards where user_id={A} and question_id={Q1}', 'postgres', null, 'scalar', '1/1/0');
select tst.run('SRS: due date is local today + 1', 'select (due_date = (now() at time zone ''UTC'')::date + 1)::text from review_cards where user_id={A} and question_id={Q1}', 'postgres', null, 'scalar', 'true');
select tst.run('SRS: correct answer same day does not advance the card', 'select (grade_answer({Q1},1)->>''correct'')', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'scalar', 'true');
select tst.run('  ...still reps 0 after same-day correct', 'select reps||''/''||interval_days from review_cards where user_id={A} and question_id={Q1}', 'postgres', null, 'scalar', '0/1');
select tst.run('SRS: simulate next day', 'update review_cards set last_reviewed = last_reviewed - 1 where user_id={A}', 'postgres', null, 'rows', '1');
select tst.run('SRS: 1st correct -> interval 1', 'select (grade_answer({Q1},1)->>''correct'')', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'scalar', 'true');
select tst.run('  ...reps 1 interval 1', 'select reps||''/''||interval_days from review_cards where user_id={A}', 'postgres', null, 'scalar', '1/1');
select tst.run('SRS: simulate next day (2)', 'update review_cards set last_reviewed = last_reviewed - 1 where user_id={A}', 'postgres', null, 'rows', '1');
select tst.run('SRS: 2nd correct', 'select (grade_answer({Q1},1)->>''correct'')', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'scalar', 'true');
select tst.run('  ...reps 2 interval 3', 'select reps||''/''||interval_days from review_cards where user_id={A}', 'postgres', null, 'scalar', '2/3');
select tst.run('SRS: simulate next day (3)', 'update review_cards set last_reviewed = last_reviewed - 1 where user_id={A}', 'postgres', null, 'rows', '1');
select tst.run('SRS: 3rd correct', 'select (grade_answer({Q1},1)->>''correct'')', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'scalar', 'true');
select tst.run('  ...reps 3 interval round(3 x 2.45) = 7', 'select reps||''/''||interval_days from review_cards where user_id={A}', 'postgres', null, 'scalar', '3/7');
select tst.run('SRS: wrong answer resets progress', 'select (grade_answer({Q1},0)->>''correct'')', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'scalar', 'false');
select tst.run('  ...reps 0, lapses 2, interval 1', 'select reps||''/''||lapses||''/''||interval_days from review_cards where user_id={A}', 'postgres', null, 'scalar', '0/2/1');
select tst.run('SRS: student cannot write cards directly', 'insert into review_cards(user_id,question_id,due_date,last_reviewed) values ({A},{Q1},current_date,current_date)', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'error', 'permission denied');
select tst.run('SRS: student cannot edit own card', 'update review_cards set interval_days = 180', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'error', 'permission denied');
select tst.run('SRS: other student sees no cards', 'select count(*) from review_cards', 'authenticated', '22222222-2222-2222-2222-222222222222'::uuid, 'scalar', '0');
select tst.run('SRS: student sees own card', 'select count(*) from review_cards', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'scalar', '1');
select tst.run('SRS: student can reset own schedule', 'delete from review_cards', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'rows', '1');

-- ===== study streaks =====
select tst.run('streak: lesson + answers made exactly one activity row today', 'select count(*) from study_activity where user_id={A}', 'postgres', null, 'scalar', '1');
insert into study_activity(user_id, day) select '11111111-1111-1111-1111-111111111111', ((now() at time zone 'UTC')::date - n) from unnest(array[1,2,4]) n;
select tst.run('streak: today + yesterday + 2 days ago = 3 (gap at 3 days ago)', 'select (my_streak()->>''current'')', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'scalar', '3');
select tst.run('streak: longest = 3', 'select (my_streak()->>''longest'')', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'scalar', '3');
select tst.run('streak: active_today is true', 'select (my_streak()->>''active_today'')', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'scalar', 'true');
delete from study_activity where user_id='11111111-1111-1111-1111-111111111111' and day = (now() at time zone 'UTC')::date;
select tst.run('streak: stays alive if you studied yesterday but not yet today (2)', 'select (my_streak()->>''current'')', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'scalar', '2');
delete from study_activity where user_id='11111111-1111-1111-1111-111111111111' and day = (now() at time zone 'UTC')::date - 1;
select tst.run('streak: broken after a missed day (0)', 'select (my_streak()->>''current'')', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'scalar', '0');
select tst.run('streak: student cannot write activity directly', 'insert into study_activity(user_id,day) values ({A}, current_date)', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'error', 'permission denied');
select tst.run('streak: other student cannot see my activity', 'select count(*) from study_activity', 'authenticated', '22222222-2222-2222-2222-222222222222'::uuid, 'scalar', '0');
select tst.run('streak: student can save own timezone', 'update profiles set tz = ''Asia/Karachi'' where id={A}', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'rows', '1');
select tst.run('streak: local date follows saved timezone', 'select (my_streak()->>''today'')::date = (now() at time zone ''Asia/Karachi'')::date', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'scalar', 'true');
select tst.run('streak: invalid timezone falls back to UTC (no error)', 'update profiles set tz = ''Not/AZone'' where id={A}', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'rows', '1');
select tst.run('  ...my_streak still works', 'select (my_streak()->>''today'')::date = (now() at time zone ''UTC'')::date', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'scalar', 'true');
select tst.run('streak: tz column grant does not allow role change', 'update profiles set role = ''admin'', tz = ''UTC'' where id={A}', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'error', 'permission denied');
select tst.run('streak: anon cannot call my_streak', 'select my_streak()', 'anon', null, 'error', 'permission denied');

-- ===== written answers: automatic key-point check + teacher marking =====
insert into auth.users(id,email) values ('77777777-7777-7777-7777-777777777777','teach@t.io');
update profiles set role='teacher' where id='77777777-7777-7777-7777-777777777777';
insert into written_questions(id,chapter_id,kind,prompt,model_answer,key_points,max_marks,published) values
 ('dddddddd-0000-0000-0000-000000000001','c1','short','What is a router?','A router forwards packets between networks.',
  '[{"label":"forwards packets","keywords":["forwards packets","routes packets","packet forwarding"]},{"label":"connects networks","keywords":["networks","network"]},{"label":"uses IP addresses","keywords":["ip address","ip addresses"]}]', 5, true),
 ('dddddddd-0000-0000-0000-000000000002','c1','long','Draft question','x','[]', 5, false);

select tst.run('written: students cannot read the table that holds model answers', 'select count(*) from written_questions', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'scalar', '0');
select tst.run('written: public view hides model answer and key points', 'select count(*) from information_schema.columns where table_name=''written_questions_public'' and column_name in (''model_answer'',''key_points'')', 'postgres', null, 'scalar', '0');
select tst.run('written: only the published question is visible to students', 'select count(*) from written_questions_public', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'scalar', '1');
select tst.run('written: anon cannot read written questions', 'select count(*) from written_questions_public', 'anon', null, 'error', 'permission denied');
select tst.run('written: teacher can read model answers', 'select count(*) from written_questions', 'authenticated', '77777777-7777-7777-7777-777777777777'::uuid, 'scalar', '2');
select tst.run('written: teacher cannot edit questions (content staff only)', 'update written_questions set max_marks = 50', 'authenticated', '77777777-7777-7777-7777-777777777777'::uuid, 'rows', '0');
select tst.run('written: editor can create a question', 'insert into written_questions(chapter_id,prompt,model_answer) values (''c1'',''New one?'',''ans'')', 'authenticated', '33333333-3333-3333-3333-333333333333'::uuid, 'rows', '1');
select tst.run('written: student cannot create a question', 'insert into written_questions(chapter_id,prompt,model_answer) values (''c1'',''New one?'',''ans'')', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'error', 'row-level security');
select tst.run('written: model answer is NOT revealed before submitting', 'select (my_written(''dddddddd-0000-0000-0000-000000000001'') ->> ''model_answer'') is null', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'scalar', 'true');
select tst.run('written: short answer rejected', 'select submit_written(''dddddddd-0000-0000-0000-000000000001'', ''no'')', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'error', 'too short');
select tst.run('written: draft question cannot be answered', 'select submit_written(''dddddddd-0000-0000-0000-000000000002'', ''some answer here'')', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'error', 'not found');
select tst.run('written: anon cannot submit', 'select submit_written(''dddddddd-0000-0000-0000-000000000001'', ''some answer here'')', 'anon', null, 'error', 'permission denied');
select tst.run('written: auto-check runs on submit', 'insert into tst.ctx select ''wid'', (submit_written(''dddddddd-0000-0000-0000-000000000001'', ''A Router FORWARDS PACKETS between different networks.'') ->> ''id'')', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'ok');
select tst.run('  ...found 2 key points (whole phrases, any case)', 'select auto_matched::text from written_answers where id=(select v::uuid from tst.ctx where k=''wid'')', 'postgres', null, 'scalar', '["forwards packets", "connects networks"]');
select tst.run('  ...out of 3', 'select auto_total::text from written_answers where id=(select v::uuid from tst.ctx where k=''wid'')', 'postgres', null, 'scalar', '3');
select tst.run('written: partial words do not match (networking is not network)', 'select jsonb_array_length(submit_written(''dddddddd-0000-0000-0000-000000000001'', ''Networking devices are great at packet things'') -> ''matched'')', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'scalar', '0');
select tst.run('written: regex characters in an answer are harmless', 'select jsonb_array_length(submit_written(''dddddddd-0000-0000-0000-000000000001'', ''(.*) [a-z]+ ^$ forwards packets?'') -> ''matched'')', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'scalar', '1');
select tst.run('written: after submitting, model answer is shown', 'select (my_written(''dddddddd-0000-0000-0000-000000000001'') ->> ''model_answer'')', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'scalar', 'A router forwards packets between networks.');
select tst.run('written: student sees own 3 submissions', 'select jsonb_array_length(my_written(''dddddddd-0000-0000-0000-000000000001'') -> ''submissions'')', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'scalar', '3');
select tst.run('written: other student has no model answer yet', 'select (my_written(''dddddddd-0000-0000-0000-000000000001'') ->> ''model_answer'') is null', 'authenticated', '22222222-2222-2222-2222-222222222222'::uuid, 'scalar', 'true');
select tst.run('written: other student cannot read my answers', 'select count(*) from written_answers', 'authenticated', '22222222-2222-2222-2222-222222222222'::uuid, 'scalar', '0');
select tst.run('written: student cannot forge a graded submission', 'insert into written_answers(user_id,question_id,answer,status,teacher_marks) values (''11111111-1111-1111-1111-111111111111'',''dddddddd-0000-0000-0000-000000000001'',''forged answer'',''graded'',5)', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'error', 'permission denied');
select tst.run('written: student cannot edit own mark', 'update written_answers set teacher_marks = 5', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'error', 'permission denied');
select tst.run('written: student cannot grade', 'select grade_written((select v::uuid from tst.ctx where k=''wid''), 5, ''great'')', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'error', 'forbidden');
select tst.run('written: teacher sees the queue', 'select count(*) from written_answers where status = ''submitted''', 'authenticated', '77777777-7777-7777-7777-777777777777'::uuid, 'scalar', '3');
select tst.run('written: marks above the maximum are refused', 'select grade_written((select v::uuid from tst.ctx where k=''wid''), 6, null)', 'authenticated', '77777777-7777-7777-7777-777777777777'::uuid, 'error', 'between 0 and 5');
select tst.run('written: negative marks are refused', 'select grade_written((select v::uuid from tst.ctx where k=''wid''), -1, null)', 'authenticated', '77777777-7777-7777-7777-777777777777'::uuid, 'error', 'between 0 and 5');
select tst.run('written: teacher marks an answer with feedback', 'select grade_written((select v::uuid from tst.ctx where k=''wid''), 4, ''Good. Mention IP addresses next time.'')', 'authenticated', '77777777-7777-7777-7777-777777777777'::uuid, 'ok');
select tst.run('written: student sees the teacher mark and status', 'select (s ->> ''teacher_marks'') || ''/'' || (s ->> ''status'') from (select e as s from jsonb_array_elements(my_written(''dddddddd-0000-0000-0000-000000000001'') -> ''submissions'') e where (e ->> ''status'') = ''graded'') z', 'authenticated', '11111111-1111-1111-1111-111111111111'::uuid, 'scalar', '4/graded');
select tst.run('written: grading is audited', 'select count(*) from audit_logs where action=''GRADE_WRITTEN''', 'postgres', null, 'scalar', '1');
select tst.run('written: a teacher cannot mark their own answer', 'select grade_written(id, 1, null) from (select wa.id from written_answers wa limit 0) z', 'authenticated', '77777777-7777-7777-7777-777777777777'::uuid, 'ok');
select tst.run('written: rate limit stops floods (10 per minute)', 'select count(submit_written(''dddddddd-0000-0000-0000-000000000001'', ''spam answer number '' || n)) from generate_series(1, 12) n', 'authenticated', '22222222-2222-2222-2222-222222222222'::uuid, 'error', 'too many');
select tst.run('written: stats show answers waiting for a teacher', 'select (admin_dashboard_stats() ->> ''written_waiting'')::int > 0', 'authenticated', '33333333-3333-3333-3333-333333333333'::uuid, 'scalar', 'true');

\pset format aligned
select case when pass then 'PASS' else 'FAIL' end as result, label, case when pass then '' else detail end as detail from tst.results order by n;
select count(*) filter (where pass) as passed, count(*) filter (where not pass) as failed, count(*) as total from tst.results;
