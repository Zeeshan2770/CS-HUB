-- The nine chapters (titles and page counts taken from the supplied chapter PDFs).
-- Run AFTER schema.sql. Sections and lessons are then imported from the old project
-- (Admin -> Import) or authored in the admin panel.
insert into public.chapters (id, number, title, source_pdf, source_pages, published) values
 ('chapter-1', 1, 'Computer Networks', '12Th-Computer-Chapter-1.pdf', 59, true),
 ('chapter-2', 2, 'Computational Thinking and Algorithm', '12Th-Computer-Chapter-2.pdf', 43, true),
 ('chapter-3', 3, 'Object-Oriented Programming Using Python', '12Th-Computer-Chapter-3.pdf', 34, true),
 ('chapter-4', 4, 'Development of Graphical User Interface (GUI)', '12Th-Computer-Chapter-4.pdf', 26, true),
 ('chapter-5', 5, 'Code Testing and Debugging', '12Th-Computer-Chapter-5.pdf', 25, true),
 ('chapter-6', 6, 'Data and Analysis', '12th-Computer-Chapter-6.pdf', 39, true),
 ('chapter-7', 7, 'Hypothesis Testing', '12th-Computer-Chapter-7.pdf', 28, true),
 ('chapter-8', 8, 'Applications of Computer Science Through Emerging Technologies', '12th-Computer-Chapter-8.pdf', 30, true),
 ('chapter-9', 9, 'Cybersecurity and Safe Digital Collaboration', '12th-Computer-Chapter-9.pdf', 43, true)
on conflict (id) do update set title = excluded.title, source_pdf = excluded.source_pdf, source_pages = excluded.source_pages;
