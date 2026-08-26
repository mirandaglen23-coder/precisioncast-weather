import React, { useRef, useState } from "react";
import { X, Download, Copy, Share2, Check, Sparkles, MapPin, Mountain, Gauge, Wind, Droplets, Activity } from "lucide-react";
import { PrecisionForecastResponse } from "../types";
import { formatTemp, formatWind, formatCoordinates } from "../utils/weatherUtils";

interface ShareForecastModalProps {
  forecast: PrecisionForecastResponse;
  tempUnit: "C" | "F";
  onClose: () => void;
}

export const ShareForecastModal: React.FC<ShareForecastModalProps> = ({
  forecast,
  tempUnit,
  onClose,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const { coordinates, current, mlBreakdown, airQuality } = forecast;
  const isImperial = tempUnit === "F";

  const renderCardToBlob = async (): Promise<Blob | null> => {
    // Generate high-resolution HTML5 Canvas representation of the card
    const canvas = document.createElement("canvas");
    const width = 1200;
    const height = 630;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, "#090d16");
    bgGrad.addColorStop(0.5, "#0b1329");
    bgGrad.addColorStop(1, "#020617");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Glowing border
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 4;
    ctx.strokeRect(16, 16, width - 32, height - 32);

    // Ambient radial glow
    const radial = ctx.createRadialGradient(width / 2, 100, 10, width / 2, 100, 450);
    radial.addColorStop(0, "rgba(6, 182, 212, 0.25)");
    radial.addColorStop(1, "rgba(6, 182, 212, 0)");
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, width, height);

    // App Branding Header
    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 28px sans-serif";
    ctx.fillText("⚡ PRECISIONCAST METEOROLOGICAL OBSERVATORY", 48, 68);

    // Location Title
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 44px sans-serif";
    const locName = coordinates.locationName || `Location (${coordinates.latitude.toFixed(2)}°, ${coordinates.longitude.toFixed(2)}°)`;
    ctx.fillText(locName.slice(0, 36), 48, 130);

    // Subtitle coordinates & elevation
    ctx.fillStyle = "#94a3b8";
    ctx.font = "22px monospace";
    ctx.fillText(`${formatCoordinates(coordinates.latitude, coordinates.longitude)} • Elev: ${Math.round(mlBreakdown.actualElevation)}m`, 48, 168);

    // Main Temperature
    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 110px sans-serif";
    const tempText = formatTemp(current.temperature, tempUnit);
    ctx.fillText(tempText, 48, 290);

    // Weather Description & Feels Like
    ctx.fillStyle = "#f8fafc";
    ctx.font = "bold 32px sans-serif";
    ctx.fillText(current.weatherDescription, 380, 240);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "24px sans-serif";
    ctx.fillText(`Feels Like ${formatTemp(current.apparentTemperature, tempUnit)} • Humidity ${current.humidity}%`, 380, 280);

    // Telemetry Grid Box
    ctx.fillStyle = "rgba(15, 23, 42, 0.8)";
    ctx.fillRect(48, 330, width - 96, 130);
    ctx.strokeStyle = "rgba(56, 189, 248, 0.2)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(48, 330, width - 96, 130);

    // Telemetry items
    ctx.fillStyle = "#94a3b8";
    ctx.font = "18px sans-serif";
    ctx.fillText("WIND FLOW", 78, 368);
    ctx.fillText("ATMOSPHERIC PRESSURE", 360, 368);
    ctx.fillText("PHYSICS DOWNSCALING (ΔT)", 680, 368);
    ctx.fillText("AIR QUALITY (EPA)", 960, 368);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 26px sans-serif";
    ctx.fillText(formatWind(current.windSpeedKmh, tempUnit), 78, 410);
    ctx.fillText(`${current.pressureHpa.toFixed(1)} hPa`, 360, 410);
    
    const deltaSign = mlBreakdown.elevationAdjustment >= 0 ? "+" : "";
    const deltaStr = isImperial
      ? `${deltaSign}${(mlBreakdown.elevationAdjustment * 1.8).toFixed(1)}°F`
      : `${deltaSign}${mlBreakdown.elevationAdjustment.toFixed(1)}°C`;
    ctx.fillStyle = mlBreakdown.elevationAdjustment < 0 ? "#38bdf8" : "#fbbf24";
    ctx.fillText(deltaStr, 680, 410);

    ctx.fillStyle = (airQuality?.usAqi ?? 30) <= 50 ? "#34d399" : "#fbbf24";
    ctx.fillText(`AQI ${airQuality?.usAqi ?? 35} (${airQuality?.aqiCategory || "Good"})`, 960, 410);

    // Bottom Footer Watermark
    ctx.fillStyle = "#64748b";
    ctx.font = "18px sans-serif";
    ctx.fillText("Generated with PrecisionCast Multi-Model Physics + High-Res ML Downscaling", 48, 560);
    ctx.fillStyle = "#38bdf8";
    ctx.fillText("https://precisioncast-weather.onrender.com", width - 420, 560);

    return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  };

  const handleDownload = async () => {
    setIsGenerating(true);
    const blob = await renderCardToBlob();
    if (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `PrecisionCast_${coordinates.locationName || "Forecast"}_${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }
    setIsGenerating(false);
  };

  const handleCopyImage = async () => {
    setIsGenerating(true);
    try {
      const blob = await renderCardToBlob();
      if (blob && navigator.clipboard && (window as any).ClipboardItem) {
        await navigator.clipboard.write([
          new (window as any).ClipboardItem({ "image/png": blob }),
        ]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch {
      // fallback to download
      handleDownload();
    }
    setIsGenerating(false);
  };

  const handleShare = async () => {
    setIsGenerating(true);
    try {
      const blob = await renderCardToBlob();
      if (blob && navigator.canShare) {
        const file = new File([blob], "forecast.png", { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: `Weather at ${coordinates.locationName}`,
            text: `Currently ${formatTemp(current.temperature, tempUnit)}, ${current.weatherDescription} at ${coordinates.locationName}.`,
            files: [file],
          });
        }
      } else {
        handleCopyImage();
      }
    } catch {
      handleDownload();
    }
    setIsGenerating(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-natural-backdrop">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 animate-natural-modal">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-cyan-400 font-semibold text-sm">
            <Share2 className="w-5 h-5" /> Share Forecast Snapshot
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Card Preview */}
        <div
          ref={cardRef}
          className="p-6 rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border-2 border-cyan-500/30 shadow-xl space-y-4"
        >
          <div className="flex items-center justify-between text-xs text-cyan-400 font-mono font-semibold tracking-wider">
            <span>⚡ PRECISIONCAST METEOROLOGICAL OBSERVATORY</span>
            <span className="bg-cyan-950/80 border border-cyan-500/30 px-2.5 py-0.5 rounded-full text-cyan-300">
              HD EXPORT
            </span>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <MapPin className="w-5 h-5 text-cyan-400" />
              {coordinates.locationName || "Custom Coordinates"}
            </h2>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              {formatCoordinates(coordinates.latitude, coordinates.longitude)} • Elevation {Math.round(mlBreakdown.actualElevation)}m
            </p>
          </div>

          <div className="flex items-baseline gap-4">
            <span className="text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-300 to-blue-400 font-mono">
              {formatTemp(current.temperature, tempUnit)}
            </span>
            <div>
              <div className="text-lg font-semibold text-slate-100">{current.weatherDescription}</div>
              <div className="text-xs text-slate-400">
                Feels like {formatTemp(current.apparentTemperature, tempUnit)} • Humidity {current.humidity}%
              </div>
            </div>
          </div>

          {/* Key Physics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800/80 text-xs">
            <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-slate-400 block text-[10px]">WIND SPEED</span>
              <span className="font-semibold text-slate-200">{formatWind(current.windSpeedKmh, tempUnit)}</span>
            </div>
            <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-slate-400 block text-[10px]">PRESSURE</span>
              <span className="font-semibold text-slate-200">{current.pressureHpa.toFixed(1)} hPa</span>
            </div>
            <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-slate-400 block text-[10px]">ML LAPSE (ΔT)</span>
              <span className="font-semibold text-cyan-300">
                {mlBreakdown.elevationAdjustment >= 0 ? "+" : ""}
                {isImperial
                  ? `${(mlBreakdown.elevationAdjustment * 1.8).toFixed(1)}°F`
                  : `${mlBreakdown.elevationAdjustment.toFixed(1)}°C`}
              </span>
            </div>
            <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-slate-400 block text-[10px]">AIR QUALITY</span>
              <span className="font-semibold text-emerald-400">AQI {airQuality?.usAqi ?? 35}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={handleDownload}
            disabled={isGenerating}
            className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm transition shadow-lg shadow-cyan-500/20 active:scale-95 disabled:opacity-50"
          >
            <Download className="w-4 h-4" /> Download PNG
          </button>
          <button
            onClick={handleCopyImage}
            disabled={isGenerating}
            className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm transition active:scale-95 disabled:opacity-50"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            {copied ? "Copied Image!" : "Copy Image"}
          </button>
          <button
            onClick={handleShare}
            disabled={isGenerating}
            className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm transition active:scale-95 disabled:opacity-50"
          >
            <Share2 className="w-4 h-4" /> Share Card
          </button>
        </div>
      </div>
    </div>
  );
};
