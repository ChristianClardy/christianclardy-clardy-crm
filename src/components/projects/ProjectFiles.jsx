import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import RecordFiles from "@/components/files/RecordFiles";
import { projectFileQueries } from "@/lib/carryFiles";

// Project files, plus anything still filed on the client or its leads.
// Once 064 is applied those rows are re-linked onto the project; until then
// this query is what makes them show up here.
export default function ProjectFiles({ projectId }) {
  const [queries, setQueries] = useState(() => projectFileQueries(projectId));

  useEffect(() => {
    if (!projectId) return undefined;
    let cancelled = false;
    (async () => {
      const project = await base44.entities.Project.get(projectId).catch(() => null);
      let leadIds = [];
      if (project?.client_id) {
        const [leads, client] = await Promise.all([
          base44.entities.Lead.filter({ linked_contact_id: project.client_id }).catch(() => []),
          base44.entities.Client.get(project.client_id).catch(() => null),
        ]);
        const ids = new Set((leads || []).map((lead) => lead.id));
        if (client?.linked_lead_id) ids.add(client.linked_lead_id);
        leadIds = [...ids];
      }
      if (!cancelled) setQueries(projectFileQueries(projectId, project?.client_id, leadIds));
    })().catch((err) => console.error("Failed to resolve project files:", err?.message || err));
    return () => { cancelled = true; };
  }, [projectId]);

  if (!projectId) return null;
  return (
    <RecordFiles
      title="Project Files"
      uploadTo={{ entityType: "project", entityId: projectId }}
      queries={queries}
    />
  );
}
