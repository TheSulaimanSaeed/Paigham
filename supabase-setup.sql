-- Run once: Supabase dashboard -> SQL Editor -> paste -> Run
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 60),
  instagram text check (instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  section text not null check (section in ('science','criminology','models','geopolitics','philosophy')),
  sub_section text check (sub_section is null or sub_section in ('physics','chemistry','biology')),
  title text not null check (char_length(title) between 3 and 120),
  excerpt text check (char_length(excerpt) <= 200),
  body text not null check (char_length(body) between 20 and 20000),
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

-- If upgrading an existing posts table, run these updates:
alter table public.posts drop constraint if exists posts_section_check;
alter table public.posts add constraint posts_section_check
  check (section in ('science','criminology','models','geopolitics','philosophy'));
alter table public.posts add column if not exists sub_section text
  check (sub_section is null or sub_section in ('physics','chemistry','biology'));

alter table public.posts enable row level security;
drop policy if exists "read approved or own" on public.posts;
create policy "read approved or own" on public.posts for select using (approved or auth.uid() = user_id);
drop policy if exists "insert own pending" on public.posts;
create policy "insert own pending" on public.posts for insert to authenticated with check (auth.uid() = user_id and approved = false);
drop policy if exists "delete own" on public.posts;
create policy "delete own" on public.posts for delete to authenticated using (auth.uid() = user_id);

-- Comments table for all journals & philosophy posts
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id text not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 60),
  instagram text check (instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

alter table public.comments enable row level security;
drop policy if exists "anyone can read comments" on public.comments;
create policy "anyone can read comments" on public.comments
  for select using (true);
drop policy if exists "authenticated users can insert own comments" on public.comments;
create policy "authenticated users can insert own comments" on public.comments
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "users can delete own comments" on public.comments;
create policy "users can delete own comments" on public.comments
  for delete to authenticated using (auth.uid() = user_id);
