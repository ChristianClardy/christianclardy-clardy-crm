import { useEffect, useRef, useState } from "react";
import { Braces, Eye, FileText, Pencil } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MERGE_FIELDS, renderPreview, smsSegments } from "@/lib/messaging";

// Subject (email) + body with merge-field insert, template picker, live
// preview and a text-segment counter. Controlled: value = { subject, body }.
export default function MessageBodyEditor({ channel, value, onChange, previewFields, showTemplates = true, rows = 7 }) {
  const bodyRef = useRef(null);
  const subjectRef = useRef(null);
  const lastFocus = useRef("body");
  const [preview, setPreview] = useState(false);
  const [templates, setTemplates] = useState([]);

  useEffect(() => {
    if (!showTemplates) return;
    base44.entities.MessageTemplate.list("name", 500).then(setTemplates).catch(() => setTemplates([]));
  }, [showTemplates]);

  const insert = (key) => {
    const token = `{{${key}}}`;
    const field = lastFocus.current === "subject" && channel === "email" ? "subject" : "body";
    const el = field === "subject" ? subjectRef.current : bodyRef.current;
    const current = value[field] || "";
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    onChange({ ...value, [field]: current.slice(0, start) + token + current.slice(end) });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const applyTemplate = (t) => onChange({ subject: t.subject || value.subject || "", body: t.body || "" });
  const channelTemplates = templates.filter((t) => t.channel === channel);
  const seg = channel === "sms" ? smsSegments(renderPreview(value.body, previewFields)) : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-8"><Braces className="mr-1.5 h-3.5 w-3.5" /> Insert field</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
            <DropdownMenuLabel className="text-xs">Filled in for each person</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {MERGE_FIELDS.map((f) => (
              <DropdownMenuItem key={f.key} onSelect={() => insert(f.key)}>
                <span>{f.label}</span>
                <span className="ml-auto pl-4 font-mono text-[11px] text-slate-400">{`{{${f.key}}}`}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {showTemplates && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="h-8" disabled={!channelTemplates.length}>
                <FileText className="mr-1.5 h-3.5 w-3.5" /> {channelTemplates.length ? "Use template" : "No templates yet"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
              {channelTemplates.map((t) => <DropdownMenuItem key={t.id} onSelect={() => applyTemplate(t)}>{t.name}</DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Button type="button" variant="ghost" size="sm" className="ml-auto h-8" onClick={() => setPreview((p) => !p)}>
          {preview ? <><Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit</> : <><Eye className="mr-1.5 h-3.5 w-3.5" /> Preview</>}
        </Button>
      </div>

      {preview ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
          {channel === "email" && <p className="mb-3 font-semibold text-slate-900">{renderPreview(value.subject, previewFields) || "(no subject)"}</p>}
          <p className="whitespace-pre-wrap text-slate-700">{renderPreview(value.body, previewFields) || "Nothing written yet."}</p>
          {!previewFields && <p className="mt-3 text-[11px] text-slate-400">Shown with sample details.</p>}
        </div>
      ) : (
        <>
          {channel === "email" && (
            <div>
              <Label className="text-xs">Subject</Label>
              <Input
                ref={subjectRef}
                value={value.subject || ""}
                onFocus={() => { lastFocus.current = "subject"; }}
                onChange={(e) => onChange({ ...value, subject: e.target.value })}
                placeholder="Thanks for reaching out, {{first_name}}"
                className="mt-1"
              />
            </div>
          )}
          <div>
            <Label className="text-xs">{channel === "email" ? "Email" : "Text message"}</Label>
            <Textarea
              ref={bodyRef}
              rows={rows}
              value={value.body || ""}
              onFocus={() => { lastFocus.current = "body"; }}
              onChange={(e) => onChange({ ...value, body: e.target.value })}
              placeholder={channel === "email"
                ? "Hi {{first_name}},\n\nThanks for your interest in {{company_name}}…"
                : "Hi {{first_name}}, this is {{rep_name}} with {{company_name}}…"}
              className="mt-1"
            />
          </div>
        </>
      )}
      {seg && (
        <p className="text-[11px] text-slate-500">
          {seg.chars} characters · {seg.segments} text{seg.segments === 1 ? "" : "s"} billed{seg.unicode ? " (emoji or special characters use shorter texts)" : ""}.
          The first text to a number adds "Reply STOP to opt out."
        </p>
      )}
      {channel === "email" && (
        <p className="text-[11px] text-slate-500">An unsubscribe link and your company footer are added to every email.</p>
      )}
    </div>
  );
}
