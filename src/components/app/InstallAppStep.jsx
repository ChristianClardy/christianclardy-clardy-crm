import { installPlatform } from "@/lib/installPrompt";
import InstallSteps from "@/components/app/InstallSteps";

// The last step of every "you've been invited" flow, so everyone we send the
// app to gets the same guide: texted portal links (JoinPortal) and emailed
// invites / sign-in links for staff, PMs, subs and customers (SetPassword).

export function SetupProgress({ steps, current }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-5">
      {steps.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span
              className="w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center"
              style={i <= current ? { backgroundColor: "#3d3530", color: "#f5f0eb" } : { backgroundColor: "#ddd5c8", color: "#7a6e66" }}
            >{i + 1}</span>
            <span className="text-xs" style={{ color: i <= current ? "#3d3530" : "#a89e96" }}>{label}</span>
          </div>
          {i < steps.length - 1 && <span className="w-4 h-px" style={{ backgroundColor: "#ddd5c8" }} />}
        </div>
      ))}
    </div>
  );
}

export default function InstallAppStep({ email, destination, onDone }) {
  const platform = installPlatform();
  const ios = platform.startsWith("ios");
  const phone = ios || platform.startsWith("android");
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold" style={{ color: "#3d3530" }}>Add Clardy to your {phone ? "home screen" : "computer"}</h2>
        <p className="text-sm mt-1" style={{ color: "#7a6e66" }}>Then it opens like any other app, right to {destination}.</p>
      </div>
      <InstallSteps
        finalStep={ios
          ? <>Open <strong>Clardy</strong> from your home screen and sign in with <strong>{email}</strong> and the password you just made.</>
          : <>Open <strong>Clardy</strong> from your home screen or desktop. You're already signed in.</>}
      />
      <button onClick={onDone} className="w-full py-2.5 rounded-lg text-sm font-semibold" style={{ backgroundColor: "#3d3530", color: "#f5f0eb" }}>
        Done, go to {destination}
      </button>
      <button onClick={onDone} className="w-full text-xs hover:underline" style={{ color: "#7a6e66" }}>I'll do this later</button>
      <p className="text-[11px] text-center" style={{ color: "#a89e96" }}>You can find these steps again any time with the <strong>Install</strong> button in the app.</p>
    </div>
  );
}
