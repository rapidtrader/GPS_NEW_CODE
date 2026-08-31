import { NavLink } from 'react-router-dom';
import {
  HomeIcon,
  TruckIcon,
  DatabaseIcon,
  UsersIcon,
  ChartIcon,
  MapIcon,
  LogoutIcon,
  ClipboardIcon,
  DriverIcon,
  CloseIcon,
  BroomIcon,
  RouteIcon,
} from './Icons';
import { ROUTES } from '../routes/paths';
import { canAccessModule } from '../utils/access';
import { PURPLE } from '../utils/vehicleUtils';

const modules = [
  {
    path: ROUTES.dashboard,
    moduleKey: 'dashboard',
    label: 'Dashboard',
    icon: HomeIcon,
    end: true,
    idleIcon: 'bg-gradient-to-br from-indigo-50 to-violet-100 text-indigo-600',
    activeIcon: 'bg-white/20 text-white shadow-inner',
  },
  {
    path: ROUTES.liveVehicles,
    moduleKey: 'liveVehicles',
    label: 'Live Vehicles',
    icon: TruckIcon,
    idleIcon: 'bg-gradient-to-br from-sky-50 to-blue-100 text-blue-600',
    activeIcon: 'bg-white/20 text-white shadow-inner',
  },
  {
    path: ROUTES.savedVehicles,
    moduleKey: 'savedVehicles',
    label: 'Saved Data',
    icon: DatabaseIcon,
    idleIcon: 'bg-gradient-to-br from-emerald-50 to-teal-100 text-emerald-600',
    activeIcon: 'bg-white/20 text-white shadow-inner',
  },
  {
    path: ROUTES.vehicleDetails,
    moduleKey: 'vehicleDetails',
    label: 'Vehicle Details',
    icon: ClipboardIcon,
    idleIcon: 'bg-gradient-to-br from-violet-50 to-purple-100 text-violet-600',
    activeIcon: 'bg-white/20 text-white shadow-inner',
  },
  {
    path: ROUTES.driverList,
    moduleKey: 'driverList',
    label: 'Driver List',
    icon: DriverIcon,
    idleIcon: 'bg-gradient-to-br from-cyan-50 to-sky-100 text-cyan-600',
    activeIcon: 'bg-white/20 text-white shadow-inner',
  },
  {
    path: ROUTES.analytics,
    moduleKey: 'analytics',
    label: 'Analytics',
    icon: ChartIcon,
    idleIcon: 'bg-gradient-to-br from-amber-50 to-orange-100 text-amber-600',
    activeIcon: 'bg-white/20 text-white shadow-inner',
  },
  {
    path: ROUTES.map,
    moduleKey: 'map',
    label: 'Live Map',
    icon: MapIcon,
    idleIcon: 'bg-gradient-to-br from-rose-50 to-pink-100 text-rose-600',
    activeIcon: 'bg-white/20 text-white shadow-inner',
  },
  {
    path: ROUTES.sweeperMonitoring,
    moduleKey: 'sweeperMonitoring',
    label: 'Sweeper Monitoring',
    icon: BroomIcon,
    idleIcon: 'bg-gradient-to-br from-lime-50 to-green-100 text-green-700',
    activeIcon: 'bg-white/20 text-white shadow-inner',
  },
  {
    path: ROUTES.distanceReport,
    moduleKey: 'distanceReports',
    label: 'Distance Report',
    icon: RouteIcon,
    idleIcon: 'bg-gradient-to-br from-blue-50 to-cyan-100 text-blue-600',
    activeIcon: 'bg-white/20 text-white shadow-inner',
  },
  {
    path: ROUTES.users,
    moduleKey: 'users',
    label: 'User Management',
    icon: UsersIcon,
    idleIcon: 'bg-gradient-to-br from-purple-50 to-fuchsia-100 text-purple-600',
    activeIcon: 'bg-white/20 text-white shadow-inner',
  },
];

