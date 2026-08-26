import React, { useState } from "react";
import {
  Layers,
  CheckCircle2,
  AlertTriangle,
  Info,
  TrendingUp,
  Activity,
  Cpu,
  BarChart2,
} from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  Area,
} from "recharts";
import { PrecisionForecastResponse } from "../types";
import { formatTemp, formatTempShort } from "../utils/weatherUtils";

interface MultiModelEnsembleProps {
  forecast: PrecisionForecastResponse;
  tempUnit: "C" | "F";
}

export const MultiModelEnsemble: React.FC<MultiModelEnsembleProps> = ({
  forecast,
  tempUnit,
}) => {
  const { models, hourly, mlBreakdown } = forecast;

  const [visibleModels, setVisibleModels] = useState<Record<string, boolean>>({
    mlCorrected: true,
    confidence: true,
    ecmwf: true,
    gfs: true,
    icon: true,
    hrrr: true,
    rawPhysics: false,
  });

  const toggleModel = (key: string) => {
    setVisibleModels((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const isImperial = tempUnit === "F";

  const toDisplayTemp = (celsius?: number | null) => {
    if (celsius === undefined || celsius === null || isNaN(celsius)) {
      return null;
    }
    if (isImperial) {
      return Number(((celsius * 9) / 5 + 32).toFixed(1));
    }
    return Number(celsius.toFixed(1));
  };

  // Prepare chart dataset (first 36 hours)
  const chartData = hourly.times.slice(0, 36).map((timeStr, idx) => {
    const date = new Date(timeStr);
    let timeLabel = "";
    try {
      timeLabel =
        idx === 0
          ? "Now"
          : date.toLocaleTimeString("en-US", {
              timeZone: forecast.coordinates.timezone || "UTC",
              hour: "numeric",
              hour12: true,
            });
    } catch {
      timeLabel =
        idx === 0 ? "Now" : date.toLocaleTimeString([], { hour: "numeric", hour12: true });
    }

    const upper = toDisplayTemp(hourly.confidenceUpper?.[idx]);
    const lower = toDisplayTemp(hourly.confidenceLower?.[idx]);

    return {
      time: timeLabel,
      mlCorrected: toDisplayTemp(hourly.mlCorrectedTemp?.[idx]),
      rawPhysics: toDisplayTemp(hourly.rawPhysicsTemp?.[idx]),
      ecmwf: toDisplayTemp(hourly.ecmwfTemp?.[idx]),
      gfs: toDisplayTemp(hourly.gfsTemp?.[idx]),
      icon: toDisplayTemp(hourly.iconTemp?.[idx]),
      hrrr: toDisplayTemp(hourly.hrrrTemp?.[idx]),
      confidenceUpper: upper,
      confidenceLower: lower,
      confidenceRange: (upper != null && lower != null) ? [lower, upper] : null,
    };
  });

  const spread = isImperial
    ? mlBreakdown.modelDivergenceSpread * 1.8
    : mlBreakdown.modelDivergenceSpread;

  return (
    <div className="space-y-6">
      {/* Top Banner: Multi-Model Stacking Architecture */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 lg:p-8 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6 mb-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 mb-1">
              <Cpu className="w-4 h-4 text-cyan-400" />
              <span>NUMERICAL WEATHER PREDICTION (NWP) ENSEMBLE STACKING</span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              Multi-Model Convergence & Consensus Matrix
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Comparing raw physics solutions from ECMWF (EU), GFS (US), ICON (DE), and HRRR (3km Mesoscale)
            </p>
          </div>

          {/* Model Spread Indicator */}
          <div className="flex items-center gap-3">
            <div className="px-4 py-2.5 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center gap-3">
              <Activity className="w-5 h-5 text-cyan-400" />
              <div>
                <div className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
                  Model Spread Variance
                </div>
                <div className="text-base font-bold font-mono text-white flex items-center gap-1.5">
                  <span>±{spread.toFixed(2)}°{tempUnit}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-sans ${
                    (isImperial ? spread < 2.2 : spread < 1.2)
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : (isImperial ? spread < 4.5 : spread < 2.5)
                      ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                      : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                  }`}>
                    {(isImperial ? spread < 2.2 : spread < 1.2) ? "High Agreement" : (isImperial ? spread < 4.5 : spread < 2.5) ? "Moderate Spread" : "High Divergence"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Model Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-xs font-medium text-slate-400 mr-1">Visible Curves:</span>
          
          <button
            onClick={() => toggleModel("mlCorrected")}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-semibold transition border flex items-center gap-1.5 ${
              visibleModels.mlCorrected
                ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm"
                : "bg-slate-950 text-slate-400 border-slate-800 opacity-60"
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
            <span>ML Corrected Ensemble (Target)</span>
          </button>

          <button
            onClick={() => toggleModel("confidence")}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-semibold transition border flex items-center gap-1.5 ${
              visibleModels.confidence
                ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm"
                : "bg-slate-950 text-slate-400 border-slate-800 opacity-60"
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-sm bg-cyan-400/40 border border-cyan-400" />
            <span>90% Confidence Envelope (±1.64σ)</span>
          </button>

          <button
            onClick={() => toggleModel("ecmwf")}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-semibold transition border flex items-center gap-1.5 ${
              visibleModels.ecmwf
                ? "bg-blue-500/20 text-blue-300 border-blue-500/50"
                : "bg-slate-950 text-slate-400 border-slate-800 opacity-60"
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-blue-400" />
            <span>ECMWF IFS (9km)</span>
          </button>

          <button
            onClick={() => toggleModel("gfs")}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-semibold transition border flex items-center gap-1.5 ${
              visibleModels.gfs
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50"
                : "bg-slate-950 text-slate-400 border-slate-800 opacity-60"
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <span>NOAA GFS (13km)</span>
          </button>

          <button
            onClick={() => toggleModel("icon")}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-semibold transition border flex items-center gap-1.5 ${
              visibleModels.icon
                ? "bg-amber-500/20 text-amber-300 border-amber-500/50"
                : "bg-slate-950 text-slate-400 border-slate-800 opacity-60"
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <span>DWD ICON (7km)</span>
          </button>

          <button
            onClick={() => toggleModel("hrrr")}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-semibold transition border flex items-center gap-1.5 ${
              visibleModels.hrrr
                ? "bg-purple-500/20 text-purple-300 border-purple-500/50"
                : "bg-slate-950 text-slate-400 border-slate-800 opacity-60"
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-purple-400" />
            <span>NOAA HRRR (3km)</span>
          </button>

          <button
            onClick={() => toggleModel("rawPhysics")}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-semibold transition border flex items-center gap-1.5 ${
              visibleModels.rawPhysics
                ? "bg-rose-500/20 text-rose-300 border-rose-500/50"
                : "bg-slate-950 text-slate-400 border-slate-800 opacity-60"
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
            <span>Raw Unadjusted Grid</span>
          </button>
        </div>

        {/* Recharts Multi-Model Comparison Chart */}
        <div className="h-80 w-full bg-slate-950/70 p-4 rounded-2xl border border-slate-800">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="time"
                stroke="#64748b"
                tick={{ fontSize: 11, fill: "#64748b" }}
              />
              <YAxis
                stroke="#64748b"
                tick={{ fontSize: 11, fill: "#64748b" }}
                unit={`°${tempUnit}`}
                domain={["auto", "auto"]}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-slate-900 border border-slate-700 p-3 rounded-xl shadow-2xl text-xs space-y-1.5 font-mono">
                        <div className="font-bold text-white border-b border-slate-800 pb-1">
                          Timeline: {label}
                        </div>
                        {payload.map((entry: any) => {
                          if (entry.value === null || entry.value === undefined) {
                            return null;
                          }
                          if (entry.name === "90% Confidence Envelope (±1.64σ)") {
                            if (Array.isArray(entry.value) && entry.value[0] != null && entry.value[1] != null) {
                              return (
                                <div
                                  key={entry.name}
                                  className="flex items-center justify-between gap-4 text-cyan-400"
                                >
                                  <span>Confidence Spread:</span>
                                  <span className="font-bold">
                                    {entry.value[0]}° to {entry.value[1]}°{tempUnit}
                                  </span>
                                </div>
                              );
                            }
                            return null;
                          }
                          return (
                            <div
                              key={entry.name}
                              className="flex items-center justify-between gap-4"
                              style={{ color: entry.color }}
                            >
                              <span>{entry.name}:</span>
                              <span className="font-bold">{entry.value}°{tempUnit}</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />

              {visibleModels.confidence && (
                <Area
                  connectNulls
                  type="monotone"
                  dataKey="confidenceRange"
                  stroke="#06b6d4"
                  strokeDasharray="3 3"
                  strokeOpacity={0.4}
                  fill="#06b6d4"
                  fillOpacity={0.12}
                  name="90% Confidence Envelope (±1.64σ)"
                />
              )}

              {visibleModels.mlCorrected && (
                <Line
                  connectNulls
                  type="monotone"
                  dataKey="mlCorrected"
                  stroke="#06b6d4"
                  strokeWidth={3.5}
                  dot={{ r: 3, fill: "#06b6d4" }}
                  name="ML Corrected Ensemble"
                />
              )}
              {visibleModels.ecmwf && (
                <Line
                  connectNulls
                  type="monotone"
                  dataKey="ecmwf"
                  stroke="#3b82f6"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  name="ECMWF IFS (9km)"
                />
              )}
              {visibleModels.gfs && (
                <Line
                  connectNulls
                  type="monotone"
                  dataKey="gfs"
                  stroke="#10b981"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  name="NOAA GFS (13km)"
                />
              )}
              {visibleModels.icon && (
                <Line
                  connectNulls
                  type="monotone"
                  dataKey="icon"
                  stroke="#f59e0b"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  name="DWD ICON (7km)"
                />
              )}
              {visibleModels.hrrr && (
                <Line
                  connectNulls
                  type="monotone"
                  dataKey="hrrr"
                  stroke="#a855f7"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  name="NOAA HRRR (3km)"
                />
              )}
              {visibleModels.rawPhysics && (
                <Line
                  connectNulls
                  type="monotone"
                  dataKey="rawPhysics"
                  stroke="#f43f5e"
                  strokeWidth={1.5}
                  dot={false}
                  name="Raw Grid Baseline"
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Model Spec Breakdown Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {models.map((model) => {
          const modelWeightObj = (mlBreakdown.ensembleModelWeights || []).find(
            (w) => w.modelKey === model.modelName
          );
          const weightPct = modelWeightObj ? modelWeightObj.weightPercent : 25;
          const historicalMae = modelWeightObj ? modelWeightObj.historicalMae : null;

          return (
            <div
              key={model.modelName}
              className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-md space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-cyan-400 font-mono">
                  {model.modelName.toUpperCase()}
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-cyan-950/80 text-cyan-300 border border-cyan-500/30">
                  {weightPct}% BMA Weight
                </span>
              </div>

              <div>
                <h4 className="text-sm font-bold text-white">{model.displayName}</h4>
                <p className="text-xs text-slate-400 mt-0.5">{model.source} ({model.resolutionKm}km grid)</p>
              </div>

              {historicalMae != null && (
                <div className="text-[11px] font-mono text-emerald-400 flex items-center justify-between bg-emerald-950/30 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                  <span>Historical MAE:</span>
                  <span className="font-bold">{isImperial ? `${(historicalMae * 1.8).toFixed(2)}°F` : `${historicalMae.toFixed(2)}°C`}</span>
                </div>
              )}

              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">Model Solution:</span>
                <span className="font-bold text-white">{formatTemp(model.currentTemp, tempUnit)}</span>
              </div>

              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">Precipitation Prob:</span>
                <span className="text-blue-400 font-semibold">{model.precipitationProb}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
