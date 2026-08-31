import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../routes/paths';

const PUBLIC_PATHS = new Set([ROUTES.login, ROUTES.signup]);

export default function CatchAllRoute() {
  const { ready, isAuthenticated } = useAuth();
  const location = useLocation();

  if (!ready) return null;

  if (PUBLIC_PATHS.has(location.pathname)) {
    return null;
  }

  return (
    <Navigate
      to={isAuthenticated ? ROUTES.dashboard : ROUTES.login}
      replace
    />
  );
}
