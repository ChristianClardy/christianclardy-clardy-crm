import { useState } from "react";
import { Download, Share, PlusSquare, MoreVertical } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useInstallPrompt, isIOS } from "@/lib/installPrompt";

// "Install app" control. Hidden once running as the installed app. On
// Chrome/Android it triggers the native install prompt; everywhere else
// (iPhone Safari especially) it shows the manual Add to Home Screen steps.
export default function InstallAppButton({ className, style, label = "Install app" }) {
  const { installed, canPrompt, prompt } = useInstallPrompt();
  const [helpOpen, setHelpOpen] = useState(false);

  if (installed) return null;

  const onClick = async () => {
    if (canPrompt) await prompt();
    else setHelpOpen(true);
  };

  const ios = isIOS();

  return (
    <>
      <button onClick={onClick} className={className} style={style} title="Install Clardy on this device">
        <Download className="w-4 h-4" />
        {label && <span>{label}</span>}
      </button>
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Install Clardy on your phone</DialogTitle>
          </DialogHeader>
          {ios ? (
            <ol className="space-y-3 text-sm text-slate-700">
              <li className="flex gap-2"><span className="font-semibold">1.</span><span>Open <strong>clardy.io</strong> in <strong>Safari</strong> (not Chrome or an in-app browser).</span></li>
              <li className="flex gap-2"><span className="font-semibold">2.</span><span className="flex items-center gap-1 flex-wrap">Tap the <Share className="w-4 h-4 inline" /> <strong>Share</strong> button.</span></li>
              <li className="flex gap-2"><span className="font-semibold">3.</span><span className="flex items-center gap-1 flex-wrap">Scroll down and tap <PlusSquare className="w-4 h-4 inline" /> <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</span></li>
              <li className="flex gap-2"><span className="font-semibold">4.</span><span>Open <strong>Clardy</strong> from your home screen and sign in.</span></li>
            </ol>
          ) : (
            <ol className="space-y-3 text-sm text-slate-700">
              <li className="flex gap-2"><span className="font-semibold">1.</span><span>Open <strong>clardy.io</strong> in <strong>Chrome</strong>.</span></li>
              <li className="flex gap-2"><span className="font-semibold">2.</span><span className="flex items-center gap-1 flex-wrap">Tap the <MoreVertical className="w-4 h-4 inline" /> menu, then <strong>Install app</strong> (or <strong>Add to Home screen</strong>).</span></li>
              <li className="flex gap-2"><span className="font-semibold">3.</span><span>Open <strong>Clardy</strong> from your home screen and sign in.</span></li>
            </ol>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
