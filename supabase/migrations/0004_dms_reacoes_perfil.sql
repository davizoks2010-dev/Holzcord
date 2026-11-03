-- Lote v0.2: mensagens diretas, fixar mensagens, perfil, nao lidas, configuracoes do servidor.

-- ---------- perfil
alter table public.profiles add column if not exists about text check (char_length(about) <= 190);
alter table public.profiles add column if not exists status text not null default 'online' check (status in ('online','idle','dnd','invisible'));

-- ---------- mensagens: fixar (somente via RPC) e colunas editaveis
alter table public.messages add column if not exists pinned boolean not null default false;
revoke update on public.messages from anon, authenticated;
grant update (content, edited_at) on public.messages to authenticated;

-- ---------- DMs: canais sem servidor + participantes
alter table public.channels alter column server_id drop not null;
alter table public.channels drop constraint if exists channels_type_check;
alter table public.channels add constraint channels_type_check check (type in ('text','voice','dm'));
create table if not exists public.dm_members (
  channel_id uuid references public.channels on delete cascade,
  user_id uuid references public.profiles on delete cascade,
  primary key (channel_id, user_id)
);
alter table public.dm_members enable row level security;

create or replace function public.is_dm_member(cid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists(select 1 from dm_members where channel_id = cid and user_id = auth.uid()) $$;

create or replace function public.can_access_channel(cid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists(select 1 from channels c where c.id = cid and (
    (c.server_id is not null and is_member(c.server_id)) or (c.server_id is null and is_dm_member(c.id)))) $$;

drop policy if exists "ver participantes" on public.dm_members;
create policy "ver participantes" on public.dm_members for select to authenticated using (user_id = auth.uid() or is_dm_member(channel_id));

drop policy if exists "ver canais" on public.channels;
create policy "ver canais" on public.channels for select to authenticated using (can_access_channel(id));
drop policy if exists "ver mensagens" on public.messages;
create policy "ver mensagens" on public.messages for select to authenticated using (can_access_channel(channel_id));
drop policy if exists "enviar mensagem" on public.messages;
create policy "enviar mensagem" on public.messages for insert to authenticated
  with check (author_id = auth.uid() and can_access_channel(channel_id));
drop policy if exists "ver reacoes" on public.reactions;
create policy "ver reacoes" on public.reactions for select to authenticated
  using (can_access_channel((select channel_id from messages where id = message_id)));
drop policy if exists "reagir" on public.reactions;
create policy "reagir" on public.reactions for insert to authenticated
  with check (user_id = auth.uid() and can_access_channel((select channel_id from messages where id = message_id)));

create or replace function public.open_dm(p_user uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'Nao autenticado'; end if;
  if p_user = auth.uid() then raise exception 'Nao e possivel abrir uma conversa consigo mesmo'; end if;
  if not exists(select 1 from profiles where id = p_user) then raise exception 'Usuario inexistente'; end if;
  select c.id into cid from channels c where c.type = 'dm'
    and exists(select 1 from dm_members where channel_id = c.id and user_id = auth.uid())
    and exists(select 1 from dm_members where channel_id = c.id and user_id = p_user) limit 1;
  if cid is null then
    insert into channels(server_id, name, type) values (null, 'dm', 'dm') returning id into cid;
    insert into dm_members(channel_id, user_id) values (cid, auth.uid()), (cid, p_user);
  end if;
  return cid;
end $$;

-- ---------- fixar mensagem (servidor: manage_messages; DM: qualquer participante)
create or replace function public.pin_message(p_id uuid, p_pinned boolean) returns void
language plpgsql security definer set search_path = public as $$
declare cid uuid; sid uuid;
begin
  select channel_id into cid from messages where id = p_id;
  if cid is null or not can_access_channel(cid) then raise exception 'Mensagem inacessivel'; end if;
  sid := channel_server(cid);
  if sid is not null and not has_perm(sid, 'manage_messages') then raise exception 'Sem permissao para fixar'; end if;
  update messages set pinned = p_pinned where id = p_id;
end $$;

-- ---------- nao lidas
create table if not exists public.read_states (
  user_id uuid not null references public.profiles on delete cascade,
  channel_id uuid not null references public.channels on delete cascade,
  last_read timestamptz not null default now(),
  primary key (user_id, channel_id)
);
alter table public.read_states enable row level security;
drop policy if exists "proprios estados" on public.read_states;
create policy "proprios estados" on public.read_states for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and can_access_channel(channel_id));

-- ---------- servidor: regenerar convite e apagar
create or replace function public.regen_invite(p_server uuid) returns text
language plpgsql security definer set search_path = public as $$
declare code text;
begin
  if not has_perm(p_server, 'manage_server') then raise exception 'Sem permissao'; end if;
  code := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  update servers set invite_code = code where id = p_server;
  return code;
end $$;
drop policy if exists "apagar servidor" on public.servers;
create policy "apagar servidor" on public.servers for delete to authenticated using (owner_id = auth.uid());

do $$ begin alter publication supabase_realtime add table public.dm_members; exception when duplicate_object then null; end $$;
