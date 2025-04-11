"use strict";

// === Global State & Configuration ===
const state = {
  zorghuizenDataCount: {
    arnhem: 0,
    nijmegen: 0,
  },
  dashboardData: {
    arnhem: {
      nursingHomeBeds: "N/A", // Will be updated with the MC sim result later.
      firstLineBeds: "N/A",
      crisisBeds: "N/A",
      waitingTime: "N/A",
      occupancyRate: "N/A",
    },
    nijmegen: {
      nursingHomeBeds: "N/A", // Will be updated with the MC sim result later.
      firstLineBeds: "N/A",
      crisisBeds: "N/A",
      waitingTime: "N/A",
      occupancyRate: "N/A",
    },
  },
  // This will hold our simulation totals for later reference.
  totalPlaatsen: {},
};

const config = {
  jsonFiles: {
    arnhem: "zorginstellingen-arnhem.json",
    nijmegen: "zorginstellingen-nijmegen.json",
    dashboard: "dashboard-data.json", // Optional summary data for cards
  },
};

// === Helper Functions ===

/**
 * Updates the textContent of a DOM element safely.
 * @param {string} id - The element's ID.
 * @param {string} text - The text to set.
 */
function updateElementText(id, text) {
  const element = document.getElementById(id);
  if (element) {
    console.log(`Updating ${id} with: ${text}`);
    element.textContent = text;
  } else {
    console.warn(`Element with ID "${id}" not found.`);
  }
}

/**
 * Updates the innerHTML of a DOM element.
 * @param {string} id - The element's ID.
 * @param {string} html - The HTML content to set.
 */
function updateElementHTML(id, html) {
  const element = document.getElementById(id);
  if (element) {
    console.log(`Updating ${id} with HTML content.`);
    element.innerHTML = html;
  } else {
    console.warn(`Element with ID "${id}" not found.`);
  }
}

/**
 * Fetches and returns JSON data from a URL.
 * @param {string} url - The URL to fetch.
 * @returns {Promise<any>} - Parsed JSON data.
 * @throws {Error} - If the request fails.
 */
