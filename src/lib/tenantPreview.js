// Local screenshot harness. Nothing in the app calls installTenantDemo().
// The preview entry (preview/main.jsx) does, and that file is not part of
// the production Vite build. Calling it only changes what this browser shows.

let demo = null;

export function installTenantDemo(data) {
  demo = data;
}

export function tenantDemo() {
  return demo;
}

export const PREVIEW_USER = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "christianclardy7@gmail.com",
  full_name: "Christian Clardy",
  role: "admin",
  needsPassword: false,
};
