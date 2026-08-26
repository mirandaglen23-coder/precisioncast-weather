/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { Header } from "./components/Header";
import { CurrentOverview } from "./components/CurrentOverview";
import { RadarNowcasting } from "./components/RadarNowcasting";
import { MultiModelEnsemble } from "./components/MultiModelEnsemble";
import { PhysicsMLInspector } from "./components/PhysicsMLInspector";
import { InteractiveMap } from "./components/InteractiveMap";
import { GeminiAtmosphericAnalysisCard } from "./components/GeminiAtmosphericAnalysisCard";
import { PipelineCodeExporter } from "./components/PipelineCodeExporter";
import { WeatherChatWidget } from "./components/WeatherChatWidget";
import { AtmosphericCanvas } from "./components/AtmosphericCanvas";
import { ShareForecastModal } from "./components/ShareForecastModal";
import { ambientAudio, SoundscapeType } from "./utils/ambientAudio";
import { PrecisionForecastResponse, WeatherCoordinates } from "./types";
import { MICROCLIMATE_PRESETS } from "./utils/weatherUtils";
import {
  Compass,
  AlertCircle,
  RefreshCw,
  Sparkles,
  MapPin,
  Cpu,
  Layers,
  Activity,
  CheckCircle2,
} from "lucide-react";

