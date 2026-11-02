-- Lote v0.3: amigos/bloqueio, DMs em grupo, categorias, canais privados, ban/timeout/modo lento,
-- log de auditoria, enquetes e icone do servidor.

-- =============== permissoes extras
create or replace function public.my_perms(sid uuid) returns text[]
language sql security definer stable set search_path = public as $$
  select case
    when exists(select 1 from servers where id = sid and owner_id = auth.uid())
      then array['manage_channels','manage_roles','manage_messages','kick_members','manage_server','ban_members','view_audit_log','moderate_members']
    else coalesce((select r.perms from members m join roles r on r.id = m.role_id
                   where m.server_id = sid and m.user_id = auth.uid()), '{}')
  end $$;

update public.roles set perms = (select array(select distinct unnest(perms || array['ban_members','view_audit_log','moderate_members'])))
  where name in ('Dono', 'Admin');

create or replace function public.create_server(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid; dono uuid;
begin
  insert into servers(name, owner_id) values (p_name, auth.uid()) returning id into sid;
  insert into roles(server_id, name, color, position, perms) values
    (sid, 'Dono', '#C8F169', 100, array['manage_channels','manage_roles','manage_messages','kick_members','manage_server','ban_members','view_audit_log','moderate_members']) returning id into dono;
  insert into roles(server_id, name, color, position, perms) values
    (sid, 'Admin', '#7EE8A8', 50, array['manage_channels','manage_roles','manage_messages','kick_members','ban_members','view_audit_log','moderate_members']),
    (sid, 'Membro', '#8E9A92', 0, '{}');
  insert into members(server_id, user_id, role, role_id) values (sid, auth.uid(), 'owner', dono);
  insert into channels(server_id, name, type) values (sid, 'geral', 'text'), (sid, 'Voz', 'voice');
  return sid;
end $$;

-- =============== colunas novas
alter table public.servers add column if not exists icon_url text;
alter table public.channels add column if not exists topic text check (char_length(topic) <= 200);
alter table public.channels add column if not exists position int not null default 0;
alter table public.channels add column if not exists slowmode_seconds int not null default 0 check (slowmode_seconds between 0 and 21600);
alter table public.channels add column if not exists is_private boolean not null default false;
alter table public.channels add column if not exists is_group boolean not null default false;
alter table public.members add column if not exists timeout_until timestamptz;

-- =============== categorias e canais privados
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers on delete cascade,
  name text not null check (char_length(name) between 1 and 50),
  position int not null default 0,
  created_at timestamptz default now()
);
alter table public.channels add column if not exists category_id uuid references public.categories on delete set null;
create table if not exists public.channel_roles (
  channel_id uuid references public.channels on delete cascade,
  role_id uuid references public.roles on delete cascade,
  primary key (channel_id, role_id)
);
alter table public.categories enable row level security;
alter table public.channel_roles enable row level security;
drop policy if exists "ver categorias" on public.categories;
create policy "ver categorias" on public.categories for select to authenticated using (is_member(server_id));
drop policy if exists "gerir categorias" on public.categories;
create policy "gerir categorias" on public.categories for all to authenticated
  using (has_perm(server_id, 'manage_channels')) with check (has_perm(server_id, 'manage_channels'));
drop policy if exists "ver canal-cargos" on public.channel_roles;
create policy "ver canal-cargos" on public.channel_roles for select to authenticated using (is_member(channel_server(channel_id)));
drop policy if exists "gerir canal-cargos" on public.channel_roles;
create policy "gerir canal-cargos" on public.channel_roles for all to authenticated
  using (has_perm(channel_server(channel_id), 'manage_channels')) with check (has_perm(channel_server(channel_id), 'manage_channels'));

create or replace function public.my_role_id(sid uuid) returns uuid
language sql security definer stable set search_path = public as $$
  select role_id from members where server_id = sid and user_id = auth.uid() $$;

create or replace function public.can_access_channel(cid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists(select 1 from channels c where c.id = cid and (
    (c.server_id is not null and is_member(c.server_id) and (
        not c.is_private or has_perm(c.server_id, 'manage_channels')
        or exists(select 1 from channel_roles cr where cr.channel_id = c.id and cr.role_id = my_role_id(c.server_id))))
    or (c.server_id is null and is_dm_member(c.id)))) $$;

-- =============== amigos e bloqueios
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles on delete cascade,
  user_b uuid not null references public.profiles on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz default now(),
  check (user_a <> user_b), unique (user_a, user_b)
);
create table if not exists public.blocks (
  blocker uuid references public.profiles on delete cascade,
  blocked uuid references public.profiles on delete cascade,
  primary key (blocker, blocked)
);
alter table public.friendships enable row level security;
alter table public.blocks enable row level security;
drop policy if exists "ver amizades" on public.friendships;
create policy "ver amizades" on public.friendships for select to authenticated using (user_a = auth.uid() or user_b = auth.uid());
drop policy if exists "ver meus bloqueios" on public.blocks;
create policy "ver meus bloqueios" on public.blocks for select to authenticated using (blocker = auth.uid());

