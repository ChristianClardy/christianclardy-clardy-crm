import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useTenant } from "@/lib/TenantContext";
import { TENANT_MODULES } from "@/lib/tenantCatalog";
import { tenantDemo } from "@/lib/tenantPreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Trash2 } from "lucide-react";

const FIELD_TYPES = ["text", "number", "date", "boolean", "select", "money"];
const ENTITIES = ["lead", "client", "project", "estimate", "invoice"];

const EMPTY_FIELD = { entity_type: "lead", label: "", field_type: "text" };

function slug(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "field";
}

export default function WorkspaceTab() {
  const demo = tenantDemo();
  const tenant = useTenant();
  const organization = demo?.organization || tenant.organization;
  const isAdmin = demo ? true : tenant.isAdmin;
  const [modules, setModules] = useState(demo?.modules || []);
  const [settings, setSettings] = useState(demo?.settings || null);
  const [stages, setStages] = useState(demo?.stages || []);
  const [fields, setFields] = useState(demo?.fields || []);
  const [taxes, setTaxes] = useState(demo?.taxes || []);
  const [prices, setPrices] = useState(demo?.prices || []);
  const [field, setField] = useState(EMPTY_FIELD);
  const [stageLabel, setStageLabel] = useState("");
  const [taxName, setTaxName] = useState("");
  const [taxRate, setTaxRate] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [loading, setLoading] = useState(!demo);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    if (!organization?.id || demo) { setLoading(false); return; }
    setLoading(true);
    const [mods, prefs, stageRows, fieldRows, taxRows, priceRows] = await Promise.all([
      supabase.from("tenant_modules").select("*").eq("organization_id", organization.id).order("module_key"),
      supabase.from("tenant_settings").select("*").eq("organization_id", organization.id).maybeSingle(),
      supabase.from("pipeline_stages").select("*").eq("organization_id", organization.id).eq("pipeline_key", "leads").order("sort_order"),
      supabase.from("custom_field_definitions").select("*").eq("organization_id", organization.id).eq("archived", false).order("sort_order"),
      supabase.from("tax_rates").select("*").eq("organization_id", organization.id).order("name"),
      supabase.from("price_lists").select("id, name, is_default, price_list_items(id, name, unit_price, unit)").eq("organization_id", organization.id).order("name"),
    ]);
    if (mods.error) setError("Workspace settings aren't in the database yet. Apply migration 065 first.");
    setModules(mods.data || []);
    setSettings(prefs.data || { branding: {}, numbering: {} });
    setStages(stageRows.data || []);
    setFields(fieldRows.data || []);
    setTaxes(taxRows.data || []);
    setPrices(priceRows.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [organization?.id]);

  const say = (text) => { setNotice(text); setError(""); };

  const toggleModule = async (row, enabled) => {
    if (!row.included_in_plan && enabled) return;
    setModules((list) => list.map((m) => m.module_key === row.module_key ? { ...m, enabled } : m));
    if (demo) { say(`${row.module_key} ${enabled ? "on" : "off"}`); return; }
    const { error: err } = await supabase.from("tenant_modules").update({ enabled, updated_at: new Date().toISOString() }).eq("organization_id", organization.id).eq("module_key", row.module_key);
    if (err) setError(err.message);
    else say("Module updated.");
  };

  const saveBranding = async () => {
    if (demo) { say("Branding saved."); return; }
    const { error: err } = await supabase.from("tenant_settings").upsert({
      organization_id: organization.id,
      branding: settings.branding,
      numbering: settings.numbering,
      updated_at: new Date().toISOString(),
    });
    if (err) setError(err.message);
    else say("Branding and numbering saved.");
  };

  const addStage = async () => {
    const label = stageLabel.trim();
    if (!label) return;
    const row = {
      organization_id: organization.id,
      pipeline_key: "leads",
      stage_key: slug(label),
      label,
      sort_order: (stages.at(-1)?.sort_order || 0) + 10,
    };
    if (demo) { setStages((list) => [...list, { ...row, id: crypto.randomUUID() }]); setStageLabel(""); say("Stage added."); return; }
    const { data, error: err } = await supabase.from("pipeline_stages").insert(row).select().single();
    if (err) setError(err.message);
    else { setStages((list) => [...list, data]); setStageLabel(""); say("Stage added. Lead pages pick it up on refresh."); }
  };

  const addField = async () => {
    if (!field.label.trim()) return;
    const row = {
      organization_id: organization.id,
      entity_type: field.entity_type,
      field_key: slug(field.label),
      label: field.label.trim(),
      field_type: field.field_type,
    };
    if (demo) { setFields((list) => [...list, { ...row, id: crypto.randomUUID() }]); setField(EMPTY_FIELD); say("Custom field added."); return; }
    const { data, error: err } = await supabase.from("custom_field_definitions").insert(row).select().single();
    if (err) setError(err.message);
    else { setFields((list) => [...list, data]); setField(EMPTY_FIELD); say("Custom field saved."); }
  };

  const addTax = async () => {
    if (!taxName.trim()) return;
    const row = { organization_id: organization.id, name: taxName.trim(), rate: Number(taxRate) || 0, is_default: taxes.length === 0 };
    if (demo) { setTaxes((list) => [...list, { ...row, id: crypto.randomUUID(), is_active: true }]); setTaxName(""); setTaxRate(""); say("Tax rate added."); return; }
    const { data, error: err } = await supabase.from("tax_rates").insert(row).select().single();
    if (err) setError(err.message);
    else { setTaxes((list) => [...list, data]); setTaxName(""); setTaxRate(""); say("Tax rate saved."); }
  };

  const addPrice = async () => {
    if (!itemName.trim()) return;
    const list = prices.find((p) => p.is_default) || prices[0];
    if (demo) {
      const next = list ? [...prices] : [{ id: "default", name: "Default", is_default: true, price_list_items: [] }];
      const target = next.find((p) => p.is_default) || next[0];
      target.price_list_items = [...(target.price_list_items || []), { id: crypto.randomUUID(), name: itemName.trim(), unit_price: Number(itemPrice) || 0, unit: "ea" }];
      setPrices(next);
      setItemName(""); setItemPrice("");
      say("Price added.");
      return;
    }
    let listId = list?.id;
    if (!listId) {
      const { data, error: err } = await supabase.from("price_lists").insert({ organization_id: organization.id, name: "Default", is_default: true }).select().single();
      if (err) { setError(err.message); return; }
      listId = data.id;
    }
    const { error: err } = await supabase.from("price_list_items").insert({
      organization_id: organization.id, price_list_id: listId, name: itemName.trim(), unit_price: Number(itemPrice) || 0, unit: "ea",
    });
    if (err) setError(err.message);
    else { setItemName(""); setItemPrice(""); say("Price saved."); load(); }
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-amber-600" /></div>;
  }

  const groups = [...new Set(TENANT_MODULES.map((m) => m.group))];
  const branding = settings?.branding || {};
  const numbering = settings?.numbering || {};

  return (
    <div className="space-y-8">
      {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {notice && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}

      <section className="space-y-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Modules</h3>
          <p className="text-sm text-slate-500">Turn parts of the workspace on or off. A module your plan doesn't include stays locked. Distribution and install are ready for the Turf'n Texas module.</p>
        </div>
        {groups.map((group) => (
          <div key={group} className="rounded-2xl border border-slate-200 bg-white">
            <p className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{group}</p>
            <div className="divide-y divide-slate-100">
              {TENANT_MODULES.filter((m) => m.group === group).map((mod) => {
                const row = modules.find((m) => m.module_key === mod.key) || { module_key: mod.key, enabled: false, included_in_plan: false };
                const locked = !row.included_in_plan;
                return (
                  <div key={mod.key} className="flex items-center gap-4 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">{mod.label}</p>
                      <p className="text-xs text-slate-500">{mod.description}{locked ? " Not included in this plan." : ""}</p>
                    </div>
                    <Switch
                      checked={!!row.enabled}
                      disabled={!isAdmin || locked}
                      onCheckedChange={(checked) => toggleModule(row, checked)}
                      aria-label={mod.label}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-base font-semibold text-slate-900">Branding</h3>
        <p className="text-sm text-slate-500">Logo, colors, and fonts for this workspace. Invoice and contract templates keep using the company profile until the next release applies these.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Logo URL</Label>
            <Input className="mt-1" value={branding.logo_url || ""} onChange={(e) => setSettings((s) => ({ ...s, branding: { ...s.branding, logo_url: e.target.value } }))} placeholder="https://…" />
          </div>
          <div>
            <Label className="text-xs">Font</Label>
            <Input className="mt-1" value={branding.font_family || ""} onChange={(e) => setSettings((s) => ({ ...s, branding: { ...s.branding, font_family: e.target.value } }))} />
          </div>
          <div>
            <Label className="text-xs">Primary color</Label>
            <Input className="mt-1" value={branding.primary_color || ""} onChange={(e) => setSettings((s) => ({ ...s, branding: { ...s.branding, primary_color: e.target.value } }))} />
          </div>
          <div>
            <Label className="text-xs">Accent color</Label>
            <Input className="mt-1" value={branding.accent_color || ""} onChange={(e) => setSettings((s) => ({ ...s, branding: { ...s.branding, accent_color: e.target.value } }))} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {["invoice", "estimate", "project"].map((doc) => (
            <div key={doc}>
              <Label className="text-xs capitalize">{doc} prefix</Label>
              <Input className="mt-1" value={numbering[doc]?.prefix || ""} onChange={(e) => setSettings((s) => ({
                ...s,
                numbering: { ...s.numbering, [doc]: { ...(s.numbering?.[doc] || {}), prefix: e.target.value } },
              }))} />
            </div>
          ))}
        </div>
        {isAdmin && <Button onClick={saveBranding} size="sm">Save branding</Button>}
      </section>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-base font-semibold text-slate-900">Lead pipeline</h3>
        <p className="text-sm text-slate-500">The same stages Clardy uses today, plus any you add. Won and lost detection still recognizes the original stage names.</p>
        <ol className="space-y-1">
          {stages.map((stage, index) => (
            <li key={stage.id || stage.stage_key} className="flex items-center gap-3 text-sm">
              <span className="w-6 text-slate-400">{index + 1}</span>
              <span className="text-slate-800">{stage.label}</span>
              {stage.is_won && <span className="text-xs text-emerald-700">Won</span>}
              {stage.is_lost && <span className="text-xs text-rose-700">Lost</span>}
            </li>
          ))}
        </ol>
        {isAdmin && (
          <div className="flex gap-2">
            <Input value={stageLabel} onChange={(e) => setStageLabel(e.target.value)} placeholder="New stage name" />
            <Button type="button" size="sm" onClick={addStage}><Plus className="mr-1 h-4 w-4" />Add</Button>
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-base font-semibold text-slate-900">Custom fields</h3>
        <p className="text-sm text-slate-500">Extra fields on leads, clients, projects, estimates, and invoices. Record screens show them in the next release; the definitions are saved now.</p>
        <ul className="space-y-1 text-sm">
          {fields.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3">
              <span>{f.label} <span className="text-slate-400">· {f.entity_type} · {f.field_type}</span></span>
              {isAdmin && !demo && (
                <button type="button" className="text-slate-400 hover:text-rose-600" onClick={async () => {
                  await supabase.from("custom_field_definitions").update({ archived: true }).eq("id", f.id);
                  setFields((list) => list.filter((row) => row.id !== f.id));
                }} aria-label={`Remove ${f.label}`}><Trash2 className="h-4 w-4" /></button>
              )}
            </li>
          ))}
          {fields.length === 0 && <li className="text-slate-400">No custom fields yet.</li>}
        </ul>
        {isAdmin && (
          <div className="grid gap-2 sm:grid-cols-4">
            <select className="h-9 rounded-md border border-slate-200 px-2 text-sm" value={field.entity_type} onChange={(e) => setField((f) => ({ ...f, entity_type: e.target.value }))}>
              {ENTITIES.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
            <Input value={field.label} onChange={(e) => setField((f) => ({ ...f, label: e.target.value }))} placeholder="Field label" />
            <select className="h-9 rounded-md border border-slate-200 px-2 text-sm" value={field.field_type} onChange={(e) => setField((f) => ({ ...f, field_type: e.target.value }))}>
              {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <Button type="button" size="sm" onClick={addField}>Add field</Button>
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="text-base font-semibold text-slate-900">Tax rates</h3>
          <ul className="space-y-1 text-sm">
            {taxes.map((t) => <li key={t.id}>{t.name} · {Number(t.rate)}%{t.is_default ? " · default" : ""}</li>)}
          </ul>
          {isAdmin && (
            <div className="flex gap-2">
              <Input value={taxName} onChange={(e) => setTaxName(e.target.value)} placeholder="Name" />
              <Input value={taxRate} onChange={(e) => setTaxRate(e.target.value)} placeholder="8.25" className="w-24" />
              <Button type="button" size="sm" onClick={addTax}>Add</Button>
            </div>
          )}
        </div>
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="text-base font-semibold text-slate-900">Price list</h3>
          <ul className="space-y-1 text-sm">
            {(prices[0]?.price_list_items || []).map((item) => (
              <li key={item.id}>{item.name} · ${Number(item.unit_price).toFixed(2)}</li>
            ))}
            {(prices[0]?.price_list_items || []).length === 0 && <li className="text-slate-400">Default list is empty.</li>}
          </ul>
          {isAdmin && (
            <div className="flex gap-2">
              <Input value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="Item" />
              <Input value={itemPrice} onChange={(e) => setItemPrice(e.target.value)} placeholder="0.00" className="w-24" />
              <Button type="button" size="sm" onClick={addPrice}>Add</Button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
