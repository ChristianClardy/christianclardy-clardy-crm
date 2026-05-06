-- Designs table for the Design Portal / 2D canvas editor
create table if not exists public.designs (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid references public.organizations(id) on delete cascade,
  title            text not null,
  client_name      text,
  address          text,
  project_types    text[] default '{}',
  status           text not null default 'concept',
  notes            text,
  estimate_id      uuid,
  canvas_data      jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- RLS
alter table public.designs enable row level security;

create policy "org members can manage designs"
  on public.designs
  for all
  using  (organization_id = get_my_org_id())
  with check (organization_id = get_my_org_id());

-- Keep updated_at current
create or replace trigger set_designs_updated_at
  before update on public.designs
  for each row execute function public.handle_updated_at();
