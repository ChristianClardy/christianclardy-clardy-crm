import { useState } from "react";
import { Download, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useInstallPrompt } from "@/lib/installPrompt";
import InstallSteps from "@/components/app/InstallSteps";

// "Put Clardy on your phone / computer" banner for anyone who signs in with
// their password (invite links already walk them through it, JoinPortal /
// SetPassword). Shows on every device where Clardy isn't installed until they
// install it or tap Not now; remembered per device.
const DISMISS_KEY = "clardy_install_nudge_dismissed";
const dismissed = () => { try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; } };

export default function InstallNudge() {
  const { installed, canPrompt, prompt } = useInstallPrompt();
  const [hidden, setHidden] = useState(dismissed);
  const [open, setOpen] = useState(false);

  if (installed || hidden) return null;

  const hide = () => {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* private window: hide for now */ }
    setHidden(true);
  };
  const show = async () => {
    if (canPrompt && (await prompt())) { hide(); return; }
    setOpen(true);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm" style={{ backgroundColor: "#3d3530", color: "#f5f0eb" }}>
        <Download className="w-4 h-4 shrink-0" style={{ color: "#c9ac76" }} />
        <span className="flex-1 min-w-[12rem]">Put Clardy on your phone or computer so it opens like an app.</span>
        <button onClick={show} className="rounded-md px-3 py-1 text-xs font-semibold" style={{ backgroundColor: "#b5965a", color: "#fff" }}>
          Show me how
        </button>
        <button onClick={hide} className="flex items-center gap-1 text-xs opacity-80 hover:opacity-100" title="Hide this">
          Not now <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Install Clardy on this device</DialogTitle>
          </DialogHeader>
          <InstallSteps finalStep={<>Open <strong>Clardy</strong> from your home screen or desktop and sign in.</>} />
          <p className="text-[11px] text-center text-slate-400">You can find these steps again any time with the <strong>Install</strong> button.</p>
        </DialogContent>
      </Dialog>
    </>
  );
}
