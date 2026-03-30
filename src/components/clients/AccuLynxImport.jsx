import { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, CheckCircle2, AlertCircle, X, Info } from "lucide-react";
import { cn } from "@/lib/utils";

// AccuLynx CSV field mappings (common export column names → our fields)
const FIELD_MAP = {
  // Name variants
  "customer name": "name",
  "contact name": "name",
  "name": "name",
  "company": "name",
  "company name": "name",
  "client name": "name",
  "full name": "contact_person",
  // Contact person
  "contact": "contact_person",
  "primary contact": "contact_person",
  "contact person": "contact_person",
  "owner": "contact_person",
  // Email
  "email": "email",
  "email address": "email",
  "primary email": "email",
  // Phone
  "phone": "phone",
  "phone number": "phone",
  "primary phone": "phone",
  "mobile": "phone",
  "cell": "phone",
  "cell phone": "phone",
  // Address
  "address": "address",
  "street address": "address",
  "property address": "address",
  "job address": "address",
  "billing address": "address",
  "city": "_city",
  "state": "_state",
  "zip": "_zip",
  "zip code": "_zip",
};

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  // Parse header
  const headers = lines[0].split(",").map((h) => h.replace(/^"|"$/g, "").trim());

  return lines.slice(1).map((line) => {
    // Handle quoted fields with commas inside
    const values = [];
    let inQuote = false;
    let current = "";
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') {
        inQuote = !inQuote;
      } else if (line[i] === "," && !inQuote) {
        values.push(current.trim());
        current = "";
      } else {
        current += line[i];
      }
    }
    values.push(current.trim());

    const row = {};
    headers.forEach((header, i) => {
      row[header] = values[i] || "";
    });
    return row;
  });
}

function mapRowToClient(row) {
  const client = { name: "", contact_person: "", email: "", phone: "", address: "", status: "active", sync_locked: true };
  const cityStateZip = {};

  Object.entries(row).forEach(([key, value]) => {
    const normalized = key.toLowerCase().trim();
    const mapped = FIELD_MAP[normalized];
    if (mapped && value) {
      if (mapped.startsWith("_")) {
        cityStateZip[mapped] = value;
      } else if (!client[mapped]) {
        // Don't overwrite if already set
        client[mapped] = value;
      }
    }
  });

  // Combine city/state/zip into address if no full address found
  if (!client.address) {
    const parts = [cityStateZip._city, cityStateZip._state, cityStateZip._zip].filter(Boolean);
    if (parts.length) client.address = parts.join(", ");
  } else {
    // Append city/state/zip to address if they exist
    const parts = [cityStateZip._city, cityStateZip._state, cityStateZip._zip].filter(Boolean);
    if (parts.length) client.address = client.address + ", " + parts.join(", ");
  }

  return client;
}

export default function AccuLynxImport({ open, onClose, onImported }) {
  const fileRef = useRef();
  const [step, setStep] = useState("upload"); // upload | preview | done
  const [rows, setRows] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");

  const reset = () => {
    setStep("upload");
    setRows([]);
    setImporting(false);
    setImportedCount(0);
    setFileName("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const processFile = (file) => {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const parsed = parseCSV(e.target.result);
      const mapped = parsed
        .map(mapRowToClient)
        .filter((c) => c.name); // Must have a name
      setRows(mapped);
      setStep("preview");
    };
    reader.readAsText(file);
  };

  const handleFileChange = (e) => processFile(e.target.files[0]);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    processFile(e.dataTransfer.files[0]);
  };

  const handleImport = async () => {
    setImporting(true);
    await base44.entities.Client.bulkCreate(rows);
    setImportedCount(rows.length);
    setStep("done");
    setImporting(false);
    onImported();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <span className="text-white text-xs font-bold">AX</span>
            </div>
            Import from AccuLynx
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-5">
            {/* Instructions */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
              <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800 space-y-1">
                <p className="font-medium">How to export from AccuLynx:</p>
                <ol className="list-decimal list-inside space-y-1 text-blue-700">
                  <li>In AccuLynx, go to <strong>Leads</strong> or <strong>Jobs</strong></li>
                  <li>Click <strong>Export</strong> → <strong>Export to CSV</strong></li>
                  <li>Save the file and upload it below</li>
                </ol>
              </div>
            </div>

            {/* Drop Zone */}
            <div
              className={cn(
                "border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer",
                dragOver ? "border-amber-400 bg-amber-50" : "border-slate-300 hover:border-amber-400 hover:bg-slate-50"
              )}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current.click()}
            >
              <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-700 font-medium">Drop your AccuLynx CSV here</p>
              <p className="text-slate-500 text-sm mt-1">or click to browse</p>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-slate-400" />
                <span className="text-sm text-slate-600">{fileName}</span>
              </div>
              <Badge className="bg-amber-100 text-amber-700">{rows.length} clients found</Badge>
            </div>

            {rows.length === 0 ? (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex gap-3">
                <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
                <p className="text-sm text-rose-700">No valid client records found. Make sure your CSV has a "Name" or "Customer Name" column.</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-slate-500">Preview of clients to be imported. Review before confirming.</p>
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-medium text-slate-600">Name</th>
                        <th className="text-left px-4 py-2.5 font-medium text-slate-600">Contact</th>
                        <th className="text-left px-4 py-2.5 font-medium text-slate-600">Phone</th>
                        <th className="text-left px-4 py-2.5 font-medium text-slate-600">Address</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map((row, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5 font-medium text-slate-900">{row.name || <span className="text-rose-500">—</span>}</td>
                          <td className="px-4 py-2.5 text-slate-500">{row.contact_person || "—"}</td>
                          <td className="px-4 py-2.5 text-slate-500">{row.phone || "—"}</td>
                          <td className="px-4 py-2.5 text-slate-500 max-w-[180px] truncate">{row.address || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-between pt-2">
                  <Button variant="outline" onClick={reset}>
                    <X className="w-4 h-4 mr-2" />
                    Choose Different File
                  </Button>
                  <Button
                    onClick={handleImport}
                    disabled={importing}
                    className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
                  >
                    {importing ? (
                      <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" /> Importing...</>
                    ) : (
                      <>Import {rows.length} Clients</>
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {step === "done" && (
          <div className="py-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-9 h-9 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-slate-900">Import Complete!</h3>
              <p className="text-slate-500 mt-1">{importedCount} clients imported from AccuLynx</p>
            </div>
            <Button onClick={handleClose} className="bg-gradient-to-r from-amber-500 to-orange-500">
              View Clients
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}