import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles, X, Send, Loader2, Check, Ban, RotateCcw } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import { getSelectedCompanyScope } from "@/lib/companyScope";

// Floating Grok chat (rendered once in Layout.jsx, so it's on every staff
// page). Talks to POST /api/mcp/assistant (api/_lib/grokAssistant.js), which
// has the same tools as the Claude connector. Changes Grok wants to make come
// back as `pending` and only run once Approve is pressed here.

const STORAGE_KEY = "grok_assistant_thread";

const SUGGESTIONS = [
  "Which leads haven't moved stages in 2 weeks?",
  "What's on the calendar this week?",
  "Which projects are over budget in Job Cost?",
  "Summarize open change orders and punch items",
];

// "update_lead" → "Update lead"
const toolLabel = (name) => name.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function parseArgs(json) {
  try { return JSON.parse(json || "{}"); } catch { return {}; }
}

function PendingCard({ pending, busy, onDecide }) {
  const writes = pending.filter((c) => c.needs_approval);
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-slate-800">
      <p className="mb-2 font-semibold">Grok wants to make {writes.length === 1 ? "this change" : `these ${writes.length} changes`}:</p>
      {writes.map((c) => (
        <div key={c.call_id} className="mb-2 rounded border border-amber-200 bg-white p-2">
          <p className="font-medium">{toolLabel(c.name)}</p>
          <dl className="mt-1 grid grid-cols-[auto,1fr] gap-x-2 text-xs">
            {Object.entries(parseArgs(c.arguments)).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-slate-500">{k.replace(/_/g, " ")}</dt>
                <dd className="break-words">{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={() => onDecide(true)} className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
          <Check className="h-4 w-4" /> Approve
        </button>
        <button type="button" disabled={busy} onClick={() => onDecide(false)} className="inline-flex items-center gap-1 rounded-md bg-slate-200 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-300 disabled:opacity-50">
          <Ban className="h-4 w-4" /> Decline
        </button>
      </div>
    </div>
  );
}

export default function GrokAssistant({ currentPageName }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || { messages: [], responseId: null }; }
    catch { return { messages: [], responseId: null }; }
  });
  // Kept across reloads too: Grok's last response is waiting on these, so the
  // thread can't continue until they're approved or declined.
  const [pending, setPending] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(`${STORAGE_KEY}_pending`)); } catch { return null; }
  });
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(thread)); }, [thread]);
  useEffect(() => { sessionStorage.setItem(`${STORAGE_KEY}_pending`, JSON.stringify(pending)); }, [pending]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [thread.messages, pending, busy, open]);

  const push = (role, text) => setThread((t) => ({ ...t, messages: [...t.messages, { role, text }] }));

  async function post(body) {
    setBusy(true);
    try {
      const res = await apiFetch("/api/mcp/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setThread((t) => ({
        responseId: data.response_id,
        messages: data.reply ? [...t.messages, { role: "assistant", text: data.reply }] : t.messages,
      }));
      setPending(data.pending?.length ? data.pending : null);
      // Grok changed records — refresh whatever the open page has loaded.
      if (data.changes?.length) queryClient.invalidateQueries();
    } catch (err) {
      push("error", err.message);
    } finally {
      setBusy(false);
    }
  }

  function send(text) {
    const message = (text ?? draft).trim();
    if (!message || busy || pending) return;
    setDraft("");
    push("user", message);
    post({
      message,
      previous_response_id: thread.responseId,
      context: { page: currentPageName, company: getSelectedCompanyScope() },
    });
  }

  function decide(approve) {
    const approvals = Object.fromEntries(pending.filter((c) => c.needs_approval).map((c) => [c.call_id, approve]));
    const calls = pending;
    setPending(null);
    push("system", approve ? "Approved." : "Declined.");
    post({ previous_response_id: thread.responseId, pending: calls, approvals });
  }

  function reset() {
    setThread({ messages: [], responseId: null });
    setPending(null);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full px-4 py-3 font-semibold shadow-lg"
        style={{ backgroundColor: "var(--brand-gold)", color: "#f5f0eb", fontFamily: "system-ui, sans-serif" }}
        title="Ask Grok"
      >
        <Sparkles className="h-5 w-5" /> Grok
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-0 right-0 z-50 flex h-[80vh] w-full flex-col border bg-white shadow-2xl sm:bottom-5 sm:right-5 sm:h-[600px] sm:w-[420px] sm:rounded-xl"
      style={{ fontFamily: "system-ui, sans-serif" }}
    >
      <div className="flex items-center justify-between rounded-t-xl px-4 py-3" style={{ backgroundColor: "var(--brand-sidebar)", color: "#f5f0eb" }}>
        <span className="inline-flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4" /> Grok</span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={reset} className="rounded p-1.5 hover:bg-white/10" title="New conversation"><RotateCcw className="h-4 w-4" /></button>
          <button type="button" onClick={() => setOpen(false)} className="rounded p-1.5 hover:bg-white/10" title="Close"><X className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
        {thread.messages.length === 0 && (
          <div className="space-y-2 text-slate-600">
            <p>Ask about leads, clients, estimates, projects, schedules, change orders, job cost, draws or payments. Grok shows you any change before it's made.</p>
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => send(s)} className="block w-full rounded-md border px-3 py-2 text-left hover:bg-slate-50">{s}</button>
            ))}
          </div>
        )}
        {thread.messages.map((m, i) => (
          m.role === "user" ? (
            <div key={i} className="ml-8 rounded-lg bg-slate-800 px-3 py-2 text-white whitespace-pre-wrap">{m.text}</div>
          ) : m.role === "error" ? (
            <div key={i} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700">{m.text}</div>
          ) : m.role === "system" ? (
            <p key={i} className="text-center text-xs text-slate-400">{m.text}</p>
          ) : (
            <div key={i} className="prose prose-sm mr-8 max-w-none rounded-lg bg-slate-100 px-3 py-2 text-slate-800"><ReactMarkdown>{m.text}</ReactMarkdown></div>
          )
        ))}
        {pending && <PendingCard pending={pending} busy={busy} onDecide={decide} />}
        {busy && <p className="inline-flex items-center gap-2 text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Grok is working…</p>}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex gap-2 border-t p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={pending ? "Approve or decline the change first" : "Ask Grok…"}
          disabled={!!pending}
          className="flex-1 rounded-md border px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-amber-400 disabled:bg-slate-50"
        />
        <button type="submit" disabled={busy || !!pending || !draft.trim()} className="rounded-md px-3 text-white disabled:opacity-50" style={{ backgroundColor: "var(--brand-gold)" }}>
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
