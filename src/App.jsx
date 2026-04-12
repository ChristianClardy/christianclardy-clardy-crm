import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { ThemeProvider } from '@/lib/ThemeContext';
import Login from './pages/Login';
import SetPassword from './pages/SetPassword';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import CRM from './pages/CRM';
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
import DocuSignCallback from './pages/DocuSignCallback';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

// Detect invite link synchronously before Supabase clears the hash
const isInviteFlow = (() => {
  try {
    const params = new URLSearchParams(window.location.hash.slice(1));
    return params.get('type') === 'invite';
  } catch {
    return false;
  }
})();

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, isAuthenticated, authError, navigateToLogin } = useAuth();

  // Invite link clicked — show password-set screen regardless of auth state
  if (isInviteFlow) return <SetPassword />;

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Not authenticated — send to login (but allow the login page itself to render)
  if (!isLoadingAuth && !isAuthenticated) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
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
      <Route path="/DocuSignCallback" element={<DocuSignCallback />} />
      <Route path="/lead-form" element={<PublicLeadForm />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <AuthenticatedApp />
          </Router>
          <Toaster />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App