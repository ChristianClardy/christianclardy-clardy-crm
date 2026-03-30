import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  ArrowLeft, Save, Send, Plus, Trash2, GripVertical,
  ChevronDown, Loader2, CheckCircle, Copy, Mail, Package, BookmarkPlus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import GoodBetterBestEstimator from "@/components/estimates/GoodBetterBestEstimator";
import MaterialPickerDialog from "@/components/estimates/MaterialPickerDialog";
import EstimatorMaterialsPanel from "@/components/estimates/EstimatorMaterialsPanel";
import SaveMaterialDialog from "@/components/estimates/SaveMaterialDialog";
import { buildMaterialFromEstimateItem } from "@/components/estimates/saveMaterialUtils";

function newId() { return Math.random().toString(36).slice(2, 10); }

function getItemRawUnitCost(item) {
  const splitCost =
    Number(item.material_unit_cost || 0) +
    Number(item.labor_unit_cost || 0) +
    Number(item.equipment_unit_cost || 0) +
    Number(item.subcontract_unit_cost || 0);
  return splitCost || Number(item.unit_cost || 0);
}

function getItemCostAmount(item) {
  const quantity = Number(item.qty || 0);
  const wasteMultiplier = 1 + (Number(item.waste_percent || 0) / 100);
  return quantity * getItemRawUnitCost(item) * wasteMultiplier;
}

function getItemSellAmount(item, marginPercent) {
  const markup = Number(item.markup_percent ?? marginPercent ?? 0) / 100;
  return getItemCostAmount(item) * (1 + markup);
}

function calcTotals(lineItems, taxRate, marginPercent) {
  const rows = (lineItems || []).filter(r => !r.is_section_header);
  const materialSubtotal = rows.reduce((s, r) => s + (Number(r.qty || 0) * Number(r.material_unit_cost || 0)), 0);
  const laborSubtotal = rows.reduce((s, r) => s + (Number(r.qty || 0) * Number(r.labor_unit_cost || 0)), 0);
  const equipmentSubtotal = rows.reduce((s, r) => s + (Number(r.qty || 0) * Number(r.equipment_unit_cost || 0)), 0);
  const subcontractSubtotal = rows.reduce((s, r) => s + (Number(r.qty || 0) * Number(r.subcontract_unit_cost || 0)), 0);
  const totalCost = rows.reduce((s, r) => s + getItemCostAmount(r), 0);
  const subtotal = rows.reduce((s, r) => s + getItemSellAmount(r, marginPercent), 0);
  const taxAmount = subtotal * (Number(taxRate) || 0) / 100;
  const total = subtotal + taxAmount;
  const grossProfit = subtotal - totalCost;
  const grossMarginPercent = subtotal > 0 ? (grossProfit / subtotal) * 100 : 0;

  return {
    materialSubtotal,
    laborSubtotal,
    equipmentSubtotal,
    subcontractSubtotal,
    totalCost,
    subtotal,
    taxAmount,
    total,
    grossProfit,
    grossMarginPercent,
  };
}

