import { Navigate, Outlet } from 'react-router-dom';
import { getStoredUser } from '../api';
import { ROUTES } from '../routes/paths';

export default function AdminRoute() {
  const user = getStoredUser();

  if (user?.role !== 'admin') {
    return <Navigate to={ROUTES.dashboard} replace />;
  }

  return <Outlet />;
}
