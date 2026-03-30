import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Send, Paperclip, Hash, Users, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format, isToday, isYesterday } from "date-fns";

const DEFAULT_CHANNELS = ["general", "projects", "field-crew"];

function formatMsgDate(dateStr) {
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return `Yesterday ${format(d, "h:mm a")}`;
  return format(d, "MMM d, h:mm a");
}

function DateDivider({ label }) {
  return (
    <div className="flex items-center gap-3 my-3">
      <div className="flex-1 border-t" style={{ borderColor: "#ddd5c8" }} />
      <span className="text-[10px] font-medium px-2" style={{ color: "#a89e96" }}>{label}</span>
      <div className="flex-1 border-t" style={{ borderColor: "#ddd5c8" }} />
    </div>
  );
}

function MessageItem({ msg, isOwn }) {
  const initials = (msg.author_name || msg.author_email || "?").slice(0, 2).toUpperCase();
  return (
    <div className={`flex gap-3 ${isOwn ? "flex-row-reverse" : ""}`}>
      <div
        className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white"
        style={{ backgroundColor: isOwn ? "#b5965a" : "#94a3b8" }}
      >
        {initials}
      </div>
      <div className={`max-w-[75%] ${isOwn ? "items-end" : "items-start"} flex flex-col`}>
        <div className={`flex items-baseline gap-2 ${isOwn ? "flex-row-reverse" : ""}`}>
          <span className="text-[11px] font-semibold" style={{ color: "#3d3530" }}>
            {msg.author_name || msg.author_email}
          </span>
          <span className="text-[10px]" style={{ color: "#a89e96" }}>{formatMsgDate(msg.created_date)}</span>
        </div>
        {msg.content && (
          <div
            className={`mt-1 px-3 py-2 rounded-2xl text-sm leading-relaxed ${isOwn ? "rounded-tr-sm" : "rounded-tl-sm"}`}
            style={{
              backgroundColor: isOwn ? "#b5965a" : "#f5f0eb",
              color: isOwn ? "#fff" : "#3d3530",
            }}
          >
            {msg.content}
          </div>
        )}
        {msg.file_url && (
          <a
            href={msg.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 flex items-center gap-2 px-3 py-2 rounded-xl border text-xs hover:opacity-80 transition-opacity"
            style={{ borderColor: "#ddd5c8", backgroundColor: "#faf8f5", color: "#3d3530" }}
          >
            <Paperclip className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#b5965a" }} />
            {msg.file_name || "Attachment"}
          </a>
        )}
      </div>
    </div>
  );
}

export default function TeamChat() {
  const [messages, setMessages] = useState([]);
  const [channels, setChannels] = useState(DEFAULT_CHANNELS);
  const [activeChannel, setActiveChannel] = useState("general");
  const [newMessage, setNewMessage] = useState("");
  const [user, setUser] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [showNewChannel, setShowNewChannel] = useState(false);
  const bottomRef = useRef();
  const fileRef = useRef();

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  useEffect(() => {
    loadMessages();
    const unsub = base44.entities.ChatMessage.subscribe((evt) => {
      if (evt.data?.channel === activeChannel) {
        setMessages(prev => {
          if (evt.type === "create") return [...prev, evt.data];
          if (evt.type === "delete") return prev.filter(m => m.id !== evt.id);
          return prev;
        });
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      }
    });
    return () => unsub();
  }, [activeChannel]);

  const loadMessages = async () => {
    const data = await base44.entities.ChatMessage.filter({ channel: activeChannel }, "created_date", 100);
    setMessages(data);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "auto" }), 50);
  };

  const sendMessage = async (content = newMessage, fileUrl = null, fileName = null) => {
    if (!content.trim() && !fileUrl) return;
    if (!user) return;
    setSending(true);
    await base44.entities.ChatMessage.create({
      channel: activeChannel,
      content: content.trim(),
      author_name: user.full_name || user.email,
      author_email: user.email,
      ...(fileUrl ? { file_url: fileUrl, file_name: fileName } : {}),
    });
    setNewMessage("");
    setSending(false);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !user) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    await sendMessage("", file_url, file.name);
    setUploading(false);
    e.target.value = "";
  };

  const addChannel = () => {
    const name = newChannelName.trim().toLowerCase().replace(/\s+/g, "-");
    if (!name || channels.includes(name)) return;
    setChannels(c => [...c, name]);
    setActiveChannel(name);
    setNewChannelName("");
    setShowNewChannel(false);
  };

  // Group messages by date
  const grouped = messages.reduce((acc, msg) => {
    const d = new Date(msg.created_date);
    const label = isToday(d) ? "Today" : isYesterday(d) ? "Yesterday" : format(d, "MMMM d, yyyy");
    if (!acc[label]) acc[label] = [];
    acc[label].push(msg);
    return acc;
  }, {});

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: "#f5f0eb" }}>
      {/* Sidebar */}
      <div className="w-56 flex-shrink-0 flex flex-col border-r" style={{ backgroundColor: "#3d3530", borderColor: "#2d2520" }}>
        <div className="p-4 border-b" style={{ borderColor: "#2d2520" }}>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-amber-300" />
            <h1 className="text-sm font-bold text-white">Team Chat</h1>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-amber-300/70">Channels</span>
            <button
              onClick={() => setShowNewChannel(!showNewChannel)}
              className="p-0.5 rounded hover:bg-white/10 transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-amber-300/70" />
            </button>
          </div>

          {showNewChannel && (
            <div className="mb-3 flex gap-1">
              <Input
                value={newChannelName}
                onChange={e => setNewChannelName(e.target.value)}
                placeholder="channel-name"
                className="h-7 text-xs bg-white/10 border-white/20 text-white placeholder:text-white/40"
                onKeyDown={e => e.key === "Enter" && addChannel()}
                autoFocus
              />
              <Button size="icon" onClick={addChannel} className="h-7 w-7 bg-amber-600 hover:bg-amber-700 flex-shrink-0">
                <Plus className="w-3 h-3" />
              </Button>
            </div>
          )}

          <div className="space-y-0.5">
            {channels.map(ch => (
              <button
                key={ch}
                onClick={() => setActiveChannel(ch)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors text-left ${activeChannel === ch ? "bg-amber-600/30 text-white" : "text-white/60 hover:bg-white/10 hover:text-white"}`}
              >
                <Hash className="w-3.5 h-3.5 flex-shrink-0" />
                {ch}
              </button>
            ))}
          </div>
        </div>

        {user && (
          <div className="p-3 border-t" style={{ borderColor: "#2d2520" }}>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-amber-600 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">
                {(user.full_name || user.email || "?").slice(0, 2).toUpperCase()}
              </div>
              <span className="text-xs text-white/70 truncate">{user.full_name || user.email}</span>
            </div>
          </div>
        )}
      </div>

      {/* Main chat */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-3 border-b bg-white" style={{ borderColor: "#ddd5c8" }}>
          <Hash className="w-4 h-4" style={{ color: "#b5965a" }} />
          <h2 className="font-semibold" style={{ color: "#3d3530" }}>{activeChannel}</h2>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5 space-y-1" style={{ backgroundColor: "#fff" }}>
          {Object.entries(grouped).map(([label, msgs]) => (
            <div key={label}>
              <DateDivider label={label} />
              <div className="space-y-4">
                {msgs.map(msg => (
                  <MessageItem key={msg.id} msg={msg} isOwn={msg.author_email === user?.email} />
                ))}
              </div>
            </div>
          ))}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-64">
              <Hash className="w-10 h-10 mb-3" style={{ color: "#ddd5c8" }} />
              <p className="text-sm font-medium" style={{ color: "#7a6e66" }}>No messages in #{activeChannel} yet</p>
              <p className="text-xs mt-1" style={{ color: "#a89e96" }}>Be the first to start the conversation!</p>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t" style={{ borderColor: "#ddd5c8", backgroundColor: "#fff" }}>
          <div className="flex items-center gap-2 p-2 rounded-xl border" style={{ borderColor: "#ddd5c8" }}>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors flex-shrink-0"
              title="Attach file"
            >
              {uploading
                ? <span className="text-[10px] text-amber-600">...</span>
                : <Paperclip className="w-4 h-4" style={{ color: "#7a6e66" }} />
              }
            </button>
            <input
              type="text"
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder={`Message #${activeChannel}`}
              className="flex-1 text-sm bg-transparent outline-none"
              style={{ color: "#3d3530" }}
            />
            <Button
              size="icon"
              onClick={() => sendMessage()}
              disabled={!newMessage.trim() || sending}
              className="h-8 w-8 flex-shrink-0"
              style={{ backgroundColor: newMessage.trim() ? "#b5965a" : "#ddd5c8" }}
            >
              <Send className="w-3.5 h-3.5" />
            </Button>
          </div>
          <input ref={fileRef} type="file" className="hidden" onChange={handleFileUpload} />
        </div>
      </div>
    </div>
  );
}