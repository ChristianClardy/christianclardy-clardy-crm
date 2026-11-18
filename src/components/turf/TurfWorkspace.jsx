import { useMemo, useState } from "react";
import { EE_ORDER_ID } from "@/lib/turf/constants";
import CatalogPanel from "./CatalogPanel";
import DistributionPanel from "./DistributionPanel";
import InstallBoard from "./InstallBoard";
import OverviewPanel from "./OverviewPanel";
import SchedulePanel from "./SchedulePanel";

const TABS = [
  ["overview", "Overview"],
  ["schedule", "Schedule"],
  ["install", "Install"],
  ["distribution", "Distribution"],
  ["catalog", "Catalog"],
];

export default function TurfWorkspace({
  model, readOnly, previewNote, initialDate, modules = { install: true, distribution: true },
  onSchedulePatch, onSaveJob, onSaveOrder, onSaveCustomer, onSaveProduct,
  onSavePurchase, onDeletePurchase, onSaveSettings, onRecordPayment,
}) {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const requested = params.get("order");
  const [tab, setTab] = useState(() => {
    const hash = window.location.hash.replace("#", "");
    if (TABS.some(([key]) => key === hash)) return hash;
    if (new URLSearchParams(window.location.search).get("track")) return "schedule";
    return "overview";
  });
  const [orderId, setOrderId] = useState(requested === "ee" ? EE_ORDER_ID : requested);
  const [jobId, setJobId] = useState(null);

  const tabs = TABS.filter(([key]) => {
    if (key === "install") return modules.install;
    if (key === "distribution" || key === "catalog") return modules.distribution;
    return modules.install || modules.distribution;
  });
  const active = tabs.some(([key]) => key === tab) ? tab : (tabs[0]?.[0] || "overview");

  const openItem = (item) => {
    if (!item) return;
    if (item.track === "distribution") {
      setOrderId(item.recordId);
      setTab("distribution");
      return;
    }
    setJobId(item.recordId);
    setTab("install");
  };

  return (
    <div className="mx-auto max-w-screen-2xl space-y-6 p-6 lg:p-8">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">Turf&apos;n Texas</p>
        <h1 className="text-3xl font-bold text-slate-900">Install and distribution</h1>
        <p className="max-w-3xl text-sm text-slate-500">Install jobs and wholesale material orders stay on Turf&apos;n Texas. Payments recorded here are the money collected. A price that is not on file stays blank.</p>
        {previewNote && <p className="text-sm text-amber-800">{previewNote}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {tabs.map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)} className={`rounded-full px-4 py-1.5 text-sm font-medium ${active === key ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>{label}</button>
        ))}
      </div>
      {active === "overview" && <OverviewPanel model={model} tracks={modules} onOpen={setTab} />}
      {active === "schedule" && (
        <SchedulePanel model={model} tracks={modules} readOnly={readOnly} initialDate={initialDate} onPatch={onSchedulePatch} onOpen={openItem} />
      )}
      {active === "install" && (
        <InstallBoard model={model} readOnly={readOnly} focusId={jobId} onSaveJob={onSaveJob} onRecordPayment={onRecordPayment} />
      )}
      {active === "distribution" && (
        <DistributionPanel
          model={model}
          readOnly={readOnly}
          focusId={orderId}
          onSaveOrder={onSaveOrder}
          onSavePurchase={onSavePurchase}
          onDeletePurchase={onDeletePurchase}
          onRecordPayment={onRecordPayment}
        />
      )}
      {active === "catalog" && (
        <CatalogPanel model={model} readOnly={readOnly} onSaveProduct={onSaveProduct} onSaveCustomer={onSaveCustomer} onSaveSettings={onSaveSettings} />
      )}
    </div>
  );
}
