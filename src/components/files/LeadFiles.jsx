import { useMemo } from "react";
import RecordFiles from "@/components/files/RecordFiles";
import { leadFileQueries } from "@/lib/carryFiles";

export default function LeadFiles({ lead }) {
  const queries = useMemo(() => leadFileQueries(lead), [lead?.id, lead?.linked_contact_id]);
  if (!lead?.id) return null;
  return (
    <RecordFiles
      title="Files"
      uploadTo={{ entityType: "lead", entityId: lead.id }}
      queries={queries}
    />
  );
}
