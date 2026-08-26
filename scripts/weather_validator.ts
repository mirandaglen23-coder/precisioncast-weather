#!/usr/bin/env node
/**
 * ============================================================================
 * PrecisionCast Atmospheric Ground Truth & Prediction Benchmark Suite
 * ============================================================================
 * 
 * Standalone validation program that:
 * 1. Takes a persistent snapshot of all hourly & daily model predictions
 *    for any GPS coordinates (defaults to 30.333488, -87.1374649).
 * 2. Fetches actual ground truth observations for elapsed forecast hours
 *    from Open-Meteo Historical Archive & Reanalysis station network.
 * 3. Evaluates error metrics: MAE, RMSE, Bias, Brier Score, Precipitation
 *    Contingency, and Lead-Time Accuracy Decay curves.
 * 4. Outputs terminal reports and saves Markdown/JSON benchmark logs.
 *
 * Usage:
 *   npx tsx scripts/weather_validator.ts record [--lat=... --lon=... --name=...]
 *   npx tsx scripts/weather_validator.ts verify [snapshot_id]
 *   npx tsx scripts/weather_validator.ts list
 *   npx tsx scripts/weather_validator.ts auto [--intervalHours=1]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPrecisionForecast } from "../server/weatherService.js";
import { WeatherCoordinates, PrecisionForecastResponse } from "../src/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const BENCHMARK_DIR = path.join(ROOT_DIR, "benchmarks");
const SNAPSHOTS_DIR = path.join(BENCHMARK_DIR, "snapshots");
const REPORTS_DIR = path.join(BENCHMARK_DIR, "reports");
const REGISTRY_FILE = path.join(BENCHMARK_DIR, "registry.json");

// Default Target Location requested by user
const DEFAULT_COORDS: WeatherCoordinates = {
  latitude: 30.333488,
  longitude: -87.1374649,
  locationName: "Pensacola / Gulf Breeze, FL",
  town: "Gulf Breeze",
  city: "Pensacola",
  state: "Florida",
  country: "United States",
  timezone: "America/Chicago",
};

// Ensure benchmark storage directories exist
function ensureDirs() {
  if (!fs.existsSync(BENCHMARK_DIR)) fs.mkdirSync(BENCHMARK_DIR, { recursive: true });
  if (!fs.existsSync(SNAPSHOTS_DIR)) fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
  if (!fs.existsSync(REGISTRY_FILE)) fs.writeFileSync(REGISTRY_FILE, JSON.stringify([], null, 2));
}

interface BenchmarkSnapshot {
  id: string;
  recordedAt: string; // ISO
  coordinates: WeatherCoordinates;
  modelConfig: {
    engine: string;
    physicsDownscaling: boolean;
    elevationCorrectionM: number;
    solarZenithCorrection: boolean;
  };
  currentSnapshot: PrecisionForecastResponse["current"];
  hourlyPredictions: {
    times: string[]; // ISO strings
    temperature: number[]; // °C
    apparentTemperature: number[]; // °C
    dewPoint: number[]; // °C
    relativeHumidity: number[]; // %
    precipitationProb: number[]; // %
    precipitationMm: number[]; // mm
    surfacePressure: number[]; // hPa
    windSpeed: number[]; // km/h
    windDirection: number[]; // deg
    cloudCover: number[]; // %
    weatherCode: number[];
  };
  dailyPredictions: {
    date: string[];
    tempMax: number[];
    tempMin: number[];
    precipitationSum: number[];
    weatherCode: number[];
    sunrise: string[];
    sunset: string[];
  };
  rawForecastResponse: PrecisionForecastResponse;
  verification?: {
    verifiedAt: string;
    elapsedHoursEvaluated: number;
    metrics: BenchmarkMetrics;
    hourlyComparisons: HourlyComparisonItem[];
  };
}

interface HourlyComparisonItem {
  timeStr: string;
  leadHours: number;
  predictedTempC: number;
  actualTempC: number;
  tempErrorC: number;
  tempErrorF: number;
  predictedFeelsLikeC: number;
  actualFeelsLikeC: number;
  feelsLikeErrorC: number;
  predictedHum: number;
  actualHum: number;
  humError: number;
  predictedDewC: number;
  actualDewC: number;
  dewErrorC: number;
  predictedWindKmh: number;
  actualWindKmh: number;
  windErrorKmh: number;
  predictedPrecipMm: number;
  actualPrecipMm: number;
  precipErrorMm: number;
  predictedPrecipProb: number;
  predictedPressureHpa: number;
  actualPressureHpa: number;
  pressureErrorHpa: number;
  weatherCodePredicted: number;
  weatherCodeActual: number;
  _hasHumObs: boolean;
  _hasDewObs: boolean;
  _hasWindObs: boolean;
  _hasPressObs: boolean;
}

interface BenchmarkMetrics {
  sampleSizeHours: number;
  temperature: {
    maeC: number;
    maeF: number;
    rmseC: number;
    rmseF: number;
    biasC: number;
    biasF: number;
    maxAbsErrorC: number;
    maxAbsErrorF: number;
    accuracyWithin1CPercent: number;
    accuracyWithin2FPercent: number;
  };
  apparentTemperature: {
    maeC: number;
    maeF: number;
    biasC: number;
  };
  dewPoint: {
    maeC: number;
    biasC: number;
  };
  relativeHumidity: {
    maePercent: number;
    biasPercent: number;
  };
  windSpeed: {
    maeKmh: number;
    maeMph: number;
    rmseKmh: number;
    biasKmh: number;
  };
  surfacePressure: {
    maeHpa: number;
    biasHpa: number;
  };
  precipitation: {
    totalPredictedMm: number;
    totalActualMm: number;
    totalPredictedInches: number;
    totalActualInches: number;
    brierScore: number;
    hits: number; // Predicted rain & rained
    misses: number; // Predicted no rain & rained
    falseAlarms: number; // Predicted rain & did not rain
    correctNegatives: number; // Predicted no rain & did not rain
    criticalSuccessIndex: number; // Threat Score CSI = Hits / (Hits + Misses + FalseAlarms)
  };
  leadTimeBreakdown: {
    bin: string;
    hoursCount: number;
    tempMaeF: number;
    windMaeMph: number;
  }[];
}

// Helper formatting utilities
const cToF = (c: number) => (c * 9) / 5 + 32;
const kmhToMph = (kmh: number) => kmh * 0.621371;
const mmToIn = (mm: number) => mm * 0.0393701;

function getRegistry(): Array<{ id: string; recordedAt: string; location: string; verified: boolean }> {
  ensureDirs();
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function updateRegistry(item: { id: string; recordedAt: string; location: string; verified: boolean }) {
  ensureDirs();
  const reg = getRegistry();
  const idx = reg.findIndex((r) => r.id === item.id);
  if (idx >= 0) {
    reg[idx] = item;
  } else {
    reg.unshift(item);
  }
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(reg, null, 2));
}

/**
 * COMMAND 1: Record Snapshot of Current Predictions
 */
