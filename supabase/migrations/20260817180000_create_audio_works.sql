create extension if not exists pgcrypto;

create table if not exists public.audio_works (
  id uuid primary key default gen_random_uuid(),
  drive_file_id text not null unique,
  drive_url text not null,
  title text not null,
  mime_type text not null default 'audio/mpeg',
  is_published boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint audio_works_drive_file_id_not_blank check (length(trim(drive_file_id)) >= 10),
  constraint audio_works_title_not_blank check (length(trim(title)) > 0)
);

create index if not exists audio_works_published_created_at_idx
  on public.audio_works (is_published, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists audio_works_set_updated_at on public.audio_works;
create trigger audio_works_set_updated_at
before update on public.audio_works
for each row execute function public.set_updated_at();

alter table public.audio_works enable row level security;

revoke all on table public.audio_works from anon, authenticated;
grant select on table public.audio_works to anon;
grant select, insert, update, delete on table public.audio_works to authenticated;

drop policy if exists "Public can read published audio works" on public.audio_works;
create policy "Public can read published audio works"
on public.audio_works
for select
to anon
using (is_published = true);

drop policy if exists "Authenticated users can read all audio works" on public.audio_works;
create policy "Authenticated users can read all audio works"
on public.audio_works
for select
to authenticated
using (true);

drop policy if exists "Authenticated users can insert audio works" on public.audio_works;
create policy "Authenticated users can insert audio works"
on public.audio_works
for insert
to authenticated
with check ((select auth.uid()) is not null);

drop policy if exists "Authenticated users can update audio works" on public.audio_works;
create policy "Authenticated users can update audio works"
on public.audio_works
for update
to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);

drop policy if exists "Authenticated users can delete audio works" on public.audio_works;
create policy "Authenticated users can delete audio works"
on public.audio_works
for delete
to authenticated
using ((select auth.uid()) is not null);
