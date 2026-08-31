import { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  fetchAnalyticsDashboard,
  fetchAnalyticsVehicleInfo,
  fetchMe,
  fetchSavedAnalytics,
  fetchSavedVehicles,
  getStoredUser,
} from '../api';
import { AnalyticsBarChart, AnalyticsMetricCard } from '../components/AnalyticsCharts';
import { getStateClass } from '../components/VehicleCard';
import { ChartIcon, DatabaseIcon, MapIcon, TruckIcon } from '../components/Icons';
import { VehicleIcon } from '../components/VehicleIcons';
import { ROUTES } from '../routes/paths';
import { canAccessModule, getModuleKeyForPath } from '../utils/access';
import {
  formatDistance,
  formatDuration,
  formatRangeLabel,
  getDefaultAnalyticsRange,
} from '../utils/analyticsUtils';
import { PURPLE } from '../utils/vehicleUtils';

function StatCard({ label, value, icon: Icon, gradient, loading }) {
  return (
    <div className={`relative overflow-hidden rounded-xl border border-white/60 p-4 shadow-sm sm:rounded-2xl sm:p-5 ${gradient}`}>
      <div className="absolute -right-3 -top-3 h-16 w-16 rounded-full bg-white/20 sm:h-20 sm:w-20" />
      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-white/80 sm:text-xs">{label}</p>
          <p className="mt-1 text-2xl font-bold text-white sm:mt-2 sm:text-3xl">
            {loading ? '—' : value}
          </p>
        </div>
        <div className="rounded-lg bg-white/20 p-2 backdrop-blur-sm sm:rounded-xl sm:p-2.5">
          <Icon className="h-5 w-5 text-white sm:h-6 sm:w-6" />
        </div>
      </div>
    </div>
  );
}