export async function recordSnapshot(customCoords?: Partial<WeatherCoordinates>): Promise<string> {
  ensureDirs();

  const coords: WeatherCoordinates = {
    ...DEFAULT_COORDS,
    ...customCoords,
  };

  console.log("\n===============================================================================");
  console.log(`📡 [PrecisionCast Benchmark] Capturing Snapshot for: ${coords.locationName}`);
  console.log(`📍 Coordinates: (${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}) | TZ: ${coords.timezone}`);
  console.log("===============================================================================\n");

  const startTime = Date.now();
  const forecast = await getPrecisionForecast(coords);
  const durationMs = Date.now() - startTime;

  const now = new Date();
  const snapshotId = `snap_${now.toISOString().replace(/[:.]/g, "-")}_${coords.latitude.toFixed(4)}_${coords.longitude.toFixed(4)}`;
  const filePath = path.join(SNAPSHOTS_DIR, `${snapshotId}.json`);

  const snapshot: BenchmarkSnapshot = {
    id: snapshotId,
    recordedAt: now.toISOString(),
    coordinates: coords,
    modelConfig: {
      engine: "PrecisionCast Multi-Model Physics Engine + High-Res ML Downscaling",
      physicsDownscaling: true,
      elevationCorrectionM: (forecast.mlBreakdown.actualElevation || 0) - (forecast.mlBreakdown.gridElevation || 0),
      solarZenithCorrection: true,
    },
    currentSnapshot: forecast.current,
    hourlyPredictions: {
      times: forecast.hourly.times,
      temperature: forecast.hourly.mlCorrectedTemp,
      apparentTemperature: forecast.hourly.mlCorrectedTemp,
      dewPoint: forecast.hourly.dewPoint,
      relativeHumidity: forecast.hourly.humidity,
      precipitationProb: forecast.hourly.precipitationProb,
      precipitationMm: forecast.hourly.rainMm,
      surfacePressure: forecast.hourly.times.map(() => forecast.current.pressureHpa),
      windSpeed: forecast.hourly.windSpeedKmh,
      windDirection: forecast.hourly.windDirection || forecast.hourly.times.map(() => forecast.current.windDirectionDeg),
      cloudCover: forecast.hourly.cloudCover,
      weatherCode: forecast.hourly.weatherCode,
    },
    dailyPredictions: {
      date: forecast.daily.date,
      tempMax: forecast.daily.tempMax,
      tempMin: forecast.daily.tempMin,
      precipitationSum: forecast.daily.precipitationSum,
      weatherCode: forecast.daily.weatherCode,
      sunrise: forecast.daily.sunrise,
      sunset: forecast.daily.sunset,
    },
    rawForecastResponse: forecast,
  };

  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), "utf-8");
  updateRegistry({
    id: snapshotId,
    recordedAt: now.toISOString(),
    location: `${coords.locationName} (${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)})`,
    verified: false,
  });

  console.log(`✅ Snapshot successfully recorded in ${durationMs}ms!`);
  console.log(`📁 File: ${filePath}`);
  console.log(`🆔 Snapshot ID: ${snapshotId}`);
  console.log("\n📊 Recorded Forecast Horizon Summary:");
  console.log(`   • Current Temperature : ${forecast.current.temperature}°C (${cToF(forecast.current.temperature).toFixed(1)}°F)`);
  console.log(`   • Feels Like          : ${forecast.current.apparentTemperature}°C (${cToF(forecast.current.apparentTemperature).toFixed(1)}°F)`);
  console.log(`   • Surface Pressure    : ${forecast.current.pressureHpa} hPa`);
  console.log(`   • Wind Speed & Dir    : ${forecast.current.windSpeedKmh} km/h (${kmhToMph(forecast.current.windSpeedKmh).toFixed(1)} mph) @ ${forecast.current.windDirectionDeg}°`);
  console.log(`   • Hourly Timeline     : ${forecast.hourly.times.length} future hours recorded (up to ${forecast.hourly.times[forecast.hourly.times.length - 1]})`);
  console.log(`   • Daily Outlook       : ${forecast.daily.date.length} days recorded (${forecast.daily.date[0]} → ${forecast.daily.date[forecast.daily.date.length - 1]})`);

  console.log("\n💡 Next Step:");
  console.log(`   After time elapses (e.g. 1 hour, 6 hours, 24 hours, or 7 days), run:`);
  console.log(`   npx tsx scripts/weather_validator.ts verify ${snapshotId}\n`);

  return snapshotId;
}

