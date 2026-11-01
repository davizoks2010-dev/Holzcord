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
create function handle_new_user() returns trigger language plpgsql security definer as $$
begin
  insert into profiles(id, username) values (new.id, coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)));
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
