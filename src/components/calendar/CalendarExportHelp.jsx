import { Button } from "@/components/ui/button";
import { Download, Info } from "lucide-react";

export default function CalendarExportHelp({ onExportPersonal, onExportOperations }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="flex-1">
          <p className="font-semibold">Apple Calendar / Google Calendar</p>
          <p className="mt-1 text-amber-800">Direct personal account linking isn’t available here yet, but you can export your schedule as an .ics file and import it into Apple Calendar or Google Calendar.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="border-amber-300 bg-white text-amber-900 hover:bg-amber-100" onClick={onExportPersonal}>
              <Download className="mr-2 h-4 w-4" /> Export My Calendar
            </Button>
            <Button type="button" variant="outline" className="border-amber-300 bg-white text-amber-900 hover:bg-amber-100" onClick={onExportOperations}>
              <Download className="mr-2 h-4 w-4" /> Export Crew Schedule
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}