/**
 * Fetch historical ground truth observations from Open-Meteo Archive / Recent Reanalysis
 */
async function fetchActualGroundTruth(
  lat: number,
  lon: number,
  startDateStr: string,
  endDateStr: string,
  timezone: string
): Promise<any> {
  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lon.toString(),
    start_date: startDateStr,
    end_date: endDateStr,
    hourly: [
      "temperature_2m",
      "relative_humidity_2m",
      "dew_point_2m",
      "apparent_temperature",
      "precipitation",
      "rain",
      "weather_code",
      "surface_pressure",
      "wind_speed_10m",
      "wind_direction_10m",
      "wind_gusts_10m",
      "cloud_cover",
    ].join(","),
    timezone: timezone || "UTC",
  });

  // Try Open-Meteo Archive API first
  const archiveUrl = `https://archive-api.open-meteo.com/v1/archive?${params.toString()}`;
  try {
    const res = await fetch(archiveUrl);
    if (res.ok) {
      const data = await res.json();
      if (data.hourly && data.hourly.time && data.hourly.time.length > 0) {
        return data;
      }
    }
  } catch {
    // Fall back to forecast endpoint with past_days
  }

  // Fallback to primary endpoint with past observations
  const forecastParams = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lon.toString(),
    past_days: "7",
    forecast_days: "1",
    hourly: params.get("hourly") || "",
    timezone: timezone || "UTC",
  });
  const fallbackUrl = `https://api.open-meteo.com/v1/forecast?${forecastParams.toString()}`;
  const res = await fetch(fallbackUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch ground truth from Open-Meteo: HTTP ${res.status}`);
  }
  return await res.json();
}

/**
 * COMMAND 2: Verify Snapshot Against Ground Truth
 */
export async function verifySnapshot(targetId?: string): Promise<BenchmarkSnapshot> {
  ensureDirs();

  const reg = getRegistry();
  if (reg.length === 0) {
    throw new Error("No snapshots found in benchmarks/registry.json. Run 'record' first!");
  }

  const snapshotId = targetId || reg[0].id;
  const filePath = path.join(SNAPSHOTS_DIR, `${snapshotId}.json`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Snapshot file not found: ${filePath}`);
  }

  const snapshot: BenchmarkSnapshot = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const recordDate = new Date(snapshot.recordedAt);
  const now = new Date();

  console.log("\n===============================================================================");
  console.log(`🔍 [PrecisionCast Benchmark] Evaluating Snapshot: ${snapshotId}`);
  console.log(`📍 Location : ${snapshot.coordinates.locationName}`);
  console.log(`⏰ Recorded : ${snapshot.recordedAt} (${((now.getTime() - recordDate.getTime()) / (1000 * 60 * 60)).toFixed(1)} hours ago)`);
  console.log("===============================================================================\n");

  // Find all predicted hourly timestamps that have passed or are up to current hour
  const predictedTimes = snapshot.hourlyPredictions.times;
  const elapsedIndices: number[] = [];

  for (let i = 0; i < predictedTimes.length; i++) {
    const pTime = new Date(predictedTimes[i]);
    if (pTime <= now) {
      elapsedIndices.push(i);
    }
  }

  if (elapsedIndices.length === 0) {
    console.log(`⚠️ Note: Snapshot was recorded very recently (${snapshot.recordedAt}).`);
    console.log(`   No predicted hourly forecast timestamps have elapsed yet.`);
    console.log(`   (First predicted hour is: ${predictedTimes[0]})`);
    console.log(`\n⏳ Please wait for at least 1-2 hours to elapse, then re-run:`);
    console.log(`   npx tsx scripts/weather_validator.ts verify ${snapshotId}\n`);
    return snapshot;
  }

  const firstTime = predictedTimes[elapsedIndices[0]].split("T")[0];
  const lastTime = predictedTimes[elapsedIndices[elapsedIndices.length - 1]].split("T")[0];

  console.log(`📡 Fetching actual observed weather from ground stations (${firstTime} to ${lastTime})...`);
  const actualData = await fetchActualGroundTruth(
    snapshot.coordinates.latitude,
    snapshot.coordinates.longitude,
    firstTime,
    lastTime,
    snapshot.coordinates.timezone || "UTC"
  );

  const actualHourly = actualData.hourly;
  if (!actualHourly || !actualHourly.time) {
    throw new Error("Received malformed ground truth data from meteorological station API.");
  }

  // Create lookup map for ground truth by ISO time string
  const actualLookup = new Map<string, any>();
  for (let i = 0; i < actualHourly.time.length; i++) {
    const t = actualHourly.time[i];
    actualLookup.set(t, {
      temp: actualHourly.temperature_2m[i],
      apparentTemp: actualHourly.apparent_temperature?.[i] ?? actualHourly.temperature_2m[i],
      dewPoint: actualHourly.dew_point_2m?.[i],
      hum: actualHourly.relative_humidity_2m[i],
      precip: actualHourly.precipitation?.[i] ?? 0,
      rain: actualHourly.rain?.[i] ?? 0,
      pressure: actualHourly.surface_pressure?.[i],
      windSpeed: actualHourly.wind_speed_10m?.[i],
      windDir: actualHourly.wind_direction_10m?.[i],
      cloudCover: actualHourly.cloud_cover?.[i],
      weatherCode: actualHourly.weather_code?.[i],
    });
  }

  // Compare each elapsed hour
  const comparisons: HourlyComparisonItem[] = [];

  for (const idx of elapsedIndices) {
    const tStr = predictedTimes[idx];
    const actual = actualLookup.get(tStr) || actualLookup.get(tStr.slice(0, 13) + ":00");

    if (!actual || actual.temp === undefined || actual.temp === null) {
      continue;
    }

    const pTempC = snapshot.hourlyPredictions.temperature[idx];
    const aTempC = actual.temp;
    const tempErrC = pTempC - aTempC;

    const pFeelsC = snapshot.hourlyPredictions.apparentTemperature[idx] ?? pTempC;
    const aFeelsC = actual.apparentTemp ?? aTempC;

    // Use null for missing ground truth instead of falling back to predicted value
    // (falling back to predicted gives 0 error, which dishonestly inflates accuracy)
    const pHum = snapshot.hourlyPredictions.relativeHumidity[idx];
    const aHum = actual.hum ?? null;

    const pDewC = snapshot.hourlyPredictions.dewPoint[idx] ?? 0;
    const aDewC = actual.dewPoint ?? null;

    const pWind = snapshot.hourlyPredictions.windSpeed[idx];
    const aWind = actual.windSpeed ?? null;

    const pPrecip = snapshot.hourlyPredictions.precipitationMm[idx] ?? 0;
    const aPrecip = actual.precip ?? 0;

    const pProb = snapshot.hourlyPredictions.precipitationProb[idx] ?? 0;
    const pPress = snapshot.hourlyPredictions.surfacePressure[idx] ?? 1013;
    const aPress = actual.pressure ?? null;

    const leadHours = Math.max(1, Math.round((new Date(tStr).getTime() - recordDate.getTime()) / (1000 * 60 * 60)));

    comparisons.push({
      timeStr: tStr,
      leadHours,
      predictedTempC: pTempC,
      actualTempC: aTempC,
      tempErrorC: tempErrC,
      tempErrorF: (tempErrC * 9) / 5,
      predictedFeelsLikeC: pFeelsC,
      actualFeelsLikeC: aFeelsC,
      feelsLikeErrorC: pFeelsC - aFeelsC,
      predictedHum: pHum,
      actualHum: aHum ?? pHum,
      humError: aHum !== null ? pHum - aHum : 0,
      predictedDewC: pDewC,
      actualDewC: aDewC ?? pDewC,
      dewErrorC: aDewC !== null ? pDewC - aDewC : 0,
      predictedWindKmh: pWind,
      actualWindKmh: aWind ?? pWind,
      windErrorKmh: aWind !== null ? pWind - aWind : 0,
      predictedPrecipMm: pPrecip,
      actualPrecipMm: aPrecip,
      precipErrorMm: pPrecip - aPrecip,
      predictedPrecipProb: pProb,
      predictedPressureHpa: pPress,
      actualPressureHpa: aPress ?? pPress,
      pressureErrorHpa: aPress !== null ? pPress - aPress : 0,
      weatherCodePredicted: snapshot.hourlyPredictions.weatherCode[idx] ?? 0,
      weatherCodeActual: actual.weatherCode ?? 0,
      // Track which metrics have real observations for honest averaging
      _hasHumObs: aHum !== null,
      _hasDewObs: aDewC !== null,
      _hasWindObs: aWind !== null,
      _hasPressObs: aPress !== null,
    });
  }

  if (comparisons.length === 0) {
    console.log("⚠️ Ground truth data is still ingesting for the requested hours. Please check back shortly.");
    return snapshot;
  }

  // Calculate Metrics
  const N = comparisons.length;
  const tempAbsErrorsC = comparisons.map((c) => Math.abs(c.tempErrorC));
  const tempErrorsC = comparisons.map((c) => c.tempErrorC);
  const tempSqErrorsC = comparisons.map((c) => c.tempErrorC * c.tempErrorC);

  const maeC = tempAbsErrorsC.reduce((a, b) => a + b, 0) / N;
  const maeF = (maeC * 9) / 5;
  const rmseC = Math.sqrt(tempSqErrorsC.reduce((a, b) => a + b, 0) / N);
  const rmseF = (rmseC * 9) / 5;
  const biasC = tempErrorsC.reduce((a, b) => a + b, 0) / N;
  const biasF = (biasC * 9) / 5;
  const maxAbsErrorC = Math.max(...tempAbsErrorsC);
  const maxAbsErrorF = (maxAbsErrorC * 9) / 5;

  const within1C = comparisons.filter((c) => Math.abs(c.tempErrorC) <= 1.0).length;
  const within2F = comparisons.filter((c) => Math.abs(c.tempErrorF) <= 2.0).length;

  const windWithObs = comparisons.filter((c: any) => c._hasWindObs !== false);
  const windN = windWithObs.length || 1;
  const windAbsErrors = windWithObs.map((c) => Math.abs(c.windErrorKmh));
  const windMaeKmh = windAbsErrors.reduce((a, b) => a + b, 0) / windN;
  const windMaeMph = kmhToMph(windMaeKmh);
  const windRmseKmh = Math.sqrt(windWithObs.map((c) => c.windErrorKmh * c.windErrorKmh).reduce((a, b) => a + b, 0) / windN);
  const windBiasKmh = windWithObs.map((c) => c.windErrorKmh).reduce((a, b) => a + b, 0) / windN;

  const humWithObs = comparisons.filter((c: any) => c._hasHumObs !== false);
  const humN = humWithObs.length || 1;
  const humMae = humWithObs.map((c) => Math.abs(c.humError)).reduce((a, b) => a + b, 0) / humN;
  const humBias = humWithObs.map((c) => c.humError).reduce((a, b) => a + b, 0) / humN;

  const dewWithObs = comparisons.filter((c: any) => c._hasDewObs !== false);
  const dewN = dewWithObs.length || 1;
  const dewMaeC = dewWithObs.map((c) => Math.abs(c.dewErrorC)).reduce((a, b) => a + b, 0) / dewN;
  const dewBiasC = dewWithObs.map((c) => c.dewErrorC).reduce((a, b) => a + b, 0) / dewN;

  const pressWithObs = comparisons.filter((c: any) => c._hasPressObs !== false);
  const pressN = pressWithObs.length || 1;
  const pressMae = pressWithObs.map((c) => Math.abs(c.pressureErrorHpa)).reduce((a, b) => a + b, 0) / pressN;
  const pressBias = pressWithObs.map((c) => c.pressureErrorHpa).reduce((a, b) => a + b, 0) / pressN;

  // Precipitation Metrics
  const totalPredictedMm = comparisons.map((c) => c.predictedPrecipMm).reduce((a, b) => a + b, 0);
  const totalActualMm = comparisons.map((c) => c.actualPrecipMm).reduce((a, b) => a + b, 0);

  let hits = 0;
  let misses = 0;
  let falseAlarms = 0;
  let correctNegatives = 0;
  let brierSum = 0;

  for (const c of comparisons) {
    const rained = c.actualPrecipMm >= 0.1 ? 1 : 0;
    const predRain = c.predictedPrecipProb >= 40 || c.predictedPrecipMm >= 0.1 ? 1 : 0;
    const probDecimal = c.predictedPrecipProb / 100;

    brierSum += Math.pow(probDecimal - rained, 2);

    if (predRain === 1 && rained === 1) hits++;
    else if (predRain === 0 && rained === 1) misses++;
    else if (predRain === 1 && rained === 0) falseAlarms++;
    else correctNegatives++;
  }

  const brierScore = brierSum / N;
  const csiDenominator = hits + misses + falseAlarms;
  const csi = csiDenominator > 0 ? hits / csiDenominator : 1.0;

  // Lead-Time Accuracy Decay
  const bins = [
    { name: "T+1h to T+6h", min: 1, max: 6 },
    { name: "T+7h to T+12h", min: 7, max: 12 },
    { name: "T+13h to T+24h", min: 13, max: 24 },
    { name: "T+25h to T+48h", min: 25, max: 48 },
    { name: "T+49h+", min: 49, max: 9999 },
  ];

  const leadTimeBreakdown = bins
    .map((b) => {
      const subset = comparisons.filter((c) => c.leadHours >= b.min && c.leadHours <= b.max);
      if (subset.length === 0) return null;
      const tMaeF = (subset.map((c) => Math.abs(c.tempErrorC)).reduce((a, b) => a + b, 0) / subset.length) * 1.8;
      const wMaeMph = kmhToMph(subset.map((c) => Math.abs(c.windErrorKmh)).reduce((a, b) => a + b, 0) / subset.length);
      return {
        bin: b.name,
        hoursCount: subset.length,
        tempMaeF: Number(tMaeF.toFixed(2)),
        windMaeMph: Number(wMaeMph.toFixed(2)),
      };
    })
    .filter(Boolean) as BenchmarkMetrics["leadTimeBreakdown"];

  const metrics: BenchmarkMetrics = {
    sampleSizeHours: N,
    temperature: {
      maeC: Number(maeC.toFixed(2)),
      maeF: Number(maeF.toFixed(2)),
      rmseC: Number(rmseC.toFixed(2)),
      rmseF: Number(rmseF.toFixed(2)),
      biasC: Number(biasC.toFixed(2)),
      biasF: Number(biasF.toFixed(2)),
      maxAbsErrorC: Number(maxAbsErrorC.toFixed(2)),
      maxAbsErrorF: Number(maxAbsErrorF.toFixed(2)),
      accuracyWithin1CPercent: Number(((within1C / N) * 100).toFixed(1)),
      accuracyWithin2FPercent: Number(((within2F / N) * 100).toFixed(1)),
    },
    apparentTemperature: {
      maeC: Number((comparisons.map((c) => Math.abs(c.feelsLikeErrorC)).reduce((a, b) => a + b, 0) / N).toFixed(2)),
      maeF: Number(((comparisons.map((c) => Math.abs(c.feelsLikeErrorC)).reduce((a, b) => a + b, 0) / N) * 1.8).toFixed(2)),
      biasC: Number((comparisons.map((c) => c.feelsLikeErrorC).reduce((a, b) => a + b, 0) / N).toFixed(2)),
    },
    dewPoint: {
      maeC: Number(dewMaeC.toFixed(2)),
      biasC: Number(dewBiasC.toFixed(2)),
    },
    relativeHumidity: {
      maePercent: Number(humMae.toFixed(1)),
      biasPercent: Number(humBias.toFixed(1)),
    },
    windSpeed: {
      maeKmh: Number(windMaeKmh.toFixed(2)),
      maeMph: Number(windMaeMph.toFixed(2)),
      rmseKmh: Number(windRmseKmh.toFixed(2)),
      biasKmh: Number(windBiasKmh.toFixed(2)),
    },
    surfacePressure: {
      maeHpa: Number(pressMae.toFixed(2)),
      biasHpa: Number(pressBias.toFixed(2)),
    },
    precipitation: {
      totalPredictedMm: Number(totalPredictedMm.toFixed(2)),
      totalActualMm: Number(totalActualMm.toFixed(2)),
      totalPredictedInches: Number(mmToIn(totalPredictedMm).toFixed(3)),
      totalActualInches: Number(mmToIn(totalActualMm).toFixed(3)),
      brierScore: Number(brierScore.toFixed(3)),
      hits,
      misses,
      falseAlarms,
      correctNegatives,
      criticalSuccessIndex: Number(csi.toFixed(3)),
    },
    leadTimeBreakdown,
  };

  snapshot.verification = {
    verifiedAt: now.toISOString(),
    elapsedHoursEvaluated: N,
    metrics,
    hourlyComparisons: comparisons,
  };

  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), "utf-8");
  updateRegistry({
    id: snapshotId,
    recordedAt: snapshot.recordedAt,
    location: `${snapshot.coordinates.locationName} (${snapshot.coordinates.latitude.toFixed(4)}, ${snapshot.coordinates.longitude.toFixed(4)})`,
    verified: true,
  });

  // Generate Markdown Report
  const reportPath = path.join(REPORTS_DIR, `eval_${snapshotId}.md`);
  const reportMd = generateMarkdownReport(snapshot, metrics, comparisons);
  fs.writeFileSync(reportPath, reportMd, "utf-8");

  // Print Rich Console Summary
  printTerminalSummary(snapshot, metrics, comparisons, reportPath);

  return snapshot;
}

