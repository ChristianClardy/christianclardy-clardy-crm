import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { setCurrentOrgId } from '@/api/base44Client';

const TenantContext = createContext(null);

export function TenantProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  const [organization, setOrganization]     = useState(null);
  const [membership, setMembership]         = useState(null);
  const [loading, setLoading]               = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  const loadOrg = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoading(true);
    try {
      // Step 1: get membership row
      const { data: mem, error: memErr } = await supabase
        .from('organization_members')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();

      if (memErr || !mem?.organization_id) {
        setOrganization(null);
        setMembership(null);
        setCurrentOrgId(null);
        setNeedsOnboarding(true);
        return;
      }

      // Step 2: get org details separately (avoids needing a FK constraint)
      const { data: org, error: orgErr } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', mem.organization_id)
        .maybeSingle();

      if (orgErr || !org) {
        setOrganization(null);
        setMembership(null);
        setCurrentOrgId(null);
        setNeedsOnboarding(true);
        return;
      }

      setOrganization(org);
      setMembership(mem);
      setCurrentOrgId(mem.organization_id);
      setNeedsOnboarding(false);
    } catch {
      setNeedsOnboarding(true);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (isAuthenticated && user?.id) {
      loadOrg();
    } else {
      setLoading(false);
    }
  }, [isAuthenticated, user?.id, loadOrg]);

  return (
    <TenantContext.Provider value={{
      organization,
      membership,
      loading,
      needsOnboarding,
      reload: loadOrg,
      isAdmin: membership?.role === 'admin',
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
