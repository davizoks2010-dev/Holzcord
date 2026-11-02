-- Login anonimo (so com nome de usuario). Ative tambem em:
-- Authentication > Sign In / Providers > "Allow anonymous sign-ins".
create or replace function handle_new_user() returns trigger language plpgsql security definer as $$
declare base text; final text; n int := 0;
begin
  base := left(coalesce(nullif(trim(new.raw_user_meta_data->>'username'), ''), nullif(split_part(coalesce(new.email,''),'@',1), ''), 'user'), 28);
  if char_length(base) < 2 then base := base || '_'; end if;
  final := base;
  while exists(select 1 from profiles where username = final) loop
    n := n + 1; final := base || n::text;
  end loop;
  insert into profiles(id, username) values (new.id, final);
  return new;
end $$;