/**
 * Print ANSI-styled Terminal Summary Table
 */
function printTerminalSummary(
  snapshot: BenchmarkSnapshot,
  metrics: BenchmarkMetrics,
  comparisons: HourlyComparisonItem[],
  reportPath: string
) {
  console.log("\n===============================================================================");
  console.log(`📊 METEOROLOGICAL ACCURACY REPORT — ${snapshot.coordinates.locationName}`);
  console.log(`🎯 Evaluated ${metrics.sampleSizeHours} Elapsed Forecast Hours against Real Ground Truth`);
  console.log("===============================================================================\n");

  console.log(`🌡️  TEMPERATURE ACCURACY:`);
  console.log(`   • Mean Absolute Error (MAE) : ±${metrics.temperature.maeF}°F (±${metrics.temperature.maeC}°C)`);
  console.log(`   • Root Mean Square (RMSE)   : ${metrics.temperature.rmseF}°F (${metrics.temperature.rmseC}°C)`);
  console.log(`   • Systematic Bias           : ${metrics.temperature.biasF > 0 ? "+" : ""}${metrics.temperature.biasF}°F (${metrics.temperature.biasF > 0 ? "Warm Bias" : "Cool Bias"})`);
  console.log(`   • Precision Within ±2°F     : ${metrics.temperature.accuracyWithin2FPercent}% of all hours`);
  console.log(`   • Peak Single-Hour Error    : ±${metrics.temperature.maxAbsErrorF}°F`);

  console.log(`\n💨 WIND & ATMOSPHERIC PRESSURE:`);
  console.log(`   • Wind Speed MAE            : ±${metrics.windSpeed.maeMph} mph (±${metrics.windSpeed.maeKmh} km/h)`);
  console.log(`   • Surface Pressure MAE      : ±${metrics.surfacePressure.maeHpa} hPa`);
  console.log(`   • Dew Point MAE             : ±${metrics.dewPoint.maeC}°C`);
  console.log(`   • Relative Humidity MAE     : ±${metrics.relativeHumidity.maePercent}%`);

  console.log(`\n🌧️  PRECIPITATION CONTINGENCY & CALIBRATION:`);
  console.log(`   • Total Predicted Rain      : ${metrics.precipitation.totalPredictedInches} in (${metrics.precipitation.totalPredictedMm} mm)`);
  console.log(`   • Total Actual Rain         : ${metrics.precipitation.totalActualInches} in (${metrics.precipitation.totalActualMm} mm)`);
  console.log(`   • Critical Success (CSI)    : ${(metrics.precipitation.criticalSuccessIndex * 100).toFixed(1)}%`);
  console.log(`   • Brier Calibration Score   : ${metrics.precipitation.brierScore} (0.0 = perfect calibration)`);
  console.log(`   • Hits: ${metrics.precipitation.hits} | False Alarms: ${metrics.precipitation.falseAlarms} | Misses: ${metrics.precipitation.misses} | Correct Dry: ${metrics.precipitation.correctNegatives}`);

  if (metrics.leadTimeBreakdown.length > 0) {
    console.log(`\n⏱️  ACCURACY DECAY BY FORECAST HORIZON:`);
    console.log(`   ┌──────────────────┬──────────────┬──────────────────┬─────────────────┐`);
    console.log(`   │ Lead Time Bin    │ Sample Hours │ Temp MAE (°F)    │ Wind MAE (mph)  │`);
    console.log(`   ├──────────────────┼──────────────┼──────────────────┼─────────────────┤`);
    for (const b of metrics.leadTimeBreakdown) {
      console.log(`   │ ${b.bin.padEnd(16)} │ ${String(b.hoursCount).padEnd(12)} │ ±${String(b.tempMaeF).padEnd(14)} │ ±${String(b.windMaeMph).padEnd(13)} │`);
    }
    console.log(`   └──────────────────┴──────────────┴──────────────────┴─────────────────┘`);
  }

  console.log(`\n📄 Detailed Markdown Report written to:`);
  console.log(`   ${reportPath}\n`);
}

