import { supabase } from "@/lib/supabase";

// Payments drive the draw schedule (050_payments_drive_draws.sql): after any
// payment or draw change, recompute which draws are paid, partly paid or
// open. Quietly does nothing if the database function isn't there yet.
export async function reconcileDraws(projectId) {
  if (!projectId) return;
  const { error } = await supabase.rpc("reconcile_project_draws", { p_project_id: projectId });
  if (error && !/reconcile_project_draws|schema cache|does not exist/i.test(error.message)) console.error("reconcile draws:", error.message);
}

// What a draw needs collected: amount minus retainage still held.
export const drawDue = (d) => Math.max(0, (Number(d?.amount) || 0) - (d?.retainage_released ? 0 : Number(d?.retainage_held) || 0));
export const drawRemaining = (d) => Math.max(0, drawDue(d) - (Number(d?.amount_paid) || 0));
export const isPartlyPaid = (d) => d?.status !== "paid" && Number(d?.amount_paid) > 0 && drawRemaining(d) > 0.005;
