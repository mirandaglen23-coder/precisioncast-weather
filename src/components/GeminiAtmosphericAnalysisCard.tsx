import React, { useState, useEffect } from "react";
import {
  Sparkles,
  RefreshCw,
  AlertCircle,
  Activity,
  Layers,
  Compass,
  Waves,
  Mountain,
  Sun,
  Droplets,
  Gauge,
  Zap,
  TrendingDown,
  Wind,
  Cpu,
  CheckCircle2,
} from "lucide-react";
import { GeminiAtmosphericAnalysis, PrecisionForecastResponse } from "../types";
import {
  formatTemp,
  formatTempDelta,
  formatElevation,
  formatPressure,
  formatLapseRate,
  formatWind,
} from "../utils/weatherUtils";

interface GeminiAtmosphericAnalysisCardProps {
  forecast: PrecisionForecastResponse;
  tempUnit?: "C" | "F";
}

export const GeminiAtmosphericAnalysisCard: React.FC<GeminiAtmosphericAnalysisCardProps> = ({
  forecast,
  tempUnit = "F",
}) => {
  const { current, mlBreakdown } = forecast;
  const [analysis, setAnalysis] = useState<GeminiAtmosphericAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalysis = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Send the necessary forecast telemetry to the analysis endpoint
      const payload = {
        coordinates: forecast.coordinates,
        current: forecast.current,
        mlBreakdown: forecast.mlBreakdown,
        radarNowcast: forecast.radarNowcast,
        unit: tempUnit,
      };

      const res = await fetch("/api/gemini/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const contentType = res.headers.get("content-type") || "";
      if (!res.ok || !contentType.includes("application/json")) {
        throw new Error(`Atmospheric analysis diagnostic unavailable (${res.status})`);
      }

      const data = await res.json();
      setAnalysis(data);
    } catch (err: any) {
      console.warn("Gemini telemetry diagnosis info:", err?.message || err);
      setError(err?.message || "Diagnostic service unavailable");
    } finally {
      setIsLoading(false);
    }
  };

  // Automatically fetch when coordinates or unit change
  useEffect(() => {
    fetchAnalysis();
  }, [forecast.coordinates.latitude, forecast.coordinates.longitude, tempUnit]);

  // Formatted values
  const depressionFormatted =
    tempUnit === "F"
      ? `${(current.dewPointDepression * 1.8).toFixed(1)}°F`
      : `${current.dewPointDepression.toFixed(1)}°C`;

  const spreadFormatted =
    tempUnit === "F"
      ? `±${(mlBreakdown.modelDivergenceSpread * 1.8).toFixed(1)}°F`
      : `±${mlBreakdown.modelDivergenceSpread.toFixed(1)}°C`;

  // Calculated Lifting Condensation Level (Cloud Base Height AGL)
  const lclMeters = Math.max(0, Math.round(125 * current.dewPointDepression));

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 lg:p-8 shadow-2xl relative overflow-hidden space-y-6">
      {/* Background Accent Glow */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shadow-sm">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                Microclimate & Sensor Telemetry
              </h3>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/25 font-semibold">
                Physics Telemetry Matrix
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Boundary layer dynamics, thermal flux, lapse-rates, and topographic advection sensors
            </p>
          </div>
        </div>

        <button
          onClick={fetchAnalysis}
          disabled={isLoading}
          className="px-3.5 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold transition flex items-center gap-1.5 self-start sm:self-auto disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-cyan-400" : "text-slate-400"}`} />
          <span>{isLoading ? "Reading Sensors..." : "Re-read Sensors"}</span>
        </button>
      </div>

      {/* Compact Microclimate & Sensor Telemetry Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        
        {/* 1. Coastal Sea-Breeze & Marine Index */}
        <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800/90 space-y-2 hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Waves className="w-3.5 h-3.5 text-teal-400" />
              Coastal Sea-Breeze Index
            </span>
            <span
              className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                mlBreakdown.isCoastalRegion
                  ? "bg-teal-500/20 text-teal-300 border border-teal-500/30"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              {mlBreakdown.isCoastalRegion ? "Active Shoreline" : "Inland"}
            </span>
          </div>
          <div className="text-xl font-bold font-mono text-white">
            {mlBreakdown.isCoastalRegion
              ? tempUnit === "F"
                ? `${(Math.abs(mlBreakdown.marineLayerDamping) * 1.8).toFixed(1)}°F Damping`
                : `${Math.abs(mlBreakdown.marineLayerDamping).toFixed(1)}°C Damping`
              : tempUnit === "F"
                ? "0.0°F (Continental)"
                : "0.0°C (Continental)"}
          </div>
          <div className="text-[11px] text-slate-400 leading-snug">
            {mlBreakdown.isCoastalRegion
              ? "Diurnal marine boundary layer suppresses thermal extremes"
              : "Unmoderated continental thermal flux"}
          </div>
        </div>

        {/* 2. Lapse-Rate & Topographic Delta */}
        <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800/90 space-y-2 hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Mountain className="w-3.5 h-3.5 text-indigo-400" />
              Lapse-Rate Delta
            </span>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              {formatLapseRate(mlBreakdown.elevationLapseRate, tempUnit)}
            </span>
          </div>
          <div className="text-xl font-bold font-mono text-white flex items-baseline gap-2">
            <span>{formatTempDelta(mlBreakdown.elevationAdjustment, tempUnit)}</span>
            <span className="text-xs font-normal text-slate-400">Terrain Offset</span>
          </div>
          <div className="text-[11px] text-slate-400 leading-snug">
            DEM: {formatElevation(mlBreakdown.gridElevation, tempUnit)} → Target: {formatElevation(mlBreakdown.actualElevation, tempUnit)}
          </div>
        </div>

        {/* 3. Cloud Base Height (LCL) */}
        <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800/90 space-y-2 hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-sky-400" />
              Cloud Base Height (LCL)
            </span>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">
              {current.dewPointDepression < 1.0 ? "Fog Floor" : `${formatElevation(lclMeters, tempUnit)} AGL`}
            </span>
          </div>
          <div className="text-xl font-bold font-mono text-white">
            {current.dewPointDepression < 1.0
              ? tempUnit === "F" ? "0 ft (Ground Fog)" : "0 m (Ground Fog)"
              : `${formatElevation(lclMeters, tempUnit)} AGL`}
          </div>
          <div className="text-[11px] text-slate-400 leading-snug">
            Lifting Condensation Level (dew point spread {depressionFormatted})
          </div>
        </div>

        {/* 4. UV / Solar Radiation Flux */}
        <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800/90 space-y-2 hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Sun className="w-3.5 h-3.5 text-amber-400" />
              UV & Solar Flux
            </span>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
              UV {current.uvIndex}
            </span>
          </div>
          <div className="text-xl font-bold font-mono text-white">
            {current.solarRadiationWm2} W/m²
          </div>
          <div className="text-[11px] text-slate-400 leading-snug">
            Solar Zenith: <span className="font-mono text-slate-200">{mlBreakdown.solarZenithAngle}°</span> • Cloud: <span className="font-mono text-slate-200">{current.cloudCoverPercent}%</span>
          </div>
        </div>

        {/* 5. Dew Point Spread & Saturation */}
        <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800/90 space-y-2 hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Droplets className="w-3.5 h-3.5 text-blue-400" />
              Dew Point Spread
            </span>
            <span
              className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                current.dewPointDepression < 1.0 && current.humidity > 95
                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                  : "bg-blue-500/20 text-blue-300 border border-blue-500/30"
              }`}
            >
              {current.dewPointDepression < 1.0 && current.humidity > 95 ? "100% Saturation" : `${current.humidity}% RH`}
            </span>
          </div>
          <div className="text-xl font-bold font-mono text-white">
            {depressionFormatted} Spread
          </div>
          <div className="text-[11px] text-slate-400 leading-snug">
            Dew point: <span className="font-mono text-slate-200">{formatTemp(current.dewPoint, tempUnit)}</span> ({current.weatherDescription})
          </div>
        </div>

        {/* 6. Planetary Boundary Layer & Convection (CAPE) */}
        <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800/90 space-y-2 hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-purple-400" />
              Boundary Layer & CAPE
            </span>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
              {current.capeJkg} J/kg CAPE
            </span>
          </div>
          <div className="text-xl font-bold font-mono text-white">
            {formatElevation(current.pblHeightM, tempUnit)} PBL
          </div>
          <div className="text-[11px] text-slate-400 leading-snug">
            3h Press. Δ: <span className="font-mono text-slate-200">{
              tempUnit === "F"
                ? `${mlBreakdown.pressureTendency3h > 0 ? "+" : ""}${(mlBreakdown.pressureTendency3h * 0.02953).toFixed(2)} inHg`
                : `${mlBreakdown.pressureTendency3h > 0 ? `+${mlBreakdown.pressureTendency3h}` : mlBreakdown.pressureTendency3h} hPa`
            }</span> ({formatPressure(current.pressureHpa, tempUnit)})
          </div>
        </div>

      </div>

      {/* Concise, Data-Driven Atmospheric Insights (Max 2 concise bullets, no essay paragraphs) */}
      {analysis && !isLoading && (
        <div className="p-4 rounded-2xl bg-slate-950/50 border border-slate-800 space-y-2.5">
          <div className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Atmospheric Column Diagnostic Synopsis</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-slate-300">
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/60 flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-1.5 flex-shrink-0" />
              <p className="leading-relaxed">{analysis.synopticOverview || "Atmospheric column stabilized with calibrated terrain boundary layer."}</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/60 flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 flex-shrink-0" />
              <p className="leading-relaxed">{analysis.ensembleAgreementAnalysis || "Multi-model ensemble consensus variance within expected tolerance."}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
