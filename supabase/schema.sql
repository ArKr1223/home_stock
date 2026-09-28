-- Run once in the Supabase SQL editor for a new project.
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  purchase_no text not null,
  photo_path text,
  name text not null check (length(btrim(name)) > 0),
  category text not null default '',
  brand text not null default '',
  purchase_date date not null,
  expiry_date date,
  quantity numeric(12, 3) not null check (quantity > 0),
  unit text not null default '',
  currency text not null default 'TWD',
  unit_price numeric(14, 2) not null default 0 check (unit_price >= 0),
  amount numeric(16, 2) generated always as (round(quantity * unit_price, 2)) stored,
  purchase_place text not null default '',
  location text not null default '',
  notes text not null default '',
  issued_quantity numeric(12, 3) not null default 0 check (issued_quantity >= 0 and issued_quantity <= quantity),
  completed boolean not null default false,
  stock_status text not null default 'in_stock' check (stock_status in ('in_stock', 'low_stock', 'out_of_stock', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, purchase_no),
  unique (user_id, id)
);

create table if not exists public.issues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  purchase_id uuid not null,
  purchase_no text not null,
  item_name text not null,
  issue_date date not null,
  quantity numeric(12, 3) not null check (quantity > 0),
  notes text not null default '',
  created_at timestamptz not null default now(),
  foreign key (user_id, purchase_id) references public.purchases(user_id, id) on delete cascade
);

create table if not exists public.price_headers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  compare_no text not null,
  name text not null check (length(btrim(name)) > 0),
  photo_path text,
  compare_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, compare_no),
  unique (user_id, id)
);

create table if not exists public.price_details (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  price_header_id uuid not null,
  compare_no text not null,
  merchant text not null check (length(btrim(merchant)) > 0),
  detail_date date not null,
  currency text not null default 'TWD',
  unit_price numeric(14, 2) not null check (unit_price >= 0),
  purchased boolean not null default false,
  notes text not null default '',
  created_at timestamptz not null default now(),
  foreign key (user_id, price_header_id) references public.price_headers(user_id, id) on delete cascade
);

