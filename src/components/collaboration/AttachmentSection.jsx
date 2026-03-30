import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Paperclip, Upload, Trash2, FileText, Image, File, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

function FileIcon({ fileType }) {
  if (fileType?.startsWith("image/")) return <Image className="w-4 h-4 text-blue-500" />;
  if (fileType === "application/pdf") return <FileText className="w-4 h-4 text-red-500" />;
  return <File className="w-4 h-4 text-slate-400" />;
}

export default function AttachmentSection({ entityType, entityId }) {
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [user, setUser] = useState(null);
  const fileInputRef = useRef();

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  useEffect(() => {
    if (entityId) loadAttachments();
  }, [entityId]);

  const loadAttachments = async () => {
    const data = await base44.entities.Attachment.filter({ entity_type: entityType, entity_id: entityId }, "-created_date");
    setAttachments(data);
  };

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    for (const file of files) {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await base44.entities.Attachment.create({
        entity_type: entityType,
        entity_id: entityId,
        file_name: file.name,
        file_url,
        file_type: file.type,
        uploaded_by: user?.full_name || user?.email || "Team Member",
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

  const formatSize = (url) => "";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-semibold text-slate-700">Files ({attachments.length})</span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={uploading}
          onClick={() => fileInputRef.current.click()}
        >
          <Upload className="w-3 h-3 mr-1" />
          {uploading ? "Uploading..." : "Attach"}
        </Button>
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileChange} />
      </div>

      {attachments.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-3">No files attached yet.</p>
      )}

      <div className="space-y-1.5">
        {attachments.map((att) => (
          <div key={att.id} className="flex items-center gap-2 p-2 rounded-lg border border-slate-100 bg-slate-50 group">
            <FileIcon fileType={att.file_type} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-700 truncate">{att.file_name}</p>
              <p className="text-[10px] text-slate-400">{att.uploaded_by}</p>
            </div>
            <a href={att.file_url} target="_blank" rel="noopener noreferrer" title="Download">
              <Download className="w-3.5 h-3.5 text-slate-400 hover:text-amber-600 transition-colors" />
            </a>
            <button onClick={() => handleDelete(att.id)} className="opacity-0 group-hover:opacity-100 transition-opacity">
              <Trash2 className="w-3.5 h-3.5 text-slate-300 hover:text-rose-400 transition-colors" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}