import { apiFetch } from "@/lib/apiFetch";

// Calls /api/quickbooks (api/_lib/quickbooks.js does the work). Throws with
// QuickBooks' own error message.
export async function qbCall(action, payload = {}) {
  const res = await apiFetch("/api/quickbooks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `QuickBooks ${action} failed.`);
  return data;
}

// Connection status, cached for the page so every screen doesn't re-ask.
let statusPromise = null;
export function qbStatus({ refresh = false } = {}) {
  if (!statusPromise || refresh) statusPromise = qbCall("status").catch(() => ({ connected: false }));
  return statusPromise;
}

// Fire-and-forget pushes after a save: returns null instead of throwing when
// QuickBooks isn't connected, so saving in the app never depends on it.
// `setting` names an on/off toggle in Settings → QuickBooks (default on).
export async function qbAutoPush(action, payload, setting) {
  const s = await qbStatus();
  if (!s.connected) return null;
  if (setting && s.settings?.[setting] === false) return null;
  try {
    return await qbCall(action, payload);
  } catch (err) {
    return { error: err.message };
  }
}
