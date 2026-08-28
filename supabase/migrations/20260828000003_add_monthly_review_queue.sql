create extension if not exists pg_cron;

alter table public.restaurants
  add column if not exists location_verification text not null default 'needs_review'
    check (location_verification in ('verified', 'needs_review', 'closed')),
  add column if not exists last_verified_at date,
  add column if not exists next_review_at date;

update public.restaurants
set location_verification = case when geocode_confidence = 'manual' then 'verified' else 'needs_review' end,
    last_verified_at = case when geocode_confidence = 'manual' then current_date else null end,
    next_review_at = case when geocode_confidence = 'manual' then current_date + interval '180 days' else current_date end
where next_review_at is null;

create table if not exists public.review_queue (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  reason text not null,
  due_at date not null default current_date,
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists review_queue_one_open_item_per_restaurant
  on public.review_queue(restaurant_id) where status = 'open';
create index if not exists review_queue_open_due_idx on public.review_queue(status, due_at);

alter table public.review_queue enable row level security;
create policy "public personal review queue" on public.review_queue for all using (true) with check (true);

create or replace function public.populate_monthly_review_queue()
returns integer language plpgsql security definer set search_path = public as $$
declare inserted_count integer;
begin
  insert into public.review_queue (restaurant_id, reason, due_at)
  select r.id,
    case
      when nullif(trim(coalesce(r.address_raw, '')), '') is null then 'Thiếu địa chỉ — cần bổ sung để kiểm tra vị trí.'
      when r.lat is null or r.lng is null then 'Chưa có tọa độ — cần kiểm tra hoặc ghim tay.'
      when r.geocode_confidence <> 'manual' then 'Vị trí Nominatim chưa được kiểm chứng.'
      else 'Đã đến lịch rà soát định kỳ 6 tháng.'
    end,
    current_date
  from public.restaurants r
  where r.location_verification <> 'closed'
    and coalesce(r.next_review_at, current_date) <= current_date
    and not exists (
      select 1 from public.review_queue q
      where q.restaurant_id = r.id and q.status = 'open'
    );
  get diagnostics inserted_count = row_count;
  update public.restaurants
  set next_review_at = current_date + interval '180 days'
  where location_verification <> 'closed'
    and coalesce(next_review_at, current_date) <= current_date;
  return inserted_count;
end;
$$;

select public.populate_monthly_review_queue();

do $$
begin
  if exists (select 1 from cron.job where jobname = 'prot-food-monthly-review-queue') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'prot-food-monthly-review-queue';
  end if;
  perform cron.schedule(
    'prot-food-monthly-review-queue',
    '0 1 1 * *',
    'select public.populate_monthly_review_queue();'
  );
exception when undefined_table then
  raise notice 'pg_cron is unavailable; run public.populate_monthly_review_queue() from an external monthly scheduler.';
end;
$$;
