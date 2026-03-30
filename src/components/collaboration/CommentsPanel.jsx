import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Send, Paperclip, Trash2, FileText, Image, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";

function FilePreview({ attachment, onDelete, canDelete }) {
  const isImage = attachment.file_type?.startsWith("image/");
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg border group" style={{ borderColor: "#ddd5c8", backgroundColor: "#faf8f5" }}>
      {isImage ? (
        <img src={attachment.file_url} alt={attachment.file_name} className="w-8 h-8 rounded object-cover flex-shrink-0" />
      ) : (
        <FileText className="w-8 h-8 flex-shrink-0" style={{ color: "#b5965a" }} />
      )}
      <div className="min-w-0 flex-1">
        <a
          href={attachment.file_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium truncate block hover:underline"
          style={{ color: "#3d3530" }}
        >
          {attachment.file_name}
        </a>
        <p className="text-[10px]" style={{ color: "#7a6e66" }}>
          {attachment.uploaded_by_name || attachment.uploaded_by_email} · {format(new Date(attachment.created_date), "MMM d")}
        </p>
      </div>
      {canDelete && (
        <button
          onClick={() => onDelete(attachment.id)}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-50"
        >
          <Trash2 className="w-3.5 h-3.5 text-red-400" />
        </button>
      )}
    </div>
  );
}

function CommentBubble({ comment, onDelete, canDelete }) {
  const initials = (comment.author_name || comment.author_email || "?").slice(0, 2).toUpperCase();
  return (
    <div className="flex gap-3 group">
      <div
        className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white"
        style={{ backgroundColor: "#b5965a" }}
      >
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold" style={{ color: "#3d3530" }}>
            {comment.author_name || comment.author_email}
          </span>
          <span className="text-[10px]" style={{ color: "#a89e96" }}>
            {format(new Date(comment.created_date), "MMM d, h:mm a")}
          </span>
          {canDelete && (
            <button
              onClick={() => onDelete(comment.id)}
              className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-red-50"
            >
              <Trash2 className="w-3 h-3 text-red-400" />
            </button>
          )}
        </div>
        <p className="text-sm mt-0.5 whitespace-pre-wrap leading-relaxed" style={{ color: "#3d3530" }}>{comment.content}</p>
      </div>
    </div>
  );
}

export default function CommentsPanel({ entityType, entityId }) {
  const [comments, setComments] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [user, setUser] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState("comments");
  const fileRef = useRef();
  const bottomRef = useRef();

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
    loadData();

    const unsub1 = base44.entities.Comment.subscribe((evt) => {
      if (evt.data?.entity_id === entityId) loadComments();
    });
    const unsub2 = base44.entities.Attachment.subscribe((evt) => {
      if (evt.data?.entity_id === entityId) loadAttachments();
    });
    return () => { unsub1(); unsub2(); };
  }, [entityId]);

  const loadData = () => { loadComments(); loadAttachments(); };
  const loadComments = async () => {
    const data = await base44.entities.Comment.filter({ entity_type: entityType, entity_id: entityId }, "created_date", 100);
    setComments(data);
  };
  const loadAttachments = async () => {
    const data = await base44.entities.Attachment.filter({ entity_type: entityType, entity_id: entityId }, "-created_date", 50);
    setAttachments(data);
  };

  const handleSubmitComment = async () => {
    if (!newComment.trim() || !user) return;
    setSubmitting(true);
    await base44.entities.Comment.create({
      entity_type: entityType,
      entity_id: entityId,
      content: newComment.trim(),
      author_name: user.full_name || user.email,
      author_email: user.email,
    });
    setNewComment("");
    setSubmitting(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !user) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    await base44.entities.Attachment.create({
      entity_type: entityType,
      entity_id: entityId,
      file_name: file.name,
      file_url,
      file_type: file.type,
      file_size: file.size,
      uploaded_by_name: user.full_name || user.email,
      uploaded_by_email: user.email,
    });
    setUploading(false);
    setActiveTab("files");
    e.target.value = "";
  };

  const deleteComment = async (id) => {
    await base44.entities.Comment.delete(id);
    setComments(c => c.filter(x => x.id !== id));
  };

  const deleteAttachment = async (id) => {
    await base44.entities.Attachment.delete(id);
    setAttachments(a => a.filter(x => x.id !== id));
  };

  return (
    <div className="flex flex-col" style={{ minHeight: 0 }}>
      {/* Tabs */}
      <div className="flex border-b" style={{ borderColor: "#ddd5c8" }}>
        {[
          { key: "comments", label: `Comments (${comments.length})` },
          { key: "files", label: `Files (${attachments.length})` },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors -mb-px ${activeTab === tab.key ? "" : "border-transparent"}`}
            style={activeTab === tab.key
              ? { borderColor: "#b5965a", color: "#b5965a" }
              : { color: "#7a6e66" }
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "comments" && (
        <>
          {/* Comment list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ maxHeight: 320 }}>
            {comments.length === 0 ? (
              <p className="text-xs text-center py-8" style={{ color: "#a89e96" }}>No comments yet. Be the first to comment!</p>
            ) : (
              comments.map(c => (
                <CommentBubble
                  key={c.id}
                  comment={c}
                  onDelete={deleteComment}
                  canDelete={user?.email === c.author_email || user?.role === "admin"}
                />
              ))
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t" style={{ borderColor: "#ddd5c8" }}>
            <div className="flex gap-2 items-end">
              <Textarea
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                placeholder="Add a comment..."
                className="text-sm resize-none"
                rows={2}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmitComment(); } }}
                style={{ borderColor: "#ddd5c8" }}
              />
              <div className="flex flex-col gap-1">
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  title="Attach file"
                  className="h-8 w-8"
                  style={{ borderColor: "#ddd5c8" }}
                >
                  {uploading ? <span className="text-[10px]">...</span> : <Paperclip className="w-3.5 h-3.5" />}
                </Button>
                <Button
                  size="icon"
                  onClick={handleSubmitComment}
                  disabled={!newComment.trim() || submitting}
                  className="h-8 w-8"
                  style={{ backgroundColor: "#b5965a" }}
                >
                  <Send className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
            <input ref={fileRef} type="file" className="hidden" onChange={handleFileUpload} />
          </div>
        </>
      )}

      {activeTab === "files" && (
        <>
          <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 gap-2" style={{ maxHeight: 320 }}>
            {attachments.length === 0 ? (
              <p className="text-xs text-center py-8" style={{ color: "#a89e96" }}>No files attached yet.</p>
            ) : (
              attachments.map(a => (
                <FilePreview
                  key={a.id}
                  attachment={a}
                  onDelete={deleteAttachment}
                  canDelete={user?.email === a.uploaded_by_email || user?.role === "admin"}
                />
              ))
            )}
          </div>
          <div className="p-3 border-t" style={{ borderColor: "#ddd5c8" }}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-full text-xs gap-2"
              style={{ borderColor: "#b5965a", color: "#b5965a" }}
            >
              <Paperclip className="w-3.5 h-3.5" />
              {uploading ? "Uploading..." : "Attach a file"}
            </Button>
            <input ref={fileRef} type="file" className="hidden" onChange={handleFileUpload} />
          </div>
        </>
      )}
    </div>
  );
}