import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { getStoredUser } from '../api';
import { canAccessModule, getDefaultRoute, getModuleKeyForPath } from '../utils/access';

export default function ModuleRoute({ moduleKey }) {
  const user = getStoredUser();
  const location = useLocation();
  const key = moduleKey || getModuleKeyForPath(location.pathname);

  if (!canAccessModule(user, key)) {
    return <Navigate to={getDefaultRoute(user)} replace />;
  }

  return <Outlet />;
}
