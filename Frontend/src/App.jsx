import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoginRoute from './components/LoginRoute';
import SignupRoute from './components/SignupRoute';
import CatchAllRoute from './components/CatchAllRoute';
import AdminRoute from './components/AdminRoute';
import ModuleRoute from './components/ModuleRoute';
import DashboardLayout from './pages/DashboardLayout';
import DashboardHome from './pages/DashboardHome';
import LiveVehicles from './pages/LiveVehicles';
import SavedVehicles from './pages/SavedVehicles';
import VehicleDetails from './pages/VehicleDetails';
import DriverList from './pages/DriverList';
import Reports from './pages/Reports';
import Analytics from './pages/Analytics';
import LiveMap from './pages/LiveMap';
import SweeperMonitoring from './pages/SweeperMonitoring';
import DistanceReport from './pages/DistanceReport';
import VehicleHistory from './pages/VehicleHistory';
import UserManagement from './pages/UserManagement';
import ProjectList from './pages/ProjectList';
import ProjectDetails from './pages/ProjectDetails';
import { ROUTES } from './routes/paths';

function AppRoutes() {
  return (
    <Routes>
      <Route path={ROUTES.login} element={<LoginRoute />} />
      <Route path={ROUTES.signup} element={<SignupRoute />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          <Route element={<ModuleRoute moduleKey="dashboard" />}>
            <Route index element={<DashboardHome />} />
          </Route>
          <Route element={<ModuleRoute moduleKey="savedVehicles" />}>
            <Route path={ROUTES.savedVehicles} element={<SavedVehicles />} />
          </Route>
          <Route element={<ModuleRoute moduleKey="vehicleDetails" />}>
            <Route path={ROUTES.vehicleDetails} element={<VehicleDetails />} />
          </Route>
          <Route element={<ModuleRoute moduleKey="driverList" />}>
            <Route path={ROUTES.driverList} element={<DriverList />} />
          </Route>
          <Route element={<ModuleRoute moduleKey="reports" />}>
            <Route path={ROUTES.reports} element={<Reports />} />
          </Route>
          <Route element={<ModuleRoute moduleKey="analytics" />}>
            <Route path={ROUTES.analytics} element={<Analytics />} />
          </Route>
          <Route element={<ModuleRoute moduleKey="map" />}>
            <Route path={ROUTES.map} element={<LiveMap />} />
          </Route>
          <Route element={<ModuleRoute moduleKey="sweeperMonitoring" />}>
            <Route path={ROUTES.sweeperMonitoring} element={<SweeperMonitoring />} />
          </Route>
          <Route element={<ModuleRoute moduleKey="distanceReports" />}>
            <Route path={ROUTES.distanceReport} element={<DistanceReport />} />
          </Route>
          <Route element={<ModuleRoute moduleKey="vehicleHistory" />}>
            <Route path={ROUTES.vehicleHistory} element={<VehicleHistory />} />
          </Route>
          <Route element={<AdminRoute />}>
            <Route element={<ModuleRoute moduleKey="liveVehicles" />}>
              <Route path={ROUTES.liveVehicles} element={<LiveVehicles />} />
            </Route>
            <Route element={<ModuleRoute moduleKey="users" />}>
              <Route path={ROUTES.users} element={<UserManagement />} />
            </Route>
            <Route element={<ModuleRoute moduleKey="projects" />}>
              <Route path={ROUTES.projects} element={<ProjectList />} />
              <Route path={ROUTES.projectDetail} element={<ProjectDetails />} />
            </Route>
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<CatchAllRoute />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
