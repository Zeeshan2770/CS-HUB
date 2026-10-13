-- Run this in the OLD Supabase project (SQL Editor). It only READS data.
-- It returns ONE cell of JSON. Use "Download CSV" (or copy the cell) and upload that file in
-- the new site: Admin -> Import -> "Import lessons from the old project".
select json_build_object(
  'version', 1,
  'chapters', (select coalesce(json_agg(c order by c.number), '[]') from (
      select id, number, title, source_pdf, source_pages, published from public.chapters) c),
  'sections', (select coalesce(json_agg(s order by s.chapter_id, s.order_index), '[]') from (
      select id, chapter_id, title, order_index, published from public.sections) s),
  'lesson_blocks', (select coalesce(json_agg(b order by b.section_id, b.order_index), '[]') from (
      select id, section_id, order_index, block_type, content, source_page from public.lesson_blocks) b),
  'questions', (select coalesce(json_agg(q order by q.chapter_id, q.created_at), '[]') from (
      select id, chapter_id, section_id, question, options, correct_answer, explanation,
             difficulty, source_type, source_page, tags from public.questions) q)
) as export;
