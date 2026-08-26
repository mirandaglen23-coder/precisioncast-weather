import { GoogleGenAI } from "@google/genai";
import { GeminiAtmosphericAnalysis, PrecisionForecastResponse } from "../src/types.js";

import dotenv from "dotenv";
import fs from "fs";
import path from "path";

let geminiClient: GoogleGenAI | null = null;
let lastLoadedKey: string | null = null;

// In-memory cache to prevent duplicate Gemini quota consumption on frequent coordinate/unit toggles
const analysisCache = new Map<string, { timestamp: number; data: GeminiAtmosphericAnalysis }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache per coordinate & unit

// Rate limit cooldown tracker
let rateLimitedUntil = 0;

function getApiKey(): string | null {
  if (process.env.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY.trim();
  }
  try {
    const envPath = path.join(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath, override: true });
      if (process.env.GEMINI_API_KEY) {
        return process.env.GEMINI_API_KEY.trim();
      }
      const raw = fs.readFileSync(envPath, "utf-8");
      const match = raw.match(/GEMINI_API_KEY\s*=\s*(.+)/);
      if (match && match[1]) {
        const key = match[1].trim().replace(/^["']|["']$/g, "");
        process.env.GEMINI_API_KEY = key;
        return key;
      }
    }
  } catch (err) {
    console.warn("Failed to dynamically read .env file:", err);
  }
  return null;
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = getApiKey();
  if (!apiKey) {
    return null;
  }
  if (!geminiClient || lastLoadedKey !== apiKey) {
    lastLoadedKey = apiKey;
    geminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return geminiClient;
}

export async function generateAtmosphericAnalysis(
  forecast: PrecisionForecastResponse,
  unit: "C" | "F" = "F"
): Promise<GeminiAtmosphericAnalysis> {
  const cacheKey = `${forecast.coordinates.latitude.toFixed(3)}_${forecast.coordinates.longitude.toFixed(3)}_${unit}`;
  const cached = analysisCache.get(cacheKey);
  const now = Date.now();

  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const ai = getGeminiClient();

  if (!ai || now < rateLimitedUntil) {
    // Return high quality deterministic meteorological fallback if key is not configured or in rate-limit cooldown
    const fallback = fallbackAtmosphericAnalysis(forecast, unit);
    analysisCache.set(cacheKey, { timestamp: now, data: fallback });
    return fallback;
  }

  const isImperial = unit === "F";

  const toTemp = (c: number) => isImperial ? `${((c * 9) / 5 + 32).toFixed(1)}°F` : `${c.toFixed(1)}°C`;
  const toDelta = (c: number) => isImperial ? `${(c * 1.8 >= 0 ? "+" : "")}${(c * 1.8).toFixed(1)}°F` : `${(c >= 0 ? "+" : "")}${c.toFixed(1)}°C`;
  const toElev = (m: number) => isImperial ? `${Math.round(m * 3.28084).toLocaleString()} ft` : `${Math.round(m).toLocaleString()} m`;
  const toPress = (hpa: number) => isImperial ? `${(hpa * 0.02953).toFixed(2)} inHg (${hpa.toFixed(1)} hPa)` : `${hpa.toFixed(1)} hPa`;
  const toWind = (kmh: number) => isImperial ? `${(kmh * 0.621371).toFixed(1)} mph (${kmh.toFixed(1)} km/h)` : `${kmh.toFixed(1)} km/h`;

  const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const windDirIndex = Math.round((forecast.current.windDirectionDeg % 360) / 22.5) % 16;
  const windDirCardinal = directions[windDirIndex];
  const windVectorStr = `${windDirCardinal} (${forecast.current.windDirectionDeg}°) at ${toWind(forecast.current.windSpeedKmh)}`;

  const capeValue = forecast.current.capeJkg;
  const stabilityGrounding =
    capeValue >= 1000
      ? "conditionally unstable with active convective storm potential"
      : capeValue >= 300
      ? "moderately unstable with marginal convective shower risk"
      : "stably stratified with minimal convective potential";

  const prompt = `You are a Senior Research Meteorologist and Machine Learning Atmospheric Scientist.
Analyze the following hyper-local weather forecast, multi-model ensemble divergence, and ML bias-correction features for coordinates (${forecast.coordinates.latitude.toFixed(4)}, ${forecast.coordinates.longitude.toFixed(4)}) - Location: ${forecast.coordinates.locationName || "Custom Coordinates"}:

Atmospheric Metrics (Active Unit System: ${isImperial ? "Imperial (°F, inHg, ft, mph)" : "Metric (°C, hPa, m, km/h)"}):
- Current ML Predicted Temp: ${toTemp(forecast.current.temperature)} (Raw Global Model was ${toTemp(forecast.current.rawPhysicsTemp)}, Net ML Correction: ${toDelta(forecast.current.temperature - forecast.current.rawPhysicsTemp)})
- Station Elevation: ${toElev(forecast.mlBreakdown.actualElevation)} (Global Model Grid Elevation: ${toElev(forecast.mlBreakdown.gridElevation)})
- Elevation Lapse Rate: ${isImperial ? `${(forecast.mlBreakdown.elevationLapseRate * 0.54864).toFixed(1)}°F/1k ft` : `${forecast.mlBreakdown.elevationLapseRate}°C/km`} (Terrain Delta: ${toDelta(forecast.mlBreakdown.elevationAdjustment)})
- Relative Humidity: ${forecast.current.humidity}%, Dew Point: ${toTemp(forecast.current.dewPoint)}, Dew Point Depression: ${toDelta(forecast.current.dewPointDepression)}
- Surface Pressure: ${toPress(forecast.current.pressureHpa)} (3-hr tendency: ${isImperial ? `${(forecast.mlBreakdown.pressureTendency3h * 0.02953).toFixed(2)} inHg` : `${forecast.mlBreakdown.pressureTendency3h} hPa`})
- Surface Wind Vector: ${windVectorStr}
- Solar Radiation: ${forecast.current.solarRadiationWm2} W/m² (Zenith Angle: ${forecast.mlBreakdown.solarZenithAngle}°)
- Planetary Boundary Layer Height: ${toElev(forecast.current.pblHeightM)}
- Convective Available Potential Energy (CAPE): ${capeValue} J/kg (Atmospheric Column is: ${stabilityGrounding})
- Model Ensemble Spread (StdDev): ${isImperial ? `±${(forecast.mlBreakdown.modelDivergenceSpread * 1.8).toFixed(2)}°F` : `±${forecast.mlBreakdown.modelDivergenceSpread.toFixed(2)}°C`} across ECMWF, GFS, ICON, HRRR
- Next 2-Hour Radar Nowcast Peak: ${isImperial ? `${(Math.max(...forecast.radarNowcast.map(r => r.intensityMmPerHour)) * 0.0393701).toFixed(2)} in/hr` : `${Math.max(...forecast.radarNowcast.map(r => r.intensityMmPerHour)).toFixed(1)} mm/hr`}

CRITICAL INSTRUCTIONS:
1. All temperatures, pressures, and elevations throughout your output JSON MUST be formatted strictly in ${isImperial ? "°F, inHg, ft, and mph" : "°C, hPa, m, and km/h"}.
2. Ground your stability assessment directly on CAPE: current CAPE is ${capeValue} J/kg. If CAPE >= 1000 J/kg, you MUST describe the column as conditionally unstable with active convective potential (DO NOT state the column is stable).
3. Ground your wind flow description directly on the surface wind vector: ${windVectorStr}.

Provide a deep, precise scientific breakdown in valid JSON format matching this schema:
{
  "synopticOverview": "2-3 sentences describing the air mass, pressure tendency, prevailing surface wind vector, and CAPE-grounded stability.",
  "microclimateFactors": ["List 3-4 specific local topography, lapse rate, marine layer, or urban heat dynamics driving these coordinates using the active unit system."],
  "whyStandardAppsFailHere": "2-3 sentences explaining exactly why standard coarse-grid (13-25km) weather apps give inaccurate numbers at these specific coordinates (e.g. smoothed DEM elevation error, unresolved valley inversions, sea-breeze fronts).",
  "ensembleAgreementAnalysis": "2 sentences evaluating the divergence between ECMWF, GFS, ICON, and HRRR and which physics model is currently most reliable for this regional regime.",
  "radarNowcastingSummary": "1-2 sentences summarizing the 0-120 minute precipitation arrival and reflectivity trend.",
  "mlFeatureImportanceHighlights": [
    {
      "feature": "Name of primary ML feature (e.g. Elevation Lapse Rate)",
      "impact": "e.g. ${isImperial ? "-2.5°F cooling" : "-1.4°C cooling"}",
      "explanation": "Why this feature dominates the bias correction at this coordinate."
    },
    {
      "feature": "Name of secondary ML feature (e.g. Solar Insolation / Aspect)",
      "impact": "e.g. ${isImperial ? "+1.4°F heating" : "+0.8°C heating"}",
      "explanation": "Local radiative heating or cooling effect."
    },
    {
      "feature": "Name of tertiary ML feature (e.g. Pressure Tendency / Moisture Advection)",
      "impact": "e.g. ${isImperial ? "+0.04 inHg trend" : "+1.4 hPa trend"}",
      "explanation": "Atmospheric instability or frontal boundary signature."
    }
  ]
}`;

  // Candidate models prioritized for maximum uptime and lowest latency
  const candidateModels = [
    "gemini-3.5-flash-lite",
    "gemini-3.6-flash",
    "gemini-flash-lite-latest",
    "gemini-flash-latest",
  ];

  for (const modelName of candidateModels) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          systemInstruction: "You are a Senior Atmospheric Scientist. Provide valid JSON strictly matching the requested schema.",
          responseMimeType: "application/json",
        },
      });

      if (response.text) {
        const parsed = JSON.parse(response.text.trim());
        analysisCache.set(cacheKey, { timestamp: Date.now(), data: parsed as GeminiAtmosphericAnalysis });
        return parsed as GeminiAtmosphericAnalysis;
      }
    } catch (error: any) {
      const errorMsg = error?.message || String(error);
      const is429 = error?.status === 429 || error?.code === 429 || errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED") || errorMsg.includes("quota");
      if (is429) {
        // Enforce 15-second cooldown before trying remote API again
        rateLimitedUntil = Date.now() + 15000;
        break;
      }
      // For 503 / high demand or 404, quietly try next candidate in the cascade
      continue;
    }
  }

  // Gracefully fallback to deterministic meteorological synthesis if API endpoints are unavailable
  const fallback = fallbackAtmosphericAnalysis(forecast, unit);
  analysisCache.set(cacheKey, { timestamp: Date.now(), data: fallback });
  return fallback;
}

