import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { buildInvoicePdf } from "./invoicePdf.js";
import { eeMidlandLines, eeMidlandOrder, previewModel } from "./fixtures.js";

function loadAssets() {
  const read = (path) => new Uint8Array(readFileSync(path));
  return {
    logo: read("public/turf/logo.png"),
    gilda: read("public/turf/fonts/GildaDisplay-Regular.ttf"),
    lato: read("public/turf/fonts/Lato-Regular.ttf"),
    latoBold: read("public/turf/fonts/Lato-Bold.ttf"),
    script: read("public/turf/fonts/MrsSaintDelafield-Regular.ttf"),
  };
}

test("Midland invoice PDF uses the Turf'n Texas invoice wording", () => {
  const doc = buildInvoicePdf({
    order: eeMidlandOrder(),
    lines: eeMidlandLines(),
    settings: previewModel().settings,
    assets: loadAssets(),
  });
  const bytes = Buffer.from(doc.output("arraybuffer"));
  writeFileSync("/tmp/ee-midland-invoice.pdf", bytes);
  const text = execFileSync("python3", ["-c", `
import pymupdf
doc = pymupdf.open("/tmp/ee-midland-invoice.pdf")
print(doc[0].get_text())
`], { encoding: "utf8" });
  assert.match(text, /Invoice/);
  assert.match(text, /Jayesh/);
  assert.match(text, /Extreme Exteriors/);
  assert.match(text, /Make Payment To/);
  assert.match(text, /Christian Clardy/);
  assert.match(text, /5882 Caruth Haven Ln/);
  assert.match(text, /Kentucky Pro/);
  assert.match(text, /\$5,580\.00/);
  assert.match(text, /TBD/);
  assert.match(text, /Material Delivery/);
  assert.match(text, /\$400\.00/);
  assert.match(text, /\$6,685\.00 \+ TBD/);
  assert.match(text, /\$551\.51 \+ TBD/);
  assert.match(text, /\$7,236\.51 \+ TBD/);
  assert.match(text, /We appreciate your business/);
  assert.match(text, /Pad and Adhesive 5 Gal Bucket prices are pending/);
});