create or replace function public.blocked_between(a uuid, b uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists(select 1 from blocks where (blocker = a and blocked = b) or (blocker = b and blocked = a)) $$;

create or replace function public.send_friend_request(p_username text) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid; fid uuid;
begin
  select id into uid from profiles where lower(username) = lower(trim(p_username)) limit 1;
  if uid is null then raise exception 'Usuario nao encontrado'; end if;
  if uid = auth.uid() then raise exception 'Voce nao pode adicionar a si mesmo'; end if;
  if blocked_between(auth.uid(), uid) then raise exception 'Nao foi possivel enviar o pedido'; end if;
  select id into fid from friendships where user_a = uid and user_b = auth.uid();
  if fid is not null then update friendships set status = 'accepted' where id = fid; return 'accepted'; end if;
  insert into friendships(user_a, user_b) values (auth.uid(), uid) on conflict do nothing;
  return 'pending';
end $$;

create or replace function public.respond_friend_request(p_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_accept then update friendships set status = 'accepted' where id = p_id and user_b = auth.uid() and status = 'pending';
  else delete from friendships where id = p_id and user_b = auth.uid() and status = 'pending'; end if;
end $$;

create or replace function public.remove_friend(p_user uuid) returns void
language sql security definer set search_path = public as $$
  delete from friendships where (user_a = auth.uid() and user_b = p_user) or (user_b = auth.uid() and user_a = p_user) $$;

create or replace function public.block_user(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_user = auth.uid() then raise exception 'Voce nao pode bloquear a si mesmo'; end if;
  insert into blocks(blocker, blocked) values (auth.uid(), p_user) on conflict do nothing;
  delete from friendships where (user_a = auth.uid() and user_b = p_user) or (user_b = auth.uid() and user_a = p_user);
end $$;

create or replace function public.unblock_user(p_user uuid) returns void
language sql security definer set search_path = public as $$
  delete from blocks where blocker = auth.uid() and blocked = p_user $$;

-- =============== DMs: bloqueio e grupos
create or replace function public.dm_allowed(cid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select not exists(
    select 1 from channels c join dm_members o on o.channel_id = c.id and o.user_id <> auth.uid()
    where c.id = cid and c.type = 'dm' and not c.is_group and blocked_between(auth.uid(), o.user_id)) $$;

create or replace function public.open_dm(p_user uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'Nao autenticado'; end if;
  if p_user = auth.uid() then raise exception 'Nao e possivel abrir uma conversa consigo mesmo'; end if;
  if not exists(select 1 from profiles where id = p_user) then raise exception 'Usuario inexistente'; end if;
  if blocked_between(auth.uid(), p_user) then raise exception 'Nao foi possivel abrir a conversa'; end if;
  select c.id into cid from channels c where c.type = 'dm' and not c.is_group
    and exists(select 1 from dm_members where channel_id = c.id and user_id = auth.uid())
    and exists(select 1 from dm_members where channel_id = c.id and user_id = p_user) limit 1;
  if cid is null then
    insert into channels(server_id, name, type) values (null, 'dm', 'dm') returning id into cid;
    insert into dm_members(channel_id, user_id) values (cid, auth.uid()), (cid, p_user);
  end if;
  return cid;
end $$;

create or replace function public.open_group_dm(p_users uuid[], p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid; u uuid; others uuid[];
begin
  select array(select distinct x from unnest(p_users) x where x <> auth.uid()) into others;
  if coalesce(array_length(others, 1), 0) < 2 then raise exception 'Escolha pelo menos 2 pessoas'; end if;
  if array_length(others, 1) > 9 then raise exception 'Grupos tem no maximo 10 pessoas'; end if;
  foreach u in array others loop
    if not exists(select 1 from profiles where id = u) then raise exception 'Usuario inexistente'; end if;
    if blocked_between(auth.uid(), u) then raise exception 'Nao foi possivel criar o grupo'; end if;
  end loop;
  insert into channels(server_id, name, type, is_group) values (null, left(coalesce(nullif(trim(p_name), ''), 'Grupo'), 50), 'dm', true) returning id into cid;
  insert into dm_members(channel_id, user_id) select cid, x from unnest(others || auth.uid()) x;
  return cid;
end $$;

create or replace function public.leave_dm(p_channel uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from dm_members where channel_id = p_channel and user_id = auth.uid();
  if not exists(select 1 from dm_members where channel_id = p_channel) then delete from channels where id = p_channel; end if;
end $$;

-- =============== banimento, timeout, modo lento
create table if not exists public.bans (
  server_id uuid references public.servers on delete cascade,
  user_id uuid references public.profiles on delete cascade,
  reason text, banned_by uuid references public.profiles, created_at timestamptz default now(),
  primary key (server_id, user_id)
);
alter table public.bans enable row level security;
drop policy if exists "ver bans" on public.bans;
create policy "ver bans" on public.bans for select to authenticated using (has_perm(server_id, 'ban_members'));

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  server_id uuid not null references public.servers on delete cascade,
  actor_id uuid, action text not null, target text,
  created_at timestamptz default now()
);
create index if not exists audit_server_idx on public.audit_log(server_id, created_at desc);
alter table public.audit_log enable row level security;
drop policy if exists "ver auditoria" on public.audit_log;
create policy "ver auditoria" on public.audit_log for select to authenticated using (has_perm(server_id, 'view_audit_log'));

create or replace function public.log_audit(sid uuid, act text, tgt text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists(select 1 from servers where id = sid) then
    insert into audit_log(server_id, actor_id, action, target) values (sid, auth.uid(), act, tgt);
  end if;
end $$;

create or replace function public.audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare uname text;
begin
  if tg_table_name = 'channels' then
    if coalesce(new.server_id, old.server_id) is not null then
      perform log_audit(coalesce(new.server_id, old.server_id), case tg_op when 'INSERT' then 'channel_create' when 'DELETE' then 'channel_delete' else 'channel_update' end, coalesce(new.name, old.name));
    end if;
  elsif tg_table_name = 'roles' then
    perform log_audit(coalesce(new.server_id, old.server_id), case tg_op when 'INSERT' then 'role_create' when 'DELETE' then 'role_delete' else 'role_update' end, coalesce(new.name, old.name));
  elsif tg_table_name = 'members' then
    select username into uname from profiles where id = coalesce(old.user_id, new.user_id);
    if tg_op = 'DELETE' then
      perform log_audit(old.server_id, case when old.user_id = auth.uid() then 'member_leave' else 'member_kick' end, uname);
    elsif new.role_id is distinct from old.role_id then
      perform log_audit(new.server_id, 'role_assign', uname || ' → ' || coalesce((select name from roles where id = new.role_id), 'sem cargo'));
    end if;
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists audit_channels on public.channels;
create trigger audit_channels after insert or update of name, topic, is_private, slowmode_seconds or delete on public.channels for each row execute function public.audit_trigger();
drop trigger if exists audit_roles on public.roles;
create trigger audit_roles after insert or update of name, perms, position or delete on public.roles for each row execute function public.audit_trigger();
drop trigger if exists audit_members on public.members;
create trigger audit_members after update of role_id or delete on public.members for each row execute function public.audit_trigger();

create or replace function public.ban_member(p_server uuid, p_user uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare uname text;
begin
  if not has_perm(p_server, 'ban_members') then raise exception 'Sem permissao para banir'; end if;
  if p_user = auth.uid() or member_pos(p_server, p_user) >= member_pos(p_server, auth.uid()) then raise exception 'Voce nao pode banir este membro'; end if;
  select username into uname from profiles where id = p_user;
  insert into bans(server_id, user_id, reason, banned_by) values (p_server, p_user, left(p_reason, 200), auth.uid()) on conflict do nothing;
  delete from members where server_id = p_server and user_id = p_user;
  perform log_audit(p_server, 'member_ban', uname);
end $$;

create or replace function public.unban_member(p_server uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare uname text;
begin
  if not has_perm(p_server, 'ban_members') then raise exception 'Sem permissao'; end if;
  select username into uname from profiles where id = p_user;
  delete from bans where server_id = p_server and user_id = p_user;
  perform log_audit(p_server, 'member_unban', uname);
end $$;

create or replace function public.timeout_member(p_server uuid, p_user uuid, p_minutes int) returns void
language plpgsql security definer set search_path = public as $$
declare uname text;
begin
  if not has_perm(p_server, 'moderate_members') then raise exception 'Sem permissao'; end if;
  if p_user = auth.uid() or member_pos(p_server, p_user) >= member_pos(p_server, auth.uid()) then raise exception 'Voce nao pode silenciar este membro'; end if;
  select username into uname from profiles where id = p_user;
  update members set timeout_until = case when p_minutes <= 0 then null else now() + make_interval(mins => least(p_minutes, 40320)) end
    where server_id = p_server and user_id = p_user;
  perform log_audit(p_server, case when p_minutes <= 0 then 'timeout_remove' else 'timeout' end, uname);
end $$;

create or replace function public.join_server(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid; base uuid;
begin
  select id into sid from servers where invite_code = p_code;
  if sid is null then raise exception 'Convite invalido'; end if;
  if exists(select 1 from bans where server_id = sid and user_id = auth.uid()) then raise exception 'Voce foi banido deste servidor'; end if;
  select id into base from roles where server_id = sid order by position asc limit 1;
  insert into members(server_id, user_id, role, role_id) values (sid, auth.uid(), 'member', base) on conflict do nothing;
  return sid;
end $$;

create or replace function public.not_timed_out(cid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select not exists(select 1 from members m join channels c on c.server_id = m.server_id
    where c.id = cid and m.user_id = auth.uid() and m.timeout_until > now()) $$;

create or replace function public.slowmode_ok(cid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select coalesce((select case
    when c.slowmode_seconds = 0 or (c.server_id is not null and has_perm(c.server_id, 'manage_messages')) then true
    else not exists(select 1 from messages m where m.channel_id = c.id and m.author_id = auth.uid()
                    and m.created_at > now() - make_interval(secs => c.slowmode_seconds)) end
    from channels c where c.id = cid), true) $$;

drop policy if exists "enviar mensagem" on public.messages;
create policy "enviar mensagem" on public.messages for insert to authenticated with check (
  author_id = auth.uid() and can_access_channel(channel_id) and dm_allowed(channel_id)
  and not_timed_out(channel_id) and slowmode_ok(channel_id));

-- =============== enquetes
create table if not exists public.polls (
  message_id uuid primary key references public.messages on delete cascade,
  question text not null check (char_length(question) <= 200),
  options text[] not null check (array_length(options, 1) between 2 and 10),
  multiple boolean not null default false
);
create table if not exists public.poll_votes (
  message_id uuid references public.polls on delete cascade,
  user_id uuid references public.profiles on delete cascade,
  option_idx int not null check (option_idx between 0 and 9),
  primary key (message_id, user_id, option_idx)
);
alter table public.polls enable row level security;
alter table public.poll_votes enable row level security;
drop policy if exists "ver enquetes" on public.polls;
create policy "ver enquetes" on public.polls for select to authenticated using (can_access_channel((select channel_id from messages where id = message_id)));
drop policy if exists "ver votos" on public.poll_votes;
create policy "ver votos" on public.poll_votes for select to authenticated using (can_access_channel((select channel_id from messages where id = message_id)));

create or replace function public.create_poll(p_channel uuid, p_question text, p_options text[], p_multiple boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare mid uuid;
begin
  if not (can_access_channel(p_channel) and dm_allowed(p_channel) and not_timed_out(p_channel) and slowmode_ok(p_channel)) then raise exception 'Voce nao pode enviar neste canal'; end if;
  insert into messages(channel_id, author_id, content) values (p_channel, auth.uid(), left(trim(p_question), 200)) returning id into mid;
  insert into polls(message_id, question, options, multiple) values (mid, left(trim(p_question), 200), p_options, p_multiple);
  return mid;
end $$;

create or replace function public.vote_poll(p_message uuid, p_idx int) returns void
language plpgsql security definer set search_path = public as $$
declare pl polls; cid uuid;
begin
  select * into pl from polls where message_id = p_message;
  select channel_id into cid from messages where id = p_message;
  if pl.message_id is null or not can_access_channel(cid) then raise exception 'Enquete inacessivel'; end if;
  if p_idx < 0 or p_idx >= array_length(pl.options, 1) then raise exception 'Opcao invalida'; end if;
  if exists(select 1 from poll_votes where message_id = p_message and user_id = auth.uid() and option_idx = p_idx) then
    delete from poll_votes where message_id = p_message and user_id = auth.uid() and option_idx = p_idx;
  else
    if not pl.multiple then delete from poll_votes where message_id = p_message and user_id = auth.uid(); end if;
    insert into poll_votes(message_id, user_id, option_idx) values (p_message, auth.uid(), p_idx);
  end if;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.categories, public.friendships, public.poll_votes, public.polls;
exception when duplicate_object then null; end $$;
