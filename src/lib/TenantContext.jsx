import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { setCurrentOrgId } from '@/api/base44Client';
import { subscriptionAllowsUse } from '@/lib/tenantCatalog';
import { tenantDemo } from '@/lib/tenantPreview';

const TenantContext = createContext(null);

export function TenantProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  const [organization, setOrganization] = useState(null);
  const [membership, setMembership] = useState(null);
  const [loading, setLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [accessRevoked, setAccessRevoked] = useState(false);
  const [modules, setModules] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  const loadOrg = useCallback(async () => {
    const demo = tenantDemo();
    if (demo) {
      setOrganization(demo.organization);
      setMembership(demo.membership);
      setCurrentOrgId(demo.organization?.id || null);
      setModules(Object.fromEntries((demo.modules || []).map((m) => [m.module_key, m.enabled !== false])));
      setSubscription(demo.subscription || null);
      setIsPlatformAdmin(!!demo.isPlatformAdmin);
      setNeedsOnboarding(false);
      setAccessRevoked(false);
      setLoading(false);
      return;
    }
    if (!user?.id) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data: mem, error: memErr } = await supabase
        .from('organization_members')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();

      if (memErr || !mem?.organization_id) {
        const { data: anyMem } = await supabase
          .from('organization_members')
          .select('id, status')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle();
        setOrganization(null);
        setMembership(null);
        setModules(null);
        setSubscription(null);
        setCurrentOrgId(null);
        setAccessRevoked(!!anyMem);
        setNeedsOnboarding(!anyMem);
        return;
      }

      let org = { id: mem.organization_id, name: 'My Organization' };
      const { data: orgData } = await supabase.from('organizations').select('*').eq('id', mem.organization_id).maybeSingle();
      if (orgData) org = orgData;

      const [modRes, subRes, adminRes] = await Promise.all([
        supabase.from('tenant_modules').select('module_key, enabled').eq('organization_id', mem.organization_id),
        supabase.from('tenant_subscriptions').select('*').eq('organization_id', mem.organization_id).maybeSingle(),
        supabase.rpc('is_platform_admin'),
      ]);

      setOrganization(org);
      setMembership(mem);
      setCurrentOrgId(mem.organization_id);
      setNeedsOnboarding(false);
      setAccessRevoked(false);
      // A missing table means migration 065 is not applied yet: don't gate.
      setModules(modRes.error ? null : Object.fromEntries((modRes.data || []).map((row) => [row.module_key, row.enabled])));
      setSubscription(subRes.error ? null : subRes.data);
      setIsPlatformAdmin(!adminRes.error && adminRes.data === true);
    } catch {
      setNeedsOnboarding(true);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (tenantDemo() || (isAuthenticated && user?.id)) loadOrg();
    else setLoading(false);
  }, [isAuthenticated, user?.id, loadOrg]);

  const moduleEnabled = (key) => {
    if (!key) return true;
    if (modules == null) return true;
    if (subscription && !subscriptionAllowsUse(subscription)) return false;
    return modules[key] !== false;
  };

  return (
    <TenantContext.Provider value={{
      organization,
      membership,
      loading,
      needsOnboarding,
      accessRevoked,
      subscription,
      isPlatformAdmin,
      moduleEnabled,
      reload: loadOrg,
      isAdmin: membership?.role === 'admin' || membership?.is_owner === true,
    }}>
      {children}
    </TenantContext.Provider>
  );
}

export const useTenant = () => {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used within TenantProvider');
  return ctx;
};
