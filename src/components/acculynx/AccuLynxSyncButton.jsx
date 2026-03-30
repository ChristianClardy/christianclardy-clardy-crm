import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";

export default function AccuLynxSyncButton({ label = "Sync from AccuLynx", onSynced, size = "sm", className = "" }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSync = async () => {
    setLoading(true);
    setMessage("");

    let offset = 0;
    let hasMore = true;
    let guard = 0;
    const totals = {
      estimates_synced: 0,
      line_items_synced: 0,
      materials_synced: 0,
    };

    while (hasMore && guard < 50) {
      const response = await base44.functions.invoke("acculynxSyncEstimatingData", { offset, batch_size: 1 });
      const data = response.data || {};

      totals.estimates_synced += Number(data.estimates_synced || 0);
      totals.line_items_synced += Number(data.line_items_synced || 0);
      totals.materials_synced += Number(data.materials_synced || 0);
      hasMore = Boolean(data.has_more);
      offset = Number(data.next_offset || 0);
      guard += 1;

      if (hasMore) {
        setMessage(`Synced ${Math.min(offset, Number(data.total_projects || offset))} of ${data.total_projects || offset} projects…`);
      }
    }

    setMessage(`Synced ${totals.estimates_synced} estimates, ${totals.line_items_synced} line items, and ${totals.materials_synced} materials.`);
    await onSynced?.(totals);
    setLoading(false);
  };

  return (
    <div className="space-y-2">
      <Button variant="outline" size={size} onClick={handleSync} disabled={loading} className={className}>
        <RefreshCw className={loading ? "w-4 h-4 animate-spin" : "w-4 h-4"} />
        {loading ? "Syncing…" : label}
      </Button>
      {message && <p className="text-xs text-slate-500">{message}</p>}
    </div>
  );
}