create index if not exists purchases_user_date_idx on public.purchases (user_id, purchase_date desc);
create index if not exists purchases_user_status_idx on public.purchases (user_id, stock_status);
create index if not exists purchases_search_idx on public.purchases using gin ((name || ' ' || category || ' ' || brand || ' ' || location || ' ' || notes) gin_trgm_ops);
create index if not exists issues_user_date_idx on public.issues (user_id, issue_date desc);
create index if not exists issues_purchase_idx on public.issues (purchase_id);
create index if not exists price_headers_user_date_idx on public.price_headers (user_id, compare_date desc);
create index if not exists price_headers_name_idx on public.price_headers using gin (name gin_trgm_ops);
create index if not exists price_details_header_idx on public.price_details (price_header_id, detail_date desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists purchases_set_updated_at on public.purchases;
create trigger purchases_set_updated_at before update on public.purchases for each row execute function public.set_updated_at();
drop trigger if exists price_headers_set_updated_at on public.price_headers;
create trigger price_headers_set_updated_at before update on public.price_headers for each row execute function public.set_updated_at();

alter table public.purchases enable row level security;
alter table public.issues enable row level security;
alter table public.price_headers enable row level security;
alter table public.price_details enable row level security;

drop policy if exists "Users read own purchases" on public.purchases;
create policy "Users read own purchases" on public.purchases for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users insert own purchases" on public.purchases;
create policy "Users insert own purchases" on public.purchases for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Users update own purchases" on public.purchases;
create policy "Users update own purchases" on public.purchases for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users delete own purchases" on public.purchases;
create policy "Users delete own purchases" on public.purchases for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users read own issues" on public.issues;
create policy "Users read own issues" on public.issues for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users insert own issues" on public.issues;
create policy "Users insert own issues" on public.issues for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Users update own issues" on public.issues;
create policy "Users update own issues" on public.issues for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users delete own issues" on public.issues;
create policy "Users delete own issues" on public.issues for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users read own price headers" on public.price_headers;
create policy "Users read own price headers" on public.price_headers for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users insert own price headers" on public.price_headers;
create policy "Users insert own price headers" on public.price_headers for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Users update own price headers" on public.price_headers;
create policy "Users update own price headers" on public.price_headers for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users delete own price headers" on public.price_headers;
create policy "Users delete own price headers" on public.price_headers for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users read own price details" on public.price_details;
create policy "Users read own price details" on public.price_details for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users insert own price details" on public.price_details;
create policy "Users insert own price details" on public.price_details for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Users update own price details" on public.price_details;
create policy "Users update own price details" on public.price_details for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users delete own price details" on public.price_details;
create policy "Users delete own price details" on public.price_details for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function public.record_issue(p_purchase_id uuid, p_issue_date date, p_quantity numeric, p_notes text default '')
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.purchases;
  new_id uuid;
begin
  select * into target from public.purchases where id = p_purchase_id and user_id = (select auth.uid()) for update;
  if target.id is null then raise exception '找不到採購資料'; end if;
  if p_quantity <= 0 or p_quantity > target.quantity - target.issued_quantity then raise exception '領用數量超過可用庫存'; end if;
  insert into public.issues (user_id, purchase_id, purchase_no, item_name, issue_date, quantity, notes)
  values ((select auth.uid()), target.id, target.purchase_no, target.name, p_issue_date, p_quantity, coalesce(p_notes, '')) returning id into new_id;
  update public.purchases
  set issued_quantity = issued_quantity + p_quantity,
      completed = issued_quantity + p_quantity >= quantity,
      stock_status = case when issued_quantity + p_quantity >= quantity then 'out_of_stock' else stock_status end
  where id = target.id;
  return new_id;
end;
$$;

create or replace function public.delete_issue(p_issue_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.issues;
begin
  select * into target from public.issues where id = p_issue_id and user_id = (select auth.uid()) for update;
  if target.id is null then raise exception '找不到領用資料'; end if;
  update public.purchases
  set issued_quantity = greatest(0, issued_quantity - target.quantity),
      completed = false,
      stock_status = case when stock_status = 'out_of_stock' then 'in_stock' else stock_status end
  where id = target.purchase_id and user_id = (select auth.uid());
  delete from public.issues where id = target.id;
end;
$$;

create or replace function public.purchase_from_price_detail(p_detail_id uuid, p_purchase_no text, p_location text default '')
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  detail public.price_details;
  header public.price_headers;
  new_id uuid;
begin
  select * into detail from public.price_details where id = p_detail_id and user_id = (select auth.uid()) for update;
  if detail.id is null then raise exception '找不到比價資料'; end if;
  select * into header from public.price_headers where id = detail.price_header_id and user_id = (select auth.uid());
  insert into public.purchases (user_id, purchase_no, photo_path, name, purchase_date, quantity, unit, currency, unit_price, purchase_place, location)
  values ((select auth.uid()), p_purchase_no, header.photo_path, header.name, current_date, 1, '件', detail.currency, detail.unit_price, detail.merchant, coalesce(p_location, ''))
  returning id into new_id;
  update public.price_details set purchased = true where id = detail.id;
  return new_id;
end;
$$;

revoke all on function public.record_issue(uuid, date, numeric, text) from public, anon;
revoke all on function public.delete_issue(uuid) from public, anon;
revoke all on function public.purchase_from_price_detail(uuid, text, text) from public, anon;
grant execute on function public.record_issue(uuid, date, numeric, text) to authenticated;
grant execute on function public.delete_issue(uuid) to authenticated;
grant execute on function public.purchase_from_price_detail(uuid, text, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('item-photos', 'item-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users read own item photos" on storage.objects;
create policy "Users read own item photos" on storage.objects for select to authenticated
using (bucket_id = 'item-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Users upload own item photos" on storage.objects;
create policy "Users upload own item photos" on storage.objects for insert to authenticated
with check (bucket_id = 'item-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Users update own item photos" on storage.objects;
create policy "Users update own item photos" on storage.objects for update to authenticated
using (bucket_id = 'item-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'item-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Users delete own item photos" on storage.objects;
create policy "Users delete own item photos" on storage.objects for delete to authenticated
using (bucket_id = 'item-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.purchases, public.issues, public.price_headers, public.price_details to authenticated;
