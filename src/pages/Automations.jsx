import { useEffect, useState } from "react";
import { AlertTriangle, FileText, Inbox, Megaphone, Settings2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { messagingApi } from "@/lib/messaging";
import SequencesTab from "@/components/messaging/SequencesTab";
import WorkflowBuilder from "@/components/messaging/WorkflowBuilder";
import BroadcastTab from "@/components/messaging/BroadcastTab";
import InboxTab from "@/components/messaging/InboxTab";
import TemplatesTab from "@/components/messaging/TemplatesTab";
import MessagingSettingsTab from "@/components/messaging/MessagingSettingsTab";

// Messaging & Automations: drips, broadcasts, inbox, templates, sender setup.
// Engine: api/_lib/messaging.js. Tables: 057_messaging_automations.sql.
const tabs = [
  { key: "drips",     label: "Drips",     icon: Zap,       description: "Automatic email and text sequences for new leads, stage changes and project milestones." },
  { key: "broadcast", label: "Broadcast", icon: Megaphone, description: "Send one email or text to many leads or clients at once." },
  { key: "inbox",     label: "Inbox",     icon: Inbox,     description: "Text replies, and every email and text sent from the CRM." },
  { key: "templates", label: "Templates", icon: FileText,  description: "Reusable emails and texts." },
  { key: "settings",  label: "Settings",  icon: Settings2, description: "Sender details, texting hours, opt-outs and setup." },
];

export default function Automations() {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("tab");
  const [active, setActive] = useState(tabs.some((t) => t.key === requested) ? requested : "drips");
  // ?drip=<id> or ?drip=new opens the workflow builder.
  const [drip, setDrip] = useState(params.get("drip"));
  const [dripsKey, setDripsKey] = useState(0);
  const [status, setStatus] = useState(null);
  const [unread, setUnread] = useState(0);

  useEffect(() => { messagingApi.status().then(setStatus).catch(() => setStatus(null)); }, []);

  const pick = (key) => {
    setActive(key);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", key);
    window.history.replaceState(null, "", url);
  };

  const openDrip = (id) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("drip", id); else url.searchParams.delete("drip");
    window.history.pushState(null, "", url);
    setDrip(id);
    if (!id) setDripsKey((k) => k + 1);
  };
  useEffect(() => {
    const onPop = () => setDrip(new URLSearchParams(window.location.search).get("drip"));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  if (drip) {
    return (
      <div className="px-3 py-3 lg:px-6 lg:py-6">
        <WorkflowBuilder key={drip} sequenceId={drip === "new" ? null : drip} onClose={() => openDrip(null)} />
      </div>
    );
  }
  const current = tabs.find((t) => t.key === active);

  return (
    <div className="space-y-6 px-6 py-6 lg:px-8 lg:py-8">
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">Messaging & Automations</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">{current.label}</h1>
          <p className="mt-1 text-sm text-slate-500">{current.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => pick(key)}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all",
                active === key ? "border-slate-900 bg-slate-900 text-white shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
              )}
            >
              <Icon className="h-4 w-4" /> {label}
              {key === "inbox" && unread > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-[11px] text-white">{unread}</span>}
            </button>
          ))}
        </div>
      </div>

      {status && (!status.email || !status.sms) && active !== "settings" && (
        <button type="button" onClick={() => pick("settings")} className="flex w-full items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-900">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
          <span>
            {!status.email && !status.sms ? "Email and texting aren't connected yet" : !status.email ? "Email isn't connected yet" : "Texting isn't connected yet"}.
            You can build drips now. Messages wait in the queue and send once it's connected. <u>Open setup</u>
          </span>
        </button>
      )}

      {active === "drips" && <SequencesTab key={dripsKey} onOpen={openDrip} />}
      {active === "broadcast" && <BroadcastTab />}
      {/* Kept mounted so the unread count on the tab stays current. */}
      <div className={active === "inbox" ? "" : "hidden"}><InboxTab onUnreadChange={setUnread} /></div>
      {active === "templates" && <TemplatesTab />}
      {active === "settings" && <MessagingSettingsTab />}
    </div>
  );
}
