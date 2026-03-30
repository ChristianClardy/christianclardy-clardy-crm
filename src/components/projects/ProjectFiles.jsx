import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Upload, Trash2, FileText, Image, File, Download, Paperclip, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  { id: "all", label: "All Files" },
  { id: "photo", label: "Site Photos" },
  { id: "permit", label: "Permits" },
  { id: "contract", label: "Contracts" },
  { id: "other", label: "Other" },
];

const ACCEPT_MAP = {
  photo: "image/*",
  permit: ".pdf,.doc,.docx,image/*",
  contract: ".pdf,.doc,.docx",
  other: "*",
  all: "*",
};

function FileIcon({ fileType }) {
  if (fileType?.startsWith("image/")) return <Image className="w-5 h-5 text-blue-500" />;
  if (fileType === "application/pdf") return <FileText className="w-5 h-5 text-red-500" />;
  return <File className="w-5 h-5 text-slate-400" />;
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ProjectFiles({ projectId }) {
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [activeCategory, setActiveCategory] = useState("all");
  const [uploadCategory, setUploadCategory] = useState("other");
  const [user, setUser] = useState(null);
  const fileInputRef = useRef();

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  useEffect(() => {
    if (projectId) loadAttachments();
  }, [projectId]);

  const loadAttachments = async () => {
    const data = await base44.entities.Attachment.filter(
      { entity_type: "project", entity_id: projectId },
      "-created_date"
    );
    setAttachments(data);
  };

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    for (const file of files) {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await base44.entities.Attachment.create({
        entity_type: "project",
        entity_id: projectId,
        file_name: file.name,
        file_url,
        file_type: file.type,
        uploaded_by: user?.full_name || user?.email || "Team Member",
        // Store category in file_name prefix for filtering
        notes: uploadCategory,
      });
    }
    setUploading(false);
    loadAttachments();
    fileInputRef.current.value = "";
  };

  const handleDelete = async (id) => {
    await base44.entities.Attachment.delete(id);
    loadAttachments();
  };

  // Infer category from file type or stored notes
  const getCategory = (att) => {
    if (att.notes && CATEGORIES.find(c => c.id === att.notes)) return att.notes;
    if (att.file_type?.startsWith("image/")) return "photo";
    return "other";
  };

  const filtered = activeCategory === "all"
    ? attachments
    : attachments.filter(att => getCategory(att) === activeCategory);

  const counts = {};
  for (const c of CATEGORIES) {
    counts[c.id] = c.id === "all" ? attachments.length : attachments.filter(a => getCategory(a) === c.id).length;
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-amber-500" />
          <h2 className="text-lg font-semibold text-slate-900">Project Files</h2>
          <Badge variant="secondary">{attachments.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={uploadCategory}
            onChange={e => setUploadCategory(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value="photo">Site Photo</option>
            <option value="permit">Permit</option>
            <option value="contract">Contract</option>
            <option value="other">Other</option>
          </select>
          <Button
            size="sm"
            disabled={uploading}
            onClick={() => fileInputRef.current.click()}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            <Upload className="w-4 h-4 mr-1.5" />
            {uploading ? "Uploading..." : "Upload"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            accept={ACCEPT_MAP[uploadCategory]}
            onChange={handleUpload}
          />
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
              activeCategory === cat.id
                ? "bg-amber-100 text-amber-700"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            )}
          >
            {cat.label}
            {counts[cat.id] > 0 && (
              <span className="ml-1.5 text-xs opacity-70">({counts[cat.id]})</span>
            )}
          </button>
        ))}
      </div>

      {/* File Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-slate-400 gap-3">
          <Paperclip className="w-10 h-10 opacity-30" />
          <p className="text-sm">No files in this category yet.</p>
          <p className="text-xs">Select a category above and click Upload to attach files.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(att => {
            const isImage = att.file_type?.startsWith("image/");
            const cat = getCategory(att);
            const catLabel = CATEGORIES.find(c => c.id === cat)?.label || "Other";
            return (
              <div key={att.id} className="group relative border border-slate-200 rounded-xl overflow-hidden bg-slate-50 hover:shadow-md transition-shadow">
                {isImage ? (
                  <div className="h-36 bg-slate-100 overflow-hidden">
                    <img src={att.file_url} alt={att.file_name} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="h-36 flex flex-col items-center justify-center bg-slate-100 gap-2">
                    <FileIcon fileType={att.file_type} />
                    <span className="text-xs text-slate-400 px-2 text-center truncate w-full text-center">{att.file_name}</span>
                  </div>
                )}
                <div className="p-3">
                  <p className="text-xs font-medium text-slate-700 truncate">{att.file_name}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-slate-400">{att.uploaded_by} · {formatDate(att.created_date)}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">{catLabel}</Badge>
                  </div>
                </div>
                {/* Hover actions */}
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <a
                    href={att.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 bg-white rounded-lg shadow border border-slate-200 hover:bg-amber-50"
                    title="Download"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-600" />
                  </a>
                  <button
                    onClick={() => handleDelete(att.id)}
                    className="p-1.5 bg-white rounded-lg shadow border border-slate-200 hover:bg-rose-50"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-rose-500" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}