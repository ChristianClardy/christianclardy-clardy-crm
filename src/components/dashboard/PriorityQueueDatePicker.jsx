import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarDays } from "lucide-react";
import { format, parseISO } from "date-fns";

export default function PriorityQueueDatePicker({ value, onChange }) {
  const selectedDate = value ? parseISO(`${value}T00:00:00`) : undefined;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" type="button" className="w-full justify-start font-normal">
          <CalendarDays className="h-4 w-4" />
          {selectedDate ? format(selectedDate, "MMM d, yyyy") : "Select due date"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={(date) => onChange(date ? format(date, "yyyy-MM-dd") : "")}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}