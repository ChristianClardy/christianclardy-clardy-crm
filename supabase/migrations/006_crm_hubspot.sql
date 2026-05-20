-- ============================================================
-- CRM HubSpot-style upgrade
-- Adds: crm_companies, deals, crm_activities
-- ============================================================

-- ============================================================
-- CRM COMPANIES
-- ============================================================

CREATE TABLE crm_companies (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  website          TEXT,
  phone            TEXT,
  email            TEXT,
  industry         TEXT,
  company_size     TEXT CHECK (company_size IN ('1-10','11-50','51-200','201-500','500+')),
  address          TEXT,
  city             TEXT,
  state            TEXT,
  annual_revenue   NUMERIC,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_crm_companies_organization_id ON crm_companies(organization_id);

CREATE TRIGGER crm_companies_updated_at
  BEFORE UPDATE ON crm_companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- DEALS
-- ============================================================

CREATE TABLE deals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  value            NUMERIC(12,2) DEFAULT 0,
  stage            TEXT DEFAULT 'lead',
  probability      INT DEFAULT 20 CHECK (probability >= 0 AND probability <= 100),
  close_date       DATE,
  lead_id          UUID REFERENCES leads(id) ON DELETE SET NULL,
  company_id       UUID REFERENCES crm_companies(id) ON DELETE SET NULL,
  assigned_to      TEXT,
  description      TEXT,
  lost_reason      TEXT,
  won_at           TIMESTAMPTZ,
  lost_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_deals_organization_id ON deals(organization_id);
CREATE INDEX idx_deals_lead_id         ON deals(lead_id);
CREATE INDEX idx_deals_company_id      ON deals(company_id);
CREATE INDEX idx_deals_stage           ON deals(stage);

CREATE TRIGGER deals_updated_at
  BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- CRM ACTIVITIES
-- ============================================================

CREATE TABLE crm_activities (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  type             TEXT NOT NULL CHECK (type IN ('call','email','meeting','note','task','sms')),
  subject          TEXT,
  body             TEXT,
  outcome          TEXT,
  duration_min     INT,
  scheduled_at     TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  is_completed     BOOLEAN DEFAULT false,
  lead_id          UUID REFERENCES leads(id) ON DELETE CASCADE,
  deal_id          UUID REFERENCES deals(id) ON DELETE CASCADE,
  company_id       UUID REFERENCES crm_companies(id) ON DELETE CASCADE,
  assigned_to      TEXT,
  created_by       TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_crm_activities_organization_id ON crm_activities(organization_id);
CREATE INDEX idx_crm_activities_lead_id         ON crm_activities(lead_id);
CREATE INDEX idx_crm_activities_deal_id         ON crm_activities(deal_id);
CREATE INDEX idx_crm_activities_type            ON crm_activities(type);
CREATE INDEX idx_crm_activities_is_completed    ON crm_activities(is_completed);

CREATE TRIGGER crm_activities_updated_at
  BEFORE UPDATE ON crm_activities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE crm_companies  ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals           ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_activities  ENABLE ROW LEVEL SECURITY;

-- crm_companies
CREATE POLICY "org members can select crm_companies"
  ON crm_companies FOR SELECT
  USING (organization_id = get_my_org_id());

CREATE POLICY "org members can insert crm_companies"
  ON crm_companies FOR INSERT
  WITH CHECK (organization_id = get_my_org_id());

CREATE POLICY "org members can update crm_companies"
  ON crm_companies FOR UPDATE
  USING (organization_id = get_my_org_id())
  WITH CHECK (organization_id = get_my_org_id());

CREATE POLICY "org members can delete crm_companies"
  ON crm_companies FOR DELETE
  USING (organization_id = get_my_org_id());

-- deals
CREATE POLICY "org members can select deals"
  ON deals FOR SELECT
  USING (organization_id = get_my_org_id());

CREATE POLICY "org members can insert deals"
  ON deals FOR INSERT
  WITH CHECK (organization_id = get_my_org_id());

CREATE POLICY "org members can update deals"
  ON deals FOR UPDATE
  USING (organization_id = get_my_org_id())
  WITH CHECK (organization_id = get_my_org_id());

CREATE POLICY "org members can delete deals"
  ON deals FOR DELETE
  USING (organization_id = get_my_org_id());

-- crm_activities
CREATE POLICY "org members can select crm_activities"
  ON crm_activities FOR SELECT
  USING (organization_id = get_my_org_id());

CREATE POLICY "org members can insert crm_activities"
  ON crm_activities FOR INSERT
  WITH CHECK (organization_id = get_my_org_id());

CREATE POLICY "org members can update crm_activities"
  ON crm_activities FOR UPDATE
  USING (organization_id = get_my_org_id())
  WITH CHECK (organization_id = get_my_org_id());

CREATE POLICY "org members can delete crm_activities"
  ON crm_activities FOR DELETE
  USING (organization_id = get_my_org_id());
