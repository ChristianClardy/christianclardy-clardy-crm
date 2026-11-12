import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mergeAttachmentLists,
  leadFileDestination,
  leadFileQueries,
  clientFileQueries,
  projectFileQueries,
} from "./fileQueries.js";

test("merge keeps one row when the same file was linked twice", () => {
  const file = { id: "a", url: "https://files/proposal.pdf", created_at: "2026-11-01T00:00:00Z" };
  const copy = { id: "b", url: "https://files/proposal.pdf", created_at: "2026-11-02T00:00:00Z" };
  const merged = mergeAttachmentLists([[file], [copy, { id: "c", url: "https://files/photo.jpg", created_at: "2026-10-01T00:00:00Z" }]]);
  assert.deepEqual(merged.map((row) => row.id), ["a", "c"]);
});

test("a lead's files go to the client until there is exactly one open project", () => {
  const clientId = "client-1";
  assert.deepEqual(leadFileDestination(clientId, []), { entityType: "client", entityId: clientId });
  assert.deepEqual(
    leadFileDestination(clientId, [{ id: "p1", status: "planning" }, { id: "p2", status: "in_progress" }]),
    { entityType: "client", entityId: clientId },
  );
  assert.deepEqual(
    leadFileDestination(clientId, [{ id: "p1", status: "completed" }, { id: "p2", status: "planning" }]),
    { entityType: "project", entityId: "p2" },
  );
  assert.equal(leadFileDestination(null, []), null);
});

test("project files include the contact and its leads, not a sibling project", () => {
  const queries = projectFileQueries("project-1", "client-1", ["lead-1"]);
  assert.deepEqual(queries, [
    { entity_type: "project", entity_id: "project-1" },
    { entity_type: "client", entity_id: "client-1" },
    { entity_type: "lead", entity_id: "lead-1" },
  ]);
  assert.equal(queries.some((query) => query.entity_id === "project-2"), false);
});

test("lead and client queries still find a file after it is re-linked", () => {
  const leadQueries = leadFileQueries({ id: "lead-1", linked_contact_id: "client-1" });
  assert.ok(leadQueries.some((query) => query.origin_entity_type === "lead" && query.origin_entity_id === "lead-1"));
  const clientQueries = clientFileQueries("client-1", ["lead-1"]);
  assert.ok(clientQueries.some((query) => query.origin_entity_type === "lead" && query.origin_entity_id === "lead-1"));
  assert.ok(clientQueries.some((query) => query.entity_type === "client"));
});
