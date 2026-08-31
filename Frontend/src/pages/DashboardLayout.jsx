import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { fetchMe, getStoredUser } from '../api';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';
import DashboardHeader from '../components/DashboardHeader';
import { ROUTES, ROUTE_TITLES } from '../routes/paths';

export default function DashboardLayout() {
  const [user, setUser] = useState(getStoredUser());
  const [headerActions, setHeaderActions] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { logout: authLogout } = useAuth();

  useEffect(() => {
    let active = true;

    fetchMe()
      .then((result) => {
        if (active) setUser(result.data);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [location.pathname]);

  function handleLogout() {
    authLogout();
    navigate(ROUTES.login, { replace: true });
  }

  const title = ROUTE_TITLES[location.pathname] || 'Dashboard';
  const fullBleed = location.pathname === ROUTES.map;
  const isDashboard = location.pathname === ROUTES.dashboard;
  const isSweeper = location.pathname === ROUTES.sweeperMonitoring;

  return (
    <Layout
      user={user}
      onLogout={handleLogout}
      title={title}
      fullBleed={fullBleed}
      hideVehicleBanner={isDashboard || isSweeper}
      headerContent={
        isDashboard ? (
          <DashboardHeader user={user} headerActions={headerActions} />
        ) : undefined
      }
    >
      <Outlet context={{ setHeaderActions }} />
    </Layout>
  );
}