function fallbackAtmosphericAnalysis(forecast: PrecisionForecastResponse, unit: "C" | "F" = "F"): GeminiAtmosphericAnalysis {
  const isImperial = unit === "F";
  const toTemp = (c: number) => isImperial ? `${((c * 9) / 5 + 32).toFixed(1)}°F` : `${c.toFixed(1)}°C`;
  const toDelta = (c: number) => isImperial ? `${(c * 1.8 >= 0 ? "+" : "")}${(c * 1.8).toFixed(1)}°F` : `${(c >= 0 ? "+" : "")}${c.toFixed(1)}°C`;
  const toElev = (m: number) => isImperial ? `${Math.round(m * 3.28084).toLocaleString()} ft` : `${Math.round(m).toLocaleString()} m`;
  const toPress = (hpa: number) => isImperial ? `${(hpa * 0.02953).toFixed(2)} inHg` : `${hpa.toFixed(1)} hPa`;
  const toWind = (kmh: number) => isImperial ? `${(kmh * 0.621371).toFixed(1)} mph` : `${kmh.toFixed(1)} km/h`;

  const elevDelta = forecast.mlBreakdown.actualElevation - forecast.mlBreakdown.gridElevation;
  const hasPrecip = forecast.radarNowcast.some(r => r.probability > 30);
  const spread = forecast.mlBreakdown.modelDivergenceSpread;
  const spreadStr = isImperial ? `±${(spread * 1.8).toFixed(2)}°F` : `±${spread.toFixed(2)}°C`;

  const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const windDirIndex = Math.round((forecast.current.windDirectionDeg % 360) / 22.5) % 16;
  const windDirCardinal = directions[windDirIndex];
  const windVectorStr = `${windDirCardinal} (${forecast.current.windDirectionDeg}°) at ${toWind(forecast.current.windSpeedKmh)}`;

  const cape = forecast.current.capeJkg;
  const stabilityStr =
    cape >= 1000
      ? "conditionally unstable with active convective storm potential"
      : cape >= 300
      ? "moderately unstable with marginal convective risk"
      : "stably stratified with minimal convective trigger";

  return {
    synopticOverview: `Atmospheric column around (${forecast.coordinates.latitude.toFixed(2)}°, ${forecast.coordinates.longitude.toFixed(2)}°) indicates surface pressure of ${toPress(forecast.current.pressureHpa)} with boundary layer height of ${toElev(forecast.current.pblHeightM)}. Surface flow is ${windVectorStr}, while thermodynamics indicate a ${stabilityStr} air column (CAPE ${cape} J/kg).`,
    microclimateFactors: [
      `Topographic elevation delta: Local terrain is ${toElev(Math.abs(elevDelta))} ${elevDelta >= 0 ? "higher" : "lower"} than global 13km model grid cells, requiring a ${toDelta(forecast.mlBreakdown.elevationAdjustment)} adiabatic adjustment.`,
      `Radiative flux: Instantaneous solar insolation is ${forecast.current.solarRadiationWm2.toFixed(0)} W/m² with a solar zenith angle of ${forecast.mlBreakdown.solarZenithAngle.toFixed(1)}°.`,
      `Moisture saturation gap: Dew point depression of ${toDelta(forecast.current.dewPointDepression)} indicates ${forecast.current.dewPointDepression < 3 ? "near-saturated lower troposphere with high cloud/fog potential" : "dry boundary layer with minimal condensation"}.`,
      `Convective instability: CAPE measured at ${cape} J/kg, indicating ${stabilityStr}.`
    ],
    whyStandardAppsFailHere: `Standard weather applications interpolate coarse 13-25 km physics grids without adjusting for the ${toElev(Math.abs(elevDelta))} local elevation discrepancy or real-time lapse rates ($\Gamma = ${isImperial ? `${(forecast.mlBreakdown.elevationLapseRate * 0.54864).toFixed(1)}°F/1k ft` : `${forecast.mlBreakdown.elevationLapseRate}°C/km`}$). They treat microclimate zones uniformly, failing to capture cold air pooling, slope aspects, or localized thermal gradients.`,
    ensembleAgreementAnalysis: `Multi-model spread across ECMWF, GFS, ICON, and HRRR is ${spreadStr} (${spread < 1.5 ? "High consensus among numerical weather models" : "Moderate spread due to differing boundary layer parameterizations"}). ECMWF and HRRR show the highest fidelity for localized mesoscale features.`,
    radarNowcastingSummary: hasPrecip
      ? `Doppler extrapolation indicates localized precipitation bands within the 120-minute window with peak reflectivity of ~${Math.max(...forecast.radarNowcast.map(r => r.dbzReflectivity))} dBZ.`
      : `Reflectivity scans indicate no significant convective precipitation signatures within the 120-minute horizon across the immediate 25km radius.`,
    mlFeatureImportanceHighlights: [
      {
        feature: "Dynamic Elevation Lapse Rate (DEM Δz)",
        impact: toDelta(forecast.mlBreakdown.elevationAdjustment),
        explanation: `Downscales coarse physics grid temperature using dynamic lapse rate (Γ = ${isImperial ? `${(forecast.mlBreakdown.elevationLapseRate * 0.54864).toFixed(1)}°F/1k ft` : `${forecast.mlBreakdown.elevationLapseRate}°C/km`}) for the exact ${toElev(forecast.mlBreakdown.actualElevation)} coordinate elevation.`
      },
      {
        feature: "Atmospheric Relative Humidity Regime",
        impact: `${forecast.current.humidity}% RH`,
        explanation: `Column moisture content determines lapse rate regime (dry adiabatic <40% RH, moist adiabatic >85% RH, or standard intermediate).`
      },
      {
        feature: "Moisture & Pressure Tendency (3-Hour ΔP)",
        impact: isImperial ? `${(forecast.mlBreakdown.pressureTendency3h * 0.02953).toFixed(2)} inHg` : `${forecast.mlBreakdown.pressureTendency3h >= 0 ? "+" : ""}${forecast.mlBreakdown.pressureTendency3h.toFixed(1)} hPa`,
        explanation: `Monitors barometric pressure movement and dew point depression to detect frontal boundaries before coarse global models update.`
      }
    ]
  };
}

