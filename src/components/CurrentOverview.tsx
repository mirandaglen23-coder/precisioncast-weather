import React, { useState, useEffect, useMemo } from "react";
import {
  Cloud,
  Sun,
  Moon,
  CloudSun,
  CloudMoon,
  CloudRain,
  CloudDrizzle,
  CloudFog,
  CloudSnow,
  CloudLightning,
  Wind,
  Droplets,
  Gauge,
  Compass,
  ArrowUpRight,
  TrendingDown,
  TrendingUp,
  Zap,
  Eye,
  Activity,
  Layers,
  Sparkles,
  Mountain,
  Waves,
  MapPin,
  Clock,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Calendar,
  X,
  Sunrise,
  Sunset,
  Info,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  Flame,
  Radio,
  Navigation,
  Maximize2,
  Minimize2,
  Telescope,
  Star,
  ShieldCheck,
  HeartPulse,
  Orbit,
} from "lucide-react";
import { PrecisionForecastResponse } from "../types";
import {
  formatTemp,
  formatTempShort,
  formatTempDelta,
  formatWind,
  formatElevation,
  formatPrecip,
  formatPressure,
  formatLapseRate,
  getWindDirectionCompass,
  getHourlyWeatherDisplayInfo,
  formatCoordinates,
  formatDailyForecastDate,
  WeatherIconType,
} from "../utils/weatherUtils";

interface CurrentOverviewProps {
  forecast: PrecisionForecastResponse;
  tempUnit: "C" | "F";
  isSyncing?: boolean;
  lastSyncedAt?: Date | null;
  onManualSync?: () => void;
  secondsUntilNextSync?: number;
}

