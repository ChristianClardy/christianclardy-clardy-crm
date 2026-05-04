import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Send, RefreshCw, CheckCircle, Clock, XCircle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_CONFIG = {
  sent:      { label: "Sent",      icon: Clock,        color: "text-blue-600 bg-blue-50 border-blue-200" },
  delivered: { label: "Delivered", icon: Clock,        color: "text-amber-600 bg-amber-50 border-amber-200" },
  completed: { label: "Signed",    icon: CheckCircle,  color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  voided:    { label: "Voided",    icon: XCircle,      color: "text-slate-500 bg-slate-50 border-slate-200" },
  declined:  { label: "Declined",  icon: XCircle,      color: "text-rose-600 bg-rose-50 border-rose-200" },
  created:   { label: "Draft",     icon: AlertCircle,  color: "text-slate-500 bg-slate-50 border-slate-200" },
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

  useEffect(() => {
    if (!entityType || !entityId) { setLoading(false); return; }
    base44.entities.DocuSignEnvelope
      .filter({ entity_type: entityType, entity_id: entityId }, "-sent_at")
      .then(rows => { setEnvelopes(rows); setLoading(false); })
      .catch(() => setLoading(false));
  }, [entityType, entityId]);

  const refresh = async (envelope) => {
    setRefreshing(envelope.id);
    try {
      const res = await fetch(`/api/docusign-status?envelope_id=${encodeURIComponent(envelope.envelope_id)}`);
      if (res.ok) {
        const data = await res.json();
        setEnvelopes(prev => prev.map(e => e.id === envelope.id ? { ...e, status: data.status } : e));
      }
    } finally {
      setRefreshing(null);
    }
  };

  if (loading || envelopes.length === 0) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Signature Requests</p>
      {envelopes.map(env => (
        <div key={env.id} className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-3 py-2.5">
          <Send className="w-4 h-4 text-slate-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 truncate">{env.document_name || "Document"}</p>
            <p className="text-xs text-slate-400">
              {env.sent_at ? new Date(env.sent_at).toLocaleDateString() : ""}
              {env.signers?.length > 0 && ` · ${env.signers.map(s => s.name || s.email).join(", ")}`}
            </p>
          </div>
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
