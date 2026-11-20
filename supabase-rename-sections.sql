-- Run once in Supabase SQL Editor, right before uploading the new site files.
alter table public.posts drop constraint if exists posts_section_check;
update public.posts set section = 'art' where section in ('models','zebrafish');
update public.posts set section = 'politics' where section in ('geopolitics','criminology');
alter table public.posts add constraint posts_section_check check (section in ('science','art','politics','philosophy'));
