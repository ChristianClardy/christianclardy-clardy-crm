import { useEffect, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { Download, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { base44 } from "@/api/base44Client";
import { getInvoiceBranding } from "@/components/payments/invoiceBrandingUtils";

export default function PaymentReceiptModal({ open, onClose, payment }) {
  const [downloading, setDownloading] = useState(false);
  const [data, setData] = useState({ project: null, client: null, company: null, loading: true });
  const receiptRef = useRef(null);

  // Self-contained data fetch — no prop chain needed
  useEffect(() => {
    if (!open || !payment) return;
    let cancelled = false;
    const load = async () => {
      setData({ project: null, client: null, company: null, loading: true });

      const project = await base44.entities.Project.get(payment.linked_job_id).catch(() => null);

      let client = null;
      if (project?.client_id) {
        client = await base44.entities.Client.get(project.client_id).catch(() => null);
      }

      let company = null;
      if (project?.company_id) {
        company = await base44.entities.CompanyProfile.get(project.company_id).catch(() => null);
      }
      if (!company) {
        const all = await base44.entities.CompanyProfile.list("name", 200).catch(() => []);
        company = (client?.company ? all.find(c => c.name === client.company) : null) || all[0] || null;
      }

      if (!cancelled) setData({ project, client, company, loading: false });
    };
    load();
    return () => { cancelled = true; };
  }, [open, payment?.linked_job_id]);

  const { project, client, company, loading } = data;
  const branding = getInvoiceBranding(company);
  const accentColor = branding.accent_color || "#b5965a";

  const receiptNumber = payment?.reference_number
    ? `REF-${payment.reference_number}`
    : `REC-${(payment?.payment_id || payment?.acculynx_payment_id || payment?.id || "").toString().slice(-6).toUpperCase() || "000000"}`;

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
      const clientName = (client?.name || "receipt").replace(/\s+/g, "-").toLowerCase();
      pdf.save(`payment-receipt-${clientName}-${payment?.payment_date || "unknown"}.pdf`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 pr-14">
          <DialogTitle className="text-lg font-semibold text-slate-900">Payment Receipt</DialogTitle>
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
                      <img src={branding.logo_url} alt="Logo" crossOrigin="anonymous"
                        style={{ height: 56, width: 56, objectFit: "contain", borderRadius: 8, backgroundColor: "#fff", padding: 4 }} />
                    ) : (
                      <div style={{ height: 56, width: 56, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.25)",
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, color: "#fff" }}>
                        {(branding.company_name || "C").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>{branding.company_name}</div>
                      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: 2 }}>Payment Receipt</div>
                      {branding.company_address && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>{branding.company_address}</div>}
                      {branding.company_phone && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>{branding.company_phone}</div>}
                      {branding.company_email && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>{branding.company_email}</div>}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>Receipt No.</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginTop: 2 }}>{receiptNumber}</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>{payment?.payment_date || "—"}</div>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div style={{ border: "1px solid #e2e8f0", borderTop: "none", borderRadius: "0 0 8px 8px", padding: "28px 32px", backgroundColor: "#fff" }}>
                {/* Paid badge */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 6, backgroundColor: "#dcfce7", color: "#15803d", borderRadius: 20, padding: "4px 12px", fontSize: 13, fontWeight: 600 }}>
                    <CheckCircle2 style={{ height: 14, width: 14 }} /> Payment Received
                  </div>
                </div>

                {/* Received From / Project */}
                <div style={{ display: "flex", gap: 32, marginBottom: 28 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8", marginBottom: 8 }}>Received From</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>{client?.name || "—"}</div>
                    {client?.email && <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>{client.email}</div>}
                    {client?.phone && <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>{client.phone}</div>}
                    {client?.address && <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>{client.address}</div>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8", marginBottom: 8 }}>Project</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#0f172a" }}>{project?.name || "—"}</div>
                    {project?.address && <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>{project.address}</div>}
                  </div>
                </div>

                <div style={{ height: 1, backgroundColor: "#e2e8f0", marginBottom: 24 }} />

                {/* Payment details */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8", marginBottom: 12 }}>Payment Details</div>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <tbody>
                      {[
                        { label: "Payment Date", value: payment?.payment_date || "—" },
                        { label: "Payment Method", value: payment?.payment_method || "—" },
                        { label: "Reference Number", value: payment?.reference_number || "—" },
                        ...(payment?.notes ? [{ label: "Notes", value: payment.notes }] : []),
                      ].map(({ label, value }) => (
                        <tr key={label}>
                          <td style={{ padding: "8px 0", fontSize: 13, color: "#64748b", width: "40%", verticalAlign: "top" }}>{label}</td>
                          <td style={{ padding: "8px 0", fontSize: 13, color: "#0f172a", fontWeight: 500, verticalAlign: "top" }}>{value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ height: 1, backgroundColor: "#e2e8f0", marginBottom: 20 }} />

                {/* Amount */}
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <div style={{ backgroundColor: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "16px 24px", textAlign: "right", minWidth: 200 }}>
                    <div style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>Amount Received</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: "#15803d", marginTop: 4 }}>
                      ${Number(payment?.amount_received || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
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
