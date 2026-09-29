import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2, CheckCircle2, Circle, CircleDot, ChevronDown, FileText, ExternalLink, CalendarDays, MapPin, User } from "lucide-react";

// What a homeowner sees when they sign in with a Customer Portal login
// (041_customer_portal.sql). Everything comes from the customer_portal_*
// functions, which only return this client's own projects and leave out
// costs, internal notes, crews and subcontractors.
//   Progress  — the project schedule (project_sheets) boiled down to phases
//   Payments  — contract total, paid to date, payment schedule, payments received
//   Documents — the contracts they signed

const C = { ink: "#3d3530", muted: "#7a6e66", faint: "#a89e96", line: "#ddd5c8", gold: "#b5965a", cream: "#f5f0eb", card: "#fff" };

const money = (n) => Number(n || 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const toDate = (iso) => (iso ? new Date(`${String(iso).slice(0, 10)}T00:00:00`) : null);
const fmtDate = (iso, opts = { month: "short", day: "numeric", year: "numeric" }) => {
  const d = toDate(iso);
  return d && !isNaN(d) ? d.toLocaleDateString("en-US", opts) : "";
};
const today = () => new Date().toLocaleDateString("en-CA");

const PROJECT_STATUS = {
  planning: "Getting started",
  in_progress: "In progress",
  on_hold: "On hold",
  completed: "Complete",
};

const isDone = (s) => /^completed?$/i.test(String(s || "").trim());
const isStarted = (s) => /in[\s_]?progress/i.test(String(s || ""));

// Schedule rows → phases. A section header starts a phase and the rows under
// it are its steps; rows before any header go in a "Project" phase.
function toPhases(rows) {
  const phases = [];
  let current = null;
  for (const r of rows || []) {
    if (r.is_section_header) {
      current = { name: r.task || r.section || "Phase", steps: [] };
      phases.push(current);
      continue;
    }
    if (!(r.task || "").trim()) continue;
    if (!current) {
      current = { name: r.section || "Project", steps: [] };
      phases.push(current);
    }
    current.steps.push(r);
  }
  return phases
    .filter((p) => p.steps.length)
    .map((p) => {
      const done = p.steps.filter((s) => isDone(s.status)).length;
      const starts = p.steps.map((s) => s.start_date).filter(Boolean).sort();
      const ends = p.steps.map((s) => s.end_date).filter(Boolean).sort();
      const state = done === p.steps.length ? "done" : done > 0 || p.steps.some((s) => isStarted(s.status)) ? "active" : "upcoming";
      return { ...p, done, state, start: starts[0], end: ends[ends.length - 1] };
    });
}

export default function CustomerPortal({ customer }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [projectId, setProjectId] = useState(null);
  const [tab, setTab] = useState("progress");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      supabase.rpc("customer_portal_projects"),
      supabase.rpc("customer_portal_payments"),
      supabase.rpc("customer_portal_draws"),
      supabase.rpc("customer_portal_schedule"),
      supabase.rpc("customer_portal_documents"),
    ]).then((results) => {
      if (cancelled) return;
      const failed = results.find((r) => r.error);
      if (failed) { setError(failed.error.message); return; }
      const [projects, payments, draws, schedule, documents] = results.map((r) => r.data || []);
      setData({ projects, payments, draws, schedule, documents });
      const active = projects.find((p) => p.status === "in_progress") || projects[0];
      setProjectId(active?.id || null);
    });
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return <Message>We couldn't load your project right now. Please try again in a few minutes. ({error})</Message>;
  }
  if (!data) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: C.gold }} />
      </div>
    );
  }
  if (!data.projects.length) {
    return (
      <Message>
        Welcome{customer.full_name ? `, ${customer.full_name.split(" ")[0]}` : ""}! Your project will show up here once it's set up.
        Questions? Contact Principle Outdoor Living.
      </Message>
    );
  }

  const project = data.projects.find((p) => p.id === projectId) || data.projects[0];

  return (
    <div className="max-w-3xl mx-auto px-4 py-5 space-y-4" style={{ color: C.ink }}>
      {data.projects.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
          {data.projects.map((p) => (
            <button
              key={p.id}
              onClick={() => setProjectId(p.id)}
              className="shrink-0 px-3 py-1.5 rounded-full text-sm border"
              style={p.id === project.id
                ? { backgroundColor: C.ink, color: C.cream, borderColor: C.ink }
                : { backgroundColor: C.card, color: C.ink, borderColor: C.line }}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}

      <ProjectHeader project={project} rows={data.schedule.find((s) => s.project_id === project.id)?.rows} />

      <div className="grid grid-cols-3 rounded-xl p-1" style={{ backgroundColor: "#ebe4da" }}>
        {[["progress", "Progress"], ["payments", "Payments"], ["documents", "Documents"]].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="py-2 rounded-lg text-sm font-semibold transition-colors"
            style={tab === key ? { backgroundColor: C.card, color: C.ink, boxShadow: "0 1px 2px rgba(0,0,0,.08)" } : { color: C.muted }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "progress" && <ProgressTab key={project.id} project={project} rows={data.schedule.find((s) => s.project_id === project.id)?.rows} />}
      {tab === "payments" && (
        <PaymentsTab
          project={project}
          payments={data.payments.filter((p) => p.project_id === project.id)}
          draws={data.draws.filter((d) => d.project_id === project.id)}
        />
      )}
      {tab === "documents" && (
        <DocumentsTab documents={data.documents.filter((d) => !d.project_id || d.project_id === project.id)} />
      )}
    </div>
  );
}

function Message({ children }) {
  return <div className="max-w-md mx-auto p-8 text-center text-sm" style={{ color: C.muted }}>{children}</div>;
}

function Card({ children, className = "" }) {
  return <div className={`rounded-2xl p-4 sm:p-5 ${className}`} style={{ backgroundColor: C.card, border: `1px solid ${C.line}` }}>{children}</div>;
}

// Overall percent: finished steps out of all steps, or the office's
// percent complete when there's no schedule yet.
function overallPercent(project, rows) {
  const steps = (rows || []).filter((r) => !r.is_section_header && (r.task || "").trim());
  if (steps.length) return Math.round((steps.filter((s) => isDone(s.status)).length / steps.length) * 100);
  if (project.status === "completed") return 100;
  return Math.round(Number(project.percent_complete || 0));
}

function ProjectHeader({ project, rows }) {
  const pct = overallPercent(project, rows);
  const finish = project.actual_completion_date || project.end_date;
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-tight">{project.name}</h1>
          {project.address && (
            <p className="text-sm mt-1 flex items-center gap-1" style={{ color: C.muted }}>
              <MapPin className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{project.address}</span>
            </p>
          )}
        </div>
        <span className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: "#f3ead9", color: "#8a6d3b" }}>
          {PROJECT_STATUS[project.status] || project.status}
        </span>
      </div>

      <div className="mt-4">
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-sm font-semibold">Overall progress</span>
          <span className="text-2xl font-bold">{pct}%</span>
        </div>
        <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: "#eee7dd" }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: C.gold }} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm" style={{ color: C.muted }}>
        {project.start_date && (
          <p className="flex items-center gap-1.5"><CalendarDays className="w-4 h-4" /> Started {fmtDate(project.start_date)}</p>
        )}
        {finish && (
          <p className="flex items-center gap-1.5">
            <CalendarDays className="w-4 h-4" /> {project.actual_completion_date ? "Completed" : "Est. completion"} {fmtDate(finish)}
          </p>
        )}
        {project.project_manager && (
          <p className="flex items-center gap-1.5"><User className="w-4 h-4" /> PM: {project.project_manager}</p>
        )}
      </div>
    </Card>
  );
}

