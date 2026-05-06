-- Enable RLS on organization_members table
alter table public.organization_members enable row level security;

-- Members can view other members in their own organization
create policy "org members can view members"
  on public.organization_members
  for select
  using (organization_id = get_my_org_id());

-- Only org members can insert new members into their organization
create policy "org members can insert members"
  on public.organization_members
  for insert
  with check (organization_id = get_my_org_id());

-- Org members can update members in their organization
create policy "org members can update members"
  on public.organization_members
  for update
  using (organization_id = get_my_org_id())
  with check (organization_id = get_my_org_id());

-- Org members can delete members from their organization
create policy "org members can delete members"
  on public.organization_members
  for delete
  using (organization_id = get_my_org_id());
