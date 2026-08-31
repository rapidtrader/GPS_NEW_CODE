import { Navigate } from 'react-router-dom';
import Login from '../pages/Login';
import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../routes/paths';

function AuthLoading() {
  return (
    <div
      className="flex min-h-dvh items-center justify-center p-6"
      style={{ background: 'linear-gradient(145deg, #0f4d3c, #1a7a5e)' }}
    >
      <div className="rounded-2xl bg-white/10 px-8 py-6 text-sm font-medium text-white backdrop-blur-sm">
        Loading...
      </div>
    </div>
  );
}

export default function LoginRoute() {
  const { ready, isAuthenticated, needsAdminSignup } = useAuth();

  if (!ready) return <AuthLoading />;

  if (isAuthenticated) {
    return <Navigate to={ROUTES.dashboard} replace />;
  }

  if (needsAdminSignup) {
    return <Navigate to={ROUTES.signup} replace />;
  }

  return <Login />;
}