function calcVersionTotals(lineItems) {
  const items = (lineItems || []).filter(r => !r.is_section_header);
  const totals = {
    subtotal_material: 0,
    subtotal_labor: 0,
    subtotal_equipment: 0,
    subtotal_subcontract: 0,
    subtotal_other: 0,
    subtotal_allowances: 0,
    subtotal_contingency: 0,
    total_cost: 0,
    total_price: 0,
    gross_profit: 0,
    gross_margin_percent: 0,
  };

  items.forEach((item) => {
    const quantity = Number(item.qty || 0);
    const material = quantity * Number(item.material_unit_cost || 0);
    const labor = quantity * Number(item.labor_unit_cost || 0);
    const equipment = quantity * Number(item.equipment_unit_cost || 0);
    const subcontract = quantity * Number(item.subcontract_unit_cost || 0);
    const wasteMultiplier = 1 + ((Number(item.waste_percent || 0)) / 100);
    const rawCost = material + labor + equipment + subcontract;
    const baseCost = Number(item.base_cost || rawCost * wasteMultiplier || quantity * Number(item.unit_cost || 0));
    const sellPrice = Number(item.sell_price || quantity * Number(item.unit_cost || 0));

    totals.subtotal_material += material;
    totals.subtotal_labor += labor;
    totals.subtotal_equipment += equipment;
    totals.subtotal_subcontract += subcontract;
    if (["Fee", "Permit", "Delivery", "Disposal"].includes(item.cost_type)) totals.subtotal_other += sellPrice;
    if (item.allowance_flag || item.cost_type === "Allowance") totals.subtotal_allowances += sellPrice;
    if (item.cost_type === "Contingency") totals.subtotal_contingency += sellPrice;
    totals.total_cost += baseCost;
    totals.total_price += sellPrice;
  });

  totals.gross_profit = totals.total_price - totals.total_cost;
  totals.gross_margin_percent = totals.total_price > 0 ? totals.gross_profit / totals.total_price : 0;
  return totals;
}