function SidebarIcon({ Icon, active, idleIcon, activeIcon }) {
  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm transition-all duration-200 ${
        active ? activeIcon : `${idleIcon} ring-1 ring-black/5`
      }`}
    >
      <Icon className="h-[1.15rem] w-[1.15rem]" strokeWidth={active ? 2 : 1.75} />
    </span>
  );
}

export default function Sidebar({ user, onLogout, mobileOpen = false, onClose }) {
  const visibleModules = modules.filter((m) => canAccessModule(user, m.moduleKey));

  function handleLogout() {
    onClose?.();
    onLogout();
  }

  return (
    <aside
      className={`group fixed inset-y-0 left-0 z-[2000] flex h-screen w-72 flex-col overflow-hidden border-r border-gray-200/80 bg-gradient-to-b from-white to-gray-50/80 shadow-xl transition-transform duration-300 ease-out lg:static lg:z-30 lg:w-[4.25rem] lg:shadow-none lg:transition-[width,box-shadow] lg:duration-300 lg:ease-out lg:hover:w-64 lg:hover:shadow-xl ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}
    >
      <div className="border-b border-gray-200/80 px-4 py-4 lg:px-3 lg:py-5 lg:group-hover:px-5">
        <div className="flex items-center justify-between gap-3 lg:justify-center lg:group-hover:justify-start">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-md"
              style={{ background: `linear-gradient(135deg, ${PURPLE}, #6b4d8a)` }}
            >
              <TruckIcon className="h-5 w-5" strokeWidth={2} />
            </div>
            <div className="min-w-0 lg:max-w-0 lg:overflow-hidden lg:opacity-0 lg:transition-all lg:duration-300 lg:group-hover:max-w-[11rem] lg:group-hover:opacity-100">
              <h1 className="truncate text-base font-bold tracking-tight text-gray-900">GPS Tracking</h1>
              <p className="text-[0.65rem] font-medium uppercase tracking-wider text-gray-400">
                Findpath Fleet
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 lg:hidden"
            aria-label="Close menu"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 lg:px-2 lg:group-hover:px-3">
        <p className="mb-3 px-1 text-[0.65rem] font-bold uppercase tracking-[0.15em] text-gray-400 lg:mb-0 lg:max-h-0 lg:overflow-hidden lg:opacity-0 lg:transition-all lg:duration-300 lg:group-hover:mb-3 lg:group-hover:max-h-8 lg:group-hover:opacity-100">
          Modules
        </p>
        <ul className="space-y-1.5">
          {visibleModules.map(({ path, label, icon: Icon, end, idleIcon, activeIcon }) => (
            <li key={path}>
              <NavLink
                to={path}
                end={end}
                title={label}
                onClick={onClose}
                className={({ isActive }) =>
                  `group/link flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-medium transition-all duration-200 lg:justify-center lg:gap-0 lg:px-1.5 lg:group-hover:justify-start lg:group-hover:gap-3 lg:group-hover:px-2.5 ${
                    isActive
                      ? 'text-white shadow-md'
                      : 'text-gray-700 hover:bg-white hover:shadow-sm'
                  }`
                }
                style={({ isActive }) =>
                  isActive ? { background: `linear-gradient(135deg, ${PURPLE}, #5a3d72)` } : undefined
                }
              >
                {({ isActive }) => (
                  <>
                    <SidebarIcon
                      Icon={Icon}
                      active={isActive}
                      idleIcon={idleIcon}
                      activeIcon={activeIcon}
                    />
                    <span
                      className={`truncate max-w-none opacity-100 lg:max-w-0 lg:overflow-hidden lg:opacity-0 lg:transition-all lg:duration-300 lg:ease-out lg:group-hover:max-w-[11rem] lg:group-hover:opacity-100 ${
                        isActive ? 'font-semibold' : 'group-hover/link:text-gray-900'
                      }`}
                    >
                      {label}
                    </span>
                    {isActive && (
                      <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-white/90 shadow-sm lg:max-w-0 lg:overflow-hidden lg:opacity-0 lg:group-hover:max-w-[0.375rem] lg:group-hover:opacity-100" />
                    )}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-auto shrink-0 border-t border-gray-200/80 p-4 lg:p-2 lg:group-hover:p-4">
        <div className="mb-3 rounded-xl border border-gray-100 bg-white px-3 py-3 shadow-sm lg:mb-2 lg:border-transparent lg:bg-transparent lg:px-0 lg:py-0 lg:shadow-none lg:group-hover:mb-3 lg:group-hover:border-gray-100 lg:group-hover:bg-white lg:group-hover:px-3 lg:group-hover:py-3 lg:group-hover:shadow-sm">
          <div className="flex items-center gap-2.5 lg:justify-center lg:group-hover:justify-start">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gray-100 to-gray-200 text-sm font-bold text-gray-600">
              {(user?.username || 'U').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 lg:max-w-0 lg:overflow-hidden lg:opacity-0 lg:transition-all lg:duration-300 lg:group-hover:max-w-[11rem] lg:group-hover:opacity-100">
              <p className="truncate text-sm font-semibold text-gray-900">{user?.username}</p>
              <p className="text-[0.65rem] font-bold uppercase tracking-wider text-purple-600">
                {user?.role}
              </p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          title="Logout"
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:border-gray-300 hover:bg-gray-50 hover:shadow lg:gap-0 lg:group-hover:gap-2"
        >
          <LogoutIcon className="h-[1.15rem] w-[1.15rem] shrink-0" strokeWidth={1.75} />
          <span className="lg:max-w-0 lg:overflow-hidden lg:opacity-0 lg:transition-all lg:duration-300 lg:group-hover:max-w-[11rem] lg:group-hover:opacity-100">
            Logout
          </span>
        </button>
      </div>
    </aside>
  );
}

export function MobileMenuButton({ onOpen, className = '' }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 shadow-sm transition hover:bg-gray-50 lg:hidden ${className}`}
      aria-label="Open menu"
    >
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
      </svg>
    </button>
  );
}