function ProgressTab({ project, rows }) {
  const phases = useMemo(() => toPhases(rows), [rows]);
  const firstOpen = phases.findIndex((p) => p.state !== "done");
  const [open, setOpen] = useState(() => new Set(firstOpen >= 0 ? [firstOpen] : []));

  if (!phases.length) {
    return (
      <Card>
        <p className="text-sm" style={{ color: C.muted }}>
          {project.status === "completed"
            ? "Your project is complete. Thank you for choosing Principle Outdoor Living!"
            : "Your project checklist will appear here once your project manager has set up the schedule."}
        </p>
      </Card>
    );
  }

  const toggle = (i) => setOpen((s) => {
    const next = new Set(s);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });

  return (
    <Card className="!p-0 overflow-hidden">
      <ol>
        {phases.map((phase, i) => {
          const Icon = phase.state === "done" ? CheckCircle2 : phase.state === "active" ? CircleDot : Circle;
          const color = phase.state === "done" ? "#4d7c5a" : phase.state === "active" ? C.gold : "#c9bfb3";
          const isOpen = open.has(i);
          const range = [fmtDate(phase.start, { month: "short", day: "numeric" }), fmtDate(phase.end, { month: "short", day: "numeric" })].filter(Boolean);
          return (
            <li key={i} style={{ borderTop: i ? `1px solid ${C.line}` : "none" }}>
              <button onClick={() => toggle(i)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left">
                <Icon className="w-6 h-6 shrink-0" style={{ color }} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate" style={{ color: phase.state === "upcoming" ? C.muted : C.ink }}>{phase.name}</p>
                  <p className="text-xs" style={{ color: C.faint }}>
                    {phase.state === "done" ? "Complete" : phase.state === "active" ? "In progress" : "Upcoming"}
                    {" · "}{phase.done} of {phase.steps.length} steps
                    {range.length ? ` · ${[...new Set(range)].join(" – ")}` : ""}
                  </p>
                </div>
                <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} style={{ color: C.faint }} />
              </button>
              {isOpen && (
                <ul className="pb-3 pl-[52px] pr-4 space-y-2">
                  {phase.steps.map((s, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm">
                      {isDone(s.status)
                        ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#4d7c5a" }} />
                        : isStarted(s.status)
                          ? <CircleDot className="w-4 h-4 mt-0.5 shrink-0" style={{ color: C.gold }} />
                          : <Circle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#c9bfb3" }} />}
                      <span className="flex-1" style={{ color: isDone(s.status) ? C.muted : C.ink }}>{s.task}</span>
                      {(s.end_date || s.start_date) && (
                        <span className="text-xs shrink-0" style={{ color: C.faint }}>{fmtDate(s.end_date || s.start_date, { month: "short", day: "numeric" })}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function PaymentsTab({ project, payments, draws }) {
  const contract = Number(project.contract_value || 0) + Number(project.change_orders_total || 0);
  const paid = Number(project.paid_to_date || 0);
  const balance = Math.max(0, contract - paid);
  const t = today();

  const drawState = (d) => {
    if (d.status === "paid") return { label: `Paid${d.paid_date ? ` ${fmtDate(d.paid_date, { month: "short", day: "numeric" })}` : ""}`, bg: "#e3efe6", fg: "#3f6b4b" };
    if (d.due_date && d.due_date.slice(0, 10) <= t) return { label: "Due", bg: "#fbe9d9", fg: "#9a5b1f" };
    return { label: "Upcoming", bg: "#eee7dd", fg: C.muted };
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-xs" style={{ color: C.muted }}>Contract total</p>
            <p className="text-base sm:text-xl font-bold mt-0.5">{money(contract)}</p>
          </div>
          <div>
            <p className="text-xs" style={{ color: C.muted }}>Paid to date</p>
            <p className="text-base sm:text-xl font-bold mt-0.5" style={{ color: "#3f6b4b" }}>{money(paid)}</p>
          </div>
          <div>
            <p className="text-xs" style={{ color: C.muted }}>Remaining</p>
            <p className="text-base sm:text-xl font-bold mt-0.5">{money(balance)}</p>
          </div>
        </div>
        {contract > 0 && (
          <div className="mt-4 h-2 rounded-full overflow-hidden" style={{ backgroundColor: "#eee7dd" }}>
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, (paid / contract) * 100)}%`, backgroundColor: "#4d7c5a" }} />
          </div>
        )}
        {Number(project.change_orders_total || 0) !== 0 && (
          <p className="text-xs mt-3" style={{ color: C.faint }}>
            Includes {money(project.change_orders_total)} in approved change orders.
          </p>
        )}
      </Card>

      {draws.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-2 px-1">Payment schedule</h2>
          <Card className="!p-0 overflow-hidden">
            {draws.map((d, i) => {
              const s = drawState(d);
              return (
                <div key={d.id} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: i ? `1px solid ${C.line}` : "none" }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{d.title || `Payment ${d.draw_number || i + 1}`}</p>
                    {d.due_date && d.status !== "paid" && <p className="text-xs" style={{ color: C.faint }}>Due {fmtDate(d.due_date)}</p>}
                  </div>
                  <span className="text-sm font-semibold">{money(d.amount)}</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ backgroundColor: s.bg, color: s.fg }}>{s.label}</span>
                </div>
              );
            })}
          </Card>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold mb-2 px-1">Payments received</h2>
        {payments.length ? (
          <Card className="!p-0 overflow-hidden">
            {payments.map((p, i) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3" style={{ borderTop: i ? `1px solid ${C.line}` : "none" }}>
                <CheckCircle2 className="w-5 h-5 shrink-0" style={{ color: "#4d7c5a" }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{fmtDate(p.payment_date) || "Payment"}</p>
                  {(p.payment_method || p.reference_number) && (
                    <p className="text-xs truncate" style={{ color: C.faint }}>
                      {[p.payment_method, p.reference_number && `Ref ${p.reference_number}`].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
                <span className="text-sm font-semibold">{money(p.amount)}</span>
              </div>
            ))}
          </Card>
        ) : (
          <Card><p className="text-sm" style={{ color: C.muted }}>No payments recorded yet.</p></Card>
        )}
      </section>
    </div>
  );
}

function DocumentsTab({ documents }) {
  if (!documents.length) {
    return (
      <Card>
        <p className="text-sm" style={{ color: C.muted }}>Your signed documents will appear here once they're filed.</p>
      </Card>
    );
  }
  return (
    <Card className="!p-0 overflow-hidden">
      {documents.map((d, i) => (
        <a
          key={d.id}
          href={d.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-4 py-3 hover:bg-[#faf8f5]"
          style={{ borderTop: i ? `1px solid ${C.line}` : "none" }}
        >
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: "#f3ead9" }}>
            <FileText className="w-5 h-5" style={{ color: "#8a6d3b" }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{(d.filename || "Document").replace(/\.pdf$/i, "")}</p>
            <p className="text-xs" style={{ color: C.faint }}>Filed {fmtDate(d.created_at)}</p>
          </div>
          <ExternalLink className="w-4 h-4 shrink-0" style={{ color: C.faint }} />
        </a>
      ))}
    </Card>
  );
}
