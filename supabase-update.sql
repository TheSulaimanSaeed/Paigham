-- Run once in Supabase -> SQL Editor, BEFORE uploading the new site files.
-- Four sections: science, tech, art, politics. Old finance/philosophy posts move into Politics.
alter table public.posts drop constraint if exists posts_section_check;
alter table public.posts drop constraint if exists posts_sub_section_check;
update public.posts set section = 'politics', sub_section = 'economy' where section = 'finance';
update public.posts set section = 'politics', sub_section = null where section = 'philosophy';
update public.posts set sub_section = null where sub_section is not null and sub_section !~ '^[a-z0-9-]{2,24}$';
alter table public.posts add constraint posts_section_check
  check (section in ('science','tech','art','politics'));
alter table public.posts add constraint posts_sub_section_check
  check (sub_section is null or sub_section ~ '^[a-z0-9-]{2,24}$');
