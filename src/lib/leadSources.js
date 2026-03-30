export const LEAD_SOURCE_OPTIONS = [
  "Website",
  "Referral",
  "Facebook",
  "Google",
  "Yard Sign",
  "Repeat Customer",
  "Realtor",
  "Other",
];

export function getLeadSourceFromQuery(value) {
  const normalized = String(value || "").trim().toLowerCase();

  const sourceMap = {
    website: "Website",
    referral: "Referral",
    facebook: "Facebook",
    google: "Google",
    "yard sign": "Yard Sign",
    "yard-sign": "Yard Sign",
    yardsign: "Yard Sign",
    "repeat customer": "Repeat Customer",
    "repeat-customer": "Repeat Customer",
    repeatcustomer: "Repeat Customer",
    realtor: "Realtor",
    other: "Other",
  };

  return sourceMap[normalized] || "Website";
}