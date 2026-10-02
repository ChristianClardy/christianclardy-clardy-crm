import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Link as LinkIcon, Building2, Unlink, RefreshCw, Copy, Check, ChevronDown, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { qbCall, qbStatus } from "@/lib/quickbooks";

// Settings → QuickBooks. Everything talks to /api/quickbooks
// (api/_lib/quickbooks.js); tokens and the client secret stay on the server.
//   1. Setup guide for the Intuit developer app
//   2. App keys (Client ID / Secret / environment / webhook verifier)
//   3. Connect / disconnect the QuickBooks company
//   4. Mapping: which product/service invoices use, which account sub bills
//      hit, where payments are deposited; auto-send toggles
//   5. Sync status and Sync now

const origin = typeof window !== "undefined" ? window.location.origin : "https://clardy.io";
// Handled on the server (vercel.json rewrite → /api/quickbooks?action=oauth-callback),
// which redirects back here with ?qb=connected or ?qb=error.
const REDIRECT_URI = `${origin}/QuickBooksCallback`;
const RETURN_MESSAGES = {
  connected: { ok: true, text: "QuickBooks is connected. Pick how Clardy books invoices and bills below." },
  denied: { ok: false, text: "QuickBooks access wasn't approved. Click Connect to QuickBooks to try again." },
  expired: { ok: false, text: "That QuickBooks sign-in took too long or wasn't started from Clardy. Click Connect to QuickBooks again." },
  failed: { ok: false, text: "QuickBooks couldn't be connected. Check the app keys and the Redirect URI in your Intuit app, then try again." },
};
const WEBHOOK_URL = `${origin}/api/quickbooks?action=webhook`;

function CopyField({ label, value }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1 flex gap-2">
        <Input readOnly value={value} className="h-9 text-xs font-mono bg-slate-50" />
        <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" onClick={async () => {
          try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { prompt("Copy:", value); }
        }}>
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}

function Card({ title, children, className }) {
  return (
    <div className={cn("rounded-2xl border border-slate-200 bg-white p-5 space-y-3", className)}>
      {title && <h3 className="font-semibold text-slate-900">{title}</h3>}
      {children}
    </div>
  );
}

