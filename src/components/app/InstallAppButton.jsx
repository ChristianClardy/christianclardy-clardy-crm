import { useState } from "react";
import { Download } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useInstallPrompt } from "@/lib/installPrompt";
import InstallSteps from "@/components/app/InstallSteps";

// "Install app" control. Hidden once running as the installed app. On
// Chrome/Android it triggers the native install prompt; everywhere else
// (iPhone Safari especially) it shows the step-by-step instructions.
export default function InstallAppButton({ className, style, label = "Install app" }) {
  const { installed, canPrompt, prompt } = useInstallPrompt();
  const [helpOpen, setHelpOpen] = useState(false);

  if (installed) return null;

  const onClick = async () => {
    if (canPrompt) await prompt();
    else setHelpOpen(true);
  };

  return (
    <>
      <button onClick={onClick} className={className} style={style} title="Install Clardy on this device">
        <Download className="w-4 h-4" />
        {label && <span>{label}</span>}
      </button>
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Install Clardy on this device</DialogTitle>
          </DialogHeader>
          <InstallSteps finalStep={<>Open <strong>Clardy</strong> from your home screen or desktop and sign in.</>} />
        </DialogContent>
      </Dialog>
    </>
  );
}
