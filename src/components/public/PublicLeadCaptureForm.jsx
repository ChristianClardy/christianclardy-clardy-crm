import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LEAD_SOURCE_OPTIONS, getLeadSourceFromQuery } from "@/lib/leadSources";

const PROJECT_TYPES = [
  "Pergola",
  "Covered Patio",
  "Cabana",
  "Outdoor Kitchen",
  "Remodel",
  "Addition",
  "Backyard Revamp",
  "Other",
];

const CONTACT_METHODS = ["phone", "email", "text"];

export default function PublicLeadCaptureForm() {
  const urlParams = new URLSearchParams(window.location.search);
  const defaultSource = getLeadSourceFromQuery(urlParams.get("source"));

  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    property_address: "",
    city: "",
    state: "",
    zip: "",
    preferred_contact_method: "phone",
    lead_source: defaultSource,
    project_type: "Other",
    budget_range: "",
    timeline: "",
    project_description: "",
    notes: "",
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const response = await base44.functions
      .invoke("createPublicLead", form)
      .finally(() => setSubmitting(false));

    if (response.data?.success) {
      setSubmitted(true);
    }
  };

  if (submitted) {
    return (
      <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-xl shadow-amber-100/40">
        <p className="text-sm font-semibold uppercase tracking-[0.28em] text-amber-700">Thanks</p>
        <h3 className="mt-3 text-3xl font-bold text-slate-900">Your request has been sent.</h3>
        <p className="mt-3 text-sm text-slate-600">Your lead was added to the CRM and someone from the team can follow up soon.</p>
        <Button className="mt-6" variant="outline" onClick={() => {
          setSubmitted(false);
          setForm({
            full_name: "",
            email: "",
            phone: "",
            property_address: "",
            city: "",
            state: "",
            zip: "",
            preferred_contact_method: "phone",
            lead_source: defaultSource,
            project_type: "Other",
            budget_range: "",
            timeline: "",
            project_description: "",
            notes: "",
          });
        }}>
          Submit another lead
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => {
      setSubmitting(true);
      handleSubmit(e);
    }} className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-amber-100/40 sm:p-8">
      <div className="grid gap-5 md:grid-cols-2">
        <div className="md:col-span-2">
          <Label>Full Name *</Label>
          <Input className="mt-1.5" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
        </div>

        <div>
          <Label>Email</Label>
          <Input type="email" className="mt-1.5" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>

        <div>
          <Label>Phone</Label>
          <Input className="mt-1.5" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>

        <div>
          <Label>Lead Source</Label>
          <Select value={form.lead_source} onValueChange={(value) => setForm({ ...form, lead_source: value })}>
            <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LEAD_SOURCE_OPTIONS.map((source) => (
                <SelectItem key={source} value={source}>{source}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Preferred Contact</Label>
          <Select value={form.preferred_contact_method} onValueChange={(value) => setForm({ ...form, preferred_contact_method: value })}>
            <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CONTACT_METHODS.map((method) => (
                <SelectItem key={method} value={method}>{method}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="md:col-span-2">
          <Label>Property Address</Label>
          <Input className="mt-1.5" value={form.property_address} onChange={(e) => setForm({ ...form, property_address: e.target.value })} />
        </div>

        <div>
          <Label>City</Label>
          <Input className="mt-1.5" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>State</Label>
            <Input className="mt-1.5" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
          </div>
          <div>
            <Label>ZIP</Label>
            <Input className="mt-1.5" value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} />
          </div>
        </div>

        <div>
          <Label>Project Type</Label>
          <Select value={form.project_type} onValueChange={(value) => setForm({ ...form, project_type: value })}>
            <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PROJECT_TYPES.map((type) => (
                <SelectItem key={type} value={type}>{type}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Budget Range</Label>
          <Input className="mt-1.5" value={form.budget_range} onChange={(e) => setForm({ ...form, budget_range: e.target.value })} />
        </div>

        <div className="md:col-span-2">
          <Label>Timeline</Label>
          <Input className="mt-1.5" value={form.timeline} onChange={(e) => setForm({ ...form, timeline: e.target.value })} />
        </div>

        <div className="md:col-span-2">
          <Label>Project Description</Label>
          <Textarea className="mt-1.5 min-h-28" value={form.project_description} onChange={(e) => setForm({ ...form, project_description: e.target.value })} />
        </div>

        <div className="md:col-span-2">
          <Label>Notes</Label>
          <Textarea className="mt-1.5 min-h-24" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </div>

      <Button type="submit" className="mt-6 w-full" disabled={submitting || !form.full_name.trim()}>
        {submitting ? "Submitting..." : "Submit Lead"}
      </Button>
    </form>
  );
}