import { useState } from "react";
import { Users, Target, CheckCircle2, Archive } from "lucide-react";
import { cn } from "@/lib/utils";
import Clients from "./Clients";
import Prospects from "./Prospects";
import LeadList from "@/components/crm/LeadList";

const tabs = [
  { key: "clients", label: "Contacts", icon: Users },
  { key: "leads", label: "Leads", icon: Target },
  { key: "prospects", label: "Prospects", icon: Target },
  { key: "approved", label: "Approved", icon: CheckCircle2 },
  { key: "completed", label: "Completed", icon: CheckCircle2 },
  { key: "closed", label: "Closed", icon: CheckCircle2 },
  { key: "archived", label: "Archived", icon: Archive },
];

const tabDescriptions = {
  clients: "Manage contacts in one place.",
  leads: "View contacts in the lead stage.",
  prospects: "View contacts with active estimates.",
  approved: "View approved contacts and active projects.",
  completed: "View completed contacts and jobs.",
  closed: "View closed contacts and finished jobs.",
  archived: "View archived contacts and dead leads.",
};

export default function CRM() {
  const urlParams = new URLSearchParams(window.location.search);
  const requestedTab = urlParams.get("tab");
  const initialTab = tabs.some((tab) => tab.key === requestedTab) ? requestedTab : "clients";
  const [activeTab, setActiveTab] = useState(initialTab);

  return (
    <div className="space-y-6">
      <div className="px-6 pt-6 lg:px-8 lg:pt-8">
        <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">CRM</p>
            <h1 className="mt-1 text-3xl font-bold text-slate-900">{tabs.find((tab) => tab.key === activeTab)?.label || "CRM"}</h1>
            <p className="mt-1 text-sm text-slate-500">{tabDescriptions[activeTab] || "Manage your workflow."}</p>
          </div>

          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
            {tabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={cn(
                  "inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all",
                  activeTab === key
                    ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div>
        {activeTab === "clients" ? <Clients /> : activeTab === "leads" ? <LeadList /> : <Prospects key={activeTab} initialBucket={activeTab} showBucketTabs={false} />}
      </div>
    </div>
  );
  }