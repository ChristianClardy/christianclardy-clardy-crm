export const defaultInvoiceBranding = {
  company_name: "Clarity Construction",
  logo_url: "",
  header_title: "Invoice",
  accent_color: "#b5965a",
  intro_text: "Thank you for the opportunity to serve you. Please review the invoice details below.",
  footer_text: "Payment is due by the listed due date. Please contact us if you have any questions regarding this invoice or the work billed.",
  default_scope_label: "Description of Work",
};

export function getInvoiceBranding(company) {
  return {
    ...defaultInvoiceBranding,
    company_name: company?.invoice_company_name || company?.name || defaultInvoiceBranding.company_name,
    logo_url: company?.invoice_logo_url || "",
    header_title: company?.invoice_header_title || defaultInvoiceBranding.header_title,
    accent_color: company?.invoice_accent_color || company?.color || defaultInvoiceBranding.accent_color,
    intro_text: company?.invoice_intro_text || defaultInvoiceBranding.intro_text,
    footer_text: company?.invoice_footer_text || defaultInvoiceBranding.footer_text,
    default_scope_label: company?.invoice_scope_label || defaultInvoiceBranding.default_scope_label,
  };
}