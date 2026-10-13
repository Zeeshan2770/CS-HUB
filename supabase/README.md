# Supabase files

| File | Run where | Purpose |
|---|---|---|
| `schema.sql` | NEW project, SQL Editor | Creates every table, policy, function and the image bucket. Run once (safe to re-run). |
| `seed_chapters.sql` | NEW project, SQL Editor | Adds the nine chapter titles. |
| `export_old_content.sql` | OLD project, SQL Editor | Read-only export of lessons and questions to upload in Admin -> Import. |
| `tests/` | local PostgreSQL only | 157 role-based security and behaviour checks. |

Tables: profiles, chapters, sections (lessons), lesson_blocks, questions (answer keys, staff only), questions_public (view
without answers), lesson_progress, bookmarks, flagged_questions, saved_code, question_attempts, study_goals, study_tasks,
quiz_sessions, quiz_answers, section_revisions, audit_logs, study_activity (streaks, trigger-written), review_cards (spaced repetition, function-written), written_questions (model answers, staff/teachers only) with the written_questions_public view, written_answers (own or teacher; function-written).

Functions callable by signed-in users: submit_written, my_written, my_streak, grade_answer, start_quiz, resume_quiz, submit_quiz, quiz_review, search_content (also
public). Staff only: admin_dashboard_stats, save_section_revision, restore_section_revision. Admin: admin_list_students.
Teachers and above: grade_written. Super admin: admin_set_user_role.

Keys: the browser only ever gets the **anon** key. Never put the `service_role` key in Netlify or in the code.
