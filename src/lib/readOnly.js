// View-only logins (the Viewer role, and an admin previewing as Viewer):
// useRolePermissions switches this on and base44Client refuses writes before
// they're sent. The database refuses them on its own too (055).
export const READ_ONLY_MESSAGE = "View-only access: your login can see everything but can't make changes.";

// Writes a view-only login may still make: marking its own notifications read.
const ALLOWED = { notifications: new Set(['update']) };

let readOnly = false;
export function setReadOnly(value) { readOnly = !!value; }
export function isReadOnly() { return readOnly; }
export function blocksWrite(table, op) { return readOnly && !ALLOWED[table]?.has(op); }