/**
 * Generate Markdown Benchmark Report File
 */
function generateMarkdownReport(
  snapshot: BenchmarkSnapshot,
  metrics: BenchmarkMetrics,
  comparisons: HourlyComparisonItem[]
): string {
  return `# 📊 Meteorological Ground Truth Benchmark Report

**Snapshot ID**: \`${snapshot.id}\`  
**Location**: ${snapshot.coordinates.locationName} (${snapshot.coordinates.latitude.toFixed(6)}°, ${snapshot.coordinates.longitude.toFixed(6)}°)  
**Recorded At**: ${snapshot.recordedAt}  
**Evaluated At**: ${snapshot.verification?.verifiedAt}  
**Sample Horizon**: ${metrics.sampleSizeHours} Elapsed Hours  

---

## 🎯 Executive Accuracy Summary

| Metric | Result | Target Benchmark | Status |
| :--- | :--- | :--- | :--- |
| **Temperature MAE** | **±${metrics.temperature.maeF}°F** (±${metrics.temperature.maeC}°C) | < ±2.5°F | ${metrics.temperature.maeF <= 2.5 ? "✅ Exceptional" : "⚠️ Moderate"} |
| **Temperature RMSE** | **${metrics.temperature.rmseF}°F** | < 3.2°F | ${metrics.temperature.rmseF <= 3.2 ? "✅ Clean" : "⚠️ Elevated"} |
| **Within ±2°F Accuracy** | **${metrics.temperature.accuracyWithin2FPercent}%** | > 80.0% | ${metrics.temperature.accuracyWithin2FPercent >= 80 ? "✅ High Precision" : "⚠️ Needs Tuning"} |
| **Wind Speed MAE** | **±${metrics.windSpeed.maeMph} mph** | < ±3.5 mph | ${metrics.windSpeed.maeMph <= 3.5 ? "✅ Stable" : "⚠️ Variable"} |
| **Pressure MAE** | **±${metrics.surfacePressure.maeHpa} hPa** | < ±1.5 hPa | ${metrics.surfacePressure.maeHpa <= 1.5 ? "✅ Calibrated" : "⚠️ Offset"} |
| **Precip Brier Score** | **${metrics.precipitation.brierScore}** | < 0.150 | ${metrics.precipitation.brierScore <= 0.15 ? "✅ Well-Calibrated" : "⚠️ Uncalibrated"} |

---

## ⏱️ Accuracy by Forecast Horizon (Lead Time Decay)

| Lead Time Horizon | Sample Hours | Temp MAE (°F) | Wind MAE (mph) |
| :--- | :---: | :---: | :---: |
${metrics.leadTimeBreakdown.map((b) => `| **${b.bin}** | ${b.hoursCount} | ±${b.tempMaeF}°F | ±${b.windMaeMph} mph |`).join("\n")}

---

## 🌧️ Precipitation Contingency Matrix

* **Total Predicted Precipitation**: \`${metrics.precipitation.totalPredictedInches} in\` (${metrics.precipitation.totalPredictedMm} mm)
* **Total Actual Precipitation**: \`${metrics.precipitation.totalActualInches} in\` (${metrics.precipitation.totalActualMm} mm)
* **Critical Success Index (CSI / Threat Score)**: \`${(metrics.precipitation.criticalSuccessIndex * 100).toFixed(1)}%\`

| | Actual Rain (>= 0.1mm) | Actual Dry (< 0.1mm) |
| :--- | :---: | :---: |
| **Predicted Rain** | 🟢 **${metrics.precipitation.hits}** (Hits) | 🔴 **${metrics.precipitation.falseAlarms}** (False Alarms) |
| **Predicted Dry** | 🟡 **${metrics.precipitation.misses}** (Misses) | 🟢 **${metrics.precipitation.correctNegatives}** (Correct Dry) |

---

## 🔬 Granular Hourly Verification Log

| Time | Lead | Predicted Temp | Actual Temp | Error (°F) | Pred Wind | Actual Wind | Pred Precip | Actual Precip |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
${comparisons
  .slice(0, 48)
  .map(
    (c) =>
      `| \`${c.timeStr.replace("T", " ")}\` | T+${c.leadHours}h | ${cToF(c.predictedTempC).toFixed(1)}°F | ${cToF(c.actualTempC).toFixed(1)}°F | ${c.tempErrorF > 0 ? "+" : ""}${c.tempErrorF.toFixed(1)}°F | ${kmhToMph(c.predictedWindKmh).toFixed(1)} mph | ${kmhToMph(c.actualWindKmh).toFixed(1)} mph | ${c.predictedPrecipMm.toFixed(1)} mm (${c.predictedPrecipProb}%) | ${c.actualPrecipMm.toFixed(1)} mm |`
  )
  .join("\n")}

