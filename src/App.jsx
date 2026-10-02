import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { TenantProvider, useTenant } from '@/lib/TenantContext';
import { ThemeProvider } from '@/lib/ThemeContext';
import Onboarding from './pages/Onboarding';
import Login from './pages/Login';
import SetPassword from './pages/SetPassword';
import JoinPortal from './pages/JoinPortal';
import { EulaPage, PrivacyPage } from './pages/LegalPage';
import QuickBooksDisconnected from './pages/QuickBooksDisconnected';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import CRM from './pages/CRM';
import CRMDashboard from './components/crm/CRMDashboard';
import PipelineView from './components/crm/PipelineView';
import ContactsView from './components/crm/ContactsView';
import CompaniesView from './components/crm/CompaniesView';
import ActivitiesView from './components/crm/ActivitiesView';
import Payments from './pages/Payments';
import Documents from './pages/Documents';
import SalesDashboard from './pages/SalesDashboard';
import OperationsDashboard from './pages/OperationsDashboard';
import FinanceDashboard from './pages/FinanceDashboard';
import ProjectManagerDashboard from './pages/ProjectManagerDashboard';
import Calendar from './pages/Calendar';
import LeadDetail from './pages/LeadDetail';
import PublicLeadForm from './pages/PublicLeadForm';
import InvoiceDesigner from './pages/InvoiceDesigner';
import Settings from './pages/Settings';
import MaterialLibraryPage from './pages/MaterialLibrary';
import DocuSignCallback from './pages/DocuSignCallback';
import DocuSignSenderReturn from './pages/DocuSignSenderReturn';
import BuilderPortal from './pages/BuilderPortal';
import Builder from './pages/Builder';
import CustomerPortal from './pages/CustomerPortal';
import { Home } from 'lucide-react';
import SubPortalLayout from './components/app/SubPortalLayout';
import ModuleGate from './components/app/ModuleGate';
import { usePortalUser } from '@/lib/portalUser';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

// Every staff page checks its role permission (src/lib/permissions.js).
const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}><ModuleGate page={currentPageName}>{children}</ModuleGate></Layout>
  : <ModuleGate page={currentPageName}>{children}</ModuleGate>;

// Detect invite link synchronously before Supabase clears the hash
const isInviteFlow = (() => {
  try {
    const params = new URLSearchParams(window.location.hash.slice(1));
    // invite = first invite email; magiclink = the sign-in link emailed when
    // access is restored (api/invite.js). Both get the password + install setup.
    return params.get('type') === 'invite' || params.get('type') === 'magiclink';
  } catch {
    return false;
  }
})();

// Subcontractor Portal link texted to a subcontractor. Captured at load because the
// page rewrites the URL to /BuilderPortal once they're signed in.
const isJoinFlow = window.location.pathname === '/join';

