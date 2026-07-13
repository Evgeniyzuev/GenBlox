create extension if not exists pgcrypto;

create table if not exists public.creator_games (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  template_id text not null check (char_length(template_id) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.creator_game_versions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.creator_games(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  source_text text not null check (octet_length(source_text) <= 240000),
  manifest jsonb not null,
  status text not null default 'private_draft'
    check (status in ('private_draft','private_test','review','published','rejected','disabled')),
  created_at timestamptz not null default now(),
  unique (game_id, version_number)
);

alter table public.creator_games enable row level security;
alter table public.creator_game_versions enable row level security;

revoke all on public.creator_games from anon;
revoke all on public.creator_game_versions from anon;
grant select on public.creator_games to authenticated;
grant select on public.creator_game_versions to authenticated;

drop policy if exists "owners read creator games" on public.creator_games;
create policy "owners read creator games" on public.creator_games
  for select using ((select auth.uid()) = owner_id);
drop policy if exists "owners read creator versions" on public.creator_game_versions;
create policy "owners read creator versions" on public.creator_game_versions
  for select using ((select auth.uid()) = owner_id);

create or replace function public.save_creator_version(
  p_game_id uuid,
  p_manifest jsonb,
  p_source_text text
) returns table (game_id uuid, version_id uuid, version_number integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_game public.creator_games;
  v_version public.creator_game_versions;
  v_number integer;
begin
  if v_owner is null then raise exception 'Authentication required'; end if;
  if octet_length(p_source_text) > 240000 then raise exception 'Game source is too large'; end if;
  if coalesce(p_manifest->>'title','') = '' then raise exception 'Game title is required'; end if;

  if p_game_id is null then
    insert into public.creator_games (owner_id,title,description,template_id)
    values (v_owner,left(p_manifest->>'title',80),left(coalesce(p_manifest->>'description',''),500),left(coalesce(p_manifest->>'templateId','custom'),80))
    returning * into v_game;
  else
    select * into v_game from public.creator_games where id=p_game_id and owner_id=v_owner for update;
    if not found then raise exception 'Private game not found'; end if;
    update public.creator_games set title=left(p_manifest->>'title',80),description=left(coalesce(p_manifest->>'description',''),500),updated_at=now() where id=v_game.id;
  end if;

  select coalesce(max(v.version_number),0)+1 into v_number from public.creator_game_versions v where v.game_id=v_game.id;
  insert into public.creator_game_versions (game_id,owner_id,version_number,source_text,manifest)
  values (v_game.id,v_owner,v_number,p_source_text,p_manifest)
  returning * into v_version;
  return query select v_game.id,v_version.id,v_version.version_number;
end;
$$;

revoke all on function public.save_creator_version(uuid,jsonb,text) from public;
grant execute on function public.save_creator_version(uuid,jsonb,text) to authenticated;

create or replace function public.delete_creator_game(p_game_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
begin
  if v_owner is null then raise exception 'Authentication required'; end if;
  delete from public.creator_games where id=p_game_id and owner_id=v_owner;
  return found;
end;
$$;

revoke all on function public.delete_creator_game(uuid) from public;
grant execute on function public.delete_creator_game(uuid) to authenticated;
