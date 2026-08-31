export function pad(n) {
  return String(n).padStart(2, '0');
}

export function formatDisplayDate(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '--';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatRangeLabel(startTime, endTime) {
  return `${formatDisplayDate(startTime)} - ${formatDisplayDate(endTime)}`;
}

export function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  return `${hours}H ${mins}M`;
}

export function formatDistance(km) {
  const value = Number(km) || 0;
  return `${value.toFixed(2)} km`;
}

export function formatComparison(value) {
  const num = Number(value) || 0;
  const sign = num > 0 ? '+' : '';
  return `${sign}${num.toFixed(2)}%`;
}

export function mapRankItems(list = [], vehicleMap = {}, valueKey = 'distance') {
  return (list || []).map((item) => ({
    ouid: item.ouid,
    vehicleNo: vehicleMap[item.ouid]?.vehicleNo || item.vehicleNo || item.ouid,
    value: item[valueKey] ?? item.distance ?? item.duration ?? item.fuel ?? item.value ?? 0,
  }));
}

export function mergeRankLists(...lists) {
  const seen = new Set();
  const merged = [];
  lists.flat().forEach((item) => {
    if (!item?.ouid || seen.has(item.ouid)) return;
    seen.add(item.ouid);
    merged.push(item);
  });
  return merged;
}

export function normalizeGraphData(graphData = []) {
  if (!Array.isArray(graphData)) return [];

  return graphData.map((point, index) => {
    if (typeof point === 'number') {
      return { label: `Day ${index + 1}`, value: point };
    }

    const rawValue =
      point.y ??
      point.yaxis ??
      point.value ??
      point.distance ??
      point.duration ??
      0;

    let label = point.x || point.label || point.dateStr || point.date || '';
    if (!label && (point.time || point.dateTime || point.timestamp)) {
      const ts = Number(point.time || point.dateTime || point.timestamp);
      if (!Number.isNaN(ts)) {
        const d = new Date(ts);
        label = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
      }
    }
    if (!label) label = `Day ${index + 1}`;

    return { label, value: Number(rawValue) || 0 };
  });
}

export function getYAxisSteps(maxValue, steps = 5) {
  if (maxValue <= 0) return [0, 50, 100, 150, 200, 250];
  const step = Math.ceil(maxValue / steps / 10) * 10 || 10;
  return Array.from({ length: steps + 1 }, (_, i) => i * step);
}

export function getDefaultAnalyticsRange() {
  const end = new Date();
  end.setHours(23, 59, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  return { start: start.getTime(), end: end.getTime() };
}
