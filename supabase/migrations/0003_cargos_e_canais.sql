-- Cargos com hierarquia, permissoes e gestao de canais/membros.
-- Posicao maior = cargo mais alto. O dono do servidor tem posicao 1000 e todas as permissoes.

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers on delete cascade,
  name text not null check (char_length(name) between 1 and 32),
  color text not null default '#8E9A92' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  position int not null default 0 check (position between 0 and 999),
  perms text[] not null default '{}',
  created_at timestamptz default now()
);
create index if not exists roles_server_idx on public.roles(server_id);
alter table public.members add column if not exists role_id uuid references public.roles(id) on delete set null;

-- ---------- funcoes auxiliares (security definer evita recursao de RLS)
create or replace function public.my_perms(sid uuid) returns text[]
language sql security definer stable set search_path = public as $$
  select case
    when exists(select 1 from servers where id = sid and owner_id = auth.uid())
      then array['manage_channels','manage_roles','manage_messages','kick_members','manage_server']
    else coalesce((select r.perms from members m join roles r on r.id = m.role_id
                   where m.server_id = sid and m.user_id = auth.uid()), '{}')
  end $$;

create or replace function public.has_perm(sid uuid, p text) returns boolean
language sql security definer stable set search_path = public as $$
  select p = any(public.my_perms(sid)) $$;

create or replace function public.member_pos(sid uuid, uid uuid) returns int
language sql security definer stable set search_path = public as $$
  select case
    when exists(select 1 from servers where id = sid and owner_id = uid) then 1000
    else coalesce((select r.position from members m join roles r on r.id = m.role_id
                   where m.server_id = sid and m.user_id = uid), 0)
  end $$;

create or replace function public.role_pos(rid uuid) returns int
language sql security definer stable set search_path = public as $$
  select position from roles where id = rid $$;

-- ---------- criar servidor / entrar por convite agora usam cargos
create or replace function public.create_server(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid; dono uuid;
begin
  insert into servers(name, owner_id) values (p_name, auth.uid()) returning id into sid;
  insert into roles(server_id, name, color, position, perms) values
    (sid, 'Dono', '#C8F169', 100, array['manage_channels','manage_roles','manage_messages','kick_members','manage_server']) returning id into dono;
  insert into roles(server_id, name, color, position, perms) values
    (sid, 'Admin', '#7EE8A8', 50, array['manage_channels','manage_roles','manage_messages','kick_members']),
    (sid, 'Membro', '#8E9A92', 0, '{}');
  insert into members(server_id, user_id, role, role_id) values (sid, auth.uid(), 'owner', dono);
  insert into channels(server_id, name, type) values (sid, 'geral', 'text'), (sid, 'Voz', 'voice');
  return sid;
end $$;

create or replace function public.join_server(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid; base uuid;
begin
  select id into sid from servers where invite_code = p_code;
  if sid is null then raise exception 'Convite invalido'; end if;
  select id into base from roles where server_id = sid order by position asc limit 1;
  insert into members(server_id, user_id, role, role_id) values (sid, auth.uid(), 'member', base) on conflict do nothing;
  return sid;
end $$;

-- ---------- servidores ja existentes: cria cargos e atribui
insert into public.roles(server_id, name, color, position, perms)
  select s.id, 'Dono', '#C8F169', 100, array['manage_channels','manage_roles','manage_messages','kick_members','manage_server']
  from servers s where not exists (select 1 from roles r where r.server_id = s.id);
insert into public.roles(server_id, name, color, position, perms)
  select s.id, 'Admin', '#7EE8A8', 50, array['manage_channels','manage_roles','manage_messages','kick_members']
  from servers s where not exists (select 1 from roles r where r.server_id = s.id and r.name = 'Admin');
insert into public.roles(server_id, name, color, position, perms)
  select s.id, 'Membro', '#8E9A92', 0, '{}' from servers s where not exists (select 1 from roles r where r.server_id = s.id and r.name = 'Membro');
update public.members m set role_id = (
  select r.id from roles r where r.server_id = m.server_id
    and r.name = case m.role when 'owner' then 'Dono' when 'admin' then 'Admin' else 'Membro' end limit 1)
where m.role_id is null;

-- ---------- RLS
alter table public.roles enable row level security;
drop policy if exists "ver cargos" on public.roles;
create policy "ver cargos" on public.roles for select to authenticated using (is_member(server_id));
drop policy if exists "criar cargos" on public.roles;
create policy "criar cargos" on public.roles for insert to authenticated
  with check (has_perm(server_id, 'manage_roles') and position < member_pos(server_id, auth.uid()) and perms <@ my_perms(server_id));
drop policy if exists "editar cargos" on public.roles;
create policy "editar cargos" on public.roles for update to authenticated
  using (has_perm(server_id, 'manage_roles') and position < member_pos(server_id, auth.uid()))
  with check (position < member_pos(server_id, auth.uid()) and perms <@ my_perms(server_id));
drop policy if exists "apagar cargos" on public.roles;
create policy "apagar cargos" on public.roles for delete to authenticated
  using (has_perm(server_id, 'manage_roles') and position < member_pos(server_id, auth.uid()));

-- membros: so o cargo pode mudar, e apenas para quem esta abaixo de voce
revoke update on public.members from anon, authenticated;
grant update (role_id) on public.members to authenticated;
drop policy if exists "atribuir cargo" on public.members;
create policy "atribuir cargo" on public.members for update to authenticated
  using (has_perm(server_id, 'manage_roles') and member_pos(server_id, user_id) < member_pos(server_id, auth.uid()))
  with check (role_id is null or role_pos(role_id) < member_pos(server_id, auth.uid()));
drop policy if exists "sair do servidor" on public.members;
drop policy if exists "sair ou expulsar" on public.members;
create policy "sair ou expulsar" on public.members for delete to authenticated using (
  (user_id = auth.uid() and not exists (select 1 from servers s where s.id = server_id and s.owner_id = auth.uid()))
  or (has_perm(server_id, 'kick_members') and member_pos(server_id, user_id) < member_pos(server_id, auth.uid())));

-- canais
drop policy if exists "gerir canais" on public.channels;
drop policy if exists "criar canais" on public.channels;
create policy "criar canais" on public.channels for insert to authenticated with check (has_perm(server_id, 'manage_channels'));
drop policy if exists "editar canais" on public.channels;
create policy "editar canais" on public.channels for update to authenticated
  using (has_perm(server_id, 'manage_channels')) with check (has_perm(server_id, 'manage_channels'));
drop policy if exists "apagar canais" on public.channels;
create policy "apagar canais" on public.channels for delete to authenticated using (has_perm(server_id, 'manage_channels'));

-- mensagens e servidor
drop policy if exists "apagar mensagem" on public.messages;
create policy "apagar mensagem" on public.messages for delete to authenticated
  using (author_id = auth.uid() or has_perm(channel_server(channel_id), 'manage_messages'));
drop policy if exists "editar servidor" on public.servers;
create policy "editar servidor" on public.servers for update to authenticated
  using (has_perm(id, 'manage_server')) with check (has_perm(id, 'manage_server'));

do $$ begin alter publication supabase_realtime add table public.roles; exception when duplicate_object then null; end $$;