export default function EstimateDetail() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const estimateId = urlParams.get("id");
  const isNew = urlParams.get("new") === "true";
  const preselectedClientId = urlParams.get("client_id") || "";

  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [estimateTemplates, setEstimateTemplates] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [sendEmail, setSendEmail] = useState("");
  const [sendName, setSendName] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [companyName, setCompanyName] = useState("Clarity Construction");
  const [viewMode, setViewMode] = useState("internal");
  const [materialPickerOpen, setMaterialPickerOpen] = useState(false);
  const [saveMaterialOpen, setSaveMaterialOpen] = useState(false);
  const [savingMaterial, setSavingMaterial] = useState(false);
  const [saveMaterialTargetId, setSaveMaterialTargetId] = useState(null);
  const [materialDraft, setMaterialDraft] = useState({
    name: "",
    description: "",
    category: "Other",
    unit: "EA",
    material_cost: "0",
    labor_cost: "0",
    sub_cost: "0",
    supplier: "",
    sku: "",
  });

  const [form, setForm] = useState({
    estimate_number: `EST-${Date.now().toString().slice(-5)}`,
    client_id: preselectedClientId,
    project_id: "",
    project_type: "Pergola",
    margin_percent: 35,
    title: "",
    status: "draft",
    issue_date: new Date().toISOString().slice(0, 10),
    expiry_date: "",
    tax_rate: 0,
    notes: "",
    terms: "",
    line_items: [],
  });

  useEffect(() => {
    const loadAll = async () => {
      const [clientsData, projectsData, etData, materialsData] = await Promise.all([
        base44.entities.Client.list(),
        base44.entities.Project.list(),
        base44.entities.EstimateTemplate.list(),
        base44.entities.Material.list("-created_date", 500),
      ]);
      setClients(clientsData);
      setProjects(projectsData);
      setEstimateTemplates(etData);
      setMaterials(materialsData);

      if (isNew && preselectedClientId) {
        const client = clientsData.find(c => c.id === preselectedClientId);
        if (client?.email) setSendEmail(client.email);
        if (client?.name) setSendName(client.name);
      }

      if (!isNew && estimateId) {
        const est = await base44.entities.Estimate.get(estimateId);
        setForm({
          estimate_number: est.estimate_number || "",
          client_id: est.client_id || "",
          project_id: est.project_id || "",
          project_type: est.project_type || "Pergola",
          margin_percent: est.margin_percent ?? 35,
          title: est.title || "",
          status: est.status || "draft",
          issue_date: est.issue_date || "",
          expiry_date: est.expiry_date || "",
          tax_rate: est.tax_rate || 0,
          notes: est.notes || "",
          terms: est.terms || "",
          line_items: est.line_items || [],
        });
        const client = clientsData.find(c => c.id === est.client_id);
        if (client?.email) setSendEmail(client.email);
        if (client?.name) setSendName(client.name);
      }
      setLoading(false);
    };
    loadAll();
  }, []);

  const {
    materialSubtotal,
    laborSubtotal,
    equipmentSubtotal,
    subcontractSubtotal,
    totalCost,
    subtotal,
    taxAmount,
    total,
    grossProfit,
    grossMarginPercent,
  } = calcTotals(form.line_items, form.tax_rate, form.margin_percent);

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const syncEstimateVersion = async (savedEstimateId, data) => {
    if (!data.project_id) return;

    const estimateVersionId = `EV-${savedEstimateId}`;
    const versionTotals = calcVersionTotals(data.line_items);
    const existingVersions = await base44.entities.EstimateVersion.filter({ linked_estimate_id: savedEstimateId }, "-created_date", 1);

    let version = existingVersions[0];
    const versionPayload = {
      estimate_version_id: version?.estimate_version_id || estimateVersionId,
      project_id: data.project_id,
      linked_estimate_id: savedEstimateId,
      version_name: data.title || data.estimate_number,
      version_type: "Custom",
      created_by_name: sendName || "",
      created_date_value: new Date().toISOString().slice(0, 10),
      active_version: true,
      notes: data.notes || "",
      ...versionTotals,
    };

    if (version) {
      await base44.entities.EstimateVersion.update(version.id, versionPayload);
    } else {
      version = await base44.entities.EstimateVersion.create(versionPayload);
    }

    const existingLineItems = await base44.entities.LineItem.filter({ estimate_version_id: versionPayload.estimate_version_id }, "sort_order", 5000);
    await Promise.all(existingLineItems.map((item) => base44.entities.LineItem.delete(item.id)));

    const detailRows = (data.line_items || [])
      .filter((item) => !item.is_section_header)
      .map((item, index) => ({
        line_item_id: item.id || newId(),
        estimate_version_id: versionPayload.estimate_version_id,
        item_code: item.item_code || "",
        item_name: item.description || item.item_name || "Item",
        item_description: item.notes || "",
        cost_type: item.cost_type || "Material",
        unit_type: item.unit || item.unit_type || "each",
        quantity: Number(item.qty || 0),
        material_unit_cost: Number(item.material_unit_cost || 0),
        labor_unit_cost: Number(item.labor_unit_cost || 0),
        equipment_unit_cost: Number(item.equipment_unit_cost || 0),
        subcontract_unit_cost: Number(item.subcontract_unit_cost || 0),
        waste_percent: Number(item.waste_percent || 0),
        base_cost: Number(item.base_cost || 0),
        markup_percent: Number(item.markup_percent || 0),
        sell_price: Number(item.sell_price || (Number(item.qty || 0) * Number(item.unit_cost || 0))),
        optional_flag: Boolean(item.optional_flag),
        allowance_flag: Boolean(item.allowance_flag),
        included_flag: item.included_flag !== false,
        good_better_best_tier: item.good_better_best_tier || "All",
        production_rate: Number(item.production_rate || 0),
        labor_hours: Number(item.labor_hours || 0),
        notes: item.notes || "",
        sort_order: index,
      }));

    for (const row of detailRows) {
      await base44.entities.LineItem.create(row);
    }
  };

  const addLineItem = (isHeader = false) => {
    const newItem = {
      id: newId(),
      is_section_header: isHeader,
      section: isHeader ? "New Section" : "",
      description: isHeader ? "" : "New Item",
      unit: "",
      qty: isHeader ? null : 1,
      unit_cost: isHeader ? null : 0,
    };
    setField("line_items", [...form.line_items, newItem]);
  };

  const addMaterialLineItem = (lineItem) => {
    setField("line_items", [...form.line_items, { ...lineItem, id: newId() }]);
    setMaterialPickerOpen(false);
  };

  const openSaveMaterialDialog = (item) => {
    setSaveMaterialTargetId(item.id);
    setMaterialDraft(buildMaterialFromEstimateItem(item));
    setSaveMaterialOpen(true);
  };

  const handleSaveMaterial = async () => {
    setSavingMaterial(true);
    const materialPayload = {
      name: materialDraft.name,
      description: materialDraft.description,
      category: materialDraft.category || "Other",
      unit: (materialDraft.unit || "EA").toUpperCase(),
      material_cost: Number(materialDraft.material_cost || 0),
      labor_cost: Number(materialDraft.labor_cost || 0),
      sub_cost: Number(materialDraft.sub_cost || 0),
      unit_cost: Number(materialDraft.material_cost || 0) + Number(materialDraft.labor_cost || 0) + Number(materialDraft.sub_cost || 0),
      markup_type: "markup_percent",
      markup_value: Number(form.margin_percent || 0),
      overhead_percent: 0,
      profit_percent: 0,
      supplier: materialDraft.supplier,
      sku: materialDraft.sku,
      notes: materialDraft.description,
    };

    const created = await base44.entities.Material.create(materialPayload);
    setMaterials((prev) => [created, ...prev]);
    setSaveMaterialOpen(false);
    setSaveMaterialTargetId(null);
    setSavingMaterial(false);
  };

  const updateItem = (id, field, value) => {
    setField("line_items", form.line_items.map(item =>
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const deleteItem = (id) => {
    setField("line_items", form.line_items.filter(item => item.id !== id));
  };

  const loadTemplate = (templateId) => {
    const t = estimateTemplates.find(et => et.id === templateId);
    if (t?.line_items?.length) {
      setField("line_items", t.line_items.map(item => ({ ...item, id: newId() })));
    }
  };

  const save = async () => {
    if (!form.client_id) return;
    setSaving(true);
    const preparedLineItems = form.line_items.map((item, index) => item.is_section_header ? item : ({
      ...item,
      sort_order: index,
      base_cost: getItemCostAmount(item),
      sell_price: getItemSellAmount(item, form.margin_percent),
      unit_cost: Number(item.qty || 0) > 0 ? getItemSellAmount(item, form.margin_percent) / Number(item.qty || 0) : 0,
      markup_percent: Number(item.markup_percent ?? form.margin_percent ?? 0),
    }));
    const data = {
      ...form,
      client_id: form.client_id,
      linked_contact_id: form.client_id,
      line_items: preparedLineItems,
      subtotal,
      tax_amount: taxAmount,
      total,
      margin_percent: Number(form.margin_percent || 0),
      estimated_revenue: subtotal,
      estimated_material_cost: materialSubtotal,
      estimated_labor_cost: laborSubtotal,
      estimated_subcontractor_cost: subcontractSubtotal,
      estimated_gross_profit: grossProfit,
      estimated_gross_margin_percent: grossMarginPercent,
    };
    if (isNew || !estimateId) {
      const created = await base44.entities.Estimate.create(data);
      await syncEstimateVersion(created.id, data);
      navigate(createPageUrl(`EstimateDetail?id=${created.id}`), { replace: true });
    } else {
      await base44.entities.Estimate.update(estimateId, data);
      await syncEstimateVersion(estimateId, data);
    }
    setSaving(false);
  };

  const handleSendEmail = async () => {
    if (!form.client_id) return;
    setSendingEmail(true);
    const preparedLineItems = form.line_items.map((item, index) => item.is_section_header ? item : ({
      ...item,
      sort_order: index,
      base_cost: getItemCostAmount(item),
      sell_price: getItemSellAmount(item, form.margin_percent),
      unit_cost: Number(item.qty || 0) > 0 ? getItemSellAmount(item, form.margin_percent) / Number(item.qty || 0) : 0,
      markup_percent: Number(item.markup_percent ?? form.margin_percent ?? 0),
    }));
    const data = {
      ...form,
      client_id: form.client_id,
      linked_contact_id: form.client_id,
      line_items: preparedLineItems,
      subtotal,
      tax_amount: taxAmount,
      total,
      margin_percent: Number(form.margin_percent || 0),
      estimated_revenue: subtotal,
      estimated_material_cost: materialSubtotal,
      estimated_labor_cost: laborSubtotal,
      estimated_subcontractor_cost: subcontractSubtotal,
      estimated_gross_profit: grossProfit,
      estimated_gross_margin_percent: grossMarginPercent,
    };
    let id = estimateId;
    if (!id) {
      const created = await base44.entities.Estimate.create(data);
      id = created.id;
      await syncEstimateVersion(id, data);
      navigate(createPageUrl(`EstimateDetail?id=${id}`), { replace: true });
    } else {
      await base44.entities.Estimate.update(id, data);
      await syncEstimateVersion(id, data);
    }

    await base44.functions.invoke("sendEstimate", {
      estimate_id: id,
      recipient_email: sendEmail,
      recipient_name: sendName,
      company_name: companyName,
    });

    setSendingEmail(false);
    setSendSuccess(true);
    setForm(f => ({ ...f, status: "sent" }));
    setTimeout(() => { setSendDialogOpen(false); setSendSuccess(false); }, 2500);
  };

  // drag reorder
  const dragItem = useRef(null);
  const dragOver = useRef(null);
  const onDragStart = (id) => { dragItem.current = id; };
  const onDragEnter = (id) => { dragOver.current = id; };
  const onDragEnd = () => {
    if (!dragItem.current || dragItem.current === dragOver.current) return;
    const items = [...form.line_items];
    const fromIdx = items.findIndex(i => i.id === dragItem.current);
    const toIdx = items.findIndex(i => i.id === dragOver.current);
    const [moved] = items.splice(fromIdx, 1);
    items.splice(toIdx, 0, moved);
    setField("line_items", items);
    dragItem.current = null; dragOver.current = null;
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(createPageUrl("Estimates"))} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{isNew ? "New Estimate" : form.title || "Estimate"}</h1>
          <p className="text-slate-500 text-sm">{form.estimate_number}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => {
            const client = clients.find(c => c.id === form.client_id);
            if (client?.email) setSendEmail(client.email);
            if (client?.name) setSendName(client.name);
            setSendDialogOpen(true);
          }}>
            <Send className="w-4 h-4 mr-2" /> Send to Client
          </Button>
          <Button onClick={save} disabled={saving || !form.client_id} className="bg-gradient-to-r from-amber-500 to-orange-500 text-white">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: Meta */}
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <h3 className="font-semibold text-slate-900 text-sm">Estimate Details</h3>
            <div>
              <Label className="text-xs text-slate-500">Estimate #</Label>
              <Input value={form.estimate_number} onChange={e => setField("estimate_number", e.target.value)} className="mt-1 h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Title *</Label>
              <Input value={form.title} onChange={e => setField("title", e.target.value)} placeholder="e.g. Luxury Covered Patio" className="mt-1 h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Project Type</Label>
              <Select value={form.project_type || "Pergola"} onValueChange={v => setField("project_type", v)}>
                <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[
                    "Pergola",
                    "Covered Patio",
                    "Cabana / Pool House",
                    "Outdoor Kitchen",
                    "Concrete / Hardscape",
                    "Backyard Revamp",
                    "Remodel / Addition",
                    "Pool",
                    "Spa",
                    "Pool Decking",
                    "Pool Water Features",
                    "Pool Equipment",
                    "Pool Side Structures",
                  ].map((type) => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Client *</Label>
              <Select value={form.client_id} onValueChange={v => {
                setField("client_id", v);
                const client = clients.find(c => c.id === v);
                if (client?.email) setSendEmail(client.email);
                if (client?.name) setSendName(client.name);
              }}>
                <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue placeholder="Select client" /></SelectTrigger>
                <SelectContent>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Linked Project (optional)</Label>
              <Select value={form.project_id || "__none__"} onValueChange={v => setField("project_id", v === "__none__" ? "" : v)}>
                <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Status</Label>
              <Select value={form.status} onValueChange={v => setField("status", v)}>
                <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="accepted">Accepted</SelectItem>
                  <SelectItem value="declined">Declined</SelectItem>
                  <SelectItem value="revised">Revised</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-500">Issue Date</Label>
                <Input type="date" value={form.issue_date} onChange={e => setField("issue_date", e.target.value)} className="mt-1 h-9 text-sm" />
              </div>
              <div>
                <Label className="text-xs text-slate-500">Expiry Date</Label>
                <Input type="date" value={form.expiry_date} onChange={e => setField("expiry_date", e.target.value)} className="mt-1 h-9 text-sm" />
              </div>
            </div>
            <div>
              <Label className="text-xs text-slate-500">Tax Rate (%)</Label>
              <Input type="number" min={0} max={100} value={form.tax_rate} onChange={e => setField("tax_rate", e.target.value)} className="mt-1 h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Job Margin %</Label>
              <div className="mt-3 px-2">
                <Slider value={[Number(form.margin_percent || 0)]} onValueChange={([v]) => setField("margin_percent", v)} min={0} max={100} step={1} />
              </div>
              <Input type="number" min={0} max={100} value={form.margin_percent} onChange={e => setField("margin_percent", e.target.value)} className="mt-3 h-9 text-sm" />
              <p className="mt-2 text-xs text-slate-500">Default margin is set to 35% for new estimates.</p>
            </div>
          </div>

          {/* Totals */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-2">
            <h3 className="font-semibold text-slate-900 text-sm mb-3">Totals</h3>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Material Cost</span>
              <span className="font-medium">${materialSubtotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Labor Cost</span>
              <span className="font-medium">${laborSubtotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Equipment Cost</span>
              <span className="font-medium">${equipmentSubtotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Subcontract Cost</span>
              <span className="font-medium">${subcontractSubtotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Internal Cost</span>
              <span className="font-medium">${totalCost.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Client Subtotal</span>
              <span className="font-medium">${subtotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Gross Profit</span>
              <span className="font-medium text-emerald-700">${grossProfit.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Gross Margin</span>
              <span className="font-medium">{grossMarginPercent.toFixed(1)}%</span>
            </div>
            {Number(form.tax_rate) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Tax ({form.tax_rate}%)</span>
                <span className="font-medium">${taxAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold pt-2 border-t border-slate-200">
              <span>Client Total</span>
              <span className="text-amber-600">${total.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          {/* Notes & Terms */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
            <div>
              <Label className="text-xs text-slate-500">Notes</Label>
              <Textarea value={form.notes} onChange={e => setField("notes", e.target.value)} className="mt-1 text-sm" rows={3} placeholder="Internal or client-facing notes…" />
            </div>
            <div>
              <Label className="text-xs text-slate-500">Terms & Conditions</Label>
              <Textarea value={form.terms} onChange={e => setField("terms", e.target.value)} className="mt-1 text-sm" rows={3} placeholder="Payment terms, warranty, etc." />
            </div>
          </div>
        </div>

        {/* Right: Line Items */}
        <div className="lg:col-span-2 space-y-4">
          <GoodBetterBestEstimator
            initialProjectType={form.project_type || "Pergola"}
            materials={materials}
            marginPercent={form.margin_percent}
            onApply={({ projectType, title, lineItems }) => {
              setForm((prev) => ({
                ...prev,
                project_type: projectType,
                title: prev.title || title,
                line_items: lineItems,
              }));
            }}
          />

          <EstimatorMaterialsPanel
            projectType={form.project_type}
            materials={materials}
            marginPercent={form.margin_percent}
            onAddMaterial={addMaterialLineItem}
          />

          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-center gap-2">
              <Button variant={viewMode === "internal" ? "default" : "outline"} onClick={() => setViewMode("internal")}>Internal Cost View</Button>
              <Button variant={viewMode === "client" ? "default" : "outline"} onClick={() => setViewMode("client")}>Client View</Button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 gap-3 flex-wrap">
              <h3 className="font-semibold text-slate-900">Line Items</h3>
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => setMaterialPickerOpen(true)}>
                  <Package className="w-4 h-4 mr-2" /> Add from Materials
                </Button>
                {estimateTemplates.length > 0 && (
                  <Select onValueChange={loadTemplate}>
                    <SelectTrigger className="h-8 text-xs w-48 border-dashed">
                      <SelectValue placeholder="Load from template…" />
                    </SelectTrigger>
                    <SelectContent>
                      {estimateTemplates.map(et => <SelectItem key={et.id} value={et.id}>{et.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="w-6 px-2 py-2"></th>
                    <th className="px-3 py-2 text-left">Description</th>
                    <th className="px-2 py-2 text-center w-20">Qty</th>
                    <th className="px-2 py-2 text-center w-20">Unit</th>
                    {viewMode === "internal" ? (
                      <>
                        <th className="px-2 py-2 text-right w-24">Material</th>
                        <th className="px-2 py-2 text-right w-24">Labor</th>
                        <th className="px-2 py-2 text-right w-28">Cost</th>
                      </>
                    ) : (
                      <>
                        <th className="px-2 py-2 text-right w-28">Unit Price</th>
                        <th className="px-2 py-2 text-right w-28">Amount</th>
                      </>
                    )}
                    <th className="w-8 px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {form.line_items.map(item => {
                    if (item.is_section_header) {
                      return (
                        <tr key={item.id} className="bg-slate-700 group"
                          draggable onDragStart={() => onDragStart(item.id)} onDragEnter={() => onDragEnter(item.id)} onDragEnd={onDragEnd}>
                          <td className="px-2 py-2 cursor-grab text-slate-400"><GripVertical className="w-3.5 h-3.5" /></td>
                          <td colSpan={viewMode === "internal" ? 6 : 5} className="px-3 py-2">
                            <input
                              value={item.section || ""}
                              onChange={e => updateItem(item.id, "section", e.target.value)}
                              className="bg-transparent text-white font-bold text-xs uppercase tracking-widest w-full outline-none placeholder:text-slate-400"
                              placeholder="Section name…"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <button onClick={() => deleteItem(item.id)} className="p-1 rounded hover:bg-slate-600 text-slate-400 hover:text-rose-400">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    }
                    const costAmount = getItemCostAmount(item);
                    const sellAmount = getItemSellAmount(item, form.margin_percent);
                    const unitSellPrice = Number(item.qty || 0) > 0 ? sellAmount / Number(item.qty || 0) : 0;
                    return (
                      <tr key={item.id} className="border-b border-slate-100 hover:bg-amber-50/30 group"
                        draggable onDragStart={() => onDragStart(item.id)} onDragEnter={() => onDragEnter(item.id)} onDragEnd={onDragEnd}>
                        <td className="px-2 py-1 cursor-grab text-slate-300 opacity-0 group-hover:opacity-100"><GripVertical className="w-3.5 h-3.5" /></td>
                        <td className="px-2 py-1">
                          <input value={item.description || ""} onChange={e => updateItem(item.id, "description", e.target.value)}
                            className="w-full bg-transparent text-slate-800 text-sm outline-none hover:bg-amber-50 rounded px-1 py-0.5 focus:bg-white focus:ring-1 focus:ring-amber-300 min-w-[140px]"
                            placeholder="Description…" />
                        </td>
                        <td className="px-2 py-1">
                          <input type="number" value={item.qty ?? ""} onChange={e => updateItem(item.id, "qty", e.target.value)}
                            className="w-full text-center bg-transparent text-slate-600 text-sm outline-none hover:bg-amber-50 rounded px-1 py-0.5 focus:bg-white focus:ring-1 focus:ring-amber-300"
                            placeholder="1" />
                        </td>
                        <td className="px-2 py-1">
                          <input value={item.unit || ""} onChange={e => updateItem(item.id, "unit", e.target.value)}
                            className="w-full text-center bg-transparent text-slate-600 text-sm outline-none hover:bg-amber-50 rounded px-1 py-0.5 focus:bg-white focus:ring-1 focus:ring-amber-300"
                            placeholder="ea" />
                        </td>
                        {viewMode === "internal" ? (
                          <>
                            <td className="px-2 py-1">
                              <input type="number" value={item.material_unit_cost ?? item.unit_cost ?? ""} onChange={e => updateItem(item.id, "material_unit_cost", e.target.value)}
                                className="w-full text-right bg-transparent text-slate-600 text-sm outline-none hover:bg-amber-50 rounded px-1 py-0.5 focus:bg-white focus:ring-1 focus:ring-amber-300"
                                placeholder="0.00" />
                            </td>
                            <td className="px-2 py-1">
                              <input type="number" value={item.labor_unit_cost ?? ""} onChange={e => updateItem(item.id, "labor_unit_cost", e.target.value)}
                                className="w-full text-right bg-transparent text-slate-600 text-sm outline-none hover:bg-amber-50 rounded px-1 py-0.5 focus:bg-white focus:ring-1 focus:ring-amber-300"
                                placeholder="0.00" />
                            </td>
                            <td className="px-3 py-1 text-right text-sm font-medium text-slate-800">
                              ${costAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-2 py-1 text-right text-sm font-medium text-slate-800">
                              ${unitSellPrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-3 py-1 text-right text-sm font-medium text-slate-800">
                              ${sellAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                            </td>
                          </>
                        )}
                        <td className="px-2 py-1">
                          <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                            <button onClick={() => openSaveMaterialDialog(item)} className="p-1 rounded hover:bg-amber-100 text-slate-300 hover:text-amber-600">
                              <BookmarkPlus className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => deleteItem(item.id)} className="p-1 rounded hover:bg-rose-100 text-slate-300 hover:text-rose-500">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="px-4 py-3 border-t border-slate-100 flex items-center gap-2">
              <button onClick={() => addLineItem(false)}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-amber-600 hover:bg-amber-50 px-3 py-1.5 rounded-lg transition-colors">
                <Plus className="w-4 h-4" /> Add Line Item
              </button>
              <button onClick={() => addLineItem(true)}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-amber-600 hover:bg-amber-50 px-3 py-1.5 rounded-lg transition-colors">
                <Plus className="w-4 h-4" /> Add Section
              </button>
            </div>
          </div>
        </div>
      </div>

      <MaterialPickerDialog
        open={materialPickerOpen}
        onOpenChange={setMaterialPickerOpen}
        materials={materials}
        marginPercent={form.margin_percent}
        onAddMaterial={addMaterialLineItem}
      />

      <SaveMaterialDialog
        open={saveMaterialOpen}
        onOpenChange={setSaveMaterialOpen}
        form={materialDraft}
        onChange={(field, value) => setMaterialDraft((prev) => ({ ...prev, [field]: value }))}
        onSubmit={handleSaveMaterial}
        isSaving={savingMaterial}
      />

      {/* Send Email Dialog */}
      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Mail className="w-5 h-5 text-amber-500" /> Send Estimate by Email</DialogTitle>
          </DialogHeader>
          {sendSuccess ? (
            <div className="flex flex-col items-center gap-3 py-6">
              <CheckCircle className="w-12 h-12 text-emerald-500" />
              <p className="text-slate-700 font-semibold">Estimate sent successfully!</p>
              <p className="text-slate-500 text-sm">Sent to {sendEmail}</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label className="text-sm">Recipient Name</Label>
                <Input value={sendName} onChange={e => setSendName(e.target.value)} className="mt-1.5" placeholder="Client name" />
              </div>
              <div>
                <Label className="text-sm">Recipient Email *</Label>
                <Input value={sendEmail} onChange={e => setSendEmail(e.target.value)} className="mt-1.5" placeholder="client@email.com" type="email" />
              </div>
              <div>
                <Label className="text-sm">Your Company Name</Label>
                <Input value={companyName} onChange={e => setCompanyName(e.target.value)} className="mt-1.5" />
              </div>
              <div className="flex justify-end gap-3 pt-2 border-t border-slate-200">
                <Button variant="outline" onClick={() => setSendDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSendEmail} disabled={!sendEmail || sendingEmail} className="bg-gradient-to-r from-amber-500 to-orange-500 text-white">
                  {sendingEmail ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending…</> : <><Send className="w-4 h-4 mr-2" /> Send Estimate</>}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}