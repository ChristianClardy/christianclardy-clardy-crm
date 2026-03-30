import PublicLeadCaptureForm from "@/components/public/PublicLeadCaptureForm";

export default function PublicLeadForm() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-amber-50 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1fr,560px] lg:items-center">
        <div className="space-y-6">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-amber-700">Lead capture</p>
          <h2 className="max-w-xl text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">A clean public form you can use on your website or Facebook.</h2>
          <p className="max-w-xl text-lg text-slate-600">Every submission creates a lead in your CRM so your team can follow up quickly and keep the pipeline moving.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">Fast intake</p>
              <p className="mt-1 text-sm text-slate-500">Collect project details in one place.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">Auto source tracking</p>
              <p className="mt-1 text-sm text-slate-500">Use one link for website or Facebook.</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">Direct to CRM</p>
              <p className="mt-1 text-sm text-slate-500">New submissions become leads automatically.</p>
            </div>
          </div>
        </div>
        <PublicLeadCaptureForm />
      </div>
    </div>
  );
}