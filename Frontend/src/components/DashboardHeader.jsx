import { Link } from 'react-router-dom';
import { getUserDisplayName } from '../api';
import { ROUTES } from '../routes/paths';
import { canAccessModule } from '../utils/access';

function HeaderChip({ children }) {
  return (
    <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-blue-200">
      {children}
    </span>
  );
}

export default function DashboardHeader({ user, headerActions }) {
  const isAdmin = user?.role === 'admin';
  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-gray-400 sm:text-xs">
          {isAdmin ? 'Fleet Dashboard' : 'Your Dashboard'}
        </p>
        <h2 className="mt-0.5 text-lg font-bold leading-tight text-black sm:text-xl">
          Welcome, {getUserDisplayName(user)}!
        </h2>
        {user?.phoneNumber && (
          <p className="mt-0.5 text-sm text-gray-500">{user.phoneNumber}</p>
        )}
        <p className="mt-1 text-xs text-gray-500 sm:text-sm">{today}</p>
        {user?.role === 'user' && user.vehicleAccess?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {user.vehicleAccess.map((vehicleNo) => (
              <HeaderChip key={vehicleNo}>{vehicleNo}</HeaderChip>
            ))}
          </div>
        )}
      </div>

      <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
        {headerActions}
        {canAccessModule(user, 'map') && (
          <Link
            to={ROUTES.map}
            className="inline-flex w-full items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-black transition hover:bg-gray-50 sm:w-auto sm:py-1.5"
          >
            Open Map
          </Link>
        )}
      </div>
    </div>
  );
}
