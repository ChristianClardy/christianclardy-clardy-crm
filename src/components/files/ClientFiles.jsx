import { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import RecordFiles from "@/components/files/RecordFiles";
import { clientFileQueries } from "@/lib/carryFiles";

export default function ClientFiles({ clientId, linkedLeadId }) {
  const [leadIds, setLeadIds] = useState(() => (linkedLeadId ? [linkedLeadId] : []));

  useEffect(() => {
    if (!clientId) return undefined;
    let cancelled = false;
    base44.entities.Lead.filter({ linked_contact_id: clientId })
      .then((rows) => {
        if (cancelled) return;
        const ids = new Set((rows || []).map((lead) => lead.id));
        if (linkedLeadId) ids.add(linkedLeadId);
        setLeadIds([...ids]);
      })
      .catch(() => {
        if (!cancelled && linkedLeadId) setLeadIds([linkedLeadId]);
      });
    return () => { cancelled = true; };
  }, [clientId, linkedLeadId]);

  const queries = useMemo(() => clientFileQueries(clientId, leadIds), [clientId, leadIds]);

  if (!clientId) return null;
  return (
    <RecordFiles
      title="Files"
      uploadTo={{ entityType: "client", entityId: clientId }}
      queries={queries}
    />
  );
}
