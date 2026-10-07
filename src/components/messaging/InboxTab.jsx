import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Loader2, Mail, MessageSquare, Reply, Search } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompanyScope, scopeFilter } from "@/lib/companyScope";
import { useRolePermissions } from "@/lib/useRolePermissions";
import { STATUS_STYLE } from "@/lib/messaging";
import ComposeDialog from "./ComposeDialog";

const VIEWS = [
  { key: "replies", label: "Replies" },
  { key: "all", label: "Everything" },
  { key: "outbound", label: "Sent" },
  { key: "problems", label: "Failed / bounced" },
];

export default function InboxTab({ onUnreadChange }) {
  const scope = useCompanyScope();
  const { readOnly } = useRolePermissions();
  const [messages, setMessages] = useState([]);
  const [names, setNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("replies");
  const [channel, setChannel] = useState("all");
  const [search, setSearch] = useState("");
  const [reply, setReply] = useState(null);

  const load = async () => {
    const msgs = await base44.entities.Message.list("-created_date", 1000);
    setMessages(msgs);
    setLoading(false);
    const leadIds = [...new Set(msgs.map((m) => m.lead_id).filter(Boolean))];
    const clientIds = [...new Set(msgs.map((m) => m.client_id).filter(Boolean))];
    // In chunks: hundreds of ids in one URL is too long for the server.
    const byIds = async (table, cols, ids) => {
      const out = [];
      for (let i = 0; i < ids.length; i += 100) {
        const { data } = await supabase.from(table).select(cols).in("id", ids.slice(i, i + 100));
        out.push(...(data || []));
      }
      return { data: out };
    };
    const [l, c] = await Promise.all([byIds("leads", "id,full_name,email,phone", leadIds), byIds("clients", "*", clientIds)]);
    const n = {};
    (l.data || []).forEach((x) => { n[x.id] = { name: x.full_name, email: x.email, phone: x.phone }; });
    (c.data || []).forEach((x) => { n[x.id] = { name: x.name || [x.first_name, x.last_name].filter(Boolean).join(" "), email: x.email, phone: x.phone }; });
    setNames(n);
  };
  useEffect(() => { load(); }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scopeFilter(messages, scope).filter((m) => {
      if (view === "replies" && m.direction !== "inbound") return false;
      if (view === "outbound" && m.direction !== "outbound") return false;
      if (view === "problems" && !["failed", "bounced", "complained"].includes(m.status)) return false;
      if (channel !== "all" && m.channel !== channel) return false;
      if (!q) return true;
      const who = names[m.lead_id]?.name || names[m.client_id]?.name || "";
      return [who, m.subject, m.body, m.to_address, m.from_address].some((v) => v && String(v).toLowerCase().includes(q));
    });
  }, [messages, scope, view, channel, search, names]);

  const unread = messages.filter((m) => m.direction === "inbound" && !m.read_at).length;
  useEffect(() => { onUnreadChange?.(unread); }, [unread, onUnreadChange]);

  const markRead = async (m) => {
    if (m.direction !== "inbound" || m.read_at || readOnly) return;
    await supabase.from("messages").update({ read_at: new Date().toISOString() }).eq("id", m.id);
    setMessages((list) => list.map((x) => (x.id === m.id ? { ...x, read_at: new Date().toISOString() } : x)));
  };

  const openReply = (m) => {
    const who = names[m.lead_id] || names[m.client_id] || {};
    setReply({
      channel: m.channel,
      initial: m.channel === "email" && m.subject ? { subject: /^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject}` } : undefined,
      target: {
        lead_id: m.lead_id || undefined, client_id: m.client_id || undefined, name: who.name,
        email: m.channel === "email" ? (m.direction === "inbound" ? m.from_address : m.to_address) : who.email,
        phone: m.channel === "sms" ? (m.direction === "inbound" ? m.from_address : m.to_address) : who.phone,
      },
    });
  };

  if (loading) return <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {VIEWS.map((v) => (
          <Button key={v.key} size="sm" variant={view === v.key ? "default" : "outline"} onClick={() => setView(v.key)}>
            {v.label}{v.key === "replies" && unread ? ` (${unread} new)` : ""}
          </Button>
        ))}
        <Select value={channel} onValueChange={setChannel}>
          <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="sms">Texts</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      {view === "replies" && (
        <p className="text-xs text-slate-500">Text replies land here. Email replies go to the reply-to inbox set under Settings.</p>
      )}

      <div className="divide-y divide-slate-100 rounded-3xl border border-slate-200 bg-white shadow-sm">
        {!visible.length && <p className="p-8 text-center text-sm text-slate-500">Nothing here.</p>}
        {visible.map((m) => {
          const who = names[m.lead_id] || names[m.client_id];
          const href = m.lead_id ? `/LeadDetail?id=${m.lead_id}` : m.client_id ? `/ClientDetail?id=${m.client_id}` : null;
          const isNew = m.direction === "inbound" && !m.read_at;
          return (
            <div key={m.id} className={`flex gap-3 p-4 ${isNew ? "bg-amber-50/60" : ""}`} onMouseEnter={() => markRead(m)}>
              <div className="mt-0.5">{m.channel === "email" ? <Mail className="h-4 w-4 text-blue-600" /> : <MessageSquare className="h-4 w-4 text-emerald-600" />}</div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {href ? <a href={href} className="font-semibold text-slate-900 hover:underline">{who?.name || "Unknown"}</a> : <span className="font-semibold text-slate-900">{m.direction === "inbound" ? m.from_address : m.to_address}</span>}
                  <span className="text-xs text-slate-500">{m.direction === "inbound" ? "replied" : `to ${m.to_address || "—"}`}</span>
                  <Badge className={`text-[10px] ${STATUS_STYLE[m.status] || ""}`}>{m.status}</Badge>
                  {isNew && <Badge className="bg-amber-500 text-[10px] text-white">New</Badge>}
                  <span className="ml-auto text-xs text-slate-400">{m.created_at ? format(new Date(m.created_at), "MMM d, h:mm a") : ""}</span>
                </div>
                {m.subject && <p className="mt-1 truncate text-sm font-medium text-slate-800">{m.subject}</p>}
                <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap text-sm text-slate-600">{m.body}</p>
                {m.error && <p className="mt-1 text-xs text-rose-600">{m.error}</p>}
              </div>
              {!readOnly && (
                <Button size="icon" variant="ghost" className="shrink-0" title="Reply" onClick={() => openReply(m)}><Reply className="h-4 w-4" /></Button>
              )}
            </div>
          );
        })}
      </div>

      <ComposeDialog
        open={!!reply}
        onOpenChange={(o) => !o && setReply(null)}
        channel={reply?.channel || "sms"}
        target={reply?.target}
        initial={reply?.initial}
        onSent={load}
      />
    </div>
  );
}
