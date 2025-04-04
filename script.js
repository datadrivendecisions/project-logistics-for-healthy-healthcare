// script.js (Vereenvoudigd voor index.html)
"use strict";

// --- Globale State & Configuratie ---
const state = {
  zorghuizenDataCount: {
    // Alleen het *aantal* onthouden, niet de hele data
    arnhem: 0,
    nijmegen: 0,
  },
  dashboardData: {
    // Summary data, geladen uit optionele JSON
    arnhem: {
      nursingHomeBeds: "N/A",
      firstLineBeds: "N/A",
      crisisBeds: "N/A",
      waitingTime: "N/A",
      occupancyRate: "N/A",
    },
    nijmegen: {
      nursingHomeBeds: "N/A",
      firstLineBeds: "N/A",
      crisisBeds: "N/A",
      waitingTime: "N/A",
      occupancyRate: "N/A",
    },
  },
  // Geen sortConfig of filters meer nodig op deze pagina
  // Geen element cache meer nodig voor tabellen
};

const config = {
  jsonFiles: {
    arnhem: "zorginstellingen-arnhem.json",
    nijmegen: "zorginstellingen-nijmegen.json",
    dashboard: "dashboard-data.json", // Optioneel bestand voor summary cards
  },
};

// --- Helper Functies ---

/**
 * Werkt veilig de textContent van een DOM-element bij.
 * @param {string} id - Het ID van het element.
 * @param {string} text - De tekst om in te stellen.
 */
function updateElementText(id, text) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = text;
  } else {
    // console.warn(`Element with ID ${id} not found on index page.`);
  }
}

// --- Kernlogica Functies ---

/**
 * Laadt de optionele summary data uit dashboard-data.json.
 */
async function loadDashboardSummary() {
  try {
    const response = await fetch(config.jsonFiles.dashboard);
    if (!response.ok) {
      console.warn(
        `Kon ${config.jsonFiles.dashboard} niet laden (Status: ${response.status}). Standaardwaarden worden gebruikt.`
      );
      return; // Gebruik default state.dashboardData
    }
    const loadedData = await response.json();
    // Voeg geladen data samen met defaults
    state.dashboardData.arnhem = {
      ...state.dashboardData.arnhem,
      ...(loadedData.arnhem || {}),
    };
    state.dashboardData.nijmegen = {
      ...state.dashboardData.nijmegen,
      ...(loadedData.nijmegen || {}),
    };
    console.log("Dashboard summary data geladen.");
  } catch (error) {
    console.warn(
      `Fout bij ophalen/parsen ${config.jsonFiles.dashboard}: ${error}. Standaardwaarden worden gebruikt.`
    );
  } finally {
    // Update UI altijd (met default of geladen data)
    updateDashboardUI("arnhem");
    updateDashboardUI("nijmegen");
  }
}

/**
 * Laadt de data voor een regio om het *aantal* instellingen te krijgen.
 * @param {'arnhem'|'nijmegen'} region - De regio.
 */
async function loadRegionCount(region) {
  const jsonFile = config.jsonFiles[region];
  const capitalizedRegion = region.charAt(0).toUpperCase() + region.slice(1);
  const totalHomesSpanId = `totalNursingHomes${capitalizedRegion}`;

  console.log(
    `[${region}] Start laden data uit ${jsonFile} (alleen voor telling)`
  );
  // Geen loading indicators nodig hier, het is snel en op de achtergrond

  try {
    const response = await fetch(jsonFile);
    if (!response.ok) {
      throw new Error(`Server response ${response.status} voor ${jsonFile}`);
    }
    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error(`Data uit ${jsonFile} is geen array.`);
    }

    console.log(`[${region}] Telling succesvol. Items: ${data.length}`);
    state.zorghuizenDataCount[region] = data.length; // Sla alleen het aantal op

    // Update het aantal in de link in de summary card
    updateElementText(totalHomesSpanId, data.length.toString());
  } catch (error) {
    console.error(`[${region}] FOUT bij laden data voor telling:`, error);
    // Update de telling naar 0 bij een fout
    updateElementText(totalHomesSpanId, "0");
    state.zorghuizenDataCount[region] = 0;
  }
  // Geen populateTable aanroep meer nodig
}

/**
 * Werkt de summary cards bij voor een regio.
 * @param {'arnhem'|'nijmegen'} region - De regio.
 */
function updateDashboardUI(region) {
  const data = state.dashboardData[region];
  if (!data) {
    console.warn(`Geen dashboard data gevonden voor regio: ${region}`);
    return;
  }
  const capitalized = region.charAt(0).toUpperCase() + region.slice(1);

  // Update alleen de kaarten die gevuld worden vanuit dashboard-data.json
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

  // De telling in totalNursingHomes[Region] wordt nu apart bijgewerkt in loadRegionCount
}

// --- Initialisatie ---

/**
 * Initialiseert het dashboard: laadt data en stelt event listeners in.
 */
function initDashboard() {
  console.log("Dashboard initialiseren (vereenvoudigd)...");

  // Laad summary data eerst, daarna data voor de actieve tab (Arnhem) voor de telling
  loadDashboardSummary()
    .then(() => loadRegionCount("arnhem")) // Laad alleen de telling
    .catch((error) =>
      console.error("Fout tijdens initiële data laden:", error)
    );

  // --- Event Listeners ---

  // Tab switching (laad data voor Nijmegen alleen als die tab actief wordt en de telling nog onbekend is)
  const nijmegenTab = document.getElementById("nijmegen-tab");
  if (nijmegenTab) {
    nijmegenTab.addEventListener("shown.bs.tab", async () => {
      console.log("[Nijmegen Tab] Getoond.");
      // Laad telling alleen als deze nog niet geladen is (count is 0)
      if (state.zorghuizenDataCount.nijmegen === 0) {
        console.log("[Nijmegen Tab] Telling nog niet bekend, data laden...");
        await loadRegionCount("nijmegen");
      } else {
        console.log("[Nijmegen Tab] Telling al bekend.");
        // Optioneel: Forceer update van de span voor het geval de tekst is gewist
        updateElementText(
          `totalNursingHomesNijmegen`,
          state.zorghuizenDataCount.nijmegen.toString()
        );
      }
    });
  } else {
    console.error("Nijmegen tab element niet gevonden!");
  }

  // Geen event listeners meer nodig voor sorteren, filteren, downloaden op deze pagina

  console.log("Dashboard Initialisatie voltooid (vereenvoudigd).");
}

// Start de applicatie zodra de DOM volledig geladen is
document.addEventListener("DOMContentLoaded", initDashboard);
