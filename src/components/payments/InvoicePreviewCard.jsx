export default function InvoicePreviewCard({ branding, companyName, invoiceName, projectName, clientName, amount, dueDate, scopeText, id }) {
  const formattedAmount = `$${Number(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div id={id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-6 text-white" style={{ backgroundColor: branding.accent_color }}>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4">
            {branding.logo_url ? (
              <img src={branding.logo_url} alt={companyName} className="h-16 w-16 rounded-2xl bg-white object-contain p-2 shadow-sm" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 text-2xl font-bold shadow-sm">
                {companyName?.charAt(0) || "C"}
              </div>
            )}
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-white/70">{branding.header_title}</p>
              <h2 className="mt-1 text-2xl font-bold leading-tight">{companyName}</h2>
              <p className="mt-2 text-sm text-white/80">Professional construction billing statement</p>
            </div>
          </div>

          <div className="rounded-2xl bg-white/10 px-5 py-4 text-sm backdrop-blur-sm sm:min-w-[220px]">
            <div className="flex items-center justify-between gap-4 border-b border-white/15 pb-3">
              <span className="text-white/75">Invoice</span>
              <span className="font-semibold text-white">{invoiceName || "Invoice"}</span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-4">
              <span className="text-white/75">Due Date</span>
              <span className="font-medium text-white">{dueDate || "Upon receipt"}</span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-4">
              <span className="text-white/75">Amount Due</span>
              <span className="text-2xl font-bold text-white">{formattedAmount}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6 px-6 py-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Bill To</p>
            <p className="mt-3 text-lg font-semibold text-slate-900">{clientName || "Client Name"}</p>
            <p className="mt-1 text-sm text-slate-500">{projectName || "Project Name"}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Invoice Summary</p>
            <p className="mt-3 text-sm leading-6 text-slate-600">{branding.intro_text}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{branding.default_scope_label}</p>
          <p className="mt-2 text-lg font-semibold text-slate-900">{invoiceName || "Invoice Name"}</p>
          <p className="mt-3 text-sm leading-6 text-slate-600">{scopeText || "This invoice covers the scheduled phase of work, materials, labor, or services provided for the project listed above."}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Amount Due</p>
              <p className="mt-2 text-sm text-slate-500">Please remit payment by the due date shown on this invoice.</p>
            </div>
            <p className="text-3xl font-bold text-slate-900">{formattedAmount}</p>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-5">
          <p className="text-sm leading-6 text-slate-500">{branding.footer_text}</p>
        </div>
      </div>
    </div>
  );
}