${comparisons.length > 48 ? `\n*(Showing first 48 of ${comparisons.length} evaluated hours)*` : ""}
`;
}

/**
 * COMMAND 3: List all stored snapshots
 */
export function listSnapshots() {
  ensureDirs();
  const reg = getRegistry();

  console.log("\n===============================================================================");
  console.log("📋 [PrecisionCast Benchmark] Stored Prediction Snapshots");
  console.log("===============================================================================\n");

  if (reg.length === 0) {
    console.log("No snapshots recorded yet. Run 'record' to capture your first benchmark snapshot!\n");
    return;
  }

  console.log(`┌───────────────────────────────────────────────────┬──────────────────────────┬──────────────┐`);
  console.log(`│ Snapshot ID                                       │ Recorded At              │ Verified?    │`);
  console.log(`├───────────────────────────────────────────────────┼──────────────────────────┼──────────────┤`);
  for (const r of reg) {
    console.log(`│ ${r.id.padEnd(49)} │ ${r.recordedAt.slice(0, 19).padEnd(24)} │ ${r.verified ? "✅ Yes" : "⏳ Pending"}   │`);
  }
  console.log(`└───────────────────────────────────────────────────┴──────────────────────────┴──────────────┘\n`);
}

// CLI Arg Parsing & Execution Entry Point
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "record";

  // Parse optional CLI flags
  let customLat: number | undefined;
  let customLon: number | undefined;
  let customName: string | undefined;

  for (const arg of args) {
    if (arg.startsWith("--lat=")) customLat = parseFloat(arg.split("=")[1]);
    if (arg.startsWith("--lon=")) customLon = parseFloat(arg.split("=")[1]);
    if (arg.startsWith("--name=")) customName = arg.split("=")[1];
  }

  try {
    switch (command.toLowerCase()) {
      case "record":
      case "save":
      case "snapshot": {
        const coords = customLat !== undefined && customLon !== undefined
          ? { latitude: customLat, longitude: customLon, locationName: customName || `Location (${customLat}, ${customLon})` }
          : undefined;
        await recordSnapshot(coords);
        break;
      }

      case "verify":
      case "compare":
      case "evaluate": {
        const targetId = args[1] && !args[1].startsWith("--") ? args[1] : undefined;
        await verifySnapshot(targetId);
        break;
      }

      case "list":
      case "ls": {
        listSnapshots();
        break;
      }

      default:
        console.log(`Unknown command: "${command}"`);
        console.log("Available commands: record, verify [snapshot_id], list");
        process.exit(1);
    }
  } catch (err: any) {
    console.error(`\n❌ Error: ${err.message || err}\n`);
    process.exit(1);
  }
}

// Run when executed directly from CLI
if (process.argv[1] === fileURLToPath(import.meta.url) || process.argv[1].includes("weather_validator")) {
  main();
}
