-- ============================================================================
-- PAIGHAM v4 DATABASE & STORAGE SETUP
-- Run once: Supabase Dashboard -> SQL Editor -> New Query -> Paste -> Run
-- ============================================================================

-- 1. RESEARCHER PROFILES TABLE
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 80),
  study_field text not null check (char_length(study_field) between 2 and 120),
  future_interests text not null check (char_length(future_interests) between 2 and 300),
  bio text check (bio is null or char_length(bio) <= 600),
  instagram text check (instagram is null or instagram = '' or instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  avatar_url text,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Public can view researcher profiles" on public.profiles;
create policy "Public can view researcher profiles" on public.profiles
  for select using (true);

drop policy if exists "Users insert own profile" on public.profiles;
create policy "Users insert own profile" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- 2. POSTS & REVIEW ARTICLES TABLE (Science, Model Organisms, Geopolitics, Philosophy)
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 80),
  author_study text,
  author_avatar text,
  instagram text check (instagram is null or instagram = '' or instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  section text not null check (section in ('science','models','geopolitics','philosophy')),
  sub_section text check (sub_section is null or sub_section in ('physics','chemistry','biology')),
  post_type text not null default 'article' check (post_type in ('article','review','thought')),
  title text not null check (char_length(title) between 3 and 140),
  excerpt text check (char_length(excerpt) <= 240),
  body text not null check (char_length(body) between 10 and 25000),
  media_url text,
  media_type text check (media_type is null or media_type in ('image','pdf')),
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

-- Migrate existing posts table safely if upgrading from older versions:
update public.posts set section = 'geopolitics' where section = 'criminology';
alter table public.posts drop constraint if exists posts_section_check;
alter table public.posts add constraint posts_section_check
  check (section in ('science','models','geopolitics','philosophy'));

alter table public.posts add column if not exists sub_section text
  check (sub_section is null or sub_section in ('physics','chemistry','biology'));
alter table public.posts add column if not exists post_type text not null default 'article';
alter table public.posts add column if not exists author_study text;
alter table public.posts add column if not exists author_avatar text;
alter table public.posts add column if not exists media_url text;
alter table public.posts add column if not exists media_type text
  check (media_type is null or media_type in ('image','pdf'));

alter table public.posts enable row level security;

drop policy if exists "read approved or own" on public.posts;
create policy "read approved or own" on public.posts
  for select using (approved or auth.uid() = user_id);

drop policy if exists "insert own pending" on public.posts;
create policy "insert own pending" on public.posts
  for insert to authenticated with check (auth.uid() = user_id and approved = false);

drop policy if exists "no user updates on posts" on public.posts;
create policy "no user updates on posts" on public.posts
  for update to authenticated using (false);

drop policy if exists "delete own" on public.posts;
create policy "delete own" on public.posts
  for delete to authenticated using (auth.uid() = user_id);

-- 3. COMMENTS & PEER DISCUSSION TABLE
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id text not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 80),
  author_study text,
  author_avatar text,
  instagram text check (instagram is null or instagram = '' or instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  body text not null check (char_length(body) between 1 and 2000),
  media_url text,
  media_type text check (media_type is null or media_type in ('image','pdf')),
  created_at timestamptz not null default now()
);

alter table public.comments add column if not exists author_study text;
alter table public.comments add column if not exists author_avatar text;
alter table public.comments add column if not exists media_url text;
alter table public.comments add column if not exists media_type text
  check (media_type is null or media_type in ('image','pdf'));

alter table public.comments enable row level security;

drop policy if exists "anyone can read comments" on public.comments;
create policy "anyone can read comments" on public.comments
  for select using (true);

drop policy if exists "authenticated users can insert own comments" on public.comments;
create policy "authenticated users can insert own comments" on public.comments
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "no user updates on comments" on public.comments;
create policy "no user updates on comments" on public.comments
  for update to authenticated using (false);

drop policy if exists "users can delete own comments" on public.comments;
create policy "users can delete own comments" on public.comments
  for delete to authenticated using (auth.uid() = user_id);

-- 4. PUBLIC STORAGE BUCKET FOR PROFILE PHOTOS, POST IMAGES & PDFs (MAX 10 MB)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments',
  'attachments',
  true,
  10485760,
  array['image/jpeg','image/png','image/webp','image/gif','application/pdf']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','application/pdf'];

drop policy if exists "Public read attachments" on storage.objects;
create policy "Public read attachments" on storage.objects
  for select using (bucket_id = 'attachments');

drop policy if exists "Authenticated upload attachments" on storage.objects;
create policy "Authenticated upload attachments" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users delete own attachments" on storage.objects;
create policy "Users delete own attachments" on storage.objects
  for delete to authenticated using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