async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fetch error: "${url}" returned status ${response.status}`);
  }
  return response.json();
}

/**
 * Updates an HTML container (a “tab”) with the Monte Carlo simulation methodology
 * and intermediate statistics.
 * Expects an element with ID "mcMethodology{CapitalizedRegion}".
 *
 * The stats object includes:
 * - totalRecords, knownCount, knownSum, meanValue,
 * - missingCount, missingPercent, simulatedMissing, estimatedTotal,
 * - lowerBound and upperBound for the 95% confidence interval,
 * - mcMeanBeds: estimated mean beds per nursing home.
 *
 * @param {string} region - The region ("arnhem" or "nijmegen").
 * @param {object} stats - The statistics object.
 */
function updateMCMethodologyUI(region, stats) {
  const capitalized = region.charAt(0).toUpperCase() + region.slice(1);
  const targetElementId = `mcMethodology${capitalized}`;
  const content = `
    <h3>Monte Carlo Simulation for ${capitalized}</h3>
    <p>
      To estimate the total "Aantal Plaatsen", we first sum the known values. For the records 
      with missing data, we assume they follow the same distribution as the observed values.
      We run a Monte Carlo simulation (with ${10000} iterations), randomly sampling for each missing record.
      The average simulated total for the missing values is added to the known sum. 
    </p>
    <ul>
      <li><strong>Total records:</strong> ${stats.totalRecords}</li>
      <li><strong>Known records:</strong> ${stats.knownCount}</li>
      <li><strong>Sum of known values:</strong> ${stats.knownSum}</li>
      <li><strong>Average of known values:</strong> ${stats.meanValue.toFixed(
        2
      )}</li>
      <li><strong>Missing records:</strong> ${
        stats.missingCount
      } (${stats.missingPercent.toFixed(2)}%)</li>
      <li><strong>Simulated missing total (mean):</strong> ${stats.simulatedMissing.toFixed(
        0
      )}</li>
      <li><strong>Estimated total (known + missing):</strong> ${stats.estimatedTotal.toFixed(
        0
      )}</li>
      <li>
        <strong>95% Confidence Interval:</strong> [${stats.lowerBound.toFixed(
          0
        )},
        ${stats.upperBound.toFixed(0)}]
      </li>
      <li><strong>Mean estimated beds per nursing home:</strong> ${stats.mcMeanBeds.toFixed(
        2
      )}</li>
    </ul>
  `;
  updateElementHTML(targetElementId, content);
}

// === Core Logic Functions ===

/**
 * Loads the optional summary data from dashboard-data.json and updates dashboard fields.
 */
async function loadDashboardSummary() {
  try {
    const loadedData = await fetchJson(config.jsonFiles.dashboard);
    state.dashboardData.arnhem = {
      ...state.dashboardData.arnhem,
      ...(loadedData.arnhem || {}),
    };
    state.dashboardData.nijmegen = {
      ...state.dashboardData.nijmegen,
      ...(loadedData.nijmegen || {}),
    };
    console.log("Dashboard summary data loaded.");
  } catch (error) {
    console.warn(
      `Error loading dashboard summary: ${error}. Using default values.`
    );
  } finally {
    updateDashboardUI("arnhem");
    updateDashboardUI("nijmegen");
  }
}

/**
 * Loads the JSON data for a region and updates the record count element.
 * @param {'arnhem'|'nijmegen'} region - The region.
 */
async function loadRegionCount(region) {
  const jsonFile = config.jsonFiles[region];
  const capitalizedRegion = region.charAt(0).toUpperCase() + region.slice(1);
  const countElementId = `totalNursingHomes${capitalizedRegion}`;

  console.log(`[${region}] Loading region count from ${jsonFile}...`);
  try {
    const data = await fetchJson(jsonFile);
    if (!Array.isArray(data)) {
      throw new Error(`Data from "${jsonFile}" is not an array.`);
    }
    state.zorghuizenDataCount[region] = data.length;
    updateElementText(countElementId, data.length.toString());
    console.log(`[${region}] Region count loaded: ${data.length}`);
  } catch (error) {
    console.error(`[${region}] Error loading region count: ${error}`);
    updateElementText(countElementId, "0");
    state.zorghuizenDataCount[region] = 0;
  }
}

/**
 * Uses Monte Carlo simulation to estimate the total sum of "Aantal Plaatsen" for a region.
 * It imputes missing (null or non-numeric) values by sampling the observed values.
 * The result is then used to update the element with ID:
 *    nursingHomeBeds{CapitalizedRegion}
 *
 * It also computes intermediate statistics including:
 * - Total records, known count, known sum, mean of known values, missing count and percent,
 * - The simulated total for missing values,
 * - The overall estimated total,
 * - A 95% confidence interval based on the simulation,
 * - And the mean estimated beds per nursing home.
 *
 * @param {'arnhem'|'nijmegen'} region - The region.
 * @returns {Promise<number>} - The estimated total.
 */
async function simulateTotalPlaatsen(region) {
  const jsonFile = config.jsonFiles[region];
  const capitalizedRegion = region.charAt(0).toUpperCase() + region.slice(1);
  // Update the element "nursingHomeBeds{CapitalizedRegion}" with the simulation result.
  const targetElementId = `nursingHomeBeds${capitalizedRegion}`;

  try {
    const data = await fetchJson(jsonFile);
    if (!Array.isArray(data)) {
      throw new Error(`Data from "${jsonFile}" is not an array.`);
    }

    const totalRecords = data.length;
    let knownSum = 0;
    let knownValues = [];
    let missingCount = 0;

    data.forEach((item) => {
      const value = item["Aantal Plaatsen"];
      if (value == null || isNaN(value)) {
        missingCount++;
      } else {
        knownSum += value;
        knownValues.push(value);
      }
    });

    const knownCount = knownValues.length;
    const meanValue = knownCount > 0 ? knownSum / knownCount : 0;
    const missingPercent =
      totalRecords > 0 ? (missingCount / totalRecords) * 100 : 0;

    let estimatedTotal, lowerBound, upperBound;
    const iterations = 10000;

    // When there are missing values, run the simulation.
    if (missingCount > 0 && knownCount > 0) {
      let iterTotals = [];
      for (let i = 0; i < iterations; i++) {
        let simSum = 0;
        for (let j = 0; j < missingCount; j++) {
          const randomIndex = Math.floor(Math.random() * knownCount);
          simSum += knownValues[randomIndex];
        }
        // Each iteration total includes the constant known sum.
        iterTotals.push(knownSum + simSum);
      }

      // Compute the mean estimated total.
      const totalSimulated = iterTotals.reduce((acc, cur) => acc + cur, 0);
      estimatedTotal = totalSimulated / iterations;

      // Sort the iteration totals and compute the 2.5th and 97.5th percentiles for the 95% CI.
      iterTotals.sort((a, b) => a - b);
      lowerBound = iterTotals[Math.floor(iterations * 0.025)];
      upperBound = iterTotals[Math.floor(iterations * 0.975)];
    } else {
      // If there are no missing values, use the knownSum.
      estimatedTotal = knownSum;
      lowerBound = knownSum;
      upperBound = knownSum;
    }

    // Compute the mean estimated beds per nursing home based on the MC estimate.
    const mcMeanBeds = totalRecords > 0 ? estimatedTotal / totalRecords : 0;

    updateElementText(targetElementId, estimatedTotal.toFixed(0));
    state.totalPlaatsen[region] = estimatedTotal;
    console.log(
      `[${region}] Simulated total "Aantal Plaatsen": ${estimatedTotal.toFixed(
        0
      )}`
    );

    // Prepare the intermediate statistics including the 95% CI.
    const stats = {
      totalRecords,
      knownCount,
      knownSum,
      meanValue,
      missingCount,
      missingPercent,
      simulatedMissing: estimatedTotal - knownSum, // average simulated missing total
      estimatedTotal,
      lowerBound,
      upperBound,
      mcMeanBeds,
    };

    // Update the corresponding Monte Carlo methodology tab container.
    updateMCMethodologyUI(region, stats);

    return estimatedTotal;
  } catch (error) {
    console.error(
      `[${region}] Error during simulation for "Aantal Plaatsen": ${error}`
    );
    updateElementText(targetElementId, "0");
    return 0;
  }
}

/**
 * Updates the dashboard UI fields for a region using dashboardData.
 * @param {'arnhem'|'nijmegen'} region - The region.
 */
function updateDashboardUI(region) {
  const data = state.dashboardData[region];
  if (!data) {
    console.warn(`No dashboard data found for region: ${region}`);
    return;
  }
  const capitalized = region.charAt(0).toUpperCase() + region.slice(1);

  // Update dashboard summary fields.
  // Note: The "nursingHomeBeds" field will be overwritten by the simulation result.
  updateElementText(
    `nursingHomeBeds${capitalized}`,
    data.nursingHomeBeds ?? "N/A"
  );
  updateElementText(`firstLineBeds${capitalized}`, data.firstLineBeds ?? "N/A");
  updateElementText(`crisisBeds${capitalized}`, data.crisisBeds ?? "N/A");
  updateElementText(
    `waitingTime${capitalized}`,
    `Wachttijd: ${data.waitingTime ?? "N/A"} dagen`
  );
  updateElementText(
    `occupancyRate${capitalized}`,
    `Bezettingsgraad: ${data.occupancyRate ?? "N/A"}%`
  );
}

// === Initialization ===

async function initDashboard() {
  console.log("Initializing dashboard...");

  try {
    // Load dashboard summary data and update the UI.
    await loadDashboardSummary();
    // Run the simulation for Arnhem.
    await simulateTotalPlaatsen("arnhem");
    // Update the region count for Arnhem.
    await loadRegionCount("arnhem");
  } catch (error) {
    console.error("Error during initial data loading:", error);
  }

  // Set up event listener for the Nijmegen tab.
  const nijmegenTab = document.getElementById("nijmegen-tab");
  if (nijmegenTab) {
    nijmegenTab.addEventListener("shown.bs.tab", async () => {
      console.log("[Nijmegen Tab] Shown.");
      if (!state.totalPlaatsen || state.totalPlaatsen.nijmegen === undefined) {
        await simulateTotalPlaatsen("nijmegen");
      } else {
        updateElementText(
          "nursingHomeBedsNijmegen",
          state.totalPlaatsen.nijmegen.toFixed(0)
        );
      }
      // Update the record count for Nijmegen.
      await loadRegionCount("nijmegen");
    });
  } else {
    console.error("Nijmegen tab element not found!");
  }

  console.log("Dashboard initialization complete.");
}

document.addEventListener("DOMContentLoaded", initDashboard);
