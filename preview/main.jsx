import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App.jsx';
import '@/index.css';
import { installTenantDemo } from '@/lib/tenantPreview';
import { FOUNDING_ORG_ID, TENANT_MODULES } from '@/lib/tenantCatalog';

const screen = new URLSearchParams(window.location.search).get('screen');
if (screen === 'workspace') window.history.replaceState(null, '', '/Settings?tab=workspace');
if (screen === 'billing') window.history.replaceState(null, '', '/Settings?tab=billing');
if (screen === 'platform') window.history.replaceState(null, '', '/Platform');

installTenantDemo({
  screen,
  isPlatformAdmin: true,
  organization: { id: FOUNDING_ORG_ID, name: 'Clardy Construction, LLC', slug: 'clardy' },
  membership: { role: 'admin', is_owner: true, status: 'active' },
  subscription: { plan_key: 'enterprise', status: 'comped' },
  modules: TENANT_MODULES.map((mod) => ({
    module_key: mod.key,
    enabled: mod.key !== 'purchasing',
    included_in_plan: true,
  })),
  settings: {
    branding: { logo_url: '', primary_color: '#3d3530', accent_color: '#b5965a', font_family: 'Georgia' },
    numbering: {
      invoice: { prefix: 'INV-' },
      estimate: { prefix: 'EST-' },
      project: { prefix: 'JOB-' },
    },
  },
  stages: [
    { id: '1', stage_key: 'new-lead', label: 'New Lead', sort_order: 10 },
    { id: '2', stage_key: 'contacted', label: 'Contacted', sort_order: 20 },
    { id: '3', stage_key: 'in-design', label: 'In Design', sort_order: 30 },
    { id: '4', stage_key: 'won', label: 'Contract Signed/Deposit Collected (Won)', sort_order: 40, is_won: true },
    { id: '5', stage_key: 'lost', label: 'Lost/No Decision', sort_order: 50, is_lost: true },
  ],
  fields: [
    { id: 'f1', label: 'HOA approval', entity_type: 'project', field_type: 'boolean' },
    { id: 'f2', label: 'Gate code', entity_type: 'lead', field_type: 'text' },
  ],
  taxes: [{ id: 't1', name: 'Texas', rate: 8.25, is_default: true }],
  prices: [{
    id: 'p1', name: 'Default', is_default: true,
    price_list_items: [{ id: 'i1', name: 'St. Augustine sod', unit_price: 0.42, unit: 'sqft' }],
  }],
  directory: [
    { organization_id: FOUNDING_ORG_ID, name: 'Clardy Construction, LLC', slug: 'clardy', plan_key: 'enterprise', status: 'comped', member_count: 8, enabled_modules: 12 },
    { organization_id: '22222222-2222-4222-8222-222222222222', name: 'North Star Pools', slug: 'north-star-pools', plan_key: 'professional', status: 'trialing', member_count: 2, enabled_modules: 10 },
  ],
});

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
