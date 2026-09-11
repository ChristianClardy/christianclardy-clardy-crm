// Scans an uploaded contract template file (PDF or DOCX) for literal
// {{dotted.path}} merge-field placeholders, so ContractTemplatesTab can
// auto-populate the Merge Fields list instead of requiring each anchor to
// be typed in by hand. Legacy .doc (binary Word) files have no reliable
// client-side text extractor, so those are reported as unsupported and fall
// back to manual entry.
//
// pdfjs-dist and mammoth are both fairly large, so they're dynamically
// imported here rather than at module load time — this file is only ever
// used from the Settings > Templates file-upload handler.

const TOKEN_RE = /\{\{\s*([\w.-]+)\s*\}\}/g;

function extractTokens(text) {
  const tokens = new Set();
  for (const m of (text || "").matchAll(TOKEN_RE)) tokens.add(m[1]);
  return [...tokens];
}

async function extractPdfText(arrayBuffer) {
  const pdfjsLib = await import("pdfjs-dist");
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item) => item.str).join(" ") + "\n";
  }
  return text;
}

async function extractDocxText(arrayBuffer) {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ arrayBuffer });
  return value;
}

// Returns:
//   { supported: false }
//   { supported: true, tokens: string[], hasSignatureMarker: boolean }
// `tokens` are the raw dotted-path strings found (e.g. "client.address"),
// deduped, in first-seen order — not yet filtered against known sources.
export async function scanTemplateFileForMergeTokens(file) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (ext !== "pdf" && ext !== "docx") return { supported: false };

  const arrayBuffer = await file.arrayBuffer();
  const text = ext === "pdf" ? await extractPdfText(arrayBuffer) : await extractDocxText(arrayBuffer);

  return {
    supported: true,
    tokens: extractTokens(text),
    hasSignatureMarker: text.includes("**signature**"),
  };
}
