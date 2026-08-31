import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminSignup } from '../api';
import { useAuth } from '../context/AuthContext';
import AuthSplitLayout, {
  authButtonClass,
  authButtonStyle,
  authInputClass,
  authInputStyle,
} from '../components/AuthSplitLayout';
import { ROUTES } from '../routes/paths';

export default function Signup() {
  const navigate = useNavigate();
  const { markAuthenticated } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await adminSignup(username, password);
      markAuthenticated();
      navigate(ROUTES.dashboard, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthSplitLayout
      title="setup"
      subtitle="Create the first admin account to get started"
      signupLink={{ to: ROUTES.login, label: 'sign in' }}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="text"
          className={authInputClass}
          style={authInputStyle}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Admin username"
          required
          autoComplete="username"
        />

        <input
          type="password"
          className={authInputClass}
          style={authInputStyle}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password (min 6 characters)"
          required
          minLength={6}
          autoComplete="new-password"
        />

        <input
          type="password"
          className={authInputClass}
          style={authInputStyle}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirm password"
          required
          autoComplete="new-password"
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
          {loading ? 'Creating...' : 'Create Account'}
        </button>
      </form>
    </AuthSplitLayout>
  );
}
