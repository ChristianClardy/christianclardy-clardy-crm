import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import { useTenant } from "@/lib/TenantContext";
import { Building2, HardHat, Loader2, ArrowRight, Link as LinkIcon, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Onboarding() {
  const { user, logout } = useAuth();
  const { reload } = useTenant();
  const [mode, setMode] = useState("choose"); // "choose" | "create" | "join"
  const [orgName, setOrgName] = useState("");
  const [extraOpen, setExtraOpen] = useState(false);
  const [profile, setProfile] = useState({ phone: "", email: "", address: "", website: "", license_number: "" });
  const [inviteToken, setInviteToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!orgName.trim()) return;
    setLoading(true);
    setError("");
    try {
      const slug = orgName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const { data: org, error: orgErr } = await supabase
        .from("organizations")
        .insert({ name: orgName.trim(), slug: `${slug}-${Date.now()}` })
        .select()
        .single();
      if (orgErr) throw orgErr;

      const { error: memErr } = await supabase
        .from("organization_members")
        .insert({ organization_id: org.id, user_id: user.id, role: "admin", status: "active" });
      if (memErr) throw memErr;

      // Create company profile (always; optional fields only included if filled)
      const profilePayload = { name: orgName.trim() };
      if (profile.phone.trim())          profilePayload.phone          = profile.phone.trim();
      if (profile.email.trim())          profilePayload.email          = profile.email.trim();
      if (profile.address.trim())        profilePayload.address        = profile.address.trim();
      if (profile.website.trim())        profilePayload.website        = profile.website.trim();
      if (profile.license_number.trim()) profilePayload.license_number = profile.license_number.trim();
      await supabase.from("company_profiles").insert(profilePayload);

      await reload();
    } catch (err) {
      setError(err.message || "Failed to create organization.");
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!inviteToken.trim()) return;
    setLoading(true);
    setError("");
    try {
      // Look up invitation
      const { data: inv, error: invErr } = await supabase
        .from("organization_invitations")
        .select("*")
        .eq("token", inviteToken.trim())
        .is("accepted_at", null)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (invErr) throw invErr;
      if (!inv) throw new Error("Invite not found or expired. Ask your admin to resend.");

      // Accept invitation
      const { error: memErr } = await supabase
        .from("organization_members")
        .insert({ organization_id: inv.organization_id, user_id: user.id, role: inv.role, status: "active" });
      if (memErr && !memErr.message.includes("duplicate")) throw memErr;

      await supabase
        .from("organization_invitations")
        .update({ accepted_at: new Date().toISOString() })
        .eq("id", inv.id);

      await reload();
    } catch (err) {
      setError(err.message || "Failed to join organization.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#f5f0eb" }}>
      <div className="w-full max-w-md px-6">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: "#3d3530" }}>
            <HardHat className="w-7 h-7" style={{ color: "#b5965a" }} />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: "#3d3530", fontFamily: "'Georgia', serif" }}>Clardy.io</h1>
          <p className="text-sm mt-1" style={{ color: "#7a6e66" }}>Welcome, {user?.full_name || user?.email}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8 border" style={{ borderColor: "#ddd5c8" }}>
          {mode === "choose" && (
            <div className="space-y-5">
              <div className="text-center mb-6">
                <h2 className="text-xl font-semibold mb-1" style={{ color: "#3d3530" }}>Set up your workspace</h2>
                <p className="text-sm" style={{ color: "#7a6e66" }}>Create a new organization or join an existing one.</p>
              </div>
              <button
                onClick={() => setMode("create")}
                className="w-full flex items-center gap-4 border-2 rounded-xl p-4 text-left hover:border-amber-400 hover:bg-amber-50/30 transition-all group"
                style={{ borderColor: "#ddd5c8" }}
              >
                <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: "#f5f0eb" }}>
                  <Building2 className="w-5 h-5" style={{ color: "#b5965a" }} />
                </div>
                <div>
                  <p className="font-semibold text-sm" style={{ color: "#3d3530" }}>Create new organization</p>
                  <p className="text-xs mt-0.5" style={{ color: "#7a6e66" }}>Start fresh for your GC company</p>
                </div>
                <ArrowRight className="w-4 h-4 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "#b5965a" }} />
              </button>
              <button
                onClick={() => setMode("join")}
                className="w-full flex items-center gap-4 border-2 rounded-xl p-4 text-left hover:border-amber-400 hover:bg-amber-50/30 transition-all group"
                style={{ borderColor: "#ddd5c8" }}
              >
                <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: "#f5f0eb" }}>
                  <LinkIcon className="w-5 h-5" style={{ color: "#b5965a" }} />
                </div>
                <div>
                  <p className="font-semibold text-sm" style={{ color: "#3d3530" }}>Join with invite token</p>
                  <p className="text-xs mt-0.5" style={{ color: "#7a6e66" }}>Enter a token sent by your admin</p>
                </div>
                <ArrowRight className="w-4 h-4 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "#b5965a" }} />
              </button>
              <button onClick={() => logout()} className="w-full text-xs text-center mt-2" style={{ color: "#b5965a" }}>
                Sign out
              </button>
            </div>
          )}

          {mode === "create" && (
            <form onSubmit={handleCreate} className="space-y-5">
              <div>
                <button type="button" onClick={() => { setMode("choose"); setError(""); }} className="text-xs mb-4" style={{ color: "#b5965a" }}>← Back</button>
                <h2 className="text-xl font-semibold" style={{ color: "#3d3530" }}>Create organization</h2>
                <p className="text-sm mt-1" style={{ color: "#7a6e66" }}>This will be your company workspace. You can invite your team after setup.</p>
              </div>

              <div>
                <Label>Company Name <span style={{ color: "#b5965a" }}>*</span></Label>
                <Input
                  value={orgName}
                  onChange={e => setOrgName(e.target.value)}
                  placeholder="e.g. Clardy Construction"
                  required
                  className="mt-1.5"
                  autoFocus
                />
              </div>

              {/* Optional details toggle */}
              <button
                type="button"
                onClick={() => setExtraOpen(o => !o)}
                className="flex items-center gap-2 text-sm font-medium w-full pt-1"
                style={{ color: "#b5965a" }}
              >
                {extraOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {extraOpen ? "Hide optional details" : "Add company details (optional)"}
              </button>

              {extraOpen && (
                <div className="space-y-4 rounded-xl border p-4" style={{ borderColor: "#ddd5c8", backgroundColor: "#faf8f5" }}>
                  <p className="text-xs" style={{ color: "#7a6e66" }}>You can fill these in now or later in Settings.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Phone</Label>
                      <Input value={profile.phone} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))} placeholder="(555) 000-0000" className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs">Email</Label>
                      <Input type="email" value={profile.email} onChange={e => setProfile(p => ({ ...p, email: e.target.value }))} placeholder="info@company.com" className="mt-1" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Address</Label>
                    <Input value={profile.address} onChange={e => setProfile(p => ({ ...p, address: e.target.value }))} placeholder="123 Main St, City, State" className="mt-1" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Website</Label>
                      <Input value={profile.website} onChange={e => setProfile(p => ({ ...p, website: e.target.value }))} placeholder="www.company.com" className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs">License #</Label>
                      <Input value={profile.license_number} onChange={e => setProfile(p => ({ ...p, license_number: e.target.value }))} placeholder="GC-12345" className="mt-1" />
                    </div>
                  </div>
                </div>
              )}

              {error && <p className="text-sm text-rose-600">{error}</p>}
              <Button type="submit" disabled={loading || !orgName.trim()} className="w-full" style={{ backgroundColor: "#3d3530", color: "#f5f0eb" }}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Create &amp; Continue
              </Button>
            </form>
          )}

          {mode === "join" && (
            <form onSubmit={handleJoin} className="space-y-5">
              <div>
                <button type="button" onClick={() => { setMode("choose"); setError(""); }} className="text-xs mb-4" style={{ color: "#b5965a" }}>← Back</button>
                <h2 className="text-xl font-semibold" style={{ color: "#3d3530" }}>Join organization</h2>
                <p className="text-sm mt-1" style={{ color: "#7a6e66" }}>Enter the invite token your admin sent you.</p>
              </div>
              <div>
                <Label>Invite Token</Label>
                <Input
                  value={inviteToken}
                  onChange={e => setInviteToken(e.target.value)}
                  placeholder="Paste your invite token"
                  required
                  className="mt-1.5 font-mono"
                  autoFocus
                />
              </div>
              {error && <p className="text-sm text-rose-600">{error}</p>}
              <Button type="submit" disabled={loading || !inviteToken.trim()} className="w-full" style={{ backgroundColor: "#3d3530", color: "#f5f0eb" }}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Join Organization
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
