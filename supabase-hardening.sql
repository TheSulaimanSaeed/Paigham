-- PAIGHAM SECURITY HARDENING. Run once in Supabase -> SQL Editor (safe to re-run).

-- 1) Server decides WHO the author is and enforces limits (the browser can no longer fake name, avatar or study field)
create or replace function public.stamp_author() returns trigger
language plpgsql security definer set search_path = public as $$
declare p public.profiles%rowtype; n int;
begin
  select * into p from public.profiles where id = new.user_id;
  if not found or coalesce(p.study_field,'') = '' or coalesce(p.future_interests,'') = '' then
    raise exception 'Complete your researcher profile first';
  end if;
  new.author_name := p.full_name; new.author_study := p.study_field;
  new.author_avatar := p.avatar_url; new.instagram := nullif(p.instagram,'');
  if tg_table_name = 'posts' then
    new.approved := false;
    select count(*) into n from public.posts where user_id = new.user_id and created_at > now() - interval '1 day';
    if n >= 5 then raise exception 'Daily post limit reached (5)'; end if;
  else
    select count(*) into n from public.comments where user_id = new.user_id and created_at > now() - interval '1 minute';
    if n >= 5 then raise exception 'Slow down: too many comments'; end if;
    select count(*) into n from public.comments where user_id = new.user_id and created_at > now() - interval '1 day';
    if n >= 100 then raise exception 'Daily comment limit reached'; end if;
  end if;
  return new;
end $$;
revoke execute on function public.stamp_author() from public, anon, authenticated;
drop trigger if exists trg_posts_stamp on public.posts;
create trigger trg_posts_stamp before insert on public.posts for each row execute function public.stamp_author();
drop trigger if exists trg_comments_stamp on public.comments;
create trigger trg_comments_stamp before insert on public.comments for each row execute function public.stamp_author();

-- 2) Attachments may only point at the user's OWN uploads in your storage (no tracking pixels or outside links)
alter table public.posts drop constraint if exists posts_media_url_check;
alter table public.posts add constraint posts_media_url_check check (media_url is null or media_url = '' or
  media_url like 'https://xaystacrlzqdrhfptosv.supabase.co/storage/v1/object/public/attachments/' || user_id::text || '/%') not valid;
alter table public.comments drop constraint if exists comments_media_url_check;
alter table public.comments add constraint comments_media_url_check check (media_url is null or media_url = '' or
  media_url like 'https://xaystacrlzqdrhfptosv.supabase.co/storage/v1/object/public/attachments/' || user_id::text || '/%') not valid;
alter table public.profiles drop constraint if exists profiles_avatar_url_check;
alter table public.profiles add constraint profiles_avatar_url_check check (avatar_url is null or avatar_url = '' or
  avatar_url like 'https://xaystacrlzqdrhfptosv.supabase.co/storage/v1/object/public/attachments/' || id::text || '/%') not valid;

-- 3) Faster, advisor-clean policies (auth.uid() wrapped in select)
drop policy if exists "Users insert own profile" on public.profiles;
create policy "Users insert own profile" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
drop policy if exists "read approved or own" on public.posts;
create policy "read approved or own" on public.posts for select using (approved or (select auth.uid()) = user_id);
drop policy if exists "insert own pending" on public.posts;
create policy "insert own pending" on public.posts for insert to authenticated with check ((select auth.uid()) = user_id and approved = false);
drop policy if exists "delete own" on public.posts;
create policy "delete own" on public.posts for delete to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "authenticated users can insert own comments" on public.comments;
create policy "authenticated users can insert own comments" on public.comments for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "users can delete own comments" on public.comments;
create policy "users can delete own comments" on public.comments for delete to authenticated using ((select auth.uid()) = user_id);

-- 4) Storage: 5 MB per file, max 40 files per user (stops someone filling your free quota)
update storage.buckets set file_size_limit = 5242880 where id = 'attachments';
drop policy if exists "Authenticated upload attachments" on storage.objects;
create policy "Authenticated upload attachments" on storage.objects for insert to authenticated with check (
  bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select count(*) from storage.objects o where o.bucket_id = 'attachments' and (storage.foldername(o.name))[1] = (select auth.uid())::text) < 40);
drop policy if exists "Users delete own attachments" on storage.objects;
create policy "Users delete own attachments" on storage.objects for delete to authenticated using (
  bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 5) "Delete my account" button support (right to erasure)
create or replace function public.delete_my_account() returns void
language sql security definer set search_path = public, auth as $$ delete from auth.users where id = auth.uid(); $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- 6) Indexes
create index if not exists comments_post_id_idx on public.comments (post_id);
create index if not exists posts_feed_idx on public.posts (approved, created_at desc);
