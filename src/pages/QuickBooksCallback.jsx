import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

/**
 * OAuth 2.0 callback page for QuickBooks.
 * QuickBooks redirects here with ?code=...&realmId=... after the user authorises the app.
 * The server exchanges the code and keeps the tokens (never sent to the
 * browser), then this page returns to /Settings?tab=quickbooks.
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
      const state = new URLSearchParams(window.location.search).get("state");

      // The server exchanges the code and stores the tokens itself; they
      // never come back to the browser (api/_lib/quickbooks.js).
      const res = await apiFetch("/api/quickbooks", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action: "callback", code, realm_id: realmId, state, redirect_uri: redirectUri }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to connect QuickBooks.");

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
