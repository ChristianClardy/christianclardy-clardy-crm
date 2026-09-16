import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

/**
 * OAuth 2.0 callback page for QuickBooks.
 * QuickBooks redirects here with ?code=...&realmId=... after the user authorises the app.
 * This page exchanges the code for tokens, stores them in company_profiles,
 * then redirects back to /Settings?tab=quickbooks.
 */
export default function QuickBooksCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("loading"); // "loading" | "success" | "error"
  const [error, setError]   = useState("");

  useEffect(() => {
    const params      = new URLSearchParams(window.location.search);
    const code        = params.get("code");
    const realmId     = params.get("realmId");
    const errorParam  = params.get("error");

    if (errorParam) {
      setError(params.get("error_description") || "QuickBooks authorization was denied.");
      setStatus("error");
      return;
    }

    if (!code) {
      setError("No authorization code received from QuickBooks.");
      setStatus("error");
      return;
    }

    exchangeCode(code, realmId);
  }, []);

  const exchangeCode = async (code, realmId) => {
    try {
      const redirectUri = `${window.location.origin}/QuickBooksCallback`;

      const res = await fetch("/api/quickbooks", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action: "callback", code, realm_id: realmId, redirect_uri: redirectUri }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to connect QuickBooks.");

      // Persist tokens in company_profiles.settings.quickbooks (org-scoped)
      const { data: profile, error: dbError } = await supabase
        .from("company_profiles")
        .select("id, settings")
        .limit(1)
        .single();

      if (dbError || !profile) throw new Error("Could not load company profile.");

      await supabase
        .from("company_profiles")
        .update({
          settings: {
            ...(profile.settings || {}),
            quickbooks: {
              access_token:  data.access_token,
              refresh_token: data.refresh_token,
              expires_at:    new Date(Date.now() + data.expires_in * 1000).toISOString(),
              realm_id:      data.realm_id,
              company_name:  data.company_name,
              connected_at:  new Date().toISOString(),
            },
          },
        })
        .eq("id", profile.id);

      setStatus("success");
      setTimeout(() => navigate("/Settings?tab=quickbooks"), 1500);
    } catch (err) {
      setError(err.message);
      setStatus("error");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 max-w-sm w-full text-center space-y-3">
        {status === "loading" && (
          <>
            <Loader2 className="w-10 h-10 animate-spin text-amber-500 mx-auto" />
            <p className="font-semibold text-slate-900">Connecting QuickBooks…</p>
            <p className="text-sm text-slate-500">Please wait while we complete the connection.</p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto" />
            <p className="font-semibold text-slate-900">QuickBooks Connected!</p>
            <p className="text-sm text-slate-500">Redirecting you back to Settings…</p>
          </>
        )}

        {status === "error" && (
          <>
            <XCircle className="w-10 h-10 text-rose-500 mx-auto" />
            <p className="font-semibold text-slate-900">Connection Failed</p>
            <p className="text-sm text-slate-500">{error}</p>
            <button
              onClick={() => navigate("/Settings")}
              className="mt-2 text-sm font-medium text-amber-700 hover:text-amber-800"
            >
              Back to Settings
            </button>
          </>
        )}
      </div>
    </div>
  );
}