function StatusBar({ label, count, total, color }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs sm:text-sm">
        <span className="font-medium text-gray-700">{label}</span>
        <span className="shrink-0 text-gray-500">{count} ({pct}%)</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const QUICK_LINK_META = {
  [ROUTES.liveVehicles]: { icon: TruckIcon, color: 'from-blue-500 to-blue-700' },
  [ROUTES.savedVehicles]: { icon: DatabaseIcon, color: 'from-violet-500 to-purple-700' },
  [ROUTES.map]: { icon: MapIcon, color: 'from-emerald-500 to-teal-700' },
  [ROUTES.analytics]: { icon: ChartIcon, color: 'from-orange-400 to-amber-600' },
  [ROUTES.reports]: { icon: ChartIcon, color: 'from-yellow-400 to-orange-500' },
};

export default function DashboardHome() {
  const { setHeaderActions } = useOutletContext() || {};
  const [user, setUser] = useState(getStoredUser());
  const isAdmin = user?.role === 'admin';
  const [vehicles, setVehicles] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchSavedVehicles();
      setVehicles(result.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAnalytics = useCallback(async (adminOverride) => {
    const adminView = adminOverride ?? user?.role === 'admin';
    setAnalyticsLoading(true);
    try {
      const vehicleResult = await fetchAnalyticsVehicleInfo();
      const info = vehicleResult.data || {};
      const ouids = Object.keys(info);

      if (ouids.length === 0) {
        setAnalytics(null);
        return;
      }

      const { start, end } = getDefaultAnalyticsRange();

      if (adminView) {
        try {
          const saved = await fetchSavedAnalytics({
            startTime: start,
            endTime: end,
            ouids,
          });
          if (saved.data) {
            setAnalytics({
              ...saved.data,
              startTime: start,
              endTime: end,
              ouids,
            });
            return;
          }
        } catch {
          // fall through to live fetch for full fleet
        }
      } else {
        try {
          const saved = await fetchSavedAnalytics({
            startTime: start,
            endTime: end,
            ouids,
          });
          if (saved.data) {
            setAnalytics({
              ...saved.data,
              startTime: start,
              endTime: end,
              ouids,
            });
            return;
          }
        } catch {
          // fall through to live fetch for user's vehicles only
        }
      }

      const dashboardResult = await fetchAnalyticsDashboard({
        startTime: start,
        endTime: end,
        ouids,
      });
      setAnalytics({
        ...dashboardResult.data,
        startTime: start,
        endTime: end,
        ouids,
      });
    } catch {
      setAnalytics(null);
    } finally {
      setAnalyticsLoading(false);
    }
  }, [user?.role]);

  useEffect(() => {
    async function init() {
      let currentUser = getStoredUser();
      try {
        const me = await fetchMe();
        if (me.data) {
          currentUser = me.data;
          setUser(me.data);
        }
      } catch {
        // keep stored user
      }
      load();
      loadAnalytics(currentUser?.role === 'admin');
    }
    init();
  }, [load, loadAnalytics]);

  useEffect(() => {
    if (!setHeaderActions) return undefined;

    setHeaderActions(
      <button
        type="button"
        onClick={() => {
          load();
          loadAnalytics(isAdmin);
        }}
        disabled={loading || analyticsLoading}
        className="w-full rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60 sm:w-auto sm:py-1.5"
      >
        {loading || analyticsLoading ? 'Refreshing...' : 'Refresh Data'}
      </button>
    );

    return () => setHeaderActions(null);
  }, [setHeaderActions, load, loadAnalytics, isAdmin, loading, analyticsLoading]);

  const distance = analytics?.distanceDTO || {};
  const duration = analytics?.durationDTO || {};

  const total = vehicles.length;
  const running = vehicles.filter((v) => /running|moving/i.test(v.state || '')).length;
  const idle = vehicles.filter((v) => /idle/i.test(v.state || '')).length;
  const off = vehicles.filter((v) => /off/i.test(v.state || '')).length;
  const active = vehicles.filter((v) => v.vehicleStatus === 'Active').length;

  const quickLinks = [
    { path: ROUTES.liveVehicles, label: 'Live Vehicles', desc: 'Real-time fleet tracking' },
    { path: ROUTES.savedVehicles, label: 'Saved Data', desc: 'Database stored records' },
    { path: ROUTES.map, label: 'Live Map', desc: 'Track on map' },
    { path: ROUTES.analytics, label: 'Analytics', desc: 'Mileage & duration insights' },
    { path: ROUTES.reports, label: 'Reports', desc: 'Fleet analytics' },
  ].filter((link) => canAccessModule(user, getModuleKeyForPath(link.path)));

  return (
    <div className="space-y-4 sm:space-y-6">
      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-3 py-3 text-sm text-red-700 sm:px-4">
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-5">
        <StatCard label={isAdmin ? 'Total Fleet' : 'Your Vehicles'} value={total} icon={TruckIcon} gradient="bg-gradient-to-br from-indigo-500 to-indigo-700" loading={loading} />
        <StatCard label="Active" value={active} icon={DatabaseIcon} gradient="bg-gradient-to-br from-green-500 to-emerald-700" loading={loading} />
        <StatCard label="Running" value={running} icon={TruckIcon} gradient="bg-gradient-to-br from-teal-500 to-cyan-700" loading={loading} />
        <StatCard label="Idle" value={idle} icon={ChartIcon} gradient="bg-gradient-to-br from-amber-400 to-orange-600" loading={loading} />
        <StatCard label="Ignition Off" value={off} icon={MapIcon} gradient="bg-gradient-to-br from-slate-500 to-gray-700" loading={loading} />
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm sm:rounded-2xl">
        <div className="flex flex-col gap-3 border-b border-gray-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            <h3 className="font-semibold text-black">
              {isAdmin ? 'Fleet Analytics' : 'Your Analytics'}
            </h3>
            <p className="text-xs text-gray-500">
              {isAdmin
                ? 'All vehicles · '
                : `${total} assigned vehicle${total === 1 ? '' : 's'} · `}
              {analytics?.startTime && analytics?.endTime
                ? formatRangeLabel(analytics.startTime, analytics.endTime)
                : 'Last 7 days mileage & duration'}
            </p>
          </div>
          {canAccessModule(user, 'analytics') && (
            <Link
              to={ROUTES.analytics}
              className="inline-flex w-full items-center justify-center rounded-lg px-3 py-2 text-xs font-semibold text-white sm:w-auto sm:py-1.5"
              style={{ backgroundColor: PURPLE }}
            >
              Open Analytics →
            </Link>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 p-3 sm:p-4 xl:grid-cols-2">
          <div className="space-y-4">
            <AnalyticsBarChart
              title="Mileage"
              data={distance.graphData}
              unit=" km"
              maxValue={distance.graphMaxValue}
            />
            <AnalyticsMetricCard
              title="Distance Travelled"
              value={formatDistance(distance.totalDistance)}
              comparison={distance.distanceComparision}
              lastLabel="Last Distance Travelled"
              lastValue={formatDistance(distance.lastTotalDistance)}
              loading={analyticsLoading}
            />
          </div>

          <div className="space-y-4">
            <AnalyticsBarChart
              title="Duration"
              data={duration.graphData}
              unit=" hr"
              maxValue={duration.graphMaxValue}
            />
            <AnalyticsMetricCard
              title="Total Duration"
              value={formatDuration(duration.totalDuration)}
              comparison={duration.comparision}
              lastLabel="Last Duration"
              lastValue={formatDuration(duration.lastDuration)}
              loading={analyticsLoading}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm sm:rounded-2xl">
            <div
              className="flex flex-col gap-3 px-4 py-4 text-white sm:flex-row sm:items-center sm:justify-between sm:px-5"
              style={{ backgroundColor: PURPLE }}
            >
              <div className="min-w-0">
                <h3 className="font-semibold">
                  {isAdmin ? 'Recent Vehicles' : 'Your Vehicles'}
                </h3>
                <p className="text-xs text-white/70">
                  {isAdmin ? 'Latest saved fleet data' : 'Your assigned machines'}
                </p>
              </div>
              <Link
                to={ROUTES.savedVehicles}
                className="inline-flex w-full items-center justify-center rounded-lg bg-white/15 px-3 py-2 text-xs font-semibold backdrop-blur-sm transition hover:bg-white/25 sm:w-auto sm:py-1.5"
              >
                View All →
              </Link>
            </div>

            {loading ? (
              <div className="flex items-center justify-center p-10 text-gray-400 sm:p-12">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-purple-600" />
              </div>
            ) : vehicles.length === 0 ? (
              <div className="p-8 text-center sm:p-10">
                <TruckIcon className="mx-auto h-10 w-10 text-gray-300" />
                <p className="mt-3 text-sm text-gray-500">
                  {user?.role === 'admin'
                    ? 'No saved data yet. Open Live Vehicles to sync.'
                    : 'No vehicle data for your account.'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {vehicles.slice(0, 6).map((v) => (
                  <div
                    key={v.ouid}
                    className="flex flex-col gap-3 px-4 py-4 transition hover:bg-gray-50 sm:flex-row sm:items-center sm:gap-4 sm:px-5"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-50 sm:h-11 sm:w-11">
                        <VehicleIcon vehicleType={v.vehicleType} showBg className="h-5 w-5 sm:h-6 sm:w-6" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-black">{v.vehicleNo}</p>
                        <p className="truncate text-xs capitalize text-gray-500">
                          {v.vehicleType || 'Vehicle'} · {v.address || 'No address'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:block sm:shrink-0 sm:text-right">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${getStateClass(v.state)}`}>
                        {v.state || 'Unknown'}
                      </span>
                      <p className="text-[0.65rem] text-gray-400 sm:mt-1">{v.lu || '--'}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4 sm:space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:rounded-2xl sm:p-5">
            <h3 className="font-semibold text-black">
              {isAdmin ? 'Fleet Status' : 'Your Fleet Status'}
            </h3>
            <p className="mb-4 text-xs text-gray-500">
              {isAdmin ? 'Distribution overview' : 'Your vehicles overview'}
            </p>
            <div className="space-y-4">
              <StatusBar label="Running" count={running} total={total} color="bg-green-500" />
              <StatusBar label="Idle" count={idle} total={total} color="bg-yellow-400" />
              <StatusBar label="Ignition Off" count={off} total={total} color="bg-gray-400" />
              <StatusBar label="Active" count={active} total={total} color="bg-blue-500" />
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:rounded-2xl sm:p-5">
            <h3 className="font-semibold text-black">Quick Access</h3>
            <p className="mb-4 text-xs text-gray-500">Jump to modules</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
              {quickLinks.map((link) => {
                const meta = QUICK_LINK_META[link.path] || { icon: TruckIcon, color: 'from-gray-500 to-gray-700' };
                const Icon = meta.icon;
                return (
                  <Link
                    key={link.path}
                    to={link.path}
                    className="group flex items-center gap-3 rounded-xl border border-gray-100 p-3 transition hover:border-gray-200 hover:shadow-md"
                  >
                    <div className={`rounded-xl bg-gradient-to-br ${meta.color} p-2.5 text-white shadow-sm`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-black group-hover:text-purple-700">
                        {link.label}
                      </p>
                      <p className="truncate text-xs text-gray-500">{link.desc}</p>
                    </div>
                    <span className="ml-auto text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-purple-500">
                      →
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