export const CurrentOverview: React.FC<CurrentOverviewProps> = ({
  forecast,
  tempUnit,
  isSyncing = false,
  lastSyncedAt = null,
  onManualSync,
  secondsUntilNextSync,
}) => {
  const { current, mlBreakdown, hourly, daily, coordinates } = forecast;

  // Selected day index for detailed 24-hour hourly inspection from 7-day matrix
  const [selectedDayIdx, setSelectedDayIdx] = useState<number | null>(null);

  // Hovered AQI hour index for interactive graph tooltip
  const [hoveredAqiIdx, setHoveredAqiIdx] = useState<number | null>(null);

  // Fullscreen Inspection Modal state: "aqi" | "astronomy" | null
  const [activeModal, setActiveModal] = useState<"aqi" | "astronomy" | null>(null);

  // Live NOAA Active Alerts for current location
  const [liveAlerts, setLiveAlerts] = useState<any[]>([]);

  useEffect(() => {
    let isMounted = true;
    // Clear out stale alerts immediately when coordinates change
    setLiveAlerts(forecast.severeAlerts || []);

    const fetchLiveAlerts = async () => {
      try {
        const res = await fetch(`/api/weather/alerts?lat=${coordinates.latitude}&lon=${coordinates.longitude}`);
        if (!res.ok || !isMounted) return;
        const data = await res.json();
        if (isMounted) {
          // If NOAA returned active alerts for this point, use them; otherwise, clear them
          if (data.alerts && data.alerts.length > 0) {
            setLiveAlerts(data.alerts);
          } else {
            setLiveAlerts(forecast.severeAlerts || []);
          }
        }
      } catch {
        if (isMounted) {
          setLiveAlerts(forecast.severeAlerts || []);
        }
      }
    };
    fetchLiveAlerts();
    return () => {
      isMounted = false;
    };
  }, [coordinates.latitude, coordinates.longitude, forecast.severeAlerts]);

  // Live ticking clock (updates every 1 second)
  const [liveTime, setLiveTime] = useState<Date>(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setLiveTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Keyboard shortcut listener to close modals or day breakdown with ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveModal(null);
        setSelectedDayIdx(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Helper to extract 24-hour data for any day in the 7-day forecast aligned with target location timezone
  const getDayHourlyData = React.useCallback(
    (dayIdx: number) => {
      if (dayIdx < 0 || dayIdx >= daily.date.length) return [];
      const targetDateStr = daily.date[dayIdx];
      if (!targetDateStr) return [];
      
      const getLocalDateString = (timeStr: string, tz: string): string => {
        try {
          const d = new Date(timeStr);
          return new Intl.DateTimeFormat("en-CA", {
            timeZone: tz || "UTC",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(d);
        } catch {
          return timeStr.split("T")[0];
        }
      };

      const cleanTargetDate = targetDateStr.includes("T")
        ? getLocalDateString(targetDateStr, coordinates.timezone || "UTC")
        : targetDateStr.split("T")[0];

      // Collect all hour indexes that belong to this day in local timezone
      const matchingIndices: number[] = [];
      hourly.times.forEach((timeStr, idx) => {
        const localDateForHour = getLocalDateString(timeStr, coordinates.timezone || "UTC");
        if (localDateForHour === cleanTargetDate) {
          matchingIndices.push(idx);
        }
      });

      // Fallback if timestamps don't match date formatting directly
      if (matchingIndices.length === 0) {
        const startIdx = dayIdx * 24;
        const endIdx = Math.min(startIdx + 24, hourly.times.length);
        for (let i = startIdx; i < endIdx; i++) {
          matchingIndices.push(i);
        }
      }

      return matchingIndices.map((idx) => {
        const timeStr = hourly.times[idx];
        const date = new Date(timeStr);
        let hourFormatted = "";
        try {
          hourFormatted = date.toLocaleTimeString("en-US", {
            timeZone: coordinates.timezone || "UTC",
            hour: "numeric",
            hour12: true,
          });
        } catch {
          hourFormatted = date.toLocaleTimeString([], { hour: "numeric", hour12: true });
        }

        const temp = hourly.mlCorrectedTemp[idx];
        const rawTemp = hourly.rawPhysicsTemp?.[idx] ?? temp;
        const precipProb = hourly.precipitationProb[idx];
        const rainMm = hourly.rainMm?.[idx] ?? 0;
        const wind = hourly.windSpeedKmh[idx];
        const windDir = hourly.windDirection?.[idx] ?? current.windDirectionDeg ?? 0;
        const windCompass = getWindDirectionCompass(windDir);
        const code = hourly.weatherCode?.[idx];
        const cloud = hourly.cloudCover?.[idx];
        const isDay = hourly.isDay?.[idx];
        const dewDep = hourly.dewPointDepression?.[idx] ?? (temp - (hourly.dewPoint?.[idx] ?? temp - 5));
        const hum = hourly.humidity[idx];
        const confUpper = hourly.confidenceUpper?.[idx] ?? temp + 1;
        const confLower = hourly.confidenceLower?.[idx] ?? temp - 1;

        // Modulate CAPE diurnally: nighttime boundary layer suppresses buoyant convection
        const isDaytime = typeof isDay === "boolean" ? isDay : isDay === 1;
        const diurnalCape = isDaytime
          ? (current.capeJkg ?? 0)
          : Math.min((current.capeJkg ?? 0) * 0.15, 100);

        const displayInfo = getHourlyWeatherDisplayInfo({
          weatherCode: code,
          cloudCover: cloud,
          isDay,
          dewPointDepression: dewDep,
          humidity: hum,
          capeJkg: diurnalCape,
        });

        return {
          index: idx,
          timeStr,
          hourFormatted,
          temp,
          rawTemp,
          precipProb,
          rainMm,
          wind,
          windDir,
          windCompass,
          code,
          cloud,
          isDay,
          dewDep,
          hum,
          confUpper,
          confLower,
          displayInfo,
        };
      });
    },
    [daily.date, hourly, coordinates.timezone, current.capeJkg, current.windDirectionDeg]
  );

  // Active selected day's hourly dataset & statistics
  const selectedDayDetails = useMemo(() => {
    if (selectedDayIdx === null) return null;
    const hours = getDayHourlyData(selectedDayIdx);
    if (hours.length === 0) return null;

    const dateStr = daily.date[selectedDayIdx];
    const dateFormatted = formatDailyForecastDate(dateStr, selectedDayIdx, coordinates.timezone);
    const maxT = daily.tempMax[selectedDayIdx];
    const minT = daily.tempMin[selectedDayIdx];
    const rainSum = daily.precipitationSum[selectedDayIdx];
    const dailyCode = daily.weatherCode?.[selectedDayIdx] ?? 0;

    const sunriseStr = daily.sunrise?.[selectedDayIdx];
    const sunsetStr = daily.sunset?.[selectedDayIdx];

    const formatSunTime = (isoTime?: string) => {
      if (!isoTime) return "--:--";
      try {
        const d = new Date(isoTime);
        return d.toLocaleTimeString("en-US", {
          timeZone: coordinates.timezone || "UTC",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });
      } catch {
        return isoTime.split("T")[1]?.slice(0, 5) || "--:--";
      }
    };

    // Calculate peaks
    let peakTempHour = hours[0];
    let minTempHour = hours[0];
    let maxPrecipHour = hours[0];
    let maxWindHour = hours[0];

    hours.forEach((h) => {
      if (h.temp > peakTempHour.temp) peakTempHour = h;
      if (h.temp < minTempHour.temp) minTempHour = h;
      if (h.precipProb > maxPrecipHour.precipProb) maxPrecipHour = h;
      if (h.wind > maxWindHour.wind) maxWindHour = h;
    });

    // Derive aggregated daily condition parameters from true 24-hour distribution
    const avgCloud = Math.round(hours.reduce((acc, h) => acc + (h.cloud ?? 30), 0) / hours.length);
    const avgHum = Math.round(hours.reduce((acc, h) => acc + h.hum, 0) / hours.length);
    const avgDewDep = Number((hours.reduce((acc, h) => acc + h.dewDep, 0) / hours.length).toFixed(1));

    const dailyDisplay = getHourlyWeatherDisplayInfo({
      weatherCode: dailyCode,
      cloudCover: avgCloud,
      isDay: true,
      dewPointDepression: avgDewDep,
      humidity: avgHum,
      capeJkg: current.capeJkg,
    });

    return {
      index: selectedDayIdx,
      dateStr,
      dateFormatted,
      maxT,
      minT,
      rainSum,
      dailyDisplay,
      sunriseFormatted: formatSunTime(sunriseStr),
      sunsetFormatted: formatSunTime(sunsetStr),
      hours,
      peakTempHour,
      minTempHour,
      maxPrecipHour,
      maxWindHour,
    };
  }, [selectedDayIdx, getDayHourlyData, daily, coordinates.timezone]);

  // Format high-precision local time for the target location's timezone
  const localTimeInfo = React.useMemo(() => {
    const locTz = coordinates.timezone || "UTC";
    try {
      const weekdayStr = liveTime.toLocaleDateString("en-US", {
        timeZone: locTz,
        weekday: "short",
      });
      const dateStr = liveTime.toLocaleDateString("en-US", {
        timeZone: locTz,
        month: "short",
        day: "numeric",
      });
      const timeStr = liveTime.toLocaleTimeString("en-US", {
        timeZone: locTz,
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });
      const tzShort =
        liveTime
          .toLocaleTimeString("en-US", {
            timeZone: locTz,
            timeZoneName: "short",
          })
          .split(" ")
          .pop() || locTz;

      return {
        fullString: `${weekdayStr}, ${dateStr} • ${timeStr} (${tzShort})`,
        timeStr,
        dateStr: `${weekdayStr}, ${dateStr}`,
        tzShort,
      };
    } catch {
      return null;
    }
  }, [coordinates.timezone, liveTime]);

  // Elapsed time since last background weather sync
  const syncElapsedText = React.useMemo(() => {
    if (!lastSyncedAt) return "Just now";
    const sec = Math.max(0, Math.floor((liveTime.getTime() - lastSyncedAt.getTime()) / 1000));
    if (sec < 5) return "Just now";
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    return `${min}m ${sec % 60}s ago`;
  }, [lastSyncedAt, liveTime]);

  const tempDelta = Number((current.temperature - current.rawPhysicsTemp).toFixed(1));
  const hasDelta = Math.abs(tempDelta) >= 0.1;

  const depressionFormatted =
    tempUnit === "F"
      ? `${(current.dewPointDepression * 1.8).toFixed(1)}°F`
      : `${current.dewPointDepression}°C`;

  const spreadFormatted =
    tempUnit === "F"
      ? `±${(mlBreakdown.modelDivergenceSpread * 1.8).toFixed(1)}°F`
      : `±${mlBreakdown.modelDivergenceSpread.toFixed(1)}°C`;

  const renderWeatherIcon = (iconType: WeatherIconType, className = "w-4 h-4") => {
    switch (iconType) {
      case "sun":
        return <Sun className={`${className} text-amber-400`} />;
      case "moon":
        return <Moon className={`${className} text-indigo-300`} />;
      case "cloud-sun":
        return <CloudSun className={`${className} text-amber-300`} />;
      case "cloud-moon":
        return <CloudMoon className={`${className} text-indigo-300`} />;
      case "cloud":
        return <Cloud className={`${className} text-slate-300`} />;
      case "fog":
        return <CloudFog className={`${className} text-slate-300`} />;
      case "drizzle":
        return <CloudDrizzle className={`${className} text-cyan-300`} />;
      case "rain":
        return <CloudRain className={`${className} text-blue-400`} />;
      case "snow":
        return <CloudSnow className={`${className} text-sky-200`} />;
      case "thunderstorm":
        return <CloudLightning className={`${className} text-amber-400`} />;
      default:
        return <Sun className={`${className} text-amber-400`} />;
    }
  };

  const currentDisplayInfo = getHourlyWeatherDisplayInfo({
    weatherCode: current.weatherCode,
    cloudCover: current.cloudCoverPercent,
    isDay: mlBreakdown.solarZenithAngle < 88,
    dewPointDepression: current.dewPointDepression,
    humidity: current.humidity,
  });

  return (
    <div className="space-y-6">
      {/* Severe Weather Alerts Banner */}
      {liveAlerts && liveAlerts.length > 0 && (
        <div className="space-y-3">
          {liveAlerts.map((alert) => {
            const isWarning = alert.severity === "warning" || alert.severity === "emergency";
            const isWatch = alert.severity === "watch";
            return (
              <div
                key={alert.id}
                className={`p-4 sm:p-5 rounded-3xl border shadow-xl relative overflow-hidden transition-all ${
                  isWarning
                    ? "bg-rose-950/90 border-rose-500/80 text-rose-100 shadow-rose-950/40"
                    : isWatch
                    ? "bg-amber-950/90 border-amber-500/80 text-amber-100 shadow-amber-950/40"
                    : "bg-cyan-950/90 border-cyan-500/80 text-cyan-100 shadow-cyan-950/40"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2.5 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                        isWarning
                          ? "bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse"
                          : isWatch
                          ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                          : "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40"
                      }`}
                    >
                      <ShieldAlert className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-base font-bold tracking-tight text-white uppercase font-mono">
                          {alert.event}
                        </h4>
                        <span
                          className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded-full font-bold border ${
                            isWarning
                              ? "bg-rose-500 text-white border-rose-400"
                              : isWatch
                              ? "bg-amber-500 text-slate-950 border-amber-400"
                              : "bg-cyan-500 text-slate-950 border-cyan-400"
                          }`}
                        >
                          {alert.severity.toUpperCase()}
                        </span>
                        {alert.urgency && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-white border border-white/20">
                            Urgency: {alert.urgency}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-white/80 font-medium mt-0.5">
                        {alert.headline}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-2xl bg-black/30 border border-white/10 space-y-1">
                    <div className="text-[11px] uppercase font-bold text-white/70 tracking-wider">
                      Atmospheric Hazard Detail
                    </div>
                    <p className="text-white/90 leading-relaxed">
                      {alert.description}
                    </p>
                  </div>

                  {alert.instruction && (
                    <div className="p-3 rounded-2xl bg-black/40 border border-white/15 space-y-1">
                      <div className="text-[11px] uppercase font-bold text-amber-300 tracking-wider flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> Action & Safety Protocol
                      </div>
                      <p className="text-white font-medium leading-relaxed">
                        {alert.instruction}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Top Banner: Location & ML Bias Correction Delta Overview */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-950 border border-slate-800/90 rounded-3xl p-6 lg:p-8 relative overflow-hidden shadow-2xl">
        {/* Atmospheric Glow Background Accent */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6 mb-6">
            <div>
              {/* Coordinates and Location Breakdown Pill Row */}
              <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 mb-2 flex-wrap">
                <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                <span className="font-bold">COORDINATES: {formatCoordinates(coordinates.latitude, coordinates.longitude)}</span>
                
                {coordinates.town && (
                  <>
                    <span className="text-slate-600">•</span>
                    <span className="text-slate-200">
                      TOWN: <span className="text-cyan-300 font-semibold">{coordinates.town}</span>
                    </span>
                  </>
                )}

                {coordinates.state && (
                  <>
                    <span className="text-slate-600">•</span>
                    <span className="text-slate-200">
                      STATE: <span className="text-cyan-300 font-semibold">{coordinates.state}</span>
                    </span>
                  </>
                )}

                {coordinates.country && (
                  <>
                    <span className="text-slate-600">•</span>
                    <span className="text-slate-200">
                      COUNTRY: <span className="text-cyan-300 font-semibold">{coordinates.country}</span>
                    </span>
                  </>
                )}

                <span className="text-slate-600">•</span>
                <span className="text-slate-400">ELEVATION: {formatElevation(mlBreakdown.actualElevation, tempUnit)}</span>
                {localTimeInfo && (
                  <>
                    <span className="text-slate-600">•</span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-800/80 flex items-center gap-1.5 font-semibold font-mono">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
                      </span>
                      <Clock className="w-3 h-3 text-amber-400" />
                      <span>LOCAL TIME:</span>
                      <span className="text-amber-100 font-bold">{localTimeInfo.fullString}</span>
                    </span>
                  </>
                )}
                {mlBreakdown.isCoastalRegion && (
                  <>
                    <span className="text-slate-600">•</span>
                    <span className="text-teal-400 flex items-center gap-1 font-semibold">
                      <Waves className="w-3 h-3" />
                      SHORELINE / MARITIME MODERATION ACTIVE
                    </span>
                  </>
                )}
              </div>

              <div className="space-y-1">
                <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight flex items-center gap-2.5 flex-wrap">
                  <span>{coordinates.locationName || coordinates.town || "Target Coordinate Point"}</span>
                  <div className="flex items-center gap-1.5 flex-wrap text-xs font-medium">
                    {coordinates.town && (
                      <span className="px-2.5 py-0.5 rounded-full bg-cyan-950/80 text-cyan-300 border border-cyan-800/80 font-mono">
                        {coordinates.town}
                      </span>
                    )}
                    {coordinates.state && (
                      <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-200 border border-slate-700">
                        {coordinates.state}
                      </span>
                    )}
                    {coordinates.country && (
                      <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                        {coordinates.country}
                      </span>
                    )}
                  </div>
                </h2>
                {coordinates.formattedAddress && coordinates.formattedAddress !== coordinates.locationName && (
                  <p className="text-xs text-slate-400 font-mono flex items-center gap-1.5 pt-0.5">
                    <MapPin className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                    <span className="truncate">{coordinates.formattedAddress}</span>
                  </p>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1.5">
                Physics-Informed Downscaling & Multi-Model Ensemble Bias Correction
              </p>
            </div>

            {/* Model Confidence, Divergence Badge & Live Sync Status */}
            <div className="flex items-center gap-3 flex-wrap">
              {/* Live Data Sync Badge */}
              <div className="px-3.5 py-2 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center gap-2.5">
                <div>
                  <div className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider flex items-center gap-1.5">
                    <span className="relative flex h-1.5 w-1.5">
                      {isSyncing ? (
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                      ) : (
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      )}
                      <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${isSyncing ? "bg-cyan-400" : "bg-emerald-400"}`} />
                    </span>
                    <span>Live Data Sync</span>
                  </div>
                  <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5 font-mono mt-0.5">
                    <span>{isSyncing ? "Updating..." : syncElapsedText}</span>
                    {onManualSync && (
                      <button
                        onClick={onManualSync}
                        disabled={isSyncing}
                        className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-cyan-300 transition"
                        title="Sync latest observational models now"
                      >
                        <RefreshCw className={`w-3 h-3 ${isSyncing ? "animate-spin text-cyan-400" : ""}`} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="px-4 py-2 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center gap-3">
                <div>
                  <div className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
                    Model Confidence
                  </div>
                  <div className="text-base font-bold text-emerald-400 flex items-center gap-1 font-mono">
                    <Zap className="w-3.5 h-3.5" />
                    {mlBreakdown.modelConfidenceScore}%
                  </div>
                </div>
                <div className="w-px h-8 bg-slate-800" />
                <div>
                  <div className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
                    Ensemble Spread
                  </div>
                  <div className="text-base font-bold text-cyan-300 font-mono">
                    {spreadFormatted}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Core Temperature & ML Correction Callout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            
            {/* Left: ML Predicted Temperature */}
            <div className="lg:col-span-5 space-y-4">
              <div className="flex items-baseline gap-4">
                <div className="text-6xl sm:text-7xl font-extrabold tracking-tighter text-white font-mono">
                  {formatTemp(current.temperature, tempUnit)}
                </div>
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-wider font-semibold text-slate-400">
                    ML Corrected
                  </div>
                  <div className="text-sm font-medium text-slate-300">
                    Feels like {formatTemp(current.apparentTemperature, tempUnit)}
                  </div>
                </div>
              </div>

              <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-2xl bg-slate-950/80 border border-slate-800 text-sm font-medium text-slate-200">
                {renderWeatherIcon(currentDisplayInfo.iconType, "w-4 h-4")}
                <span>{currentDisplayInfo.condition}</span>
                <span>•</span>
                <span className="text-slate-400 font-normal">
                  Cloud Cover: {current.cloudCoverPercent}%
                </span>
              </div>

              {/* Bias Correction Delta Pill */}
              <div className="p-3.5 rounded-2xl bg-cyan-950/40 border border-cyan-500/30 text-xs flex items-start gap-3">
                <div className="p-1.5 rounded-xl bg-cyan-500/20 text-cyan-300 mt-0.5">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="space-y-0.5">
                  <div className="font-semibold text-cyan-200 flex items-center gap-1.5">
                    <span>Physics Model Discrepancy Adjusted</span>
                    <span className="font-mono text-cyan-400 font-bold">
                      ({formatTempDelta(tempDelta, tempUnit)} Delta)
                    </span>
                  </div>
                  <p className="text-slate-300 text-[11px] leading-relaxed">
                    Raw global physics model estimated <strong>{formatTemp(current.rawPhysicsTemp, tempUnit)}</strong> (at {formatElevation(mlBreakdown.gridElevation, tempUnit)} elevation). Model Output Statistics downscaled for target terrain ({formatElevation(mlBreakdown.actualElevation, tempUnit)}) using dynamic atmospheric lapse rate Γ = <strong>{formatLapseRate(mlBreakdown.elevationLapseRate, tempUnit)}</strong> based on relative humidity ({mlBreakdown.humidity}%).
                  </p>
                </div>
              </div>
            </div>

            {/* Right: Key Atmospheric Physics Indicators Grid */}
            <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-3">
              
              {/* Dew Point & Saturation Gap */}
              <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 transition">
                <div className="flex items-center justify-between text-slate-400 mb-1">
                  <span className="text-xs font-medium">Dew Point</span>
                  <Droplets className="w-3.5 h-3.5 text-blue-400" />
                </div>
                <div className="text-base font-bold text-white font-mono">
                  {formatTemp(current.dewPoint, tempUnit)}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Depression: <span className="text-cyan-300 font-mono">{depressionFormatted}</span>
                </div>
              </div>

              {/* Surface Pressure & Tendency */}
              <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 transition">
                <div className="flex items-center justify-between text-slate-400 mb-1">
                  <span className="text-xs font-medium">Pressure</span>
                  <Gauge className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="text-base font-bold text-white font-mono">
                  {formatPressure(current.pressureHpa, tempUnit)}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                  <span>3h Δ:</span>
                  <span className={`font-mono font-semibold ${
                    mlBreakdown.pressureTendency3h > 0 ? "text-emerald-400" : mlBreakdown.pressureTendency3h < 0 ? "text-rose-400" : "text-slate-300"
                  }`}>
                    {tempUnit === "F"
                      ? `${mlBreakdown.pressureTendency3h > 0 ? "+" : ""}${(mlBreakdown.pressureTendency3h * 0.02953).toFixed(2)} inHg`
                      : `${mlBreakdown.pressureTendency3h > 0 ? `+${mlBreakdown.pressureTendency3h}` : mlBreakdown.pressureTendency3h} hPa`}
                  </span>
                </div>
              </div>

              {/* Wind Vector & Direction */}
              <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 transition">
                <div className="flex items-center justify-between text-slate-400 mb-1">
                  <span className="text-xs font-medium">Wind at 10m</span>
                  <Wind className="w-3.5 h-3.5 text-teal-400" />
                </div>
                <div className="text-base font-bold text-white font-mono">
                  {formatWind(current.windSpeedKmh, tempUnit)}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Dir: <span className="text-slate-200 font-semibold">{getWindDirectionCompass(current.windDirectionDeg)} ({current.windDirectionDeg}°)</span>
                </div>
              </div>

              {/* Solar Radiation Flux & Zenith */}
              <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 transition">
                <div className="flex items-center justify-between text-slate-400 mb-1">
                  <span className="text-xs font-medium">Solar Flux</span>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <div className="text-base font-bold text-white font-mono">
                  {current.solarRadiationWm2} W/m²
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Zenith: <span className="text-amber-300 font-mono">{mlBreakdown.solarZenithAngle}°</span>
                </div>
              </div>

              {/* Boundary Layer Height */}
              <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 transition">
                <div className="flex items-center justify-between text-slate-400 mb-1">
                  <span className="text-xs font-medium">PBL Height</span>
                  <Layers className="w-3.5 h-3.5 text-purple-400" />
                </div>
                <div className="text-base font-bold text-white font-mono">
                  {formatElevation(current.pblHeightM, tempUnit)}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Mixing layer depth
                </div>
              </div>

              {/* Atmospheric Instability (CAPE) */}
              <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 transition">
                <div className="flex items-center justify-between text-slate-400 mb-1">
                  <span className="text-xs font-medium">CAPE Instability</span>
                  <Activity className="w-3.5 h-3.5 text-rose-400" />
                </div>
                <div className="text-base font-bold text-white font-mono">
                  {current.capeJkg} J/kg
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {current.capeJkg > 1000 ? "High Storm Potential" : current.capeJkg > 300 ? "Moderate" : "Stable Column"}
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* Hourly Multi-Variable Timeline Strip */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Compass className="w-4 h-4 text-cyan-400" />
              Hourly Hyper-Local Timeline (Next 24 Hours)
            </h3>
            <p className="text-xs text-slate-400">
              Icons reflect exact hourly WMO code, cloud cover %, day/night cycle, and dew point depression fog threshold
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-cyan-400" /> ML Temp
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500 ml-2" /> Rain Prob %
          </div>
        </div>

        <div className="flex items-center gap-3 overflow-x-auto pb-3 pt-2 no-scrollbar">
          {hourly.times.slice(0, 24).map((timeStr, idx) => {
            let hourFormatted = "";
            if (timeStr && timeStr.includes("T")) {
              const hourPart = parseInt(timeStr.split("T")[1].slice(0, 2), 10);
              const hour12 = hourPart % 12 || 12;
              const ampm = hourPart >= 12 ? "PM" : "AM";
              hourFormatted = `${hour12} ${ampm}`;
            } else {
              try {
                hourFormatted = new Date(timeStr).toLocaleTimeString("en-US", {
                  timeZone: coordinates.timezone || "UTC",
                  hour: "numeric",
                  hour12: true,
                });
              } catch {
                hourFormatted = "--";
              }
            }

            const temp = hourly.mlCorrectedTemp[idx] ?? 20;
            const precipProb = hourly.precipitationProb[idx] ?? 0;
            const wind = hourly.windSpeedKmh[idx] ?? 0;
            const code = hourly.weatherCode?.[idx];
            const cloud = hourly.cloudCover?.[idx];
            const isDay = hourly.isDay?.[idx];
            const dewDep = hourly.dewPointDepression?.[idx] ?? Math.max(0, temp - (hourly.dewPoint?.[idx] ?? temp - 5));
            const hum = hourly.humidity[idx] ?? 50;

            const isDaytime = typeof isDay === "boolean" ? isDay : isDay === 1;
            const diurnalCape = isDaytime
              ? (current.capeJkg ?? 0)
              : Math.min((current.capeJkg ?? 0) * 0.15, 100);

            const hourDisplay = getHourlyWeatherDisplayInfo({
              weatherCode: code,
              cloudCover: cloud,
              isDay,
              dewPointDepression: dewDep,
              humidity: hum,
              capeJkg: diurnalCape,
            });

            return (
              <div
                key={timeStr}
                className="flex-shrink-0 w-28 p-3 rounded-2xl bg-slate-950/70 border border-slate-800/80 hover:border-cyan-500/50 hover:bg-slate-950 transition flex flex-col items-center text-center space-y-2 group"
                title={`${hourDisplay.condition} (${hourFormatted}) • Cloud Cover: ${cloud ?? 20}% • RH: ${hum}% • T-Td: ${dewDep.toFixed(1)}°C`}
              >
                <span className="text-xs font-semibold text-slate-400 font-mono flex items-center justify-center gap-1">
                  {idx === 0 ? (
                    <>
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                      <span className="text-cyan-300 font-bold">Now</span>
                    </>
                  ) : (
                    hourFormatted
                  )}
                </span>

                <div className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center group-hover:scale-110 transition shadow-inner">
                  {renderWeatherIcon(hourDisplay.iconType, "w-4 h-4")}
                </div>

                <div className="text-[10px] font-medium text-slate-300 leading-tight h-6 flex items-center justify-center line-clamp-2 px-1">
                  {hourDisplay.condition}
                </div>

                <div className="text-sm font-bold text-white font-mono">
                  {formatTempShort(temp, tempUnit)}
                </div>

                <div className="w-full pt-1.5 border-t border-slate-800/60 space-y-1">
                  <div className="flex items-center justify-center gap-1 text-[11px] font-mono text-blue-400 font-semibold">
                    <Droplets className="w-2.5 h-2.5" />
                    <span>{precipProb}%</span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    {formatWind(wind, tempUnit)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Atmospheric Chemistry (Air Quality) & Solar/Lunar Astronomy Widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Air Quality Index & Particulate Chemistry */}
        {forecast.airQuality && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Activity className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">
                    Air Quality Index (AQI)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Real-time atmospheric chemistry & particulate matter
                  </p>
                </div>
              </div>

              {/* AQI Score Badge & Fullscreen Button */}
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="flex items-center gap-1.5 justify-end">
                    <span className="text-2xl font-black font-mono text-white">
                      {forecast.airQuality.usAqi}
                    </span>
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                        forecast.airQuality.aqiCategory === "Good"
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                          : forecast.airQuality.aqiCategory === "Moderate"
                          ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                          : forecast.airQuality.aqiCategory === "Sensitive"
                          ? "bg-orange-500/20 text-orange-300 border-orange-500/40"
                          : "bg-rose-500/20 text-rose-300 border-rose-500/40"
                      }`}
                    >
                      {forecast.airQuality.aqiCategory}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    Dominant: {forecast.airQuality.dominantPollutant}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveModal("aqi")}
                  className="p-2.5 rounded-2xl bg-slate-950/80 hover:bg-slate-800 text-slate-400 hover:text-emerald-300 border border-slate-800 hover:border-emerald-500/50 transition shadow-sm group active:scale-95 cursor-pointer"
                  title="Fullscreen Air Quality Observatory"
                >
                  <Maximize2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
                </button>
              </div>
            </div>

            {/* AQI Gradient Meter */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-[10px] font-mono text-slate-400">
                <span>0 Good</span>
                <span>50 Mod</span>
                <span>100 Sensitive</span>
                <span>150 Unhealthy</span>
                <span>300+ Haz</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden relative">
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 via-amber-400 via-orange-500 via-rose-500 to-purple-700 opacity-80" />
                <div
                  className="absolute top-0 bottom-0 w-2.5 bg-white rounded-full shadow-md transform -translate-x-1/2"
                  style={{
                    left: `${Math.min(100, Math.max(0, (forecast.airQuality.usAqi / 300) * 100))}%`,
                  }}
                />
              </div>
            </div>

            {/* Inversion Smoke / Pollutant Trapping Alert */}
            {forecast.airQuality.inversionTrappingRisk && (
              <div className="p-3 rounded-2xl bg-amber-950/40 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2.5">
                <Flame className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="text-amber-300">Boundary Layer Inversion Trap Detected:</strong> Stable nocturnal cold air pool is trapping particulate matter and smoke near the valley floor.
                </div>
              </div>
            )}

            {/* Pollutant Breakdown Tiles */}
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-center">
              <div className="p-2.5 rounded-2xl bg-slate-950/60 border border-slate-800">
                <div className="text-[10px] text-slate-400 font-medium">PM 2.5</div>
                <div className="text-xs font-bold text-white font-mono mt-0.5">
                  {forecast.airQuality.pm25} <span className="text-[9px] font-normal text-slate-400">µg/m³</span>
                </div>
              </div>

              <div className="p-2.5 rounded-2xl bg-slate-950/60 border border-slate-800">
                <div className="text-[10px] text-slate-400 font-medium">PM 10</div>
                <div className="text-xs font-bold text-white font-mono mt-0.5">
                  {forecast.airQuality.pm10} <span className="text-[9px] font-normal text-slate-400">µg/m³</span>
                </div>
              </div>

              <div className="p-2.5 rounded-2xl bg-slate-950/60 border border-slate-800">
                <div className="text-[10px] text-slate-400 font-medium">Ozone (O₃)</div>
                <div className="text-xs font-bold text-white font-mono mt-0.5">
                  {forecast.airQuality.ozone} <span className="text-[9px] font-normal text-slate-400">µg/m³</span>
                </div>
              </div>

              <div className="p-2.5 rounded-2xl bg-slate-950/60 border border-slate-800">
                <div className="text-[10px] text-slate-400 font-medium">NO₂</div>
                <div className="text-xs font-bold text-white font-mono mt-0.5">
                  {forecast.airQuality.nitrogenDioxide} <span className="text-[9px] font-normal text-slate-400">µg/m³</span>
                </div>
              </div>

              <div className="p-2.5 rounded-2xl bg-slate-950/60 border border-slate-800">
                <div className="text-[10px] text-slate-400 font-medium">SO₂</div>
                <div className="text-xs font-bold text-white font-mono mt-0.5">
                  {forecast.airQuality.sulphurDioxide} <span className="text-[9px] font-normal text-slate-400">µg/m³</span>
                </div>
              </div>
            </div>

            {/* 24-Hour Air Quality Smooth Line Graph */}
            {forecast.airQuality.hourlyAqi && forecast.airQuality.hourlyAqi.length > 0 && (() => {
              const aqList = forecast.airQuality.hourlyAqi.slice(0, 24);
              const minAq = Math.min(...aqList, 20);
              const maxAq = Math.max(...aqList, 150);
              const range = Math.max(40, maxAq - minAq);

              const svgW = 500;
              const svgH = 110;
              const padL = 24;
              const padR = 24;
              const padT = 16;
              const padB = 22;
              const plotW = svgW - padL - padR;
              const plotH = svgH - padT - padB;

              const getCategory = (v: number) => {
                if (v <= 50) return { label: "Good", hex: "#10b981", color: "text-emerald-400", border: "border-emerald-500/40", bg: "bg-emerald-950/60" };
                if (v <= 100) return { label: "Moderate", hex: "#eab308", color: "text-amber-400", border: "border-amber-500/40", bg: "bg-amber-950/60" };
                if (v <= 150) return { label: "Sensitive", hex: "#f97316", color: "text-orange-400", border: "border-orange-500/40", bg: "bg-orange-950/60" };
                if (v <= 200) return { label: "Unhealthy", hex: "#f43f5e", color: "text-rose-400", border: "border-rose-500/40", bg: "bg-rose-950/60" };
                return { label: "Very Unhealthy", hex: "#a855f7", color: "text-purple-400", border: "border-purple-500/40", bg: "bg-purple-950/60" };
              };

              const points = aqList.map((val, i) => {
                const x = padL + (i / Math.max(1, aqList.length - 1)) * plotW;
                const y = padT + (1 - (val - minAq) / range) * plotH;
                const cat = getCategory(val);
                return { x, y, val, i, cat };
              });

              // Cubic bezier smooth curve
              let pathD = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
              for (let i = 0; i < points.length - 1; i++) {
                const p0 = points[i];
                const p1 = points[i + 1];
                const dx = (p1.x - p0.x) / 2;
                pathD += ` C ${(p0.x + dx).toFixed(1)} ${p0.y.toFixed(1)}, ${(p1.x - dx).toFixed(1)} ${p1.y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
              }

              const bottomY = padT + plotH;
              const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${bottomY} L ${points[0].x.toFixed(1)} ${bottomY} Z`;

              // Guide line positions for EPA thresholds
              const getYForAqi = (threshold: number) => {
                if (threshold < minAq || threshold > maxAq) return null;
                return padT + (1 - (threshold - minAq) / range) * plotH;
              };

              const y50 = getYForAqi(50);
              const y100 = getYForAqi(100);
              const y150 = getYForAqi(150);

              const activeIdx = hoveredAqiIdx ?? 0;
              const activePoint = points[activeIdx] || points[0];
              const activeVal = activePoint.val;
              const activeCat = activePoint.cat;
              const activeTimeStr = forecast.airQuality?.hourlyTimes?.[activeIdx]
                ? (() => {
                    try {
                      return new Date(forecast.airQuality.hourlyTimes[activeIdx]).toLocaleTimeString("en-US", {
                        timeZone: coordinates.timezone || "UTC",
                        hour: "numeric",
                        minute: "2-digit",
                        hour12: true,
                      });
                    } catch {
                      return `${activeIdx}h`;
                    }
                  })()
                : `${activeIdx}h`;

              const peakAq = Math.max(...aqList);

              return (
                <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800/90 space-y-3 relative overflow-hidden">
                  {/* Header & Active Hover HUD */}
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span className="font-semibold flex items-center gap-1.5 text-cyan-300">
                      <Activity className="w-4 h-4 text-cyan-400" /> 24-Hour Air Quality Trend (AQI)
                    </span>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                        24h Peak: <strong className="text-rose-300">{peakAq} AQI</strong>
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full border text-[10px] font-bold font-mono transition-colors duration-150 ${activeCat.bg} ${activeCat.border} ${activeCat.color}`}>
                        {activeTimeStr}: {activeVal} AQI ({activeCat.label})
                      </span>
                    </div>
                  </div>

                  {/* Interactive SVG Line Graph */}
                  <div
                    className="relative w-full cursor-crosshair select-none"
                    onMouseLeave={() => setHoveredAqiIdx(null)}
                  >
                    <svg
                      viewBox={`0 0 ${svgW} ${svgH}`}
                      className="w-full h-28 overflow-visible"
                    >
                      <defs>
                        {/* Area Gradient Fill matching active/hovered pollutant severity */}
                        <linearGradient id="aqiAreaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor={activeCat.hex} stopOpacity="0.25" />
                          <stop offset="100%" stopColor={activeCat.hex} stopOpacity="0.0" />
                        </linearGradient>

                        {/* Value-Based Stroke Line Gradient dynamically mapped to each hour's exact EPA category */}
                        <linearGradient id="aqiLineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                          {points.map((pt, i) => {
                            const pct = (i / Math.max(1, points.length - 1)) * 100;
                            return (
                              <stop
                                key={i}
                                offset={`${pct.toFixed(1)}%`}
                                stopColor={pt.cat.hex}
                              />
                            );
                          })}
                        </linearGradient>
                      </defs>

                      {/* Threshold Guidelines */}
                      {y50 !== null && (
                        <g opacity="0.35">
                          <line x1={padL} y1={y50} x2={svgW - padR} y2={y50} stroke="#10b981" strokeDasharray="3 3" strokeWidth="1" />
                          <text x={svgW - padR + 3} y={y50 + 3} fill="#10b981" fontSize="8" fontFamily="monospace">50</text>
                        </g>
                      )}
                      {y100 !== null && (
                        <g opacity="0.35">
                          <line x1={padL} y1={y100} x2={svgW - padR} y2={y100} stroke="#eab308" strokeDasharray="3 3" strokeWidth="1" />
                          <text x={svgW - padR + 3} y={y100 + 3} fill="#eab308" fontSize="8" fontFamily="monospace">100</text>
                        </g>
                      )}
                      {y150 !== null && (
                        <g opacity="0.35">
                          <line x1={padL} y1={y150} x2={svgW - padR} y2={y150} stroke="#f43f5e" strokeDasharray="3 3" strokeWidth="1" />
                          <text x={svgW - padR + 3} y={y150 + 3} fill="#f43f5e" fontSize="8" fontFamily="monospace">150</text>
                        </g>
                      )}

                      {/* Area Fill Under Curve */}
                      <path d={areaD} fill="url(#aqiAreaGrad)" className="transition-all duration-300" />

                      {/* Smooth Trend Line */}
                      <path
                        d={pathD}
                        fill="none"
                        stroke="url(#aqiLineGrad)"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />

                      {/* Interactive Crosshair & Highlight Dot with Matching Category Color */}
                      {hoveredAqiIdx !== null && (
                        <g className="transition-colors duration-150">
                          <line
                            x1={activePoint.x}
                            y1={padT}
                            x2={activePoint.x}
                            y2={bottomY}
                            stroke={activeCat.hex}
                            strokeWidth="1.5"
                            strokeDasharray="2 2"
                            opacity="0.85"
                          />
                          <circle
                            cx={activePoint.x}
                            cy={activePoint.y}
                            r="5"
                            fill={activeCat.hex}
                            stroke="#020617"
                            strokeWidth="2"
                            className="drop-shadow"
                          />
                          <circle
                            cx={activePoint.x}
                            cy={activePoint.y}
                            r="8"
                            fill="none"
                            stroke={activeCat.hex}
                            strokeWidth="1.5"
                            opacity="0.4"
                          />
                        </g>
                      )}

                      {/* Hover Trigger Rectangles across 24 columns */}
                      {points.map((pt, i) => {
                        const colW = plotW / Math.max(1, points.length - 1);
                        const startX = pt.x - colW / 2;
                        return (
                          <rect
                            key={i}
                            x={Math.max(0, startX)}
                            y={0}
                            width={colW}
                            height={svgH}
                            fill="transparent"
                            onMouseEnter={() => setHoveredAqiIdx(i)}
                            onTouchStart={() => setHoveredAqiIdx(i)}
                          />
                        );
                      })}
                    </svg>

                    {/* Clean X-Axis Time Labels */}
                    <div className="flex justify-between px-2 pt-1 text-[9px] text-slate-400 font-mono select-none">
                      {points.map((pt, idx) => {
                        if (idx % 4 !== 0 && idx !== points.length - 1) return null;
                        const tLabel = forecast.airQuality?.hourlyTimes?.[idx]
                          ? (() => {
                              try {
                                return new Date(forecast.airQuality.hourlyTimes[idx])
                                  .toLocaleTimeString("en-US", {
                                    timeZone: coordinates.timezone || "UTC",
                                    hour: "numeric",
                                    hour12: true,
                                  })
                                  .replace(":00", "")
                                  .toLowerCase();
                              } catch {
                                return `${idx}h`;
                              }
                            })()
                          : `${idx}h`;

                        return (
                          <span
                            key={idx}
                            className={`transition-colors cursor-pointer ${
                              hoveredAqiIdx === idx ? "text-cyan-300 font-bold" : "text-slate-500 hover:text-slate-300"
                            }`}
                            onMouseEnter={() => setHoveredAqiIdx(idx)}
                          >
                            {idx === 0 ? "Now" : tLabel}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Health Guidance */}
            <p className="text-xs text-slate-300 bg-slate-950/40 p-3 rounded-2xl border border-slate-800/60 leading-relaxed">
              <strong>Health Advisory:</strong> {forecast.airQuality.healthRecommendation}
            </p>
          </div>
        )}

        {/* 2. Solar & Lunar Celestial Astronomy Widget */}
        {forecast.astronomy && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <Sun className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">
                    Solar & Lunar Astronomy
                  </h3>
                  <p className="text-xs text-slate-400">
                    Daylight trajectory, golden & blue hour, and moon phase
                  </p>
                </div>
              </div>

              {/* Moon Phase Badge & Fullscreen Button */}
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="flex items-center gap-1.5 justify-end">
                    <span className="text-lg">{forecast.astronomy.moonPhaseIcon}</span>
                    <span className="text-xs font-bold text-indigo-300 font-mono">
                      {forecast.astronomy.moonPhase}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    {forecast.astronomy.moonIlluminationPercent}% Illuminated • Age: {forecast.astronomy.moonAgeDays}d
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveModal("astronomy")}
                  className="p-2.5 rounded-2xl bg-slate-950/80 hover:bg-slate-800 text-slate-400 hover:text-amber-300 border border-slate-800 hover:border-amber-500/50 transition shadow-sm group active:scale-95 cursor-pointer"
                  title="Fullscreen Solar & Lunar Observatory"
                >
                  <Maximize2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
                </button>
              </div>
            </div>

            {/* Sun Trajectory Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-1">
                <div className="text-[10px] text-amber-400 font-bold uppercase tracking-wider flex items-center gap-1">
                  <Sunrise className="w-3 h-3" /> Sunrise
                </div>
                <div className="text-sm font-bold text-white font-mono">
                  {forecast.astronomy.sunrise}
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-1">
                <div className="text-[10px] text-orange-400 font-bold uppercase tracking-wider flex items-center gap-1">
                  <Sunset className="w-3 h-3" /> Sunset
                </div>
                <div className="text-sm font-bold text-white font-mono">
                  {forecast.astronomy.sunset}
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-1">
                <div className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider flex items-center gap-1">
                  <Sun className="w-3 h-3" /> Solar Noon
                </div>
                <div className="text-sm font-bold text-white font-mono">
                  {forecast.astronomy.solarNoon}
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-1">
                <div className="text-[10px] text-purple-400 font-bold uppercase tracking-wider flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Daylight
                </div>
                <div className="text-sm font-bold text-white font-mono">
                  {forecast.astronomy.daylightDurationHours} hrs
                </div>
              </div>
            </div>

            {/* Golden & Blue Hours */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div className="p-3 rounded-2xl bg-amber-950/20 border border-amber-500/20 space-y-1">
                <div className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-amber-400" /> Golden Hour Photography Windows
                </div>
                <div className="text-[11px] text-slate-300 font-mono space-y-0.5">
                  <div>🌅 Morning: {forecast.astronomy.goldenHourMorning}</div>
                  <div>🌇 Evening: {forecast.astronomy.goldenHourEvening}</div>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-indigo-950/20 border border-indigo-500/20 space-y-1">
                <div className="text-[11px] font-bold text-indigo-300 flex items-center gap-1.5">
                  <Moon className="w-3 h-3 text-indigo-400" /> Blue Hour Twilight Windows
                </div>
                <div className="text-[11px] text-slate-300 font-mono space-y-0.5">
                  <div>🌌 Dawn: {forecast.astronomy.blueHourMorning}</div>
                  <div>🌆 Dusk: {forecast.astronomy.blueHourEvening}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 7-Day Precision Outlook */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              7-Day Synoptic Forecast Matrix
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Click any day card below to inspect its hyper-local 24-hour hourly prediction model.
            </p>
          </div>
          {selectedDayIdx !== null && (
            <button
              onClick={() => setSelectedDayIdx(null)}
              className="self-start sm:self-auto text-xs px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition flex items-center gap-1 border border-slate-700 font-mono"
            >
              <X className="w-3 h-3 text-slate-400" />
              <span>Close Hourly View</span>
            </button>
          )}
        </div>

        {/* 7-Day Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
          {daily.date.map((dateStr, idx) => {
            const { dayName, monthDay, isToday, isTomorrow, weekday } = formatDailyForecastDate(dateStr, idx, coordinates.timezone);
            const maxT = daily.tempMax[idx];
            const minT = daily.tempMin[idx];
            const rainSum = daily.precipitationSum[idx];
            const dailyCode = daily.weatherCode?.[idx] ?? 0;
            const isSelected = selectedDayIdx === idx;

            const dayHours = getDayHourlyData(idx);
            const dayAvgCloud = dayHours.length > 0
              ? Math.round(dayHours.reduce((acc, h) => acc + (h.cloud ?? 30), 0) / dayHours.length)
              : rainSum > 2 ? 85 : 30;
            const dayAvgHum = dayHours.length > 0
              ? Math.round(dayHours.reduce((acc, h) => acc + h.hum, 0) / dayHours.length)
              : 60;
            const dayAvgDewDep = dayHours.length > 0
              ? Number((dayHours.reduce((acc, h) => acc + h.dewDep, 0) / dayHours.length).toFixed(1))
              : 5.0;

            const dailyDisplay = getHourlyWeatherDisplayInfo({
              weatherCode: dailyCode,
              cloudCover: dayAvgCloud,
              isDay: true,
              dewPointDepression: dayAvgDewDep,
              humidity: dayAvgHum,
              capeJkg: current.capeJkg,
            });

            return (
              <button
                key={dateStr}
                type="button"
                onClick={() => setSelectedDayIdx((prev) => (prev === idx ? null : idx))}
                className={`p-4 rounded-2xl transition-all duration-200 flex flex-col items-center text-center space-y-2.5 relative group cursor-pointer text-left w-full focus:outline-none ${
                  isSelected
                    ? "bg-cyan-950/90 border-2 border-cyan-400 shadow-xl shadow-cyan-950/50 ring-2 ring-cyan-400/30 scale-[1.02]"
                    : isToday
                    ? "bg-cyan-950/40 border border-cyan-500/40 shadow-lg shadow-cyan-950/20 hover:border-cyan-400 hover:bg-cyan-950/60"
                    : isTomorrow
                    ? "bg-slate-950/80 border border-slate-700/80 hover:border-slate-600 hover:bg-slate-950"
                    : "bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 hover:bg-slate-950/90"
                }`}
                title={`Click to view 24-hour hourly prediction for ${dayName} (${monthDay})`}
              >
                {/* Active Indicator Beacon */}
                {isSelected && (
                  <div className="absolute -top-2 px-2 py-0.5 rounded-full bg-cyan-400 text-slate-950 text-[9px] font-black tracking-wider uppercase flex items-center gap-1 shadow-md">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-950 animate-pulse" />
                    Viewing Hourly
                  </div>
                )}

                <div>
                  <div
                    className={`text-xs font-bold ${
                      isSelected
                        ? "text-cyan-200"
                        : isToday
                        ? "text-cyan-300"
                        : isTomorrow
                        ? "text-slate-100"
                        : "text-slate-200"
                    }`}
                  >
                    {dayName}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    {monthDay} {idx > 1 && `(${weekday})`}
                  </div>
                </div>

                <div
                  className={`p-2 rounded-xl flex items-center justify-center transition ${
                    isSelected ? "bg-cyan-900/80 shadow-inner" : "bg-slate-900 group-hover:scale-105"
                  }`}
                  title={dailyDisplay.condition}
                >
                  {renderWeatherIcon(dailyDisplay.iconType, "w-5 h-5")}
                </div>

                <div
                  className={`text-[11px] font-medium line-clamp-1 ${
                    isSelected ? "text-cyan-100" : "text-slate-300"
                  }`}
                >
                  {dailyDisplay.condition}
                </div>

                <div className="flex items-center gap-2 font-mono">
                  <span className="text-sm font-bold text-white">
                    {formatTempShort(maxT, tempUnit)}
                  </span>
                  <span className="text-xs text-slate-400">
                    {formatTempShort(minT, tempUnit)}
                  </span>
                </div>

                <div className="text-[11px] text-slate-400 font-mono">
                  {rainSum > 0 ? (
                    <span className="text-blue-400 font-semibold">{formatPrecip(rainSum, tempUnit)}</span>
                  ) : (
                    <span className="text-slate-400">{tempUnit === "F" ? "0.00 in" : "0.0 mm"}</span>
                  )}
                </div>

                {/* Bottom Toggle Pill */}
                <div className="pt-1 w-full border-t border-slate-800/60 flex items-center justify-center">
                  {isSelected ? (
                    <span className="text-[10px] font-bold text-cyan-300 flex items-center gap-0.5">
                      <ChevronUp className="w-3 h-3" /> Hide Hourly
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400 group-hover:text-cyan-300 flex items-center gap-0.5 transition">
                      <ChevronDown className="w-3 h-3" /> Hourly
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected Day 24-Hour Synoptic Hourly Prediction Breakdown */}
        {selectedDayDetails && (
          <div className="mt-4 p-5 sm:p-6 rounded-3xl bg-slate-950/90 border-2 border-cyan-500/40 shadow-2xl space-y-5 animate-in fade-in slide-in-from-top-2 duration-300">
            {/* Header: Selected Day Meta & Controls */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
              <div className="space-y-1">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full bg-cyan-950 border border-cyan-500/50 text-cyan-300 text-xs font-bold font-mono uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    {selectedDayDetails.dateFormatted.fullDate}
                  </span>
                  <span className="text-sm font-semibold text-slate-200">
                    24-Hour Synoptic Breakdown
                  </span>
                  <span className="px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 flex items-center gap-1">
                    {renderWeatherIcon(selectedDayDetails.dailyDisplay.iconType, "w-3.5 h-3.5")}
                    {selectedDayDetails.dailyDisplay.condition}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-400 font-mono flex-wrap pt-1">
                  <span>
                    High: <strong className="text-white">{formatTemp(selectedDayDetails.maxT, tempUnit)}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Low: <strong className="text-slate-300">{formatTemp(selectedDayDetails.minT, tempUnit)}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Rain Total: <strong className="text-blue-300">{formatPrecip(selectedDayDetails.rainSum, tempUnit)}</strong>
                  </span>
                  {selectedDayDetails.sunriseFormatted !== "--:--" && (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-1 text-amber-300">
                        <Sunrise className="w-3 h-3" /> {selectedDayDetails.sunriseFormatted}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1 text-orange-400">
                        <Sunset className="w-3 h-3" /> {selectedDayDetails.sunsetFormatted}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Day Switcher Buttons & Close */}
              <div className="flex items-center gap-2 self-start md:self-center">
                <button
                  type="button"
                  disabled={selectedDayIdx <= 0}
                  onClick={() => setSelectedDayIdx((prev) => (prev !== null && prev > 0 ? prev - 1 : prev))}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 disabled:opacity-40 disabled:pointer-events-none text-xs font-semibold transition flex items-center gap-1"
                  title="View previous day's hourly forecast"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Prev Day</span>
                </button>

                <button
                  type="button"
                  disabled={selectedDayIdx >= daily.date.length - 1}
                  onClick={() =>
                    setSelectedDayIdx((prev) =>
                      prev !== null && prev < daily.date.length - 1 ? prev + 1 : prev
                    )
                  }
                  className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 disabled:opacity-40 disabled:pointer-events-none text-xs font-semibold transition flex items-center gap-1"
                  title="View next day's hourly forecast"
                >
                  <span>Next Day</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedDayIdx(null)}
                  className="p-1.5 rounded-xl bg-slate-900 hover:bg-rose-950 text-slate-400 hover:text-rose-300 border border-slate-800 transition"
                  title="Close hourly breakdown"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Key Microclimate Insights for the Selected Day */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800/80 space-y-1">
                <div className="text-[10px] uppercase font-bold text-amber-400 tracking-wider flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Thermal Peak
                </div>
                <div className="text-sm font-bold text-white font-mono">
                  {formatTemp(selectedDayDetails.peakTempHour.temp, tempUnit)}
                </div>
                <div className="text-[11px] text-slate-400 font-mono">
                  at {selectedDayDetails.peakTempHour.hourFormatted}
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800/80 space-y-1">
                <div className="text-[10px] uppercase font-bold text-cyan-400 tracking-wider flex items-center gap-1">
                  <TrendingDown className="w-3 h-3" /> Thermal Min
                </div>
                <div className="text-sm font-bold text-white font-mono">
                  {formatTemp(selectedDayDetails.minTempHour.temp, tempUnit)}
                </div>
                <div className="text-[11px] text-slate-400 font-mono">
                  at {selectedDayDetails.minTempHour.hourFormatted}
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800/80 space-y-1">
                <div className="text-[10px] uppercase font-bold text-blue-400 tracking-wider flex items-center gap-1">
                  <Droplets className="w-3 h-3" /> Max Precip Risk
                </div>
                <div className="text-sm font-bold text-blue-300 font-mono">
                  {selectedDayDetails.maxPrecipHour.precipProb}%
                </div>
                <div className="text-[11px] text-slate-400 font-mono">
                  {selectedDayDetails.maxPrecipHour.precipProb > 10
                    ? `at ${selectedDayDetails.maxPrecipHour.hourFormatted}`
                    : "Low rain probability"}
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800/80 space-y-1">
                <div className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider flex items-center gap-1">
                  <Wind className="w-3 h-3" /> Peak Wind Speed
                </div>
                <div className="text-sm font-bold text-emerald-300 font-mono">
                  {formatWind(selectedDayDetails.maxWindHour.wind, tempUnit)}
                </div>
                <div className="text-[11px] text-slate-400 font-mono">
                  at {selectedDayDetails.maxWindHour.hourFormatted}
                </div>
              </div>
            </div>

            {/* 24-Hour Horizontal Scrollable Carousel */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                <span className="font-semibold text-slate-300">Hourly Atmospheric Progression (24h)</span>
                <span className="font-mono text-[11px]">Scroll horizontally →</span>
              </div>

              <div className="flex items-center gap-3 overflow-x-auto pb-3 pt-1 no-scrollbar">
                {selectedDayDetails.hours.map((hourData, hIdx) => {
                  return (
                    <div
                      key={hourData.timeStr}
                      className="flex-shrink-0 w-28 p-3 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-cyan-500/60 hover:bg-slate-900 transition flex flex-col items-center text-center space-y-2 group shadow-sm"
                      title={`${hourData.displayInfo.condition} (${hourData.hourFormatted}) • Humidity: ${hourData.hum}% • Cloud Cover: ${hourData.cloud ?? 20}% • Rain: ${formatPrecip(hourData.rainMm, tempUnit)}`}
                    >
                      <span className="text-xs font-semibold text-slate-300 font-mono">
                        {hourData.hourFormatted}
                      </span>

                      <div className="w-8 h-8 rounded-full bg-slate-950 flex items-center justify-center group-hover:scale-110 transition shadow-inner">
                        {renderWeatherIcon(hourData.displayInfo.iconType, "w-4 h-4")}
                      </div>

                      <div className="text-[10px] font-medium text-slate-300 leading-tight h-6 flex items-center justify-center line-clamp-2 px-0.5">
                        {hourData.displayInfo.condition}
                      </div>

                      <div className="text-sm font-bold text-white font-mono">
                        {formatTempShort(hourData.temp, tempUnit)}
                      </div>

                      <div className="w-full pt-1.5 border-t border-slate-800 space-y-1">
                        <div className="flex items-center justify-center gap-1 text-[11px] font-mono text-blue-400 font-semibold">
                          <Droplets className="w-2.5 h-2.5" />
                          <span>{hourData.precipProb}%</span>
                        </div>
                        <div className="flex items-center justify-center gap-1 text-[10px] text-slate-300 font-mono">
                          <Navigation
                            className="w-2.5 h-2.5 text-cyan-400 transform flex-shrink-0"
                            style={{ transform: `rotate(${hourData.windDir}deg)` }}
                          />
                          <span className="font-semibold text-cyan-200">{hourData.windCompass}</span>
                          <span>{formatWind(hourData.wind, tempUnit)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 1. FULLSCREEN AIR QUALITY OBSERVATORY MODAL */}
      {/* ========================================================================= */}
      {activeModal === "aqi" && forecast.airQuality && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-2xl animate-natural-backdrop"
          onClick={() => setActiveModal(null)}
        >
          <div
            className="w-full max-w-5xl max-h-[92vh] bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border border-slate-700/80 rounded-3xl shadow-2xl ring-1 ring-cyan-500/30 shadow-cyan-950/50 p-6 sm:p-8 overflow-y-auto space-y-6 text-slate-200 my-auto animate-natural-modal"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 animate-in fade-in slide-in-from-top-1 duration-300">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  <Activity className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                    Atmospheric Chemistry & Air Quality Observatory
                  </h2>
                  <p className="text-xs text-slate-400">
                    {coordinates.locationName || coordinates.town || "Target Coordinates"} • Local Time: {localTimeInfo?.timeStr || "Now"} • Elevation: {formatElevation(mlBreakdown.actualElevation, tempUnit)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="p-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition"
                title="Close modal (or press ESC)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Top Score Banner */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-1">
                <div className="text-xs text-slate-400 font-medium">Current Air Quality</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black font-mono text-white">
                    {forecast.airQuality.usAqi}
                  </span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                    forecast.airQuality.aqiCategory === "Good"
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                      : forecast.airQuality.aqiCategory === "Moderate"
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                      : forecast.airQuality.aqiCategory === "Sensitive"
                      ? "bg-orange-500/20 text-orange-300 border-orange-500/40"
                      : "bg-rose-500/20 text-rose-300 border-rose-500/40"
                  }`}>
                    {forecast.airQuality.aqiCategory}
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-1">
                <div className="text-xs text-slate-400 font-medium">Dominant Pollutant</div>
                <div className="text-lg font-bold text-cyan-300 font-mono">
                  {forecast.airQuality.dominantPollutant}
                </div>
                <div className="text-[11px] text-slate-400">Primary driver of current AQI score</div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-1">
                <div className="text-xs text-slate-400 font-medium">24-Hour Forecast Peak</div>
                <div className="text-lg font-bold text-rose-400 font-mono">
                  {Math.max(...(forecast.airQuality.hourlyAqi || [forecast.airQuality.usAqi]))} AQI
                </div>
                <div className="text-[11px] text-slate-400">Maximum expected concentration</div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-1">
                <div className="text-xs text-slate-400 font-medium">Inversion Risk</div>
                <div className={`text-base font-bold ${forecast.airQuality.inversionTrappingRisk ? "text-amber-400" : "text-emerald-400"}`}>
                  {forecast.airQuality.inversionTrappingRisk ? "Active Trapping Risk" : "Normal Vertical Mixing"}
                </div>
                <div className="text-[11px] text-slate-400">Boundary Layer: {formatElevation(current.pblHeightM, tempUnit)}</div>
              </div>
            </div>

            {/* High-Resolution 24-Hour Spline Chart */}
            {forecast.airQuality.hourlyAqi && forecast.airQuality.hourlyAqi.length > 0 && (() => {
              const aqList = forecast.airQuality.hourlyAqi.slice(0, 24);
              const minAq = Math.min(...aqList, 20);
              const maxAq = Math.max(...aqList, 150);
              const range = Math.max(40, maxAq - minAq);

              const svgW = 800;
              const svgH = 140;
              const padL = 30;
              const padR = 30;
              const padT = 20;
              const padB = 25;
              const plotW = svgW - padL - padR;
              const plotH = svgH - padT - padB;

              const getCategory = (v: number) => {
                if (v <= 50) return { label: "Good", hex: "#10b981", color: "text-emerald-400", bg: "bg-emerald-950/60" };
                if (v <= 100) return { label: "Moderate", hex: "#eab308", color: "text-amber-400", bg: "bg-amber-950/60" };
                if (v <= 150) return { label: "Sensitive", hex: "#f97316", color: "text-orange-400", bg: "bg-orange-950/60" };
                if (v <= 200) return { label: "Unhealthy", hex: "#f43f5e", color: "text-rose-400", bg: "bg-rose-950/60" };
                return { label: "Very Unhealthy", hex: "#a855f7", color: "text-purple-400", bg: "bg-purple-950/60" };
              };

              const points = aqList.map((val, i) => {
                const x = padL + (i / Math.max(1, aqList.length - 1)) * plotW;
                const y = padT + (1 - (val - minAq) / range) * plotH;
                const cat = getCategory(val);
                return { x, y, val, i, cat };
              });

              let pathD = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
              for (let i = 0; i < points.length - 1; i++) {
                const p0 = points[i];
                const p1 = points[i + 1];
                const dx = (p1.x - p0.x) / 2;
                pathD += ` C ${(p0.x + dx).toFixed(1)} ${p0.y.toFixed(1)}, ${(p1.x - dx).toFixed(1)} ${p1.y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
              }

              const bottomY = padT + plotH;
              const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${bottomY} L ${points[0].x.toFixed(1)} ${bottomY} Z`;

              const getYForAqi = (threshold: number) => {
                if (threshold < minAq || threshold > maxAq) return null;
                return padT + (1 - (threshold - minAq) / range) * plotH;
              };

              const y50 = getYForAqi(50);
              const y100 = getYForAqi(100);
              const y150 = getYForAqi(150);

              const activeIdx = hoveredAqiIdx ?? 0;
              const activePoint = points[activeIdx] || points[0];

              return (
                <div className="p-5 rounded-3xl bg-slate-950/80 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span className="font-semibold flex items-center gap-1.5 text-cyan-300">
                      <Activity className="w-4 h-4" /> Expanded 24-Hour Atmospheric Chemistry Timeline
                    </span>
                    <span className="text-xs font-mono font-bold text-white px-2.5 py-0.5 rounded-full bg-slate-900 border border-slate-700">
                      Hover to inspect any hour
                    </span>
                  </div>

                  <div
                    className="relative w-full cursor-crosshair select-none"
                    onMouseLeave={() => setHoveredAqiIdx(null)}
                  >
                    <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-36 overflow-visible">
                      <defs>
                        <linearGradient id="modalAqiAreaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor={activePoint.cat.hex} stopOpacity="0.30" />
                          <stop offset="100%" stopColor={activePoint.cat.hex} stopOpacity="0.0" />
                        </linearGradient>

                        <linearGradient id="modalAqiLineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                          {points.map((pt, i) => {
                            const pct = (i / Math.max(1, points.length - 1)) * 100;
                            return (
                              <stop key={i} offset={`${pct.toFixed(1)}%`} stopColor={pt.cat.hex} />
                            );
                          })}
                        </linearGradient>
                      </defs>

                      {y50 !== null && (
                        <g opacity="0.35">
                          <line x1={padL} y1={y50} x2={svgW - padR} y2={y50} stroke="#10b981" strokeDasharray="3 3" strokeWidth="1" />
                          <text x={svgW - padR + 4} y={y50 + 3} fill="#10b981" fontSize="9" fontFamily="monospace">50 (Good)</text>
                        </g>
                      )}
                      {y100 !== null && (
                        <g opacity="0.35">
                          <line x1={padL} y1={y100} x2={svgW - padR} y2={y100} stroke="#eab308" strokeDasharray="3 3" strokeWidth="1" />
                          <text x={svgW - padR + 4} y={y100 + 3} fill="#eab308" fontSize="9" fontFamily="monospace">100 (Mod)</text>
                        </g>
                      )}
                      {y150 !== null && (
                        <g opacity="0.35">
                          <line x1={padL} y1={y150} x2={svgW - padR} y2={y150} stroke="#f43f5e" strokeDasharray="3 3" strokeWidth="1" />
                          <text x={svgW - padR + 4} y={y150 + 3} fill="#f43f5e" fontSize="9" fontFamily="monospace">150 (Unhealthy)</text>
                        </g>
                      )}

                      <path d={areaD} fill="url(#modalAqiAreaGrad)" />
                      <path d={pathD} fill="none" stroke="url(#modalAqiLineGrad)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

                      {hoveredAqiIdx !== null && (
                        <g>
                          <line x1={activePoint.x} y1={padT} x2={activePoint.x} y2={bottomY} stroke={activePoint.cat.hex} strokeWidth="1.5" strokeDasharray="3 3" />
                          <circle cx={activePoint.x} cy={activePoint.y} r="6" fill={activePoint.cat.hex} stroke="#020617" strokeWidth="2" />
                          <circle cx={activePoint.x} cy={activePoint.y} r="10" fill="none" stroke={activePoint.cat.hex} strokeWidth="1.5" opacity="0.4" />
                        </g>
                      )}

                      {points.map((pt, i) => {
                        const colW = plotW / Math.max(1, points.length - 1);
                        const startX = pt.x - colW / 2;
                        return (
                          <rect
                            key={i}
                            x={Math.max(0, startX)}
                            y={0}
                            width={colW}
                            height={svgH}
                            fill="transparent"
                            onMouseEnter={() => setHoveredAqiIdx(i)}
                            onTouchStart={() => setHoveredAqiIdx(i)}
                          />
                        );
                      })}
                    </svg>

                    <div className="flex justify-between px-3 pt-1 text-[10px] text-slate-400 font-mono">
                      {points.map((pt, idx) => {
                        if (idx % 3 !== 0 && idx !== points.length - 1) return null;
                        const tLabel = forecast.airQuality?.hourlyTimes?.[idx]
                          ? (() => {
                              try {
                                return new Date(forecast.airQuality.hourlyTimes[idx])
                                  .toLocaleTimeString("en-US", {
                                    timeZone: coordinates.timezone || "UTC",
                                    hour: "numeric",
                                    hour12: true,
                                  })
                                  .replace(":00", "")
                                  .toLowerCase();
                              } catch {
                                return `${idx}h`;
                              }
                            })()
                          : `${idx}h`;

                        return (
                          <span
                            key={idx}
                            className={`${hoveredAqiIdx === idx ? "text-cyan-300 font-bold" : "text-slate-500"}`}
                          >
                            {idx === 0 ? "Now" : tLabel}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* 6-Pollutant Chemistry Lab Grid */}
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-emerald-400" /> Granular Pollutant Concentrations & WHO Thresholds
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {/* PM2.5 */}
                <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm">PM2.5 (Fine Particles)</span>
                    <span className="text-xs font-mono font-bold text-cyan-300">{forecast.airQuality.pm25} µg/m³</span>
                  </div>
                  <p className="text-xs text-slate-400">Microscopic particles &le; 2.5 µm that penetrate deep into the alveolar sacs. WHO 24h Guide: 15 µg/m³.</p>
                  <div className="text-[11px] text-slate-500 font-mono">Sources: Vehicle exhaust, wildfire smoke, industrial burning.</div>
                </div>

                {/* PM10 */}
                <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm">PM10 (Coarse Dust)</span>
                    <span className="text-xs font-mono font-bold text-cyan-300">{forecast.airQuality.pm10} µg/m³</span>
                  </div>
                  <p className="text-xs text-slate-400">Inhalable dust, pollen, and mechanical particulates &le; 10 µm. WHO 24h Guide: 45 µg/m³.</p>
                  <div className="text-[11px] text-slate-500 font-mono">Sources: Road dust, construction, soil erosion, agriculture.</div>
                </div>

                {/* Ozone */}
                <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm">Ground-Level Ozone (O₃)</span>
                    <span className="text-xs font-mono font-bold text-cyan-300">{forecast.airQuality.ozone} µg/m³</span>
                  </div>
                  <p className="text-xs text-slate-400">Secondary photochemical pollutant formed when NOx reacts with volatile organics under strong sunlight.</p>
                  <div className="text-[11px] text-slate-500 font-mono">Sources: Solar irradiation of urban traffic emissions.</div>
                </div>

                {/* NO2 */}
                <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm">Nitrogen Dioxide (NO₂)</span>
                    <span className="text-xs font-mono font-bold text-cyan-300">{forecast.airQuality.nitrogenDioxide} µg/m³</span>
                  </div>
                  <p className="text-xs text-slate-400">High-temperature combustion gas causing airway hyper-reactivity. WHO 24h Guide: 25 µg/m³.</p>
                  <div className="text-[11px] text-slate-500 font-mono">Sources: Diesel and gasoline engine combustion.</div>
                </div>

                {/* SO2 */}
                <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm">Sulphur Dioxide (SO₂)</span>
                    <span className="text-xs font-mono font-bold text-cyan-300">{forecast.airQuality.sulphurDioxide} µg/m³</span>
                  </div>
                  <p className="text-xs text-slate-400">Acidic gas from fossil fuel containing sulphur. WHO 24h Guide: 40 µg/m³.</p>
                  <div className="text-[11px] text-slate-500 font-mono">Sources: Coal-fired power plants, metal smelting.</div>
                </div>

                {/* Boundary Layer Trap */}
                <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm">Mixing Layer Dynamics</span>
                    <span className="text-xs font-mono font-bold text-cyan-300">{formatElevation(current.pblHeightM, tempUnit)}</span>
                  </div>
                  <p className="text-xs text-slate-400">Planetary boundary layer height governs dilution volume for all surface pollutants.</p>
                  <div className="text-[11px] text-slate-500 font-mono">Status: {forecast.airQuality.inversionTrappingRisk ? "Compressed / Low Dispersion" : "Adequate Dilution"}</div>
                </div>
              </div>
            </div>

            {/* Health & Action Advice */}
            <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-2">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <HeartPulse className="w-4 h-4 text-rose-400" /> Official Health Recommendation & Activity Protocol
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                {forecast.airQuality.healthRecommendation}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. FULLSCREEN SOLAR & LUNAR ASTRONOMY MODAL */}
      {/* ========================================================================= */}
      {activeModal === "astronomy" && forecast.astronomy && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-2xl animate-natural-backdrop"
          onClick={() => setActiveModal(null)}
        >
          <div
            className="w-full max-w-5xl max-h-[92vh] bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border border-slate-700/80 rounded-3xl shadow-2xl ring-1 ring-amber-500/30 shadow-amber-950/50 p-6 sm:p-8 overflow-y-auto space-y-6 text-slate-200 my-auto animate-natural-modal"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 animate-in fade-in slide-in-from-top-1 duration-300">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  <Sun className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                    Solar & Lunar Celestial Ephemeris
                  </h2>
                  <p className="text-xs text-slate-400">
                    {coordinates.locationName || coordinates.town || "Target Coordinates"} ({coordinates.latitude.toFixed(4)}°, {coordinates.longitude.toFixed(4)}°) • {forecast.astronomy.daylightDurationHours} Hours of Total Sunlight
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="p-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition"
                title="Close modal (or press ESC)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Solar Trajectory Grid */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Sunrise className="w-4 h-4 text-amber-400" /> Complete Solar Arc & Twilight Timeline
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-1">
                  <div className="text-[10px] text-amber-400 font-bold uppercase tracking-wider flex items-center gap-1">
                    <Sunrise className="w-3.5 h-3.5" /> Sunrise
                  </div>
                  <div className="text-lg font-bold text-white font-mono">
                    {forecast.astronomy.sunrise}
                  </div>
                  <div className="text-[11px] text-slate-400">Solar disk crosses horizon</div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-1">
                  <div className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider flex items-center gap-1">
                    <Sun className="w-3.5 h-3.5" /> Solar Noon
                  </div>
                  <div className="text-lg font-bold text-white font-mono">
                    {forecast.astronomy.solarNoon}
                  </div>
                  <div className="text-[11px] text-slate-400">Zenith: {mlBreakdown.solarZenithAngle}° • {current.solarRadiationWm2} W/m²</div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-1">
                  <div className="text-[10px] text-orange-400 font-bold uppercase tracking-wider flex items-center gap-1">
                    <Sunset className="w-3.5 h-3.5" /> Sunset
                  </div>
                  <div className="text-lg font-bold text-white font-mono">
                    {forecast.astronomy.sunset}
                  </div>
                  <div className="text-[11px] text-slate-400">Solar disk sets below horizon</div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-1">
                  <div className="text-[10px] text-purple-400 font-bold uppercase tracking-wider flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> Total Sunlight
                  </div>
                  <div className="text-lg font-bold text-white font-mono">
                    {forecast.astronomy.daylightDurationHours} hrs
                  </div>
                  <div className="text-[11px] text-slate-400">Calculated day length</div>
                </div>
              </div>
            </div>

            {/* Photography & Twilight Windows */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-5 rounded-2xl bg-amber-950/20 border border-amber-500/30 space-y-2">
                <div className="text-sm font-bold text-amber-300 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" /> Golden Hour Photography Windows
                </div>
                <p className="text-xs text-slate-300">
                  Ideal sun angle (&lt; 6°) casting long dramatic shadows and soft warm diffuse lighting.
                </p>
                <div className="text-xs font-mono text-amber-200 space-y-1 pt-1 border-t border-amber-500/20">
                  <div>🌅 Morning Golden Hour: <strong>{forecast.astronomy.goldenHourMorning}</strong></div>
                  <div>🌇 Evening Golden Hour: <strong>{forecast.astronomy.goldenHourEvening}</strong></div>
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-indigo-950/20 border border-indigo-500/30 space-y-2">
                <div className="text-sm font-bold text-indigo-300 flex items-center gap-2">
                  <Moon className="w-4 h-4 text-indigo-400" /> Blue Hour Twilight Windows
                </div>
                <p className="text-xs text-slate-300">
                  Sun is between 4° and 8° below the horizon. Atmospheric Chappuis ozone absorption produces intense deep blue sky hues.
                </p>
                <div className="text-xs font-mono text-indigo-200 space-y-1 pt-1 border-t border-indigo-500/20">
                  <div>🌌 Dawn Twilight: <strong>{forecast.astronomy.blueHourMorning}</strong></div>
                  <div>🌆 Dusk Twilight: <strong>{forecast.astronomy.blueHourEvening}</strong></div>
                </div>
              </div>
            </div>

            {/* Lunar Phase & Astrophotography Analytics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Moon Details */}
              <div className="p-5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{forecast.astronomy.moonPhaseIcon}</span>
                    <div>
                      <h4 className="text-sm font-bold text-white">{forecast.astronomy.moonPhase}</h4>
                      <p className="text-[11px] text-slate-400">Synodic Lunar Cycle</p>
                    </div>
                  </div>
                  <span className="text-base font-black font-mono text-indigo-300">
                    {forecast.astronomy.moonIlluminationPercent}% Lit
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                    <span>Moon Age: {forecast.astronomy.moonAgeDays} days</span>
                    <span>Cycle: 29.53 days</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 rounded-full"
                      style={{ width: `${Math.min(100, (forecast.astronomy.moonAgeDays / 29.53) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Stargazing & Astrophotography Score */}
              <div className="p-5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Telescope className="w-5 h-5 text-purple-400" />
                    <div>
                      <h4 className="text-sm font-bold text-white">Stargazing & Telescope Index</h4>
                      <p className="text-[11px] text-slate-400">Sky Transparency & Dark Sky Rating</p>
                    </div>
                  </div>

                  <span className={`text-base font-black font-mono ${
                    current.cloudCoverPercent < 20 ? "text-emerald-300" : "text-amber-300"
                  }`}>
                    {Math.max(10, Math.round(100 - (current.cloudCoverPercent * 0.7 + forecast.astronomy.moonIlluminationPercent * 0.3)))} / 100
                  </span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  {current.cloudCoverPercent < 20
                    ? `Excellent atmospheric clarity with ${current.cloudCoverPercent}% cloud cover. Minimal tropospheric moisture interference.`
                    : `Moderate sky obstruction with ${current.cloudCoverPercent}% cloud cover. Moon illumination at ${forecast.astronomy.moonIlluminationPercent}%.`}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
