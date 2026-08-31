import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { login } from '../api';
import { useAuth } from '../context/AuthContext';
import AuthSplitLayout, {
  authButtonClass,
  authButtonStyle,
  authInputClass,
  authInputStyle,
} from '../components/AuthSplitLayout';
import { ROUTES } from '../routes/paths';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { markAuthenticated } = useAuth();
  const from = location.state?.from?.pathname || ROUTES.dashboard;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(username, password);
      markAuthenticated();
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthSplitLayout
      title="welcome"
      subtitle="Login to your account to continue"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          className={authInputClass}
          style={authInputStyle}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          required
          autoComplete="username"
        />

        <input
          type="password"
          className={authInputClass}
          style={authInputStyle}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          required
          autoComplete="current-password"
        />

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          className={authButtonClass}
          style={authButtonStyle}
          disabled={loading}
        >
          {loading ? 'Logging in...' : 'Log In'}
        </button>
      </form>
    </AuthSplitLayout>
  );
}
