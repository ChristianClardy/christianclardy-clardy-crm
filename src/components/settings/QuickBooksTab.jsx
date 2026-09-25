import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Link, Building2, Unlink } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

// ─── QuickBooks Online settings tab ──────────────────────────────────────────

export default function QuickBooksTab() {
  const [quickbooks, setQuickbooks]       = useState(null);
  const [loading, setLoading]             = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  // QB OAuth app credentials (Client ID + Client Secret), entered below and
  // stored server-side in quickbooks_credentials — never in a Vercel env var.
  // GET /api/quickbooks-config only ever returns client_id/environment; the
  // secret never comes back to the browser once saved.
  const [appConfig, setAppConfig]   = useState(null); // { configured, client_id, environment }
  const [editingApp, setEditingApp] = useState(false);
  const [savingApp, setSavingApp]   = useState(false);
  const [appError, setAppError]     = useState("");
  const [form, setForm] = useState({ client_id: "", client_secret: "", environment: "sandbox" });

  useEffect(() => { loadStatus(); loadAppConfig(); }, []);

  const loadStatus = async () => {
    const { data } = await supabase
      .from("company_profiles")
      .select("id, settings")
      .limit(1)
      .single();
    setQuickbooks(data?.settings?.quickbooks || null);
    setLoading(false);
  };

  const loadAppConfig = async () => {
    try {
      const res = await apiFetch("/api/quickbooks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "config-get" }) });
      const data = await res.json();
      setAppConfig(data);
      if (data?.configured) setForm((f) => ({ ...f, client_id: data.client_id, environment: data.environment }));
    } catch {
      setAppConfig({ configured: false });
    }
  };

  const handleSaveApp = async () => {
    setAppError("");
    if (!form.client_id.trim())     return setAppError("Client ID is required.");
    if (!form.client_secret.trim()) return setAppError("Client Secret is required.");
    setSavingApp(true);
    try {
      const res = await apiFetch("/api/quickbooks", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action: "config-save", ...form }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save QuickBooks app credentials.");
      setAppConfig({ configured: true, client_id: data.client_id, environment: data.environment });
      setForm((f) => ({ ...f, client_secret: "" }));
      setEditingApp(false);
    } catch (err) {
      setAppError(err.message);
    } finally {
      setSavingApp(false);
    }
  };

  const handleConnect = async () => {
    try {
      const redirectUri = `${window.location.origin}/QuickBooksCallback`;
      const res = await apiFetch("/api/quickbooks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "auth-url", redirect_uri: redirectUri }) });
      const data = await res.json();
      if (!res.ok || !data.auth_url) throw new Error(data.error || "Failed to start QuickBooks authorization.");
      window.location.href = data.auth_url;
    } catch (err) {
      setAppError(err.message);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect QuickBooks? You will need to reconnect to push invoices.")) return;
    setDisconnecting(true);
    const { data } = await supabase
      .from("company_profiles")
      .select("id, settings")
      .limit(1)
      .single();
    if (data) {
      const { quickbooks: _removed, ...rest } = data.settings || {};
      await supabase.from("company_profiles").update({ settings: rest }).eq("id", data.id);
    }
    setQuickbooks(null);
    setDisconnecting(false);
  };

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="w-6 h-6 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const showAppForm = !appConfig?.configured || editingApp;

  return (
    <div className="space-y-6 max-w-lg">
      {/* ── App credentials card ── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#2CA01C" }}>
            <Building2 className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="font-semibold text-slate-900">QuickBooks App</p>
            <p className="text-xs text-slate-500">Your QuickBooks developer app credentials, used to connect an account below</p>
          </div>
          {appConfig?.configured && !editingApp && (
            <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
              Configured
            </span>
          )}
        </div>

        {showAppForm ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="qb-client-id">Client ID</Label>
              <Input
                id="qb-client-id"
                value={form.client_id}
                onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}
                placeholder="e.g. ABcd1234EFgh5678..."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qb-client-secret">Client Secret</Label>
              <Input
                id="qb-client-secret"
                type="password"
                value={form.client_secret}
                onChange={(e) => setForm((f) => ({ ...f, client_secret: e.target.value }))}
                placeholder={appConfig?.configured ? "Enter a new secret to replace the saved one" : "Client Secret"}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qb-env">Environment</Label>
              <select
                id="qb-env"
                value={form.environment}
                onChange={(e) => setForm((f) => ({ ...f, environment: e.target.value }))}
                className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
              >
                <option value="sandbox">Sandbox (developer/demo)</option>
                <option value="production">Production</option>
              </select>
            </div>
            {appError && <p className="text-xs text-rose-600">{appError}</p>}
            <div className="flex gap-2">
              <Button
                onClick={handleSaveApp}
                disabled={savingApp}
                className="text-white"
                style={{ backgroundColor: "#2CA01C" }}
              >
                {savingApp ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save App Credentials
              </Button>
              {appConfig?.configured && (
                <Button variant="outline" onClick={() => { setEditingApp(false); setAppError(""); }}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between text-sm">
            <div>
              <p className="text-slate-500">Client ID</p>
              <p className="font-mono text-slate-900">{appConfig.client_id}</p>
              <p className="text-xs text-slate-500 mt-1 capitalize">{appConfig.environment}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setEditingApp(true)}>
              Edit
            </Button>
          </div>
        )}
      </div>

      {/* ── Connection status card ── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#2CA01C" }}>
            <Link className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="font-semibold text-slate-900">QuickBooks Account</p>
            <p className="text-xs text-slate-500">Link your QuickBooks Online company to push invoices and sync payments</p>
          </div>
          {quickbooks && (
            <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
              Connected
            </span>
          )}
        </div>

        {quickbooks ? (
          <div className="space-y-4">
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2 text-sm">
              {[
                { label: "Company",   value: quickbooks.company_name },
                { label: "Realm ID",  value: quickbooks.realm_id },
                { label: "Connected", value: quickbooks.connected_at ? new Date(quickbooks.connected_at).toLocaleDateString() : null },
              ].map(({ label, value }) => value ? (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-slate-500">{label}</span>
                  <span className="font-medium text-slate-900">{value}</span>
                </div>
              ) : null)}
            </div>
            <Button
              onClick={handleDisconnect}
              disabled={disconnecting}
              variant="outline"
              className="w-full border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
            >
              {disconnecting
                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                : <Unlink className="w-4 h-4 mr-2" />}
              Disconnect QuickBooks
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              Connect your QuickBooks Online company to push invoices directly from the Payments page.
            </p>
            {!appConfig?.configured && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
                <p className="font-semibold mb-1">App credentials needed</p>
                <p>Add your Client ID and Client Secret above before connecting.</p>
              </div>
            )}
            <Button
              onClick={handleConnect}
              disabled={!appConfig?.configured}
              className="w-full text-white"
              style={{ backgroundColor: appConfig?.configured ? "#2CA01C" : undefined }}
            >
              <Link className="w-4 h-4 mr-2" />
              Connect QuickBooks Online
            </Button>
          </div>
        )}
      </div>

      {/* ── How it works info section ── */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-700">
        <p className="font-semibold text-slate-800 mb-2">How it works</p>
        <ul className="space-y-1.5 text-xs leading-relaxed text-slate-600 list-disc list-inside">
          <li>After connecting, you can push invoices directly to QuickBooks from the Payments page</li>
          <li>Clients receive a QuickBooks payment link via email for online payment</li>
          <li>QB invoices sync back automatically when clients pay</li>
        </ul>
      </div>
    </div>
  );
}
