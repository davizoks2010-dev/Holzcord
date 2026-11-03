-- Lote v0.4: topicos (threads) e convites temporarios.

-- =============== topicos: um topico e um canal de texto escondido, ligado a uma mensagem
alter table public.channels add column if not exists is_thread boolean not null default false;
alter table public.channels add column if not exists parent_channel_id uuid references public.channels on delete cascade;
alter table public.channels add column if not exists parent_message_id uuid references public.messages on delete cascade;
create index if not exists channels_parent_msg_idx on public.channels(parent_message_id);

-- o topico herda o acesso do canal de origem (inclusive se for privado)
create or replace function public.can_access_channel(cid uuid) returns boolean
language plpgsql security definer stable set search_path = public as $$
declare c channels;
begin
  select * into c from channels where id = cid;
  if c.id is null then return false; end if;
  if c.parent_channel_id is not null then return public.can_access_channel(c.parent_channel_id); end if;
  if c.server_id is null then return is_dm_member(c.id); end if;
  if not is_member(c.server_id) then return false; end if;
  return not c.is_private or has_perm(c.server_id, 'manage_channels')
    or exists(select 1 from channel_roles cr where cr.channel_id = c.id and cr.role_id = my_role_id(c.server_id));
end $$;

create or replace function public.create_thread(p_message uuid, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare m messages; pc channels; tid uuid;
begin
  select * into m from messages where id = p_message;
  if m.id is null or not can_access_channel(m.channel_id) then raise exception 'Mensagem inacessivel'; end if;
  select * into pc from channels where id = m.channel_id;
  if pc.server_id is null then raise exception 'Topicos so existem em canais de servidor'; end if;
  if pc.is_thread then raise exception 'Nao e possivel criar um topico dentro de outro topico'; end if;
  select id into tid from channels where parent_message_id = p_message;
  if tid is not null then return tid; end if;
  insert into channels(server_id, name, type, is_thread, parent_channel_id, parent_message_id)
    values (pc.server_id, left(coalesce(nullif(trim(p_name), ''), 'Topico'), 60), 'text', true, pc.id, p_message) returning id into tid;
  return tid;
end $$;

-- topicos nao aparecem no log de auditoria como canais
create or replace function public.audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare uname text;
begin
  if tg_table_name = 'channels' then
    if coalesce(new.is_thread, old.is_thread, false) then return coalesce(new, old); end if;
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

-- =============== convites com validade e limite de usos
create table if not exists public.invites (
  code text primary key default substr(md5(random()::text || clock_timestamp()::text), 1, 8),
  server_id uuid not null references public.servers on delete cascade,
  created_by uuid references public.profiles on delete set null,
  max_uses int check (max_uses is null or max_uses between 1 and 1000),
  uses int not null default 0,
  expires_at timestamptz,
  created_at timestamptz default now()
);
alter table public.invites enable row level security;
drop policy if exists "ver convites" on public.invites;
create policy "ver convites" on public.invites for select to authenticated using (created_by = auth.uid() or has_perm(server_id, 'manage_server'));
drop policy if exists "apagar convites" on public.invites;
create policy "apagar convites" on public.invites for delete to authenticated using (created_by = auth.uid() or has_perm(server_id, 'manage_server'));

create or replace function public.create_invite(p_server uuid, p_hours int, p_max_uses int) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not is_member(p_server) then raise exception 'Voce nao e membro deste servidor'; end if;
  insert into invites(server_id, created_by, max_uses, expires_at)
    values (p_server, auth.uid(), nullif(p_max_uses, 0), case when coalesce(p_hours, 0) <= 0 then null else now() + make_interval(hours => least(p_hours, 8760)) end)
    returning code into c;
  return c;
end $$;

create or replace function public.join_server(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid; base uuid; inv invites; joined boolean;
begin
  select id into sid from servers where invite_code = p_code;
  if sid is null then
    select * into inv from invites where code = p_code;
    if inv.code is null then raise exception 'Convite invalido'; end if;
    if inv.expires_at is not null and inv.expires_at < now() then raise exception 'Este convite expirou'; end if;
    if inv.max_uses is not null and inv.uses >= inv.max_uses then raise exception 'Este convite atingiu o limite de usos'; end if;
    sid := inv.server_id;
  end if;
  if exists(select 1 from bans where server_id = sid and user_id = auth.uid()) then raise exception 'Voce foi banido deste servidor'; end if;
  select exists(select 1 from members where server_id = sid and user_id = auth.uid()) into joined;
  if not joined then
    select id into base from roles where server_id = sid order by position asc limit 1;
    insert into members(server_id, user_id, role, role_id) values (sid, auth.uid(), 'member', base);
    if inv.code is not null then update invites set uses = uses + 1 where code = inv.code; end if;
  end if;
  return sid;
end $$;

-- =============== cores padrao dos cargos (paleta nova); so troca quem ainda usa as cores antigas
update public.roles set color = '#E07A4E' where color = '#C8F169';
update public.roles set color = '#E0A84E' where color = '#7EE8A8';
update public.roles set color = '#A69D91' where color = '#8E9A92';

create or replace function public.create_server(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid; dono uuid;
begin
  insert into servers(name, owner_id) values (p_name, auth.uid()) returning id into sid;
  insert into roles(server_id, name, color, position, perms) values
    (sid, 'Dono', '#E07A4E', 100, array['manage_channels','manage_roles','manage_messages','kick_members','manage_server','ban_members','view_audit_log','moderate_members']) returning id into dono;
  insert into roles(server_id, name, color, position, perms) values
    (sid, 'Admin', '#E0A84E', 50, array['manage_channels','manage_roles','manage_messages','kick_members','ban_members','view_audit_log','moderate_members']),
    (sid, 'Membro', '#A69D91', 0, '{}');
  insert into members(server_id, user_id, role, role_id) values (sid, auth.uid(), 'owner', dono);
  insert into channels(server_id, name, type) values (sid, 'geral', 'text'), (sid, 'Voz', 'voice');
  return sid;
end $$;
