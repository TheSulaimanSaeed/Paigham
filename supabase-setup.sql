-- Run once: Supabase dashboard -> SQL Editor -> paste -> Run
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 60),
  instagram text check (instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  section text not null check (section in ('science','criminology','zebrafish','geopolitics')),
  title text not null check (char_length(title) between 3 and 120),
  excerpt text check (char_length(excerpt) <= 200),
  body text not null check (char_length(body) between 20 and 20000),
  approved boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.posts enable row level security;
-- Everyone sees approved posts; authors also see their own pending ones
create policy "read approved or own" on public.posts for select using (approved or auth.uid() = user_id);
-- Logged-in users can only post as themselves, and never pre-approved
create policy "insert own pending" on public.posts for insert to authenticated with check (auth.uid() = user_id and approved = false);
create policy "delete own" on public.posts for delete to authenticated using (auth.uid() = user_id);
-- No update policy: users can't approve their own posts. You approve in Table Editor (tick "approved").
