create extension if not exists pgcrypto with schema extensions;

create table public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
grant select, insert, update, delete on public.app_settings to authenticated;
grant all on public.app_settings to service_role;
alter table public.app_settings enable row level security;
create policy "admins read settings" on public.app_settings for select to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "admins write settings" on public.app_settings for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create or replace function public.set_access_pin(_pin text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.has_role(auth.uid(),'admin') then
    raise exception 'forbidden';
  end if;
  if length(_pin) < 4 then
    raise exception 'pin too short';
  end if;
  insert into public.app_settings(key,value,updated_by)
    values('call_base_pin', extensions.crypt(_pin, extensions.gen_salt('bf')), auth.uid())
    on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
end$$;

create or replace function public.verify_access_pin(_pin text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare h text;
begin
  select value into h from public.app_settings where key = 'call_base_pin';
  if h is null then return false; end if;
  return h = extensions.crypt(_pin, h);
end$$;

grant execute on function public.set_access_pin(text) to authenticated;
grant execute on function public.verify_access_pin(text) to authenticated;