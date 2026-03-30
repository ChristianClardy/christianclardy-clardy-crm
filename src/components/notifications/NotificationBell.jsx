import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Bell, CheckCheck, X, AlertCircle, Calendar, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import moment from "moment";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";

const TYPE_ICONS = {
  assignment: UserCheck,
  deadline: Calendar,
  reminder: AlertCircle,
};

const TYPE_COLORS = {
  assignment: "text-blue-500 bg-blue-50",
  deadline: "text-amber-500 bg-amber-50",
  reminder: "text-rose-500 bg-rose-50",
};

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef();

  useEffect(() => {
    loadNotifications();
    // Poll every 60s
    const interval = setInterval(loadNotifications, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const loadNotifications = async () => {
    try {
      const me = await base44.auth.me();
      if (!me) return;
      const items = await base44.entities.Notification.filter({ user_email: me.email }, "-created_date", 30);
      setNotifications(items);
    } catch {
      // Silently ignore network errors for notification polling
    }
  };

  const markRead = async (id) => {
    await base44.entities.Notification.update(id, { read: true });
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.read);
    await Promise.all(unread.map(n => base44.entities.Notification.update(n.id, { read: true })));
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const deleteNotif = async (e, id) => {
    e.stopPropagation();
    e.preventDefault();
    await base44.entities.Notification.delete(id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="relative p-2 rounded-lg hover:bg-slate-100 transition-colors"
        title="Notifications"
      >
        <Bell className="w-5 h-5 text-slate-600" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 text-[10px] font-bold bg-rose-500 text-white rounded-full flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
            <h3 className="font-semibold text-sm text-slate-800">Notifications</h3>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-amber-600 hover:text-amber-700 flex items-center gap-1">
                <CheckCheck className="w-3.5 h-3.5" /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-slate-50">
            {notifications.length === 0 ? (
              <div className="py-10 text-center">
                <Bell className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No notifications</p>
              </div>
            ) : notifications.map(n => {
              const Icon = TYPE_ICONS[n.type] || Bell;
              const colorClass = TYPE_COLORS[n.type] || "text-slate-500 bg-slate-50";
              const content = (
                <div
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  className={cn("flex items-start gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer group transition-colors", !n.read && "bg-amber-50/40")}
                >
                  <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5", colorClass)}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm font-medium leading-snug", n.read ? "text-slate-600" : "text-slate-900")}>{n.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{n.message}</p>
                    <p className="text-[10px] text-slate-300 mt-1">{moment(n.created_date).fromNow()}</p>
                  </div>
                  {!n.read && <div className="w-2 h-2 bg-amber-400 rounded-full shrink-0 mt-1.5" />}
                  <button
                    onClick={(e) => deleteNotif(e, n.id)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-300 hover:text-rose-400 transition-all"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
              return n.link ? <Link key={n.id} to={n.link}>{content}</Link> : <div key={n.id}>{content}</div>;
            })}
          </div>
        </div>
      )}
    </div>
  );
}