// Public pages (Intuit / DocuSign app listings link here): no sign-in.
const LEGAL_PAGES = {
  '/eula': EulaPage,
  '/terms': EulaPage,
  '/privacy': PrivacyPage,
  '/quickbooks/disconnected': QuickBooksDisconnected,
};

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, isAuthenticated, user } = useAuth();
  const { loading: tenantLoading, needsOnboarding } = useTenant();
  const { loading: portalLoading, portalUser, pmUser, customerUser, isStaff } = usePortalUser(isAuthenticated ? user?.id : null);

  const LegalPage = LEGAL_PAGES[window.location.pathname.replace(/\/$/, '').toLowerCase()];
  if (LegalPage) return <LegalPage />;

  // Invite link clicked — show password-set screen regardless of auth state
  if (isInviteFlow) return <SetPassword />;
  if (isJoinFlow) return <JoinPortal />;

  // Show loading spinner while checking auth or tenant
  if (isLoadingPublicSettings || isLoadingAuth || (isAuthenticated && (tenantLoading || portalLoading))) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Not authenticated — send to login
  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  // Subcontractor login — portal only, no CRM. Checked before onboarding
  // since subs never belong to an organization.
  if (portalUser) {
    return (
      <Routes>
        <Route path="*" element={<SubPortalApp portalUser={portalUser} />} />
      </Routes>
    );
  }

  // Project manager with a Builder Portal-only login: their jobs, no CRM or money.
  if (pmUser) {
    return (
      <Routes>
        <Route path="*" element={<PmPortalApp pmUser={pmUser} />} />
      </Routes>
    );
  }

  // Customer (homeowner) login: their own projects' payments, progress and
  // signed documents, nothing else.
  if (customerUser) {
    return (
      <Routes>
        <Route path="*" element={<CustomerPortalApp customerUser={customerUser} />} />
      </Routes>
    );
  }

  // Signed up on their own instead of being invited — no access to anything.
  if (!isStaff) return <NoAccess />;

  // Authenticated but no org — show onboarding
  if (needsOnboarding) {
    return <Onboarding />;
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={
        <LayoutWrapper currentPageName={mainPageKey}>
          <MainPage />
        </LayoutWrapper>
      } />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <Page />
            </LayoutWrapper>
          }
        />
      ))}
      <Route path="/CRM" element={<LayoutWrapper currentPageName="CRM"><CRM /></LayoutWrapper>} />
      <Route path="/Pipeline" element={<LayoutWrapper currentPageName="Pipeline"><PipelineView /></LayoutWrapper>} />
      <Route path="/CRMContacts" element={<LayoutWrapper currentPageName="CRMContacts"><ContactsView /></LayoutWrapper>} />
      <Route path="/CRMCompanies" element={<LayoutWrapper currentPageName="CRMCompanies"><CompaniesView /></LayoutWrapper>} />
      <Route path="/CRMActivities" element={<LayoutWrapper currentPageName="CRMActivities"><ActivitiesView /></LayoutWrapper>} />
      <Route path="/CRMDashboard" element={<LayoutWrapper currentPageName="CRMDashboard"><CRMDashboard /></LayoutWrapper>} />
      <Route path="/Payments" element={<LayoutWrapper currentPageName="Payments"><Payments /></LayoutWrapper>} />
      <Route path="/Documents" element={<LayoutWrapper currentPageName="Documents"><Documents /></LayoutWrapper>} />
      <Route path="/SalesDashboard" element={<LayoutWrapper currentPageName="SalesDashboard"><SalesDashboard /></LayoutWrapper>} />
      <Route path="/OperationsDashboard" element={<LayoutWrapper currentPageName="OperationsDashboard"><OperationsDashboard /></LayoutWrapper>} />
      <Route path="/FinanceDashboard" element={<LayoutWrapper currentPageName="FinanceDashboard"><FinanceDashboard /></LayoutWrapper>} />
      <Route path="/ProjectManagerDashboard" element={<LayoutWrapper currentPageName="ProjectManagerDashboard"><ProjectManagerDashboard /></LayoutWrapper>} />
      <Route path="/Calendar" element={<LayoutWrapper currentPageName="Calendar"><Calendar /></LayoutWrapper>} />
      <Route path="/LeadDetail" element={<LayoutWrapper currentPageName="CRM"><LeadDetail /></LayoutWrapper>} />
      <Route path="/InvoiceDesigner" element={<LayoutWrapper currentPageName="Payments"><InvoiceDesigner /></LayoutWrapper>} />
      <Route path="/Settings" element={<LayoutWrapper currentPageName="Settings"><Settings /></LayoutWrapper>} />
      <Route path="/MaterialLibrary" element={<LayoutWrapper currentPageName="MaterialLibrary"><MaterialLibraryPage /></LayoutWrapper>} />
      <Route path="/DocuSignCallback" element={<DocuSignCallback />} />
      <Route path="/DocuSignSenderReturn" element={<DocuSignSenderReturn />} />
      <Route path="/lead-form" element={<PublicLeadForm />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

const NoAccess = () => {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: "#f5f0eb", fontFamily: "'Georgia', serif" }}>
      <div className="max-w-sm text-center space-y-4">
        <h1 className="text-xl font-bold" style={{ color: "#3d3530" }}>No access yet</h1>
        <p className="text-sm" style={{ color: "#7a6e66" }}>
          {user?.email} isn't set up in Clardy. Ask your Principle Outdoor Living admin to send you an invite, then sign in with the link in that email.
        </p>
        <button onClick={() => logout()} className="text-sm font-semibold hover:underline" style={{ color: "#b5965a" }}>Sign out</button>
      </div>
    </div>
  );
};

const PmPortalApp = ({ pmUser }) => (
  <SubPortalLayout title="Builder Portal" subcontractorName={pmUser.full_name}>
    {pmUser.active ? (
      <Builder pm={pmUser} />
    ) : (
      <div className="max-w-md mx-auto p-8 text-center text-sm" style={{ color: "#7a6e66" }}>
        Your Builder Portal access has been turned off. Contact the Principle Outdoor Living office if you think this is a mistake.
      </div>
    )}
  </SubPortalLayout>
);

const CustomerPortalApp = ({ customerUser }) => (
  <SubPortalLayout title="Customer Portal" icon={Home} subcontractorName={customerUser.full_name}>
    {customerUser.active ? (
      <CustomerPortal customer={customerUser} />
    ) : (
      <div className="max-w-md mx-auto p-8 text-center text-sm" style={{ color: "#7a6e66" }}>
        Your Customer Portal access has been turned off. Contact Principle Outdoor Living if you think this is a mistake.
      </div>
    )}
  </SubPortalLayout>
);

const SubPortalApp = ({ portalUser }) => (
  <SubPortalLayout subcontractorName={portalUser.full_name}>
    {portalUser.active && portalUser.subcontractor_id ? (
      <BuilderPortal portal={portalUser} />
    ) : (
      <div className="max-w-md mx-auto p-8 text-center text-sm" style={{ color: "#7a6e66" }}>
        Your Subcontractor Portal access has been turned off. Contact your Principle Outdoor Living project manager if you think this is a mistake.
      </div>
    )}
  </SubPortalLayout>
);

function App() {

  return (
    <ThemeProvider>
      <AuthProvider>
        <TenantProvider>
          <QueryClientProvider client={queryClientInstance}>
            <Router>
              <AuthenticatedApp />
            </Router>
            <Toaster />
          </QueryClientProvider>
        </TenantProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App