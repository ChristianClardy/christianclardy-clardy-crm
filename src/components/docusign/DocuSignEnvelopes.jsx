import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Send, RefreshCw, CheckCircle, Clock, XCircle, AlertCircle, FileCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/apiFetch";

const STATUS_CONFIG = {
  sent:      { label: "Sent",      icon: Clock,        color: "text-blue-600 bg-blue-50 border-blue-200" },
  delivered: { label: "Delivered", icon: Clock,        color: "text-amber-600 bg-amber-50 border-amber-200" },
  completed: { label: "Signed",    icon: CheckCircle,  color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  voided:    { label: "Voided",    icon: XCircle,      color: "text-slate-500 bg-slate-50 border-slate-200" },
  declined:  { label: "Declined",  icon: XCircle,      color: "text-rose-600 bg-rose-50 border-rose-200" },
  created:   { label: "Draft",     icon: AlertCircle,  color: "text-slate-500 bg-slate-50 border-slate-200" },
};

// Only envelopes that actually went out are listed: out for signature, or
// fully signed. Drafts, voided, and declined envelopes stay in the database
// but are hidden here.
const VISIBLE_STATUSES = new Set(["sent", "delivered", "completed"]);
const DRAFT_SYNC_WINDOW_MS = 14 * 86400000;

// Envelopes worth re-checking with DocuSign: anything out for signature, a
// signed one whose copy isn't saved yet, and recent drafts (a draft becomes
// "sent" once it's sent from DocuSign's review screen, and only shows up here
// after this check).
const needsSync = (env) => {
  const status = env.status?.toLowerCase();
  if (status === "completed") return !env.signed_document_url;
  if (status === "sent" || status === "delivered") return true;
  if (status === "created") return Date.now() - new Date(env.created_at || env.sent_at).getTime() < DRAFT_SYNC_WINDOW_MS;
  return false;
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status?.toLowerCase()] || STATUS_CONFIG.sent;
  const Icon = cfg.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border", cfg.color)}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

export default function DocuSignEnvelopes({ entityType, entityId, className }) {
  const [envelopes, setEnvelopes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(null);

  const refresh = async (envelope, { quiet = false } = {}) => {
    if (!quiet) setRefreshing(envelope.id);
    try {
      const res = await apiFetch(`/api/docusign-status?envelope_id=${encodeURIComponent(envelope.envelope_id)}`);
      if (res.ok) {
        const data = await res.json();
        setEnvelopes(prev => prev.map(e => e.id === envelope.id
          ? { ...e, status: data.status, signed_document_url: data.signed_document_url || e.signed_document_url }
          : e));
      }
    } finally {
      if (!quiet) setRefreshing(null);
    }
  };

  useEffect(() => {
    if (!entityType || !entityId) { setLoading(false); return; }
    base44.entities.DocuSignEnvelope
      .filter({ entity_type: entityType, entity_id: entityId }, "-sent_at")
      .then(async rows => {
        setEnvelopes(rows);
        setLoading(false);
        // Quietly check anything still open so a signed contract shows up
        // (and gets saved) without anyone pressing refresh.
        for (const env of rows.filter(needsSync)) await refresh(env, { quiet: true }).catch(() => {});
      })
      .catch(() => setLoading(false));
  }, [entityType, entityId]);

  const visible = envelopes.filter((e) => VISIBLE_STATUSES.has(e.status?.toLowerCase()));
  if (loading || visible.length === 0) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Signature Requests</p>
      {visible.map(env => (
        <div key={env.id} className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-3 py-2.5">
          <Send className="w-4 h-4 text-slate-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 truncate">{env.document_name || "Document"}</p>
            <p className="text-xs text-slate-400">
              {env.sent_at ? new Date(env.sent_at).toLocaleDateString() : ""}
              {env.signers?.length > 0 && ` · ${env.signers.map(s => s.name || s.email).join(", ")}`}
            </p>
          </div>
          {env.signed_document_url && (
            <a
              href={env.signed_document_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline shrink-0"
              title="Fully signed contract, saved automatically"
            >
              <FileCheck className="w-3.5 h-3.5" /> Signed copy
            </a>
          )}
          <StatusBadge status={env.status} />
          <button
            onClick={() => refresh(env)}
            disabled={refreshing === env.id}
            title="Refresh status"
            className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", refreshing === env.id && "animate-spin")} />
          </button>
        </div>
      ))}
    </div>
  );
}
