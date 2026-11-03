-- Holzcord: banco de dados completo (gerado automaticamente a partir de supabase/migrations).
-- Pode ser executado varias vezes: cria o que falta e atualiza o resto. Cole tudo no SQL Editor do Supabase e clique em Run.

-- ===== 0001_init.sql (somente se o banco ainda nao foi criado)
do $holz_base$ begin
  if to_regclass('public.profiles') is null then
    execute $holz_sql$
-- Holzcord: schema inicial
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null check (char_length(username) between 2 and 32),
  avatar_url text,
  created_at timestamptz default now()
);
create table servers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  owner_id uuid not null references profiles(id),
  invite_code text unique not null default substr(md5(random()::text), 1, 8),
  created_at timestamptz default now()
);
create table members (
  server_id uuid references servers on delete cascade,
  user_id uuid references profiles on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  joined_at timestamptz default now(),
  primary key (server_id, user_id)
);
create table channels (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references servers on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  type text not null default 'text' check (type in ('text','voice')),
  created_at timestamptz default now()
);
create table messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels on delete cascade,
  author_id uuid not null references profiles(id),
  content text not null check (char_length(content) <= 4000),
  attachment_url text,
  reply_to uuid references messages(id) on delete set null,
  edited_at timestamptz,
  created_at timestamptz default now()
);
create index on messages (channel_id, created_at desc);
create table reactions (
  message_id uuid references messages on delete cascade,
  user_id uuid references profiles on delete cascade,
  emoji text not null,
  primary key (message_id, user_id, emoji)
);

-- helpers (security definer evita recursao de RLS)
create function is_member(sid uuid) returns boolean language sql security definer stable as
$$ select exists(select 1 from members where server_id = sid and user_id = auth.uid()) $$;
create function is_admin(sid uuid) returns boolean language sql security definer stable as
$$ select exists(select 1 from members where server_id = sid and user_id = auth.uid() and role in ('owner','admin')) $$;
create function channel_server(cid uuid) returns uuid language sql security definer stable as
$$ select server_id from channels where id = cid $$;

-- criar servidor: dono + #geral + voz
create function create_server(p_name text) returns uuid language plpgsql security definer as $$
declare sid uuid;
begin
  insert into servers(name, owner_id) values (p_name, auth.uid()) returning id into sid;
  insert into members values (sid, auth.uid(), 'owner');
  insert into channels(server_id, name, type) values (sid, 'geral', 'text'), (sid, 'Voz', 'voice');
  return sid;
end $$;
-- entrar por convite
create function join_server(p_code text) returns uuid language plpgsql security definer as $$
declare sid uuid;
begin
  select id into sid from servers where invite_code = p_code;
  if sid is null then raise exception 'Convite invalido'; end if;
  insert into members values (sid, auth.uid(), 'member') on conflict do nothing;
  return sid;
end $$;
-- perfil automatico no cadastro
create function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, username) values (new.id, coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- RLS
alter table profiles enable row level security;
alter table servers enable row level security;
alter table members enable row level security;
alter table channels enable row level security;
alter table messages enable row level security;
alter table reactions enable row level security;

create policy "perfis visiveis" on profiles for select to authenticated using (true);
create policy "editar proprio perfil" on profiles for update to authenticated using (id = auth.uid());
create policy "ver servidores" on servers for select to authenticated using (is_member(id));
create policy "editar servidor" on servers for update to authenticated using (is_admin(id));
create policy "ver membros" on members for select to authenticated using (is_member(server_id));
create policy "sair do servidor" on members for delete to authenticated using (user_id = auth.uid() or is_admin(server_id));
create policy "ver canais" on channels for select to authenticated using (is_member(server_id));
create policy "gerir canais" on channels for all to authenticated using (is_admin(server_id)) with check (is_admin(server_id));
create policy "ver mensagens" on messages for select to authenticated using (is_member(channel_server(channel_id)));
create policy "enviar mensagem" on messages for insert to authenticated
  with check (author_id = auth.uid() and is_member(channel_server(channel_id)));
create policy "editar propria" on messages for update to authenticated using (author_id = auth.uid());
create policy "apagar mensagem" on messages for delete to authenticated
  using (author_id = auth.uid() or is_admin(channel_server(channel_id)));
create policy "ver reacoes" on reactions for select to authenticated
  using (is_member(channel_server((select channel_id from messages where id = message_id))));
create policy "reagir" on reactions for insert to authenticated with check (user_id = auth.uid());
create policy "remover reacao" on reactions for delete to authenticated using (user_id = auth.uid());

-- realtime
alter publication supabase_realtime add table messages, reactions, members, channels;

-- storage para anexos
insert into storage.buckets (id, name, public) values ('attachments', 'attachments', true) on conflict do nothing;
create policy "upload anexos" on storage.objects for insert to authenticated with check (bucket_id = 'attachments');
create policy "ler anexos" on storage.objects for select using (bucket_id = 'attachments');

    $holz_sql$;
  end if;
end $holz_base$;

-- ===== 0002_login_sem_senha.sql
-- Corrige/cria o gatilho que gera o perfil ao criar usuario (inclusive anonimo).
-- Roda no schema auth, entao precisa de search_path e nomes qualificados (public.profiles).
-- Ative tambem: Authentication > Sign In / Providers > "Allow anonymous sign-ins".
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare base text; final text; n int := 0;
begin
  base := left(coalesce(nullif(trim(new.raw_user_meta_data->>'username'), ''),
                        nullif(split_part(coalesce(new.email,''),'@',1), ''), 'user'), 28);
  if char_length(base) < 2 then base := base || '_'; end if;
  final := base;
  while exists(select 1 from public.profiles where username = final) loop
    n := n + 1; final := base || n::text;
  end loop;
  insert into public.profiles(id, username) values (new.id, final);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();


-- ===== 0003_cargos_e_canais.sql
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


-- ===== 0004_dms_reacoes_perfil.sql
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


-- ===== 0005_social_moderacao.sql
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


-- ===== 0006_topicos_convites.sql
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


