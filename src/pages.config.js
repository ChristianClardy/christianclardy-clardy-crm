/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import CRM from './pages/CRM';
import ClientDetail from './pages/ClientDetail';
import Clients from './pages/Clients';
import Dashboard from './pages/Dashboard';
import Documents from './pages/Documents';
import EstimateDetail from './pages/EstimateDetail';
import Estimates from './pages/Estimates';
import FinanceDashboard from './pages/FinanceDashboard';
import Municipalities from './pages/Municipalities';
import MyTodos from './pages/MyTodos';
import OperationsDashboard from './pages/OperationsDashboard';
import Payments from './pages/Payments';
import ProjectDetail from './pages/ProjectDetail';
import ProjectManagerDashboard from './pages/ProjectManagerDashboard';
import Projects from './pages/Projects';
import Prospects from './pages/Prospects';
import Reports from './pages/Reports';
import SalesDashboard from './pages/SalesDashboard';
import Subcontractors from './pages/Subcontractors';
import TeamChat from './pages/TeamChat';
import WIPReport from './pages/WIPReport';
import WorkplaceItems from './pages/WorkplaceItems';
import __Layout from './Layout.jsx';


export const PAGES = {
    "CRM": CRM,
    "ClientDetail": ClientDetail,
    "Clients": Clients,
    "Dashboard": Dashboard,
    "Documents": Documents,
    "EstimateDetail": EstimateDetail,
    "Estimates": Estimates,
    "FinanceDashboard": FinanceDashboard,
    "Municipalities": Municipalities,
    "MyTodos": MyTodos,
    "OperationsDashboard": OperationsDashboard,
    "Payments": Payments,
    "ProjectDetail": ProjectDetail,
    "ProjectManagerDashboard": ProjectManagerDashboard,
    "Projects": Projects,
    "Prospects": Prospects,
    "Reports": Reports,
    "SalesDashboard": SalesDashboard,
    "Subcontractors": Subcontractors,
    "TeamChat": TeamChat,
    "WIPReport": WIPReport,
    "WorkplaceItems": WorkplaceItems,
}

export const pagesConfig = {
    mainPage: "Dashboard",
    Pages: PAGES,
    Layout: __Layout,
};