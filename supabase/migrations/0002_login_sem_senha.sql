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
