import { Unlink } from "lucide-react";

// Public page Intuit sends people to after they disconnect Clardy from
// inside QuickBooks (the app's "Disconnect URL"). No sign-in needed. The
// server notices the revoked access on its next call and marks QuickBooks
// disconnected in Settings (api/_lib/quickbooks.js).
export default function QuickBooksDisconnected() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: "#f5f0eb", fontFamily: "'Georgia', serif" }}>
      <div className="max-w-md w-full rounded-2xl bg-white p-8 text-center space-y-4 shadow-sm" style={{ border: "1px solid #ddd5c8" }}>
        <div className="w-12 h-12 mx-auto rounded-xl flex items-center justify-center" style={{ backgroundColor: "#3d3530" }}>
          <Unlink className="w-6 h-6" style={{ color: "#b5965a" }} />
        </div>
        <h1 className="text-xl font-bold" style={{ color: "#3d3530" }}>Clardy is disconnected from QuickBooks</h1>
        <p className="text-sm" style={{ color: "#7a6e66" }}>
          Invoices, payments and bills will no longer sync between Clardy and QuickBooks. Nothing already in either one was deleted.
        </p>
        <p className="text-sm" style={{ color: "#7a6e66" }}>To reconnect, sign in to Clardy and go to Settings → QuickBooks.</p>
        <a href="/Settings?tab=quickbooks" className="inline-block w-full py-2.5 rounded-lg text-sm font-semibold" style={{ backgroundColor: "#3d3530", color: "#f5f0eb" }}>
          Go to Settings → QuickBooks
        </a>
        <p className="text-xs" style={{ color: "#a89e96" }}>
          <a href="/privacy" className="underline">Privacy Policy</a> · <a href="/eula" className="underline">License Agreement</a>
        </p>
      </div>
    </div>
  );
}
