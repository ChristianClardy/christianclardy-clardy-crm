import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Send, MessageSquare, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import moment from "moment";

export default function CommentSection({ entityType, entityId }) {
  const [comments, setComments] = useState([]);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  useEffect(() => {
    if (entityId) loadComments();
  }, [entityId]);

  const loadComments = async () => {
    const data = await base44.entities.Comment.filter({ entity_type: entityType, entity_id: entityId }, "created_date");
    setComments(data);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;
    setSubmitting(true);
    await base44.entities.Comment.create({
      entity_type: entityType,
      entity_id: entityId,
      content: content.trim(),
      author_name: user?.full_name || "Team Member",
      author_email: user?.email || "",
    });
    setContent("");
    setSubmitting(false);
    loadComments();
  };

  const handleDelete = async (id) => {
    await base44.entities.Comment.delete(id);
    loadComments();
  };

  const getInitials = (name) => name ? name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) : "?";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <MessageSquare className="w-4 h-4 text-slate-400" />
        <span className="text-sm font-semibold text-slate-700">Comments ({comments.length})</span>
      </div>

      {/* Comment list */}
      <div className="space-y-3 max-h-64 overflow-y-auto">
        {comments.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-4">No comments yet. Be the first!</p>
        )}
        {comments.map((c) => (
          <div key={c.id} className="flex gap-3 group">
            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-xs font-bold text-amber-700 flex-shrink-0">
              {getInitials(c.author_name)}
            </div>
            <div className="flex-1 min-w-0 bg-slate-50 rounded-xl px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-700">{c.author_name || "Team Member"}</span>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-slate-400">{moment(c.created_date).fromNow()}</span>
                  {(user?.email === c.author_email || user?.role === "admin") && (
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-400 transition-all"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-sm text-slate-600 mt-0.5 whitespace-pre-wrap">{c.content}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Add a comment..."
          rows={2}
          className="flex-1 resize-none text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(e); }
          }}
        />
        <Button type="submit" size="icon" disabled={submitting || !content.trim()} className="self-end bg-amber-500 hover:bg-amber-600">
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </div>
  );
}