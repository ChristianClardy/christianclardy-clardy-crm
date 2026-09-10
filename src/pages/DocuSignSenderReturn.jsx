import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle } from "lucide-react";

/**
 * DocuSign redirects here (returnUrl passed to the Embedded Sender View,
 * see api/docusign-send.js) after Christian finishes — or cancels —
 * reviewing/sending a contract inside DocuSign's own UI. This tab was
 * opened via window.open() from ContractsPanel.jsx, so closing it via
 * script is allowed; falls back to a manual-close message if the browser
 * blocks it.
 */
export default function DocuSignSenderReturn() {
  const navigate = useNavigate();
  const [canAutoClose, setCanAutoClose] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      window.close();
      // If we're still here shortly after, the browser blocked the close.
      setTimeout(() => setCanAutoClose(false), 300);
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 max-w-sm w-full text-center space-y-3">
        <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto" />
        <p className="font-semibold text-slate-900">All set in DocuSign</p>
        <p className="text-sm text-slate-500">
          {canAutoClose
            ? "This tab will close automatically…"
            : "You can close this tab now, or head back to Clardy.io."}
        </p>
        {!canAutoClose && (
          <button
            onClick={() => navigate("/Pipeline")}
            className="mt-2 text-sm font-medium text-amber-700 hover:text-amber-800"
          >
            Back to Pipeline
          </button>
        )}
      </div>
    </div>
  );
}
