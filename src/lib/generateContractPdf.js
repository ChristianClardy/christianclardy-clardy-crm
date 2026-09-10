import { jsPDF } from "jspdf";

// Renders a fully-resolved 'text' mode contract body to a real PDF using
// jsPDF's native text API (doc.text/splitTextToSize) — deliberately NOT the
// html2canvas + addImage pattern InvoicePdfDownloadButton.jsx uses. That
// pattern rasterizes the page into an image with no text layer, which would
// make the "**signature**" marker unfindable by DocuSign's anchor-string
// matching in api/docusign-send.js. Native jsPDF text stays real, searchable
// text, so anchor matching keeps working.
const PAGE_MARGIN = 20; // mm
const LINE_HEIGHT = 6; // mm
const FONT_SIZE = 11;

export function generateContractPdf(body, { title } = {}) {
  const doc = new jsPDF("p", "mm", "letter");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const textWidth = pageWidth - PAGE_MARGIN * 2;
  const maxY = pageHeight - PAGE_MARGIN;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(FONT_SIZE);

  let y = PAGE_MARGIN;
  const paragraphs = (body || "").split("\n");
  for (const paragraph of paragraphs) {
    const lines = paragraph.length ? doc.splitTextToSize(paragraph, textWidth) : [""];
    for (const line of lines) {
      if (y > maxY) {
        doc.addPage();
        y = PAGE_MARGIN;
      }
      doc.text(line, PAGE_MARGIN, y);
      y += LINE_HEIGHT;
    }
  }

  const blob = doc.output("blob");
  const fileName = `${(title || "Contract").replace(/[^\w -]+/g, "").trim() || "Contract"}.pdf`;
  return new File([blob], fileName, { type: "application/pdf" });
}
