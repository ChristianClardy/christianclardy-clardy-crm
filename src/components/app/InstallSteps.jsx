import { useState } from "react";
import { Download, Share, PlusSquare, MoreVertical, MoreHorizontal, Menu, MonitorDown, Compass, Check } from "lucide-react";
import { useInstallPrompt, installPlatform } from "@/lib/installPrompt";

const Icon = ({ as: I }) => <I className="w-4 h-4 inline -mt-0.5 mx-0.5" />;

// Step-by-step "put Clardy on your home screen / desktop" instructions for
// the device and browser in hand. Chrome/Edge/Android get a one-tap install
// button when the browser offers it; iPhone has no such prompt, so it's
// always the Share → Add to Home Screen steps.
const STEPS = {
  "ios-safari": {
    label: "iPhone / iPad (Safari)",
    steps: [
      <>Tap the <Icon as={Share} /> <strong>Share</strong> button at the bottom of the screen (top right on iPad). Don't see it? Tap <Icon as={MoreHorizontal} /> first.</>,
      <>Scroll down and tap <Icon as={PlusSquare} /> <strong>Add to Home Screen</strong>.</>,
      <>Leave <strong>Open as Web App</strong> on if you see it, then tap <strong>Add</strong>.</>,
    ],
  },
  "ios-other-browser": {
    label: "iPhone / iPad (Chrome or other)",
    steps: [
      <>Tap the <Icon as={Share} /> <strong>Share</strong> button in the address bar.</>,
      <>Tap <Icon as={PlusSquare} /> <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</>,
      <>Not there? Open this page in <strong>Safari</strong> instead and follow the Safari steps.</>,
    ],
  },
  "ios-in-app": {
    label: "iPhone (inside another app)",
    steps: [
      <>This page opened inside another app, which can't install it. Tap <Icon as={MoreHorizontal} /> or <Icon as={Compass} /> and choose <strong>Open in Safari</strong>.</>,
      <>In Safari, tap <Icon as={Share} /> <strong>Share</strong>, then <Icon as={PlusSquare} /> <strong>Add to Home Screen</strong>.</>,
    ],
  },
  "android-chrome": {
    label: "Android (Chrome)",
    steps: [
      <>Tap the <Icon as={MoreVertical} /> menu at the top right.</>,
      <>Tap <strong>Install app</strong> (or <strong>Add to Home screen</strong>), then <strong>Install</strong>.</>,
    ],
  },
  "android-samsung": {
    label: "Android (Samsung Internet)",
    steps: [
      <>Tap the <Icon as={Menu} /> menu at the bottom right.</>,
      <>Tap <strong>Add page to</strong>, then <strong>Home screen</strong>, then <strong>Add</strong>.</>,
    ],
  },
  "android-firefox": {
    label: "Android (Firefox)",
    steps: [
      <>Tap the <Icon as={MoreVertical} /> menu.</>,
      <>Tap <strong>Add to Home screen</strong> (or <strong>Install</strong>), then <strong>Add</strong>.</>,
    ],
  },
  "desktop-chrome": {
    label: "Computer (Chrome)",
    steps: [
      <>Click the <Icon as={MonitorDown} /> install icon at the right end of the address bar.</>,
      <>No icon? Click <Icon as={MoreVertical} />, then <strong>Cast, save, and share</strong>, then <strong>Install page as app</strong>.</>,
      <>Click <strong>Install</strong>. Clardy gets its own window and a desktop / dock icon.</>,
    ],
  },
  "desktop-edge": {
    label: "Computer (Edge)",
    steps: [
      <>Click <Icon as={MoreHorizontal} /> at the top right, then <strong>Apps</strong>.</>,
      <>Click <strong>Install this site as an app</strong>, then <strong>Install</strong>.</>,
    ],
  },
  "mac-safari": {
    label: "Mac (Safari)",
    steps: [
      <>In the menu bar, click <strong>File</strong>, then <strong>Add to Dock</strong>.</>,
      <>Click <strong>Add</strong>. Clardy now opens from your Dock like any app.</>,
    ],
  },
  "desktop-firefox": {
    label: "Computer (Firefox)",
    steps: [
      <>Firefox can't install web apps. Open this page in <strong>Chrome</strong> or <strong>Edge</strong> to install it,</>,
      <>or bookmark it with <strong>Ctrl+D</strong> (<strong>⌘D</strong> on Mac).</>,
    ],
  },
  "desktop-other": {
    label: "Other browser",
    steps: [
      <>Open this page in <strong>Chrome</strong> or <strong>Edge</strong> and look for <strong>Install</strong> in the browser menu,</>,
      <>or bookmark it so it's one click away.</>,
    ],
  },
};

export default function InstallSteps({ finalStep }) {
  const detected = installPlatform();
  const [platform, setPlatform] = useState(detected);
  const { installed, canPrompt, prompt } = useInstallPrompt();
  const [justInstalled, setJustInstalled] = useState(false);

  if (installed || justInstalled) {
    return (
      <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: "#ecfdf5", color: "#047857" }}>
        <Check className="w-4 h-4 shrink-0" /> Clardy is installed on this device.
      </div>
    );
  }

  const { steps } = STEPS[platform] || STEPS["desktop-other"];
  const all = finalStep ? [...steps, finalStep] : steps;

  return (
    <div className="space-y-4">
      {canPrompt && platform === detected && (
        <button
          onClick={async () => { if (await prompt()) setJustInstalled(true); }}
          className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
          style={{ backgroundColor: "#b5965a", color: "#fff" }}
        >
          <Download className="w-4 h-4" /> Install Clardy now
        </button>
      )}
      {canPrompt && platform === detected && <p className="text-xs text-center" style={{ color: "#7a6e66" }}>Or do it by hand:</p>}

      <ol className="space-y-3">
        {all.map((step, i) => (
          <li key={i} className="flex gap-3 text-sm leading-relaxed" style={{ color: "#3d3530" }}>
            <span className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-xs font-bold" style={{ backgroundColor: "#3d3530", color: "#f5f0eb" }}>{i + 1}</span>
            <span className="pt-0.5">{step}</span>
          </li>
        ))}
      </ol>

      <label className="block text-xs" style={{ color: "#7a6e66" }}>
        Different device?{" "}
        <select value={platform} onChange={(e) => setPlatform(e.target.value)} className="ml-1 rounded border px-1 py-0.5 text-xs" style={{ borderColor: "#ddd5c8" }}>
          {Object.entries(STEPS).map(([key, { label }]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>
    </div>
  );
}
