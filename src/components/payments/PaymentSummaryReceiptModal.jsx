import { useEffect, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { Download, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { base44 } from "@/api/base44Client";
import { getInvoiceBranding } from "@/components/payments/invoiceBrandingUtils";

export default function PaymentSummaryReceiptModal({ open, onClose, projectId, payments = [], contractValue = 0 }) {
  const [downloading, setDownloading] = useState(false);
  const [data, setData] = useState({ project: null, client: null, company: null, loading: true });
  const receiptRef = useRef(null);

  // Self-contained data fetch
  useEffect(() => {
    if (!open || !projectId) return;
    let cancelled = false;
    const load = async () => {
      setData({ project: null, client: null, company: null, loading: true });

      const project = await base44.entities.Project.get(projectId).catch(() => null);

      let client = null;
      if (project?.client_id) {
        client = await base44.entities.Client.get(project.client_id).catch(() => null);
      }

      let company = null;
      if (project?.company_id) {
        company = await base44.entities.CompanyProfile.get(project.company_id).catch(() => null);
      }
      if (!company && client?.company) {
        const all = await base44.entities.CompanyProfile.list("name", 200).catch(() => []);
        company = all.find(c => c.name === client.company) || null;
      }

      if (!cancelled) setData({ project, client, company, loading: false });
    };
    load();
    return () => { cancelled = true; };
  }, [open, projectId]);

  const { project, client, company, loading } = data;
  const branding = getInvoiceBranding(company);
  const accentColor = branding.accent_color || "#b5965a";

  const sorted = [...payments].sort((a, b) => String(a.payment_date || "").localeCompare(String(b.payment_date || "")));
  const totalReceived = sorted.reduce((sum, p) => sum + (Number(p.amount_received) || 0), 0);
  const remainingBalance = Math.max(0, (Number(contractValue) || 0) - totalReceived);
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const fmt = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleDownload = async () => {
    if (!receiptRef.current) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(receiptRef.current, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      const imageData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      if (imgHeight <= pageHeight) {
        pdf.addImage(imageData, "PNG", 0, 0, imgWidth, imgHeight);
      } else {
        let heightLeft = imgHeight;
        let position = 0;
        pdf.addImage(imageData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
        while (heightLeft > 0) {
          position = heightLeft - imgHeight;
          pdf.addPage();
          pdf.addImage(imageData, "PNG", 0, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;
        }
      }

      const projectSlug = (project?.name || "project").replace(/\s+/g, "-").toLowerCase();
      pdf.save(`payment-history-${projectSlug}.pdf`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 pr-14">
          <DialogTitle className="text-lg font-semibold text-slate-900">Payment History Receipt</DialogTitle>
          <Button onClick={handleDownload} disabled={downloading || loading} size="sm">
            {downloading ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Preparing...</> : <><Download className="h-4 w-4 mr-1" />Download PDF</>}
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
          </div>
        ) : (
          <div className="p-6">
            <div ref={receiptRef} className="bg-white" style={{ fontFamily: "sans-serif", width: "100%" }}>

              {/* Branded header */}
              <div style={{ backgroundColor: accentColor, padding: "28px 32px", borderRadius: "8px 8px 0 0" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    {branding.logo_url ? (
                      <img src={branding.logo_url} alt="Company Logo" crossOrigin="anonymous"
                        style={{ height: 56, width: 56, objectFit: "contain", borderRadius: 8, backgroundColor: "#fff", padding: 4 }} />
                    ) : (
                      <div style={{ height: 56, width: 56, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.25)",
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, color: "#fff" }}>
                        {(branding.company_name || "C").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>{branding.company_name}</div>
                      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: 2 }}>Payment History</div>
                      {branding.company_address && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>{branding.company_address}</div>}
                      {branding.company_phone && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>{branding.company_phone}</div>}
                      {branding.company_email && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>{branding.company_email}</div>}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>Generated</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", marginTop: 2 }}>{today}</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>
                      {sorted.length} payment{sorted.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div style={{ border: "1px solid #e2e8f0", borderTop: "none", borderRadius: "0 0 8px 8px", padding: "28px 32px", backgroundColor: "#fff" }}>

                {/* Client / Project info */}
                <div style={{ display: "flex", gap: 32, marginBottom: 24 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8", marginBottom: 8 }}>Customer</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>{client?.name || "—"}</div>
                    {client?.email && <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>{client.email}</div>}
                    {client?.phone && <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>{client.phone}</div>}
                    {client?.address && <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>{client.address}</div>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8", marginBottom: 8 }}>Project</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#0f172a" }}>{project?.name || "—"}</div>
                    {project?.address && <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>{project.address}</div>}
                    {contractValue > 0 && (
                      <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
                        Contract Value: <strong style={{ color: "#0f172a" }}>{fmt(contractValue)}</strong>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ height: 1, backgroundColor: "#e2e8f0", marginBottom: 20 }} />

                {/* Payments table */}
                <div style={{ marginBottom: 4 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8", marginBottom: 12 }}>Payment History</div>
                </div>

                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ backgroundColor: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
                      <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600, color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>#</th>
                      <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600, color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>Date</th>
                      <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600, color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>Method</th>
                      <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600, color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>Reference</th>
                      <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600, color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>Notes</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", fontWeight: 600, color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((p, i) => (
                      <tr key={p.id || i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "9px 10px", color: "#94a3b8" }}>{i + 1}</td>
                        <td style={{ padding: "9px 10px", color: "#334155" }}>{p.payment_date || "—"}</td>
                        <td style={{ padding: "9px 10px", color: "#334155" }}>{p.payment_method || "—"}</td>
                        <td style={{ padding: "9px 10px", color: "#334155" }}>{p.reference_number || "—"}</td>
                        <td style={{ padding: "9px 10px", color: "#64748b" }}>{p.notes || "—"}</td>
                        <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 600, color: "#0f172a" }}>{fmt(p.amount_received)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Totals block */}
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 20 }}>
                  <div style={{ minWidth: 260 }}>
                    <div style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      backgroundColor: "#dcfce7", borderRadius: 8,
                      padding: "14px 20px", marginBottom: contractValue > 0 ? 8 : 0,
                    }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#15803d" }}>Total Paid to Date</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                          <CheckCircle2 style={{ width: 13, height: 13, color: "#15803d" }} />
                          <span style={{ fontSize: 11, color: "#16a34a" }}>{sorted.length} payment{sorted.length !== 1 ? "s" : ""} recorded</span>
                        </div>
                      </div>
                      <div style={{ fontSize: 26, fontWeight: 800, color: "#15803d" }}>{fmt(totalReceived)}</div>
                    </div>

                    {contractValue > 0 && (
                      <div style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        backgroundColor: remainingBalance === 0 ? "#f0fdf4" : "#fffbeb",
                        border: `1px solid ${remainingBalance === 0 ? "#bbf7d0" : "#fde68a"}`,
                        borderRadius: 8, padding: "14px 20px",
                      }}>
                        <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: remainingBalance === 0 ? "#15803d" : "#92400e" }}>
                          Remaining Balance
                        </div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: remainingBalance === 0 ? "#15803d" : "#b45309" }}>{fmt(remainingBalance)}</div>
                      </div>
                    )}
                  </div>
                </div>

                {branding.footer_text && (
                  <>
                    <div style={{ height: 1, backgroundColor: "#e2e8f0", marginTop: 24, marginBottom: 16 }} />
                    <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", lineHeight: 1.6 }}>{branding.footer_text}</div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