export default function QuickBooksTab() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(null);
  const [form, setForm] = useState({ client_id: "", client_secret: "", environment: "production", webhook_verifier: "" });
  const [editingKeys, setEditingKeys] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [options, setOptions] = useState(null);
  const [mapping, setMapping] = useState({});
  const [syncResult, setSyncResult] = useState(null);
  // Result of the QuickBooks sign-in (?qb=connected|error&reason=…), shown once.
  const [returnMsg] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    const qb = p.get("qb");
    if (!qb) return null;
    window.history.replaceState(null, "", "/Settings?tab=quickbooks");
    return qb === "connected" ? RETURN_MESSAGES.connected : RETURN_MESSAGES[p.get("reason")] || RETURN_MESSAGES.failed;
  });

  const load = async () => {
    const s = await qbStatus({ refresh: true });
    setStatus(s);
    setMapping(s.settings || {});
    if (s.configured) setForm((f) => ({ ...f, client_id: s.client_id || "", environment: s.environment || "production" }));
    setGuideOpen(!s.configured);
    if (s.connected) qbCall("options").then(setOptions).catch((e) => setError(e.message));
  };
  useEffect(() => { load(); }, []);

  const run = async (key, fn) => {
    setBusy(key); setError("");
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(null); }
  };

  const saveKeys = () => run("keys", async () => {
    await qbCall("config-save", form);
    setForm((f) => ({ ...f, client_secret: "", webhook_verifier: "" }));
    setEditingKeys(false);
    await load();
  });

  const connect = () => run("connect", async () => {
    const { auth_url } = await qbCall("auth-url", { redirect_uri: REDIRECT_URI });
    window.location.href = auth_url;
  });

  const disconnect = () => {
    if (!confirm("Disconnect QuickBooks? Invoices, payments and bills stop syncing until you reconnect. Nothing is deleted in QuickBooks or in Clardy.")) return;
    run("disconnect", async () => { await qbCall("disconnect"); setOptions(null); await load(); });
  };

  const saveMapping = () => run("mapping", async () => {
    const name = (list, id) => list?.find((x) => x.id === id)?.name || null;
    await qbCall("settings-save", {
      settings: {
        ...mapping,
        income_item_name: name(options?.items, mapping.income_item_id),
        expense_account_name: name(options?.expense_accounts, mapping.expense_account_id),
        deposit_account_name: name(options?.deposit_accounts, mapping.deposit_account_id),
      },
    });
    await load();
  });

  const syncNow = () => run("sync", async () => {
    const r = await qbCall("sync", { force: true });
    setSyncResult(r);
    await load();
  });

  if (!status) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-amber-500" /></div>;

  const keysForm = !status.configured || editingKeys;
  const refreshExpiresSoon = status.refresh_expires_at && new Date(status.refresh_expires_at).getTime() - Date.now() < 14 * 86400000;
  const result = syncResult || status.last_sync_result;
  const mappingMissing = status.connected && (!status.settings?.income_item_id || !status.settings?.expense_account_id);

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">QuickBooks Online</h2>
        <p className="text-sm text-slate-500">
          Send invoices with a Pay now link, keep payments in sync both ways, send sub bills to QuickBooks coded to the job,
          and see QuickBooks profit per job in Clardy. Each project becomes a job (sub-customer) under its client in QuickBooks.
        </p>
      </div>

      {returnMsg && (
        <div className={cn("rounded-xl border px-4 py-3 text-sm", returnMsg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-700")}>{returnMsg.text}</div>
      )}
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      {/* 1. Setup guide */}
      <div className="rounded-2xl border border-slate-200 bg-white">
        <button type="button" onClick={() => setGuideOpen((o) => !o)} className="w-full flex items-center justify-between px-5 py-4 text-left">
          <span className="font-semibold text-slate-900">One-time setup: create your Intuit app</span>
          <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", guideOpen && "rotate-180")} />
        </button>
        {guideOpen && (
          <div className="px-5 pb-5 space-y-4 text-sm text-slate-700">
            <ol className="list-decimal pl-5 space-y-2">
              <li>Go to <a href="https://developer.intuit.com" target="_blank" rel="noopener noreferrer" className="text-amber-700 underline">developer.intuit.com</a> and sign in with the same Intuit account you use for QuickBooks.</li>
              <li>Open <strong>My Hub → App dashboard</strong>, click <strong>Create an app</strong>, choose <strong>QuickBooks Online and Payments</strong>, name it "Clardy", and pick the <strong>Accounting</strong> scope.</li>
              <li>In the app, open <strong>Production → Keys &amp; credentials</strong>. Intuit asks a short questionnaire (app info, privacy/terms links, where it's hosted) before showing production keys. Your website's privacy page and terms page are fine; host is "Vercel".</li>
              <li>Under <strong>Redirect URIs</strong> (Production), add this exactly:</li>
            </ol>
            <CopyField label="Redirect URI" value={REDIRECT_URI} />
            <ol start={5} className="list-decimal pl-5 space-y-2">
              <li>Copy the <strong>Client ID</strong> and <strong>Client Secret</strong> into the form below and choose <strong>Production</strong>.</li>
              <li>For live payment syncing, open <strong>Production → Webhooks</strong>, paste this endpoint, tick <strong>Payment</strong>, <strong>Invoice</strong> and <strong>Bill</strong>, save, and copy the <strong>Verifier token</strong> into the form below:</li>
            </ol>
            <CopyField label="Webhook endpoint" value={WEBHOOK_URL} />
            <ol start={7} className="list-decimal pl-5 space-y-2">
              <li>For the <strong>Pay now</strong> link on invoices, QuickBooks Payments must be turned on in QuickBooks (gear icon → Account and settings → Payments). Without it invoices still send, just without online paying.</li>
              <li>Click <strong>Connect to QuickBooks</strong> below and approve access for your company.</li>
            </ol>
            <p className="text-xs text-slate-500">Want to try it first? Use the Development (sandbox) keys and the Sandbox environment, then switch to Production keys.</p>
          </div>
        )}
      </div>

      {/* 2. App keys */}
      <Card title="Intuit app keys">
        {keysForm ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Client ID</Label>
                <Input value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value.trim() })} className="mt-1 h-9 text-sm font-mono" />
              </div>
              <div>
                <Label className="text-xs">Client Secret {status.configured && <span className="text-slate-400">(leave blank to keep)</span>}</Label>
                <Input type="password" value={form.client_secret} onChange={(e) => setForm({ ...form, client_secret: e.target.value.trim() })} className="mt-1 h-9 text-sm font-mono" />
              </div>
              <div>
                <Label className="text-xs">Environment</Label>
                <select value={form.environment} onChange={(e) => setForm({ ...form, environment: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm">
                  <option value="production">Production (your real books)</option>
                  <option value="sandbox">Sandbox (test company)</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">Webhook verifier token {status.webhook_configured && <span className="text-slate-400">(leave blank to keep)</span>}</Label>
                <Input type="password" value={form.webhook_verifier} onChange={(e) => setForm({ ...form, webhook_verifier: e.target.value.trim() })} placeholder="Optional, for live sync" className="mt-1 h-9 text-sm font-mono" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={saveKeys} disabled={busy === "keys" || !form.client_id} className="bg-slate-900 text-white">
                {busy === "keys" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />} Save keys
              </Button>
              {status.configured && <Button size="sm" variant="outline" onClick={() => setEditingKeys(false)}>Cancel</Button>}
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="text-slate-600 space-y-0.5">
              <p>Client ID <span className="font-mono text-slate-900">{status.client_id?.slice(0, 8)}…</span> · {status.environment === "production" ? "Production" : "Sandbox"}</p>
              <p className={status.webhook_configured ? "text-emerald-700" : "text-amber-700"}>
                {status.webhook_configured ? "Live sync (webhook) is set up." : "No webhook verifier yet: payments sync on Sync now, when you open Payments, and once a day."}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setEditingKeys(true)}>Change keys</Button>
          </div>
        )}
      </Card>

      {/* 3. Connection */}
      {status.configured && (
        <Card title="Connection">
          {status.connected ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center"><Building2 className="w-5 h-5 text-emerald-600" /></div>
                  <div>
                    <p className="font-medium text-slate-900">{status.company_name || "QuickBooks company"}</p>
                    <p className="text-xs text-slate-500">Connected {status.connected_at ? new Date(status.connected_at).toLocaleDateString() : ""}{status.connected_by ? ` by ${status.connected_by}` : ""}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={connect} disabled={!!busy}>Reconnect</Button>
                  <Button size="sm" variant="outline" className="text-rose-600" onClick={disconnect} disabled={!!busy}>
                    {busy === "disconnect" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Unlink className="w-4 h-4 mr-1" />} Disconnect
                  </Button>
                </div>
              </div>
              {refreshExpiresSoon && (
                <p className="text-xs text-amber-700 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> QuickBooks access expires {new Date(status.refresh_expires_at).toLocaleDateString()}. Click Reconnect before then.</p>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-600">Sign in to QuickBooks and approve Clardy for your company.</p>
              <Button size="sm" onClick={connect} disabled={busy === "connect"} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {busy === "connect" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <LinkIcon className="w-4 h-4 mr-1" />} Connect to QuickBooks
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* 4. Mapping */}
      {status.connected && (
        <Card title="How Clardy books things in QuickBooks">
          {mappingMissing && (
            <p className="text-sm text-amber-700 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> Pick a product/service and an expense account so invoices and bills can be sent.</p>
          )}
          {!options ? (
            <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Invoices use product/service</Label>
                  <select value={mapping.income_item_id || ""} onChange={(e) => setMapping({ ...mapping, income_item_id: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm">
                    <option value="">Choose…</option>
                    {options.items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Sub bills are coded to</Label>
                  <select value={mapping.expense_account_id || ""} onChange={(e) => setMapping({ ...mapping, expense_account_id: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm">
                    <option value="">Choose…</option>
                    {options.expense_accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Payments are deposited to</Label>
                  <select value={mapping.deposit_account_id || ""} onChange={(e) => setMapping({ ...mapping, deposit_account_id: e.target.value })} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm">
                    <option value="">Undeposited Funds (default)</option>
                    {options.deposit_accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={mapping.auto_push_payments !== false} onChange={(e) => setMapping({ ...mapping, auto_push_payments: e.target.checked })} />
                Send payments recorded in Clardy to QuickBooks automatically
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={mapping.auto_push_bills !== false} onChange={(e) => setMapping({ ...mapping, auto_push_bills: e.target.checked })} />
                Send sub invoices entered on a project's AP &amp; Cash tab to QuickBooks as bills automatically
              </label>
              <Button size="sm" onClick={saveMapping} disabled={busy === "mapping"} className="bg-slate-900 text-white">
                {busy === "mapping" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />} Save
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* 5. Sync */}
      {status.connected && (
        <Card title="Sync from QuickBooks">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">
              Brings in payments entered in QuickBooks (including online Pay now payments), marks paid invoices and paid bills.
              {status.last_sync_at ? ` Last synced ${new Date(status.last_sync_at).toLocaleString()}.` : " Not synced yet."}
            </p>
            <Button size="sm" variant="outline" onClick={syncNow} disabled={busy === "sync"}>
              {busy === "sync" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />} Sync now
            </Button>
          </div>
          {result && !result.skipped && (
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 space-y-1">
              <p className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                {result.payments_added} payment{result.payments_added === 1 ? "" : "s"} added · {result.payments_updated} updated · {result.payments_removed} removed · {result.invoices_updated} invoice{result.invoices_updated === 1 ? "" : "s"} updated · {result.bills_paid} bill{result.bills_paid === 1 ? "" : "s"} paid
              </p>
              {result.unmatched?.length > 0 && (
                <div className="text-amber-700">
                  <p>Couldn't tell which project these belong to (the QuickBooks customer isn't linked to a Clardy job yet):</p>
                  <ul className="list-disc pl-5">{result.unmatched.slice(0, 10).map((u, i) => <li key={i}>{u}</li>)}</ul>
                </div>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
