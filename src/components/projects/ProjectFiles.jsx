import { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Upload, Trash2, FileText, Image, File, Download, Paperclip, FolderOpen, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const CATEGORIES = [
  { id: "all", label: "All Files" },
  { id: "photo", label: "Site Photos" },
  { id: "permit", label: "Permits" },
  { id: "contract", label: "Contracts" },
  { id: "misc", label: "Important Misc Documents" },
  { id: "other", label: "Other" },
];

const CATEGORY_COLORS = {
  photo: "bg-blue-100 text-blue-700",
  permit: "bg-purple-100 text-purple-700",
  contract: "bg-green-100 text-green-700",
  misc: "bg-amber-100 text-amber-700",
  other: "bg-slate-100 text-slate-500",
};

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
  const [isDragging, setIsDragging] = useState(false);
  const [editingTag, setEditingTag] = useState(null); // attachment id being re-tagged
  const fileInputRef = useRef();
  const dragCounterRef = useRef(0);

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

  const uploadFiles = useCallback(async (files, category) => {
    if (!files.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        await base44.integrations.Core.UploadFile({
          file,
          entity_type: "project",
          entity_id: projectId,
          uploaded_by: user?.full_name || user?.email || "Team Member",
          category: category || "other",
        });
      }
      loadAttachments();
    } catch (err) {
      console.error("Upload failed:", err);
      alert("Upload failed: " + (err?.message || "Unknown error"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [projectId, user]);

  const handleUpload = (e) => {
    uploadFiles(Array.from(e.target.files), uploadCategory);
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setIsDragging(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) uploadFiles(files, uploadCategory);
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    await base44.entities.Attachment.delete(id);
    loadAttachments();
  };

  const handleRetag = async (e, id, newCategory) => {
    e.stopPropagation();
    await base44.entities.Attachment.update(id, { category: newCategory });
    setEditingTag(null);
    loadAttachments();
  };

  const getCategory = (att) => {
    if (att.category && att.category !== "other") return att.category;
    if (att.file_type?.startsWith("image/")) return "photo";
    return att.category || "other";
  };

  const filtered = activeCategory === "all"
    ? attachments
    : attachments.filter(att => getCategory(att) === activeCategory);

  const counts = {};
  for (const c of CATEGORIES) {
    counts[c.id] = c.id === "all" ? attachments.length : attachments.filter(a => getCategory(a) === c.id).length;
  }

  return (
    <div
      className={cn(
        "bg-white rounded-2xl border-2 p-6 space-y-5 transition-colors",
        isDragging ? "border-amber-400 bg-amber-50" : "border-slate-200"
      )}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
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
            <option value="misc">Important Misc Document</option>
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

      {/* Drag overlay */}
      {isDragging && (
        <div className="flex flex-col items-center justify-center py-8 text-amber-600 gap-2 border-2 border-dashed border-amber-400 rounded-xl bg-amber-50">
          <Upload className="w-8 h-8" />
          <p className="text-sm font-medium">Drop files here to upload</p>
        </div>
      )}

      {/* File Grid */}
      {!isDragging && filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-slate-400 gap-3 border-2 border-dashed border-slate-200 rounded-xl">
          <Paperclip className="w-10 h-10 opacity-30" />
          <p className="text-sm">No files yet. Click Upload or drag & drop files here.</p>
        </div>
      ) : !isDragging && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
          {filtered.map(att => {
            const isImage = att.file_type?.startsWith("image/");
            const cat = getCategory(att);
            const catLabel = CATEGORIES.find(c => c.id === cat)?.label || "Other";
            const isEditingThisTag = editingTag === att.id;

            return (
              <div
                key={att.id}
                className="group relative border border-slate-200 rounded-lg overflow-hidden bg-slate-50 hover:shadow-md hover:border-amber-300 transition-all cursor-pointer"
                onClick={() => { if (!isEditingThisTag) window.open(att.url, "_blank"); }}
              >
                {isImage ? (
                  <div className="h-20 bg-slate-100 overflow-hidden">
                    <img src={att.url} alt={att.filename} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="h-20 flex flex-col items-center justify-center bg-slate-100 gap-1">
                    <FileIcon fileType={att.file_type} />
                  </div>
                )}
                <div className="px-2 py-1.5">
                  <p className="text-[11px] font-medium text-slate-700 truncate">{att.filename}</p>

                  {/* Tag — click to edit */}
                  {isEditingThisTag ? (
                    <select
                      autoFocus
                      className="mt-1 w-full text-[10px] border border-amber-300 rounded px-1 py-0.5 bg-white focus:outline-none"
                      defaultValue={cat}
                      onClick={e => e.stopPropagation()}
                      onChange={e => handleRetag(e, att.id, e.target.value)}
                      onBlur={() => setEditingTag(null)}
                    >
                      {CATEGORIES.filter(c => c.id !== "all").map(c => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </select>
                  ) : (
                    <span
                      className={cn("inline-flex items-center gap-0.5 mt-1 text-[9px] px-1.5 py-0.5 rounded-full font-medium cursor-pointer hover:opacity-80", CATEGORY_COLORS[cat] || "bg-slate-100 text-slate-500")}
                      title="Click to change category"
                      onClick={e => { e.stopPropagation(); setEditingTag(att.id); }}
                    >
                      <Tag className="w-2 h-2" />
                      {catLabel}
                    </span>
                  )}
                </div>

                {/* Hover actions */}
                <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <a
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="p-1 bg-white rounded shadow border border-slate-200 hover:bg-amber-50"
                    title="Open in new tab"
                  >
                    <Download className="w-3 h-3 text-slate-600" />
                  </a>
                  <button
                    onClick={(e) => handleDelete(e, att.id)}
                    className="p-1 bg-white rounded shadow border border-slate-200 hover:bg-rose-50"
                    title="Delete"
                  >
                    <Trash2 className="w-3 h-3 text-slate-400 hover:text-rose-500" />
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
