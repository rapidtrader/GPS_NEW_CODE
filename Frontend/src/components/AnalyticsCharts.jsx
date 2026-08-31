import {
  formatComparison,
  getYAxisSteps,
  normalizeGraphData,
} from '../utils/analyticsUtils';

export function AnalyticsBarChart({ title, data, unit, maxValue }) {
  const points = normalizeGraphData(data);
  const peak = maxValue || Math.max(...points.map((p) => p.value), 0);
  const ySteps = getYAxisSteps(peak);
  const chartMax = ySteps[ySteps.length - 1] || 1;

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-3 py-3 sm:px-4">
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
      </div>
      <div className="bg-black p-3 sm:p-4">
        <div className="flex h-44 gap-2 sm:h-56 sm:gap-3">
          <div className="flex w-8 shrink-0 flex-col justify-between py-1 text-[0.6rem] text-gray-400 sm:w-10 sm:text-[0.65rem]">
            {[...ySteps].reverse().map((step) => (
              <span key={step}>{step}{unit}</span>
            ))}
          </div>
          <div className="relative flex-1">
            <div className="absolute inset-0 flex flex-col justify-between">
              {ySteps.map((step) => (
                <div key={step} className="border-t border-white/10" />
              ))}
            </div>
            <div className="relative flex h-full items-end justify-around gap-2 px-1">
              {points.length === 0 ? (
                <div className="flex flex-1 items-center justify-center text-xs text-gray-500">
                  No chart data for selected range
                </div>
              ) : (
                points.map((point, index) => {
                  const height = chartMax > 0 ? Math.max((point.value / chartMax) * 100, 4) : 4;
                  return (
                    <div key={`${point.label}-${index}`} className="flex h-full flex-1 flex-col items-center justify-end">
                      <div
                        className="w-full max-w-8 rounded-t-sm bg-gradient-to-t from-lime-500 to-cyan-400"
                        style={{ height: `${height}%` }}
                        title={`${point.label}: ${point.value}${unit}`}
                      />
                      <span className="mt-2 max-w-[2.75rem] truncate text-[0.5rem] text-gray-400 sm:max-w-[3.5rem] sm:text-[0.55rem]">
                        {point.label}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AnalyticsMetricCard({ title, value, comparison, lastLabel, lastValue, loading }) {
  const negative = Number(comparison) < 0;

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-4 sm:px-5">
      <h3 className="text-sm font-bold text-gray-900">{title}</h3>
      <p className="mt-2 text-3xl font-bold text-orange-500 sm:mt-3 sm:text-4xl">
        {loading ? '—' : value}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs sm:text-sm">
        <span className={`inline-flex items-center gap-1 font-semibold ${negative ? 'text-red-500' : 'text-green-600'}`}>
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
            {negative ? (
              <path d="M10 14l-4-4h8l-4 4z" />
            ) : (
              <path d="M10 6l4 4H6l4-4z" />
            )}
          </svg>
          {loading ? '—' : formatComparison(comparison)}
        </span>
        <span className="text-gray-500">
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-gray-400" />
          {lastLabel} {loading ? '—' : lastValue}
        </span>
      </div>
    </div>
  );
}
