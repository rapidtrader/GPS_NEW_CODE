/**
 * sweepingPlanService.js
 *
 * Core scheduling logic:
 *   1. Frequency check — is a road scheduled on a given date?
 *   2. getScheduledRoads — filter active roads by frequency
 *   3. assignRoadsToMachines — distribute roads across machines (capacity-aware)
 *
 * IMPORTANT: This service NEVER modifies road.gpsPoints or road.routeGeometry.
 * Only Machine Daily Road Sequence is produced here.
 */

// ── Date helpers ───────────────────────────────────────────────────────────────

/**
 * Parse a YYYY-MM-DD string to a UTC midnight Date, avoiding local-timezone shifts.
 */
function parsePlanDate(dateStr) {
  // dateStr expected: "YYYY-MM-DD"
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Return lowercase weekday name for a UTC date.
 * e.g. "monday", "tuesday", ...
 */
function utcWeekdayName(date) {
  const names = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return names[date.getUTCDay()];
}

/**
 * Number of calendar days between two UTC midnight Dates (absolute).
 */
function daysDiff(dateA, dateB) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round(Math.abs(dateA.getTime() - dateB.getTime()) / msPerDay);
}

// ── Frequency check ────────────────────────────────────────────────────────────

/**
 * isRoadScheduled(road, planDateStr) → boolean
 *
 * @param {object} road  - Road document (plain object with sweepingFrequency)
 * @param {string} planDateStr - "YYYY-MM-DD"
 */
function isRoadScheduled(road, planDateStr) {
  const freq = road.sweepingFrequency;
  if (!freq) return false;

  const planDate = parsePlanDate(planDateStr);

  switch (freq.type) {
    case 'daily':
      return true;

    case 'alternate': {
      if (!freq.startDate) return false;
      // startDate stored as Date in MongoDB — convert to UTC midnight
      const start = new Date(freq.startDate);
      const startUtc = new Date(Date.UTC(
        start.getUTCFullYear(),
        start.getUTCMonth(),
        start.getUTCDate()
      ));
      const diff = daysDiff(startUtc, planDate);
      return diff % 2 === 0;
    }

    case 'specific': {
      if (!Array.isArray(freq.days) || freq.days.length === 0) return false;
      const weekday = utcWeekdayName(planDate);
      return freq.days.map((d) => d.toLowerCase()).includes(weekday);
    }

    default:
      return false;
  }
}

// ── Get scheduled roads ────────────────────────────────────────────────────────

/**
 * getScheduledRoads(allActiveRoads, planDateStr)
 * Returns roads that are scheduled on the given date.
 *
 * @param {Array}  allActiveRoads - active Road docs (lean objects) for the project
 * @param {string} planDateStr    - "YYYY-MM-DD"
 * @returns {Array} roads sorted by totalLength desc
 */
function getScheduledRoads(allActiveRoads, planDateStr) {
  const scheduled = allActiveRoads.filter((r) => isRoadScheduled(r, planDateStr));
  // Sort descending by length — helps pack machines more evenly (largest-first strategy)
  scheduled.sort((a, b) => b.totalLength - a.totalLength);
  return scheduled;
}

// ── Assignment algorithm ───────────────────────────────────────────────────────

/**
 * assignRoadsToMachines(scheduledRoads, activeMachines)
 *
 * Strategy: Largest-Road-First / Best-Fit
 *   Roads sorted by totalLength DESC.
 *   For each road, pick the machine with the most remaining capacity that can still
 *   fit the road. If no machine fits, assign to the machine with highest remaining
 *   capacity anyway (capacity exceeded flag will be set).
 *   Every scheduled road is always assigned — none are silently dropped.
 *
 * @param {Array} scheduledRoads  - road docs with totalLength
 * @param {Array} activeMachines  - machine docs with machineId, sweepingKmPerDay
 * @returns {Map<machineId, {machine, assignedRoads[]}>}
 */
function assignRoadsToMachines(scheduledRoads, activeMachines) {
  // Build mutable machine state
  const machineState = activeMachines.map((m) => ({
    machine: m,
    assignedRoads: [],       // {road, sequence}
    assignedKm: 0,
    remainingKm: m.sweepingKmPerDay,
  }));

  for (const road of scheduledRoads) {
    const km = road.totalLength;

    // Best-fit: machine where road fits AND remaining capacity is SMALLEST (tightest fit)
    // This prevents one machine from taking everything while others sit idle.
    let bestFit = null;
    let bestFitRemaining = Infinity;

    for (const ms of machineState) {
      if (ms.remainingKm >= km) {
        // road fits — prefer smallest remaining (tightest fit)
        if (ms.remainingKm < bestFitRemaining) {
          bestFitRemaining = ms.remainingKm;
          bestFit = ms;
        }
      }
    }

    if (!bestFit) {
      // No machine can fit the road — assign to machine with most remaining capacity
      // (least overloaded), even if it causes capacity exceeded
      machineState.sort((a, b) => b.remainingKm - a.remainingKm);
      bestFit = machineState[0];
    }

    // Assign road — sequence = position in this machine's list + 1
    bestFit.assignedRoads.push(road);
    bestFit.assignedKm   += km;
    bestFit.remainingKm  -= km;
  }

  return machineState;
}

// ── Build plan documents ───────────────────────────────────────────────────────

/**
 * buildPlanDocs(projectId, planDateStr, machineState)
 * Converts assignment results into SweepingPlan document objects ready to upsert.
 *
 * @returns {Array} plan doc objects (not yet saved)
 */
function buildPlanDocs(projectId, planDateStr, machineState) {
  const plans = [];

  for (const ms of machineState) {
    const { machine, assignedRoads, assignedKm } = ms;
    const capacityKm = machine.sweepingKmPerDay;
    const capacityExceeded = assignedKm > capacityKm + 0.001; // small float tolerance

    // Build machine road sequence (starts at 1, independent per machine)
    const roads = assignedRoads.map((road, idx) => ({
      roadId:     road.roadId,
      roadName:   road.roadName,
      areaName:   road.areaName,
      colonyName: road.colonyName,
      sequence:   idx + 1,           // Machine Daily Road Sequence — NOT GPS sequence
      plannedKm:  road.totalLength,
    }));

    plans.push({
      projectId,
      planDate:       planDateStr,
      machineId:      machine.machineId,
      machineName:    machine.machineName,
      vehicleNumber:  machine.vehicleNumber,
      capacityKm,
      totalPlannedKm: Math.round(assignedKm * 1000) / 1000,
      capacityExceeded,
      roads,
      status: 'planned',
    });
  }

  return plans;
}

// ── Generate summary ───────────────────────────────────────────────────────────

function buildSummary(scheduledRoads, machineState, planDocs) {
  const assignedRoadIds = new Set(
    machineState.flatMap((ms) => ms.assignedRoads.map((r) => r.roadId))
  );
  const unassigned = scheduledRoads.filter((r) => !assignedRoadIds.has(r.roadId));

  return {
    scheduledRoads:           scheduledRoads.length,
    assignedRoads:            assignedRoadIds.size,
    unassignedRoads:          unassigned.length,
    unassignedRoadIds:        unassigned.map((r) => r.roadId),
    totalPlannedKm:           Math.round(
      machineState.reduce((s, ms) => s + ms.assignedKm, 0) * 1000
    ) / 1000,
    machinesUsed:             planDocs.length,
    capacityExceededMachines: planDocs.filter((p) => p.capacityExceeded).length,
  };
}

module.exports = {
  isRoadScheduled,
  getScheduledRoads,
  assignRoadsToMachines,
  buildPlanDocs,
  buildSummary,
  parsePlanDate,
};