export default function App() {
  // Read initial query params if present in URL
  const initialUrlState = React.useMemo(() => {
    if (typeof window === "undefined") return null;
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const lat = searchParams.get("lat");
      const lon = searchParams.get("lon");
      const name = searchParams.get("name");
      const elevation = searchParams.get("elevation");
      const unit = searchParams.get("unit");

      if (lat && lon) {
        const parsedLat = parseFloat(lat);
        const parsedLon = parseFloat(lon);
        if (!isNaN(parsedLat) && !isNaN(parsedLon) && parsedLat >= -90 && parsedLat <= 90 && parsedLon >= -180 && parsedLon <= 180) {
          return {
            coords: {
              latitude: parsedLat,
              longitude: parsedLon,
              locationName: name || undefined,
              elevation: elevation ? parseFloat(elevation) : undefined,
            },
            unit: unit === "C" ? ("C" as const) : unit === "F" ? ("F" as const) : undefined,
          };
        }
      }
    } catch {
      // ignore
    }
    return null;
  }, []);

  // Default coordinates: Mount Washington alpine microclimate testbed
  const defaultPreset = MICROCLIMATE_PRESETS[0];
  const [coordinates, setCoordinates] = useState<WeatherCoordinates>(() => {
    return initialUrlState?.coords || {
      latitude: defaultPreset.latitude,
      longitude: defaultPreset.longitude,
      locationName: defaultPreset.name,
      elevation: defaultPreset.elevation,
    };
  });

  const [forecast, setForecast] = useState<PrecisionForecastResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [autoRefreshIntervalSec, setAutoRefreshIntervalSec] = useState<number>(60);
  const [isAutoRefreshEnabled, setIsAutoRefreshEnabled] = useState<boolean>(true);
  const [secondsUntilNextSync, setSecondsUntilNextSync] = useState<number>(60);
  const [error, setError] = useState<string | null>(null);
  const [tempUnit, setTempUnit] = useState<"C" | "F">(() => {
    return initialUrlState?.unit || "F";
  });
  const [activeTab, setActiveTab] = useState<
    "forecast" | "nowcast" | "models" | "physics_ml" | "map" | "pipeline_code"
  >("forecast");

  // Atmospheric Soundscape & Share Modal State
  const [isSoundscapePlaying, setIsSoundscapePlaying] = useState<boolean>(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);

  // Global Sandbox Hyperparameter Override state
  const [hyperparameterOverride, setHyperparameterOverride] = useState<{
    customLapseRate?: number;
    customElevationDelta?: number;
    isOverridden: boolean;
  }>({ isOverridden: false });

  // Handle Atmospheric Soundscape toggle & dynamic condition adaptation
  const toggleSoundscape = () => {
    if (isSoundscapePlaying) {
      ambientAudio.stop();
      setIsSoundscapePlaying(false);
    } else {
      if (forecast) {
        const code = forecast.current.weatherCode;
        const isRain = [51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code);
        const isThunder = [95, 96, 99].includes(code);
        const isDaytime = forecast.current.weatherCode != null ? true : true;

        let soundType: SoundscapeType = "clear";
        if (isThunder) soundType = "thunder";
        else if (isRain) soundType = "rain";
        else if (forecast.current.windSpeedKmh > 24) soundType = "wind";
        else if (forecast.current.cloudCoverPercent < 30) soundType = "night";

        ambientAudio.play(soundType);
      } else {
        ambientAudio.play("clear");
      }
      setIsSoundscapePlaying(true);
    }
  };

  // Sync soundscape when forecast changes
  useEffect(() => {
    if (isSoundscapePlaying && forecast) {
      const code = forecast.current.weatherCode;
      const isRain = [51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code);
      const isThunder = [95, 96, 99].includes(code);

      let soundType: SoundscapeType = "clear";
      if (isThunder) soundType = "thunder";
      else if (isRain) soundType = "rain";
      else if (forecast.current.windSpeedKmh > 24) soundType = "wind";
      ambientAudio.play(soundType);
    }
  }, [forecast?.current.weatherCode, isSoundscapePlaying]);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      ambientAudio.stop();
    };
  }, []);

  // Reset override when coordinates change
  useEffect(() => {
    setHyperparameterOverride({ isOverridden: false });
  }, [coordinates.latitude, coordinates.longitude]);

  // Compute effective forecast applying live hyperparameter overrides
  const effectiveForecast = React.useMemo(() => {
    if (!forecast) return null;
    if (!hyperparameterOverride.isOverridden) return forecast;

    const lapse = hyperparameterOverride.customLapseRate ?? forecast.mlBreakdown.elevationLapseRate;
    const elevDelta = hyperparameterOverride.customElevationDelta ?? (forecast.mlBreakdown.actualElevation - forecast.mlBreakdown.gridElevation);
    const deltaT = -1 * (elevDelta / 1000) * lapse;
    const adjustedCurrentTemp = Number((forecast.current.rawPhysicsTemp + deltaT).toFixed(1));

    const e = (forecast.current.humidity / 100) * 6.105 * Math.exp((17.27 * adjustedCurrentTemp) / (237.7 + adjustedCurrentTemp));
    const adjustedApparent = Number((adjustedCurrentTemp + 0.33 * e - 0.7 * (forecast.current.windSpeedKmh / 3.6) - 4.0).toFixed(1));
    const adjustedHourlyMlTemps = (forecast.hourly.rawPhysicsTemp || []).map((rawT) => Number((rawT + deltaT).toFixed(1)));

    return {
      ...forecast,
      current: {
        ...forecast.current,
        temperature: adjustedCurrentTemp,
        apparentTemperature: adjustedApparent,
      },
      hourly: {
        ...forecast.hourly,
        mlCorrectedTemp: adjustedHourlyMlTemps,
      },
      mlBreakdown: {
        ...forecast.mlBreakdown,
        correctedTemp: adjustedCurrentTemp,
        elevationAdjustment: Number(deltaT.toFixed(2)),
        elevationLapseRate: Number(lapse.toFixed(1)),
        actualElevation: forecast.mlBreakdown.gridElevation + elevDelta,
      },
    };
  }, [forecast, hyperparameterOverride]);

  // Keep URL parameters in sync for shareable deep links
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const searchParams = new URLSearchParams(window.location.search);
      searchParams.set("lat", coordinates.latitude.toString());
      searchParams.set("lon", coordinates.longitude.toString());
      if (coordinates.locationName) {
        searchParams.set("name", coordinates.locationName);
      } else {
        searchParams.delete("name");
      }
      if (coordinates.elevation != null) {
        searchParams.set("elevation", coordinates.elevation.toString());
      } else {
        searchParams.delete("elevation");
      }
      searchParams.set("unit", tempUnit);

      const newUrl = `${window.location.pathname}?${searchParams.toString()}`;
      window.history.replaceState(null, "", newUrl);
    } catch {
      // ignore
    }
  }, [coordinates, tempUnit]);

  // Track latest active request ID to prevent race conditions on search/retries
  const activeRequestIdRef = useRef<number>(0);

  // Fetch forecast data from Express backend (supports background silent sync with auto-retry)
  const fetchForecast = async (
    coords: WeatherCoordinates,
    isBackground: boolean = false,
    retryCount: number = 0
  ) => {
    const currentRequestId = ++activeRequestIdRef.current;
    if (isBackground) {
      setIsSyncing(true);
    } else {
      setIsLoading(true);
    }
    if (!isBackground && retryCount === 0) {
      setError(null);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      const params = new URLSearchParams({
        lat: coords.latitude.toString(),
        lon: coords.longitude.toString(),
      });
      if (coords.locationName) params.append("name", coords.locationName);
      if (coords.elevation != null) params.append("elevation", coords.elevation.toString());

      const res = await fetch(`/api/weather/predict?${params.toString()}`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        let errorDetail = "";
        try {
          const errJson = await res.json();
          errorDetail = errJson.error || "";
        } catch {
          // ignore non-json
        }
        throw new Error(
          errorDetail || `Server returned status ${res.status}: Failed to calculate forecast`
        );
      }
      const data: PrecisionForecastResponse = await res.json();

      // Ensure response matches latest active request
      if (activeRequestIdRef.current !== currentRequestId) {
        return;
      }

      setForecast(data);
      setLastSyncedAt(new Date());
      setSecondsUntilNextSync(autoRefreshIntervalSec);
      setError(null);
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (activeRequestIdRef.current !== currentRequestId) {
        return;
      }
      console.error("Forecast fetch error:", err);

      // Auto-retry up to 4 times with progressive backoff if server is warming up or connection is initializing
      const maxRetries = isBackground ? 1 : 4;
      if (retryCount < maxRetries) {
        const retryDelay = Math.min(3000, 600 * Math.pow(1.5, retryCount));
        setTimeout(() => {
          if (activeRequestIdRef.current === currentRequestId) {
            fetchForecast(coords, isBackground, retryCount + 1);
          }
        }, retryDelay);
        return;
      }

      if (!isBackground) {
        const isNetworkErr = err.name === "AbortError" || err.message?.includes("Failed to fetch");
        setError(
          isNetworkErr
            ? "Connecting to local weather prediction engine... Please click Retry or select a preset location."
            : err.message || "Failed to load hyper-local forecast"
        );
      }
    } finally {
      if (activeRequestIdRef.current === currentRequestId) {
        if (isBackground) {
          setIsSyncing(false);
        } else {
          setIsLoading(false);
        }
      }
    }
  };

  const handleSelectCoords = (newCoords: WeatherCoordinates) => {
    setCoordinates(newCoords);
    fetchForecast(newCoords, false);
  };

  useEffect(() => {
    fetchForecast(coordinates, false);
  }, []);

  // Periodic Auto-Sync Timer: keeps forecast & physics models fresh while looking at the location
  useEffect(() => {
    if (!isAutoRefreshEnabled || autoRefreshIntervalSec <= 0) return;

    const timer = setInterval(() => {
      setSecondsUntilNextSync((prev) => {
        if (prev <= 1) {
          fetchForecast(coordinates, true);
          return autoRefreshIntervalSec;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [coordinates, isAutoRefreshEnabled, autoRefreshIntervalSec]);

  // Tab refocus visibility listener: if returning to active tab and data >45s old, sync quietly
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && lastSyncedAt) {
        const elapsed = (Date.now() - lastSyncedAt.getTime()) / 1000;
        if (elapsed > 45) {
          fetchForecast(coordinates, true);
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [coordinates, lastSyncedAt]);

  const handleToggleTempUnit = () => {
    setTempUnit((prev) => (prev === "C" ? "F" : "C"));
  };

  const handleToggleAutoRefresh = () => {
    setIsAutoRefreshEnabled((prev) => !prev);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-cyan-500 selection:text-slate-950 relative overflow-x-hidden">
      {/* Background Dynamic Atmospheric Particles */}
      <AtmosphericCanvas
        weatherCode={effectiveForecast?.current?.weatherCode ?? 0}
        isDay={effectiveForecast?.hourly?.isDay?.[0] ?? true}
        precipitationMm={effectiveForecast?.current ? (effectiveForecast.hourly.rainMm?.[0] ?? 0) : 0}
        windSpeedKmh={effectiveForecast?.current?.windSpeedKmh ?? 10}
        enabled={true}
      />

      {/* Top Application Header & Search Bar */}
      <Header
        currentCoords={coordinates}
        onSelectCoords={handleSelectCoords}
        isLoading={isLoading}
        isSyncing={isSyncing}
        lastSyncedAt={lastSyncedAt}
        autoRefreshIntervalSec={autoRefreshIntervalSec}
        secondsUntilNextSync={secondsUntilNextSync}
        isAutoRefreshEnabled={isAutoRefreshEnabled}
        onToggleAutoRefresh={handleToggleAutoRefresh}
        tempUnit={tempUnit}
        onToggleTempUnit={handleToggleTempUnit}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onRefresh={() => fetchForecast(coordinates, false)}
        isGloballyOverridden={hyperparameterOverride.isOverridden}
        onResetOverrides={() => setHyperparameterOverride({ isOverridden: false })}
        isSoundscapePlaying={isSoundscapePlaying}
        onToggleSoundscape={toggleSoundscape}
        onOpenShareModal={() => setIsShareModalOpen(true)}
      />

      {/* Share Forecast High-Res Social Card Modal */}
      {isShareModalOpen && effectiveForecast && (
        <ShareForecastModal
          forecast={effectiveForecast}
          tempUnit={tempUnit}
          onClose={() => setIsShareModalOpen(false)}
        />
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8 relative z-10">
        {/* Error Notification Alert */}
        {error && (
          <div className="p-4 rounded-2xl bg-rose-950/60 border border-rose-500/40 text-rose-200 text-sm flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => fetchForecast(coordinates, false)}
              className="px-3 py-1 rounded-xl bg-rose-900/80 hover:bg-rose-800 text-white text-xs font-semibold transition"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading Skeleton (Only on initial load or manual coordinate change) */}
        {isLoading && !forecast && (
          <div className="py-20 flex flex-col items-center justify-center space-y-4 text-center">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-4 border-slate-800 border-t-cyan-400 animate-spin" />
              <Compass className="w-6 h-6 text-cyan-400 absolute inset-0 m-auto animate-pulse" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-white">
                Downscaling Physics Grids & Running ML Ensemble...
              </h3>
              <p className="text-xs text-slate-400 max-w-md">
                Querying ECMWF, GFS, ICON, and NOAA HRRR, evaluating digital elevation model lapse rates, and computing 120-minute radar advection nowcasts.
              </p>
            </div>
          </div>
        )}

        {/* Active Tab View Rendering */}
        {effectiveForecast && (
          <div className="space-y-8">
            {activeTab === "forecast" && (
              <div className="space-y-8 animate-in fade-in duration-300">
                <CurrentOverview
                  forecast={effectiveForecast}
                  tempUnit={tempUnit}
                  isSyncing={isSyncing}
                  lastSyncedAt={lastSyncedAt}
                  onManualSync={() => fetchForecast(coordinates, true)}
                  secondsUntilNextSync={secondsUntilNextSync}
                />
                <GeminiAtmosphericAnalysisCard forecast={effectiveForecast} tempUnit={tempUnit} />
              </div>
            )}

            {activeTab === "nowcast" && (
              <div className="space-y-8 animate-in fade-in duration-300">
                <RadarNowcasting forecast={effectiveForecast} tempUnit={tempUnit} />
              </div>
            )}

            {activeTab === "models" && (
              <div className="space-y-8 animate-in fade-in duration-300">
                <MultiModelEnsemble forecast={effectiveForecast} tempUnit={tempUnit} />
              </div>
            )}

            {activeTab === "physics_ml" && (
              <div className="space-y-8 animate-in fade-in duration-300">
                <PhysicsMLInspector
                  forecast={effectiveForecast}
                  tempUnit={tempUnit}
                  onApplyHyperparameters={setHyperparameterOverride}
                  isGloballyOverridden={hyperparameterOverride.isOverridden}
                />
              </div>
            )}

            {activeTab === "map" && (
              <div className="space-y-8 animate-in fade-in duration-300">
                <InteractiveMap
                  coordinates={coordinates}
                  onSelectCoords={handleSelectCoords}
                  elevationMeters={effectiveForecast.mlBreakdown.actualElevation}
                  tempUnit={tempUnit}
                />
              </div>
            )}

            {activeTab === "pipeline_code" && (
              <div className="space-y-8 animate-in fade-in duration-300">
                <PipelineCodeExporter forecast={effectiveForecast} />
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer & Meta Info */}
      <footer className="border-t border-slate-900 bg-slate-950/90 py-6 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-cyan-400" />
            <span className="font-semibold text-slate-300">PrecisionCast Atmospheric Engine</span>
            <span>•</span>
            <span>Physics-Informed ML Bias Correction & MOS Downscaling</span>
          </div>

          <div className="flex items-center gap-4 text-slate-400 text-[11px] font-mono">
            <span>Data: Open-Meteo & Copernicus ERA5</span>
            <span>•</span>
            <span>Models: ECMWF IFS (9km) / GFS / ICON / HRRR (3km)</span>
            <span>•</span>
            <span>Gemini 3.7 Diagnostics</span>
          </div>
        </div>
      </footer>

      {/* Floating Layman AI Weather Chat Assistant */}
      <WeatherChatWidget forecast={forecast} tempUnit={tempUnit} />
    </div>
  );
}
