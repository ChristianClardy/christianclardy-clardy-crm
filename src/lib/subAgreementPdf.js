import { jsPDF } from "jspdf";
import { agreementSnapshot } from "@/lib/barrierChecklist";

// PDF of a signed Subcontractor Agreement, built on the device from the signed
// row (subcontractor_barrier_acknowledgments). Uses the terms saved with the
// signature (agreement_snapshot, 042); rows signed before that existed fall
// back to the current terms. Native jsPDF text, so it's searchable.
const M = 18; // page margin, mm
const LINE = 5.2;

const fmtDate = (iso) => {
  if (!iso) return "";
  const d = new Date(String(iso).length <= 10 ? `${iso}T00:00:00` : iso);
  return isNaN(d) ? "" : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};

export function buildSubAgreementPdf(ack, { subcontractorName, projectName } = {}) {
  const terms = ack.agreement_snapshot?.requirements?.length ? ack.agreement_snapshot : agreementSnapshot();
  const doc = new jsPDF("p", "mm", "letter");
  const width = doc.internal.pageSize.getWidth() - M * 2;
  const maxY = doc.internal.pageSize.getHeight() - M;
  let y = M;

  const room = (h) => { if (y + h > maxY) { doc.addPage(); y = M; } };
  const para = (text, { size = 10, style = "normal", gap = 2, indent = 0 } = {}) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text || "", width - indent);
    for (const line of lines) {
      room(LINE);
      doc.text(line, M + indent, y);
      y += size >= 14 ? 7 : LINE;
    }
    y += gap;
  };
  const field = (label, value, style = "normal") => {
    room(LINE * 2);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(label, M, y);
    doc.setFont("helvetica", style);
    doc.setFontSize(11);
    doc.text(value || "—", M + 55, y);
    y += LINE + 1.5;
  };

  para(terms.title, { size: 15, style: "bold", gap: 1 });
  para(`Subcontractor: ${subcontractorName || "—"}`, { gap: 0 });
  para(`Applies to: ${projectName || "All Principle Outdoor Living projects"}`, { gap: 4 });

  terms.requirements.forEach((r, i) => {
    room(LINE * 2);
    para(`${i + 1}. ${r.title}`, { style: "bold", gap: 0 });
    para(r.body, { indent: 5, gap: 2.5 });
  });

  y += 2;
  para(terms.acknowledgment, { style: "italic", gap: 6 });

  room(LINE * 8);
  doc.setDrawColor(180);
  doc.line(M, y, M + width, y);
  y += 7;
  field("Authorized representative", ack.authorized_representative);
  field("Subcontractor signature", ack.signature_name, "italic");
  field("Date signed", fmtDate(ack.signed_date));
  if (ack.principle_representative || ack.principle_signature_name) {
    y += 2;
    field("Principle representative", ack.principle_representative);
    field("Principle signature", ack.principle_signature_name, "italic");
  }

  y += 4;
  para(
    `Signed electronically in the Clardy Subcontractor Portal${ack.created_at ? ` on ${fmtDate(ack.created_at)}` : ""}. Record ${ack.id || ""}.`,
    { size: 8, gap: 0 }
  );

  const safe = (subcontractorName || "Subcontractor").replace(/[^\w -]+/g, "").trim();
  const fileName = `Subcontractor Agreement - ${safe} - ${ack.signed_date || "signed"}.pdf`;
  return { doc, fileName };
}

// Phone: opens the share sheet (Save to Files, Mail, AirDrop…), which works
// in home-screen apps where a plain download doesn't. Elsewhere: downloads.
export async function downloadSubAgreementPdf(ack, names) {
  const { doc, fileName } = buildSubAgreementPdf(ack, names);
  const file = new File([doc.output("blob")], fileName, { type: "application/pdf" });
  const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName });
      return;
    } catch (err) {
      if (err?.name === "AbortError") return; // they closed the share sheet
    }
  }
  doc.save(fileName);
}