/**
 * Safely parses daily date strings (e.g. "2026-08-24") without UTC timezone conversion skew.
 */
function parseForecastDate(dateStr?: string): { fullDate: string; weekday: string; monthDay: string; iso: string } {
  if (!dateStr) {
    const now = new Date();
    return {
      fullDate: now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
      weekday: now.toLocaleDateString("en-US", { weekday: "long" }),
      monthDay: now.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      iso: now.toISOString().split("T")[0],
    };
  }
  const cleanDate = dateStr.split("T")[0];
  const parts = cleanDate.split("-");
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const localDate = new Date(year, month, day, 12, 0, 0); // Noon avoids UTC/DST boundary shifts
    return {
      fullDate: localDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
      weekday: localDate.toLocaleDateString("en-US", { weekday: "long" }),
      monthDay: localDate.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      iso: cleanDate,
    };
  }
  const d = new Date(dateStr);
  return {
    fullDate: d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }),
    weekday: d.toLocaleDateString("en-US", { weekday: "long" }),
    monthDay: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    iso: dateStr,
  };
}

export interface ChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export async function answerWeatherChatQuestion(
  message: string,
  history: ChatHistoryItem[] = [],
  forecast: PrecisionForecastResponse
): Promise<string> {
  const ai = getGeminiClient();

  const tempC = forecast.current.temperature.toFixed(1);
  const tempF = (forecast.current.temperature * 1.8 + 32).toFixed(1);
  const apparentC = forecast.current.apparentTemperature.toFixed(1);
  const apparentF = (forecast.current.apparentTemperature * 1.8 + 32).toFixed(1);
  const locName = forecast.coordinates.locationName || (forecast.coordinates.town ? `${forecast.coordinates.town}, ${forecast.coordinates.state || forecast.coordinates.country || ''}` : `Point (${forecast.coordinates.latitude.toFixed(3)}°, ${forecast.coordinates.longitude.toFixed(3)}°)`);
  const rainMax = Math.max(...(forecast.hourly.precipitationProb?.slice(0, 12) || [0]));
  const condition = forecast.current.weatherDescription;
  const windKmh = forecast.current.windSpeedKmh;
  const windMph = (windKmh * 0.621371).toFixed(1);
  const humidity = forecast.current.humidity;
  const uv = forecast.current.uvIndex;
  const clouds = forecast.current.cloudCoverPercent;
  const isDay = (forecast.hourly.isDay && forecast.hourly.isDay.length > 0) ? forecast.hourly.isDay[0] === 1 : (forecast.current.solarRadiationWm2 > 15 || forecast.current.uvIndex > 0);
  const elevationM = forecast.mlBreakdown?.actualElevation ?? Math.round(forecast.coordinates.elevation || 0);
  const elevationFt = Math.round(elevationM * 3.28084);

  // Exact calendar date grounding
  const todayInfo = parseForecastDate(forecast.daily?.date?.[0]);
  const tomorrowInfo = parseForecastDate(forecast.daily?.date?.[1]);
  const dayAfterInfo = parseForecastDate(forecast.daily?.date?.[2]);

  // Target location timezone & current local time calculation
  const locTz = forecast.coordinates.timezone || "UTC";
  let locLocalTimeStr = "";
  let locLocalDateStr = "";
  try {
    const now = new Date();
    locLocalDateStr = now.toLocaleDateString("en-US", {
      timeZone: locTz,
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    locLocalTimeStr = now.toLocaleTimeString("en-US", {
      timeZone: locTz,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "short",
    });
  } catch (err) {
    locLocalDateStr = todayInfo.fullDate;
    locLocalTimeStr = "Local time relative to location timezone";
  }

  // 1. Multi-Model Numerical Ensemble
  const ensembleText = forecast.models && forecast.models.length > 0
    ? `Multi-Model Numerical Ensemble (Collected & Predicted by Website):
${forecast.models.map(m => `- ${m.displayName} (${m.source}, ${m.resolutionKm}km resolution): ${((m.currentTemp * 1.8) + 32).toFixed(1)}°F (${m.currentTemp.toFixed(1)}°C), Precip Chance: ${m.precipitationProb}%, Wind: ${(m.windSpeed * 0.621371).toFixed(1)} mph`).join("\n")}
- Multi-Model Divergence Spread: ${(forecast.mlBreakdown?.modelDivergenceSpread ? (forecast.mlBreakdown.modelDivergenceSpread * 1.8).toFixed(1) : "0.8")}°F (Confidence Score: ${forecast.mlBreakdown?.modelConfidenceScore ?? 92}%)`
    : "";

  // 2. Machine Learning Downscaling Breakdown
  const mlText = forecast.mlBreakdown
    ? `High-Resolution ML Elevation Downscaling:
- True Ground Elevation: ${elevationFt.toLocaleString()} ft (${elevationM}m) vs Coarse Grid Elevation: ${Math.round(forecast.mlBreakdown.gridElevation * 3.28084).toLocaleString()} ft (${Math.round(forecast.mlBreakdown.gridElevation)}m) [Δz: ${Math.round((forecast.mlBreakdown.actualElevation - forecast.mlBreakdown.gridElevation) * 3.28084)} ft]
- Raw Coarse Physics Temperature: ${((forecast.mlBreakdown.rawEnsembleMeanTemp * 1.8) + 32).toFixed(1)}°F (${forecast.mlBreakdown.rawEnsembleMeanTemp.toFixed(1)}°C)
- Calibrated Microclimate Temperature: ${tempF}°F (${tempC}°C) [Elevation Adjustment: ${(forecast.mlBreakdown.elevationAdjustment * 1.8 >= 0 ? "+" : "")}${(forecast.mlBreakdown.elevationAdjustment * 1.8).toFixed(1)}°F]
- Dynamic Environmental Lapse Rate: ${forecast.mlBreakdown.elevationLapseRate.toFixed(1)}°C/km (${(forecast.mlBreakdown.elevationLapseRate * 0.54864).toFixed(1)}°F/1000ft)
- Solar Radiation Adjustment: ${(forecast.mlBreakdown.solarRadiationBonus * 1.8 >= 0 ? "+" : "")}${(forecast.mlBreakdown.solarRadiationBonus * 1.8).toFixed(2)}°F (Zenith Angle: ${forecast.mlBreakdown.solarZenithAngle.toFixed(1)}°)
- Pressure Tendency (3-Hour ΔP): ${forecast.mlBreakdown.pressureTendency3h >= 0 ? "+" : ""}${forecast.mlBreakdown.pressureTendency3h.toFixed(1)} hPa
- Marine Layer / Coastal Damping: ${(forecast.mlBreakdown.marineLayerDamping * 1.8).toFixed(2)}°F`
    : "";

  // 3. Doppler Radar Nowcast
  const radarSteps = forecast.radarNowcast && forecast.radarNowcast.length > 0
    ? forecast.radarNowcast.map(r => `  • +${r.minuteOffset} min: ${r.probability}% rain probability, ${r.dbzReflectivity} dBZ reflectivity (${r.intensityMmPerHour} mm/h, ${r.condition.replace('_', ' ')})`).join("\n")
    : "  • Clear radar nowcast across next 120 minutes";

  // 4. Next 12 Hours Hourly Trajectory
  const hourlySteps = forecast.hourly && forecast.hourly.times
    ? forecast.hourly.times.slice(0, 12).map((t, idx) => {
        const timeLabel = t.includes("T") ? t.split("T")[1].slice(0, 5) : t;
        const hrTemp = forecast.hourly.mlCorrectedTemp?.[idx] != null ? `${((forecast.hourly.mlCorrectedTemp[idx] * 1.8) + 32).toFixed(0)}°F` : `${tempF}°F`;
        const hrPrecip = forecast.hourly.precipitationProb?.[idx] ?? 0;
        const hrCloud = forecast.hourly.cloudCover?.[idx] ?? clouds;
        const hrWind = forecast.hourly.windSpeedKmh?.[idx] != null ? `${(forecast.hourly.windSpeedKmh[idx] * 0.621371).toFixed(0)}mph` : `${windMph}mph`;
        return `[${timeLabel}: ${hrTemp}, ${hrPrecip}% rain, ${hrCloud}% clouds, wind ${hrWind}]`;
      }).join(" ")
    : "";

  // 5. 7-Day Extended Outlook with explicit dates and day labels
  const dailySteps = forecast.daily && forecast.daily.date
    ? forecast.daily.date.slice(0, 7).map((d, idx) => {
        const parsed = parseForecastDate(d);
        const maxF = forecast.daily.tempMax?.[idx] != null ? `${((forecast.daily.tempMax[idx] * 1.8) + 32).toFixed(0)}°F` : "-";
        const minF = forecast.daily.tempMin?.[idx] != null ? `${((forecast.daily.tempMin[idx] * 1.8) + 32).toFixed(0)}°F` : "-";
        const rainSumMm = forecast.daily.precipitationSum?.[idx] ?? 0;
        const rainSumIn = (rainSumMm * 0.0393701).toFixed(2);
        const dayLabel = idx === 0 ? "TODAY" : idx === 1 ? "TOMORROW" : idx === 2 ? "DAY AFTER TOMORROW" : parsed.weekday.toUpperCase();
        return `  • [${dayLabel}] ${parsed.fullDate} (${parsed.iso}): High ${maxF} / Low ${minF} | Rain: ${rainSumMm} mm (${rainSumIn} in) | Weather Code: ${forecast.daily.weatherCode?.[idx] ?? 0}`;
      }).join("\n")
    : "";

  if (ai) {
    const systemInstruction = `You are the live AI Meteorological Assistant for PrecisionCast, powered by Gemini 3.5 Flash-Lite.
You have real-time, uninterrupted access to all observational sensors, 5 numerical weather models (ECMWF, GFS, ICON, HRRR, GEM), high-resolution ML elevation downscaling, and Doppler radar nowcasts collected and predicted for this location.

📍 LOCATION & LOCAL TIMEZONE GROUNDING (CRITICAL):
• Target Location: ${locName}
• Target Timezone: ${locTz}
• Current Local Time at ${locName}: ${locLocalTimeStr} (${locLocalDateStr})
• TODAY at ${locName}: ${todayInfo.fullDate} (${todayInfo.iso})
• TOMORROW at ${locName}: ${tomorrowInfo.fullDate} (${tomorrowInfo.iso})
• DAY AFTER TOMORROW at ${locName}: ${dayAfterInfo.fullDate} (${dayAfterInfo.iso})

CRITICAL TIMEZONE & DATE RULES FOR THE AI ASSISTANT:
1. ALWAYS reference dates, days, and times relative to the SEARCHED LOCATION (${locName}) and its local timezone (${locTz}).
2. The user might be searching from a completely different timezone or day on their computer. Always orient your weather explanations around the local day and local time at ${locName}!
3. If the user asks "what day is it there?", "what is the date in ${locName}?", or asks about today's or tomorrow's conditions, explicitly reference ${locName}'s local date (${todayInfo.fullDate}) and local time (${locLocalTimeStr}).
4. TODAY IS ALWAYS ${todayInfo.fullDate} in ${locName}. NEVER refer to ${todayInfo.fullDate} as "tomorrow" or "yesterday".
5. TOMORROW IS ALWAYS ${tomorrowInfo.fullDate} in ${locName}.
6. When mentioning dates or days, explicitly specify the exact day name and date (e.g. "Tomorrow (${tomorrowInfo.weekday}, ${tomorrowInfo.monthDay})").

LIVE DATA & PREDICTION CONTEXT:
📍 Location: ${locName} (Coordinates: ${forecast.coordinates.latitude.toFixed(4)}°, ${forecast.coordinates.longitude.toFixed(4)}°)
⏰ Time & Light: ${isDay ? "Daytime (Sunlit)" : "Nighttime (Dark/Starry/Moonlit)"}
🌡️ Current Calibrated Temp: ${tempF}°F (${tempC}°C), Feels Like: ${apparentF}°F (${apparentC}°C)
☁️ Conditions: ${condition} (Cloud Cover: ${clouds}%)
💧 Humidity: ${humidity}%, Dew Point: ${((forecast.current.dewPoint * 1.8) + 32).toFixed(1)}°F (Depression: ${((forecast.current.dewPointDepression * 1.8)).toFixed(1)}°F)
💨 Wind: ${windMph} mph (${windKmh} km/h) from ${forecast.current.windDirectionDeg}°, Gusts: ${(forecast.current.windGustsKmh * 0.621371).toFixed(1)} mph
☀️ Solar Radiation: ${forecast.current.solarRadiationWm2} W/m², UV Index: ${uv}
⚡ Atmospheric Convective Instability (CAPE): ${forecast.current.capeJkg} J/kg
⛰️ Elevation: ${elevationFt.toLocaleString()} ft (${elevationM} m)

${ensembleText}

${mlText}

📡 120-Minute High-Resolution Doppler Radar Nowcast:
${radarSteps}

⏱️ Next 12-Hour Trajectory:
${hourlySteps}

📅 7-Day Synoptic Outlook:
${dailySteps}

HOW TO RESPOND:
1. IDENTITY & CAPABILITIES:
   - You are a real AI model (Gemini 3.5 Flash-Lite) synthesizing active data from PrecisionCast.
   - If asked who you are or what models you use, explain that you are Gemini analyzing live feeds from ECMWF, GFS, ICON, HRRR, GEM, Doppler radar, and high-resolution DEM lapse-rate downscaling.
2. VISUAL / SENSORY QUERIES (e.g. "what would it look like standing here", "what do you see"):
   - Vividly describe what a person standing outside right now would experience with their own eyes, skin, and ears (lighting/sky, horizon at ${elevationFt} ft, physical temperature and wind feel).
3. MODEL COMPARISONS & REASONING:
   - If asked about forecast differences, cite the exact predictions across ECMWF, GFS, HRRR, and the ML lapse rate downscaling.
4. ATTIRE, RAIN & ACTIVITY PLANNING:
   - Give direct, practical, and personalized recommendations based on the exact numbers above.
5. TONE:
   - Conversational, engaging, friendly, intelligent, and natural. Keep responses concise (2 to 4 sentences or clean bullet points). Avoid robotic filler.`;

    // Format past history for context
    const recentHistory = history.slice(-6);
    const formattedHistory = recentHistory.map(h => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`).join('\n');
    const userPrompt = formattedHistory.length > 0
      ? `Recent Conversation:\n${formattedHistory}\n\nUser: ${message}\nAssistant:`
      : `User: ${message}\nAssistant:`;

    const candidateModels = [
      "gemini-3.5-flash-lite",
      "gemini-3.6-flash",
      "gemini-flash-lite-latest",
      "gemini-flash-latest",
    ];

    for (const modelName of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: userPrompt,
          config: {
            systemInstruction,
            temperature: 0.7,
          },
        });

        if (response.text && response.text.trim().length > 0) {
          return response.text.trim();
        }
      } catch (err: any) {
        console.warn(`[Gemini Chat] Model ${modelName} failed:`, err?.message || err);
        const errorMsg = err?.message || String(err);
        const is429 = err?.status === 429 || err?.code === 429 || errorMsg.includes("429") || errorMsg.includes("RESOURCE_EXHAUSTED") || errorMsg.includes("quota");
        if (is429) {
          rateLimitedUntil = Date.now() + 15000;
          break;
        }
        // For 503 / high demand or 404, quietly try next candidate in the cascade
        continue;
      }
    }
  }

  // Deterministic, high-intelligence fallback if API is temporarily unavailable
  return generateSmartFallbackReply(message, forecast);
}

function generateSmartFallbackReply(message: string, forecast: PrecisionForecastResponse): string {
  const text = message.trim();
  const q = text.toLowerCase();

  const tempC = Math.round(forecast.current.temperature);
  const tempF = Math.round(forecast.current.temperature * 1.8 + 32);
  const feelsLikeF = Math.round(forecast.current.apparentTemperature * 1.8 + 32);
  const condition = forecast.current.weatherDescription;
  const conditionLower = condition.toLowerCase();
  const rainMax = Math.max(...(forecast.hourly.precipitationProb?.slice(0, 12) || [0]));
  const windMph = Math.round(forecast.current.windSpeedKmh * 0.621371);
  const windKmh = Math.round(forecast.current.windSpeedKmh);
  const uv = forecast.current.uvIndex;
  const humidity = forecast.current.humidity;
  const clouds = forecast.current.cloudCoverPercent;
  const isDay = (forecast.hourly.isDay && forecast.hourly.isDay.length > 0) ? forecast.hourly.isDay[0] === 1 : (forecast.current.solarRadiationWm2 > 15 || forecast.current.uvIndex > 0);
  const elevationFt = Math.round(forecast.mlBreakdown.actualElevation * 3.28084);
  const locName = forecast.coordinates.locationName || forecast.coordinates.town || "this location";

  // Target location timezone & current local time calculation
  const locTz = forecast.coordinates.timezone || "UTC";
  let locLocalTimeStr = "";
  let locLocalDateStr = "";
  try {
    const now = new Date();
    locLocalDateStr = now.toLocaleDateString("en-US", {
      timeZone: locTz,
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    locLocalTimeStr = now.toLocaleTimeString("en-US", {
      timeZone: locTz,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "short",
    });
  } catch (err) {
    locLocalDateStr = forecast.daily.date?.[0] || "Today";
    locLocalTimeStr = "Local time relative to location timezone";
  }

  // Helper: word boundary test
  const hasWord = (word: string) => new RegExp(`\\b${word}\\b`, 'i').test(q);
  const hasAnyWord = (...words: string[]) => words.some(w => hasWord(w));

  // 1. VISUAL / SCENERY / SENSORY EXPERIENCE ("what would it look like to somebody standing here", "view", "scenery", "look like")
  if (
    q.includes("look like") ||
    q.includes("standing here") ||
    q.includes("standing outside") ||
    q.includes("what do you see") ||
    q.includes("what does it look like") ||
    q.includes("what would i see") ||
    hasAnyWord("view", "scenery", "sight", "landscape", "horizon", "visual")
  ) {
    let skyDescription = "";
    if (clouds <= 15) {
      skyDescription = isDay
        ? "a clear, deep blue sky with uninterrupted sunlight"
        : "a crisp, dark expanse speckled with bright, visible stars";
    } else if (clouds <= 50) {
      skyDescription = isDay
        ? "scattered white cumulus clouds drifting across sunny blue skies"
        : "a moonlit sky with passing, backlit cloud patches and visible constellations";
    } else if (clouds <= 80) {
      skyDescription = isDay
        ? "a broken canopy of silver and grey clouds filtering the ambient daylight"
        : "thick cloud layers drifting overhead, partially veiling the night sky";
    } else {
      skyDescription = isDay
        ? "a solid, overcast grey ceiling giving the landscape a soft, diffused lighting"
        : "a dark, blanketed overcast sky with no visible stars";
    }

    if (conditionLower.includes("rain") || conditionLower.includes("drizzle") || conditionLower.includes("shower")) {
      skyDescription += ", with light rain streaks falling through the air and glistening wet surfaces on the ground.";
    } else if (conditionLower.includes("snow")) {
      skyDescription += ", with gentle snowflakes drifting quietly onto the surrounding terrain.";
    } else if (conditionLower.includes("fog") || conditionLower.includes("mist")) {
      skyDescription += ", wrapped in a soft veil of atmospheric mist and reduced horizon visibility.";
    } else {
      skyDescription += ".";
    }

    let physicalFeel = "";
    if (tempF >= 85) {
      physicalFeel = `The air feels hot and radiant (${tempF}°F)${humidity > 65 ? " with noticeable tropical humidity" : " with dry warmth"}`;
    } else if (tempF >= 68) {
      physicalFeel = `The air feels pleasantly mild and comfortable (${tempF}°F)`;
    } else if (tempF >= 50) {
      physicalFeel = `The air feels crisp and refreshing (${tempF}°F)`;
    } else if (tempF >= 35) {
      physicalFeel = `There is a brisk, cool chill in the air (${tempF}°F)`;
    } else {
      physicalFeel = `It's biting cold (${tempF}°F) with a sharp, freezing bite`;
    }

    let windFeel = "";
    if (windMph <= 3) {
      windFeel = "a calm stillness with barely a breath of wind";
    } else if (windMph <= 10) {
      windFeel = `a gentle ${windMph} mph breeze lightly moving leaves and clothing`;
    } else if (windMph <= 20) {
      windFeel = `a brisk ${windMph} mph wind rustling through trees`;
    } else {
      windFeel = `gusty ${windMph} mph winds that you can distinctly lean against`;
    }

    return `👀 **If you were standing here right now in ${locName} (${elevationFt.toLocaleString()} ft elev.):**\n\n` +
      `• **Sky & Lighting:** You would see ${skyDescription}\n` +
      `• **Atmospheric Feel:** ${physicalFeel}, accompanied by ${windFeel}.\n` +
      `• **Sensory Vibe:** Humidity is sitting at **${humidity}%** with **${clouds}%** cloud coverage. Looking around, conditions feel quiet, clear, and serene.`;
  }

  // 2. GREETINGS & INTRODUCTIONS ("hello", "hi", "hey", "good morning", "yo")
  if (
    hasAnyWord("hello", "hi", "hey", "howdy", "sup", "yo", "greetings") ||
    q === "good morning" ||
    q === "good afternoon" ||
    q === "good evening" ||
    q === "how are you"
  ) {
    return `👋 **Hello!** Right now at **${locName}**, it's **${tempF}°F (${tempC}°C)** under **${conditionLower}** skies with **${windMph} mph** winds.\n\n` +
      `How can I assist you? You can ask about clothing advice, rain timing, outdoor activity suitability, or what it looks and feels like standing outside!`;
  }

  // 3. PLAYFUL / SLANG / MEME QUERIES ("skibidi", "rizz", "test", "joke", "who made you")
  if (hasAnyWord("skibidi", "rizz", "gyatt", "sigma", "bussin", "sus", "meme")) {
    return `⚡ **Zero skibidi, 100% microphysics.** At ${locName}, the atmosphere is currently operating at **${tempF}°F** with **${conditionLower}** skies and **${windMph} mph** wind speed. Everything is running smoothly!`;
  }

  if (hasAnyWord("joke", "funny")) {
    return `😄 **Meteorologist Joke:** Why did the cloud stay home from work?\nBecause it was feeling a little *under the weather*!\n\n(Current condition at ${locName}: **${condition}**, **${tempF}°F**).`;
  }

  if (q.includes("who are you") || q.includes("what can you do") || q.includes("help me with")) {
    return `🤖 I am your **PrecisionCast AI Meteorological Co-Pilot**! I can provide:\n` +
      `• **Sensory & Visual Descriptions**: Ask *"what would it look like standing outside?"*\n` +
      `• **Attire Recommendations**: Ask *"what should I wear today?"*\n` +
      `• **Precipitation Timing**: Ask *"will it rain in the next few hours?"*\n` +
      `• **Outdoor Activity Planning**: Ask *"is it good weather for running or stargazing?"*`;
  }

  // 4. UMBRELLA / RAIN / STORMS / PRECIPITATION
  if (hasAnyWord("umbrella", "rain", "raining", "rainy", "wet", "storm", "storms", "drizzle", "shower", "showers", "thunder", "snow", "hail")) {
    if (rainMax > 40 || conditionLower.includes("rain") || conditionLower.includes("drizzle") || conditionLower.includes("shower") || conditionLower.includes("snow")) {
      return `🌧️ **Yes, bring an umbrella or waterproof jacket!** There is a **${rainMax}% peak precipitation risk** in the near-term forecast with **${conditionLower}** conditions.`;
    } else {
      return `☀️ **No umbrella needed right now.** The precipitation probability is very low (**${rainMax}%**) over the next 12 hours with **${conditionLower}** skies.`;
    }
  }

  // 5. CLOTHING / ATTIRE / OUTFIT ("wear", "jacket", "coat", "clothes", "outfit")
  if (hasAnyWord("wear", "jacket", "coat", "clothes", "clothing", "dress", "outfit", "shoes", "hoodie", "sweater", "shorts")) {
    let clothingAdvice = "";
    if (tempF >= 80) {
      clothingAdvice = "Light, breathable short-sleeves and shorts. Don't forget sunglasses!";
    } else if (tempF >= 65) {
      clothingAdvice = "Comfortable everyday layers (a t-shirt, light overshirt, or long-sleeve tee).";
    } else if (tempF >= 50) {
      clothingAdvice = "A light jacket, fleece, or cozy hoodie.";
    } else if (tempF >= 35) {
      clothingAdvice = "A warm coat, layered sweater, and possibly a light beanie.";
    } else {
      clothingAdvice = "Heavy insulated winter parka, thermal base layers, gloves, and a warm hat.";
    }
    return `🧥 **Attire Recommendation for ${locName}:**\n` +
      `Currently **${tempF}°F** (feels like **${feelsLikeF}°F**).\n` +
      `• **Suggested:** ${clothingAdvice}\n` +
      `• **Rain Gear:** ${rainMax > 30 ? `Pack an umbrella (${rainMax}% rain risk).` : "No rain gear needed today."}`;
  }

  // 6. OUTDOOR ACTIVITIES (Running, cycling, hiking, walking, tennis, dog walk)
  if (hasAnyWord("run", "running", "walk", "walking", "hike", "hiking", "bike", "cycling", "exercise", "workout", "golf", "tennis", "dog", "outdoor", "park")) {
    if (rainMax > 60 || windMph > 25 || tempF > 92 || tempF < 25) {
      return `⚠️ **Outdoor Caution:** Current conditions (${tempF}°F, winds at ${windMph} mph, and ${rainMax}% rain probability) might make outdoor workouts less comfortable. Plan accordingly or bring appropriate gear.`;
    } else {
      return `🏃 **Great conditions for outdoor activities!** With ${conditionLower} skies, comfortable temperatures around **${tempF}°F**, and gentle **${windMph} mph** winds, it's a solid time for a run, walk, or bike ride.`;
    }
  }

  // 7. STARGAZING & NIGHT SKY
  if (hasAnyWord("stargazing", "stars", "astronomy", "telescope", "moon", "aurora", "constellation")) {
    if (!isDay) {
      if (clouds < 25) {
        return `✨ **Exceptional Stargazing Conditions!** Cloud cover is only **${clouds}%** at an elevation of **${elevationFt.toLocaleString()} ft**. The sky is exceptionally clear and dark tonight.`;
      } else if (clouds < 60) {
        return `🌓 **Moderate Stargazing:** There is around **${clouds}% cloud cover**, offering periodic clear windows between passing clouds.`;
      } else {
        return `☁️ **Poor Stargazing Tonight:** Heavy cloud cover (**${clouds}%**) is blocking most celestial views.`;
      }
    } else {
      return `☀️ **It is currently daytime.** For tonight's stargazing, check back after sunset! Cloud cover is forecast around **${clouds}%**.`;
    }
  }

  // 8. SUN, UV & TANNING (Using strict word boundaries)
  if (hasAnyWord("sun", "uv", "sunscreen", "tan", "tanning", "sunburn", "solar", "sunglasses")) {
    let uvMsg = "Low UV exposure.";
    if (uv >= 8) uvMsg = "Very High UV index! Wear SPF 50+ sunscreen, sunglasses, and seek shade during peak hours.";
    else if (uv >= 6) uvMsg = "High UV index. Sunscreen and eye protection strongly advised.";
    else if (uv >= 3) uvMsg = "Moderate UV index. Sun protection recommended if outdoors for extended periods.";

    return `☀️ **Sun & UV Index:**\n` +
      `• **Current UV Index:** **${uv}** (${uvMsg})\n` +
      `• **Cloud Cover:** **${clouds}%** with ${conditionLower} conditions.`;
  }

  // 9. HUMIDITY, DEW POINT, MUGGINESS
  if (hasAnyWord("humid", "humidity", "dew", "dewpoint", "muggy", "sticky", "dry", "moisture", "sweltering")) {
    const dewF = Math.round(forecast.current.dewPoint * 1.8 + 32);
    let comfort = "crisp and very dry";
    if (dewF >= 70) comfort = "oppressively muggy and humid";
    else if (dewF >= 65) comfort = "noticeably humid and sticky";
    else if (dewF >= 60) comfort = "moderately humid";
    else if (dewF >= 50) comfort = "very comfortable and pleasant";

    return `💧 **Humidity & Comfort:**\n` +
      `• **Relative Humidity:** **${humidity}%**\n` +
      `• **Dew Point:** **${dewF}°F** (${Math.round(forecast.current.dewPoint)}°C)\n` +
      `• **Air Sensation:** The air feels **${comfort}**.`;
  }

  // 10. WIND & GUSTS
  if (hasAnyWord("wind", "windy", "breeze", "gust", "gusts", "draft", "gale")) {
    const gustMph = Math.round(forecast.current.windGustsKmh * 0.621371);
    return `💨 **Wind & Air Movement:**\n` +
      `• **Sustained Speed:** **${windMph} mph** (${windKmh} km/h)\n` +
      `• **Peak Gusts:** Up to **${gustMph} mph** (${Math.round(forecast.current.windGustsKmh)} km/h)\n` +
      `• **Direction:** Heading from **${forecast.current.windDirectionDeg}°** with steady atmospheric flow.`;
  }

  // 11. LOCAL DATE & TIME AT TARGET LOCATION
  if (hasAnyWord("date", "time", "timezone", "clock", "what day")) {
    return `🕒 **Local Date & Time at ${locName}:**\n` +
      `• **Local Time:** **${locLocalTimeStr}** (${locTz})\n` +
      `• **Local Date:** **${locLocalDateStr}**\n` +
      `• **Today's High / Low:** **${forecast.daily.tempMax?.[0] != null ? Math.round(forecast.daily.tempMax[0] * 1.8 + 32) : "-"}°F** / **${forecast.daily.tempMin?.[0] != null ? Math.round(forecast.daily.tempMin[0] * 1.8 + 32) : "-"}°F**`;
  }

  // 12. TOMORROW / EXTENDED FORECAST
  if (hasAnyWord("tomorrow", "next day")) {
    if (forecast.daily.tempMax && forecast.daily.tempMax.length > 1) {
      const tomorrow = parseForecastDate(forecast.daily.date?.[1]);
      const maxF = Math.round(forecast.daily.tempMax[1] * 1.8 + 32);
      const minF = Math.round(forecast.daily.tempMin[1] * 1.8 + 32);
      const precip = forecast.daily.precipitationSum ? forecast.daily.precipitationSum[1] : 0;
      const precipIn = (precip * 0.0393701).toFixed(2);
      return `📅 **Forecast for Tomorrow (${tomorrow.weekday}, ${tomorrow.monthDay}):**\n` +
        `• **High / Low:** **${maxF}°F** / **${minF}°F**\n` +
        `• **Precipitation:** **${precip} mm** (${precipIn} in) expected.`;
    }
  }

  if (hasAnyWord("weekend", "forecast", "future", "week", "days")) {
    if (forecast.daily.tempMax && forecast.daily.tempMax.length > 1) {
      const tomorrow = parseForecastDate(forecast.daily.date?.[1]);
      const maxF = Math.round(forecast.daily.tempMax[1] * 1.8 + 32);
      const minF = Math.round(forecast.daily.tempMin[1] * 1.8 + 32);
      const precip = forecast.daily.precipitationSum ? forecast.daily.precipitationSum[1] : 0;
      return `📅 **Upcoming Forecast for ${locName}:**\n` +
        `• **Tomorrow (${tomorrow.weekday}, ${tomorrow.monthDay}):** High of **${maxF}°F**, Low of **${minF}°F** (${precip} mm rain).\n` +
        `• Check the 7-day forecast matrix above for the full daily breakdown!`;
    }
  }

  // 12. GENERAL / DEFAULT SUMMARY
  return `📍 **Current Conditions at ${locName}:**\n` +
    `• **Temperature:** **${tempF}°F (${tempC}°C)**, feels like **${feelsLikeF}°F**\n` +
    `• **Sky:** **${condition}** (${clouds}% cloud cover)\n` +
    `• **Winds & Rain:** **${windMph} mph** breeze, **${rainMax}%** max rain chance today.\n\n` +
    `Ask me anything specific—like what it looks like standing outside, what to wear, or rain timing!`;
}

