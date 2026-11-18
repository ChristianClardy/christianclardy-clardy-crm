import { useState } from "react";
import TurfWorkspace from "@/components/turf/TurfWorkspace";
import { previewModel } from "@/lib/turf/fixtures";
import { previewHandlers } from "./Turf";

export default function TurfPreview() {
  const [model, setModel] = useState(() => previewModel());
  return (
    <div className="min-h-screen bg-slate-50">
      <TurfWorkspace
        model={model}
        readOnly={false}
        initialDate={new Date(2026, 10, 17)}
        previewNote="Install names are the Turf'n Texas jobs in the database on 17 Nov 2026: 1 project and 3 sold leads, listed once when they are the same job. None have a start date, so they are unscheduled. Nothing on this screen is saved."
        {...previewHandlers(setModel)}
      />
    </div>
  );
}
