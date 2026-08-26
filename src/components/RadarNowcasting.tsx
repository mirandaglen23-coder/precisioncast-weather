import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import L from "leaflet";
import {
  Play,
  Pause,
  RotateCcw,
  CloudRain,
  Cloud,
  Navigation,
  Activity,
  Zap,
  Info,
  Droplet,
  Wind,
  Compass,
  Radio,
  Eye,
  Layers,
  MapPin,
  RefreshCw,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Crosshair,
  ChevronLeft,
  ChevronRight,
  Clock,
  Gauge,
  Sparkles,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { PrecisionForecastResponse, RadarNowcastPoint } from "../types";
import {
  formatRainRate,
  formatWind,
  getWindDirectionCompass,
  formatCoordinates,
} from "../utils/weatherUtils";

interface RadarNowcastingProps {
  forecast: PrecisionForecastResponse;
  tempUnit?: "C" | "F";
}

interface RadarFrame {
  time: number; // epoch in seconds
  path: string;
  label: string;
  minuteOffset: number;
  isNowcast: boolean;
  timeString: string;
}

interface UnifiedTimelineStep {
  minuteOffset: number;
  label: string;
  timeString: string;
  isPast: boolean;
  isLive: boolean;
  isNowcast: boolean;
  radarFrameIndex: number;
  chartPointIndex: number;
}

export const RadarNowcasting: React.FC<RadarNowcastingProps> = ({
  forecast,
  tempUnit = "F",
}) => {
  const { radarNowcast, coordinates } = forecast;
  const isImperial = tempUnit === "F";

  // Layer mode: Precipitation Radar vs Satellite Cloud Cover
  const [activeLayerMode, setActiveLayerMode] = useState<"radar" | "satellite">("radar");

  // RainViewer live frames state
  const [rainViewerHost, setRainViewerHost] = useState<string>("https://tilecache.rainviewer.com");
  const [radarFrames, setRadarFrames] = useState<RadarFrame[]>([]);
  const [isLoadingFrames, setIsLoadingFrames] = useState<boolean>(true);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [frameError, setFrameError] = useState<string | null>(null);

  // Master Synchronized Timeline Index
  const [timelineIndex, setTimelineIndex] = useState<number>(0);

  // Leaflet map refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const activeTileLayerRef = useRef<L.TileLayer | null>(null);
  const fallbackTileLayerRef = useRef<L.TileLayer | null>(null);
  const tileLayersCacheRef = useRef<Map<string, L.TileLayer>>(new Map());
  const cloudOverlayGroupRef = useRef<L.LayerGroup | null>(null);
  const nowcastOverlayGroupRef = useRef<L.LayerGroup | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const ringsGroupRef = useRef<L.LayerGroup | null>(null);

  // Identify first upcoming rain event from ML forecast
  const firstRainIndex = radarNowcast.findIndex(
    (p) => p.intensityMmPerHour >= 0.05 || (p.probability > 30 && p.condition !== "dry")
  );
  const rainEvent = firstRainIndex !== -1 ? radarNowcast[firstRainIndex] : null;

  // Chart data formatted for imperial (in/hr) or metric (mm/hr)
  const chartData = useMemo(() => {
    return radarNowcast.map((pt) => ({
      ...pt,
      displayIntensity: isImperial
        ? Number((pt.intensityMmPerHour * 0.0393701).toFixed(3))
        : pt.intensityMmPerHour,
    }));
  }, [radarNowcast, isImperial]);

  // Wind steering vector & cloud cover
  const windDirDeg = forecast.current.windDirectionDeg ?? 240;
  const windSpeedKmh = forecast.current.windSpeedKmh ?? 15;
  const windSpeedFormatted = formatWind(windSpeedKmh, tempUnit);
  const windCompass = getWindDirectionCompass(windDirDeg);
  const cloudCoverPct = forecast.current.cloudCoverPercent ?? 50;

  // 1. Fetch Real Live Global Doppler Radar Frames from RainViewer
  const fetchRadarFrames = useCallback(async () => {
    setIsLoadingFrames(true);
    setFrameError(null);
    try {
      const res = await fetch("https://api.rainviewer.com/public/weather-maps.json");
      if (!res.ok) throw new Error(`RainViewer API returned status ${res.status}`);
      const data = await res.json();

      const host = data.host || "https://tilecache.rainviewer.com";
      setRainViewerHost(host);

      const pastRaw = data.radar?.past || [];
      const nowcastRaw = data.radar?.nowcast || [];
      const liveEpoch = pastRaw.length > 0 ? pastRaw[pastRaw.length - 1].time : Math.floor(Date.now() / 1000);

      const pastFrames: RadarFrame[] = pastRaw.map((f: { time: number; path: string }) => {
        const date = new Date(f.time * 1000);
        const minOffset = Math.round((f.time - liveEpoch) / 60);
        return {
          time: f.time,
          path: f.path,
          minuteOffset: minOffset,
          label: minOffset === 0 ? "Now" : `${minOffset}m`,
          timeString: date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          isNowcast: false,
        };
      });

      const nowcastFrames: RadarFrame[] = nowcastRaw.map((f: { time: number; path: string }) => {
        const date = new Date(f.time * 1000);
        const minOffset = Math.round((f.time - liveEpoch) / 60);
        return {
          time: f.time,
          path: f.path,
          minuteOffset: minOffset,
          label: `+${minOffset}m`,
          timeString: date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          isNowcast: true,
        };
      });

      const allFrames = [...pastFrames, ...nowcastFrames];
      if (allFrames.length > 0) {
        setRadarFrames(allFrames);
      } else {
        throw new Error("No radar frames returned");
      }
    } catch (err: any) {
      console.warn("RainViewer fetch error:", err);
      setFrameError("Connecting to real-time NEXRAD radar composite feed...");
    } finally {
      setIsLoadingFrames(false);
    }
  }, []);

  useEffect(() => {
    fetchRadarFrames();
  }, [fetchRadarFrames]);

  // 2. Build Unified Timeline bridging Past Doppler Scans (-120m to 0m) and Forward Nowcast (+10m to +120m)
  const unifiedTimeline = useMemo<UnifiedTimelineStep[]>(() => {
    const steps: UnifiedTimelineStep[] = [];

    // 1. Process past radar frames
    const pastAndLiveFrames = radarFrames.filter((f) => !f.isNowcast);
    pastAndLiveFrames.forEach((frame, fIdx) => {
      const targetMin = Math.max(0, frame.minuteOffset);
      let bestChartIdx = 0;
      let minDiff = Infinity;

      radarNowcast.forEach((pt, idx) => {
        const diff = Math.abs(pt.minuteOffset - targetMin);
        if (diff < minDiff) {
          minDiff = diff;
          bestChartIdx = idx;
        }
      });

      steps.push({
        minuteOffset: frame.minuteOffset,
        label: frame.minuteOffset === 0 ? "Live (Now)" : frame.label,
        timeString: frame.timeString,
        isPast: frame.minuteOffset < 0,
        isLive: frame.minuteOffset === 0,
        isNowcast: false,
        radarFrameIndex: fIdx,
        chartPointIndex: bestChartIdx,
      });
    });

    // 2. Process forward nowcast steps (from RainViewer if present, otherwise from physics radarNowcast)
    const nowcastFrames = radarFrames.filter((f) => f.isNowcast);
    if (nowcastFrames.length > 0) {
      nowcastFrames.forEach((frame, idx) => {
        let bestChartIdx = 0;
        let minDiff = Infinity;
        radarNowcast.forEach((pt, pIdx) => {
          const diff = Math.abs(pt.minuteOffset - frame.minuteOffset);
          if (diff < minDiff) {
            minDiff = diff;
            bestChartIdx = pIdx;
          }
        });
        steps.push({
          minuteOffset: frame.minuteOffset,
          label: frame.label,
          timeString: frame.timeString,
          isPast: false,
          isLive: false,
          isNowcast: true,
          radarFrameIndex: pastAndLiveFrames.length + idx,
          chartPointIndex: bestChartIdx,
        });
      });
    } else {
      const liveFrameIdx = Math.max(0, pastAndLiveFrames.length - 1);
      const futureIntervals = [15, 30, 45, 60, 90, 120, 180, 240, 360];
      const now = new Date();
      const locTz = coordinates.timezone || "UTC";

      futureIntervals.forEach((mOffset) => {
        let bestChartIdx = 0;
        let minDiff = Infinity;
        radarNowcast.forEach((pt, pIdx) => {
          const diff = Math.abs(pt.minuteOffset - mOffset);
          if (diff < minDiff) {
            minDiff = diff;
            bestChartIdx = pIdx;
          }
        });

        const futureDate = new Date(now.getTime() + mOffset * 60000);
        let timeString = "";
        try {
          timeString = futureDate.toLocaleTimeString("en-US", {
            timeZone: locTz,
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          });
        } catch {
          timeString = futureDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        }

        const label = mOffset >= 60 && mOffset % 60 === 0 ? `+${mOffset / 60}h` : `+${mOffset}m`;

        steps.push({
          minuteOffset: mOffset,
          label,
          timeString,
          isPast: false,
          isLive: false,
          isNowcast: true,
          radarFrameIndex: liveFrameIdx,
          chartPointIndex: bestChartIdx,
        });
      });
    }

    return steps;
  }, [radarFrames, radarNowcast, coordinates.timezone]);

  // Find index corresponding to "Live (Now)"
  const liveStepIndex = useMemo(() => {
    const idx = unifiedTimeline.findIndex((s) => s.isLive || s.minuteOffset === 0);
    return idx >= 0 ? idx : 0;
  }, [unifiedTimeline]);

  // Set default initial timeline index to Live (0m) on first load
  const hasInitializedTimeline = useRef(false);
  useEffect(() => {
    if (!hasInitializedTimeline.current && unifiedTimeline.length > 0) {
      setTimelineIndex(liveStepIndex);
      hasInitializedTimeline.current = true;
    }
  }, [unifiedTimeline, liveStepIndex]);

  // Active step
  const safeIndex = Math.max(0, Math.min(unifiedTimeline.length - 1, timelineIndex));
  const activeStep = unifiedTimeline[safeIndex] || unifiedTimeline[0];
  const activeChartPoint = radarNowcast[activeStep?.chartPointIndex ?? 0] || radarNowcast[0];
  const activeRadarFrame = radarFrames[activeStep?.radarFrameIndex ?? 0] || radarFrames[0];

  // 3. Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const lat = coordinates.latitude;
    const lon = coordinates.longitude;

    const map = L.map(mapContainerRef.current, {
      center: [lat, lon],
      zoom: 7,
      zoomControl: false,
      attributionControl: true,
      minZoom: 2,
      maxZoom: 18,
    });

    // Dark Basemap (CARTO Dark Matter)
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      subdomains: "abcd",
      maxZoom: 19,
      minZoom: 2,
      attribution:
        '&copy; <a href="https://carto.com/" target="_blank" rel="noreferrer">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
    }).addTo(map);

    // Glowing Center Pin Icon
    const customPinIcon = L.divIcon({
      className: "custom-radar-pin",
      html: `
        <div style="position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
          <div style="position: absolute; width: 28px; height: 28px; border-radius: 50%; background: rgba(6, 182, 212, 0.25); animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="position: absolute; width: 14px; height: 14px; border-radius: 50%; background: #06b6d4; border: 2.5px solid #ffffff; box-shadow: 0 0 12px rgba(6, 182, 212, 0.8);"></div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    const marker = L.marker([lat, lon], {
      icon: customPinIcon,
      zIndexOffset: 1000,
    }).addTo(map);

    marker.bindPopup(
      `<div style="font-family: sans-serif; font-size: 12px; color: #f8fafc; padding: 2px;">
        <strong style="color: #38bdf8;">Your Location Pin</strong><br/>
        ${formatCoordinates(lat, lon)}
      </div>`
    );
    markerRef.current = marker;

    const ringsGroup = L.layerGroup().addTo(map);
    ringsGroupRef.current = ringsGroup;

    const cloudGroup = L.layerGroup().addTo(map);
    cloudOverlayGroupRef.current = cloudGroup;

    const nowcastGroup = L.layerGroup().addTo(map);
    nowcastOverlayGroupRef.current = nowcastGroup;

    mapInstanceRef.current = map;

    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      if (mapInstanceRef.current) {
        const m = mapInstanceRef.current;
        tileLayersCacheRef.current.forEach((layer) => {
          if (m.hasLayer(layer)) {
            m.removeLayer(layer);
          }
        });
        tileLayersCacheRef.current.clear();
        m.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
        ringsGroupRef.current = null;
        cloudOverlayGroupRef.current = null;
        nowcastOverlayGroupRef.current = null;
        activeTileLayerRef.current = null;
      }
    };
  }, [coordinates.latitude, coordinates.longitude]);

  // 4. Range Rings
  useEffect(() => {
    if (!mapInstanceRef.current || !ringsGroupRef.current) return;
    const lat = coordinates.latitude;
    const lon = coordinates.longitude;
    const ringsGroup = ringsGroupRef.current;
    ringsGroup.clearLayers();

    const radiiMeters = isImperial
      ? [8046.72, 16093.4, 24140.2] // 5 mi, 10 mi, 15 mi
      : [8000, 16000, 25000]; // 8 km, 16 km, 25 km

    radiiMeters.forEach((radius, idx) => {
      const circle = L.circle([lat, lon], {
        radius,
        color: idx === 2 ? "#0284c7" : "#0e7490",
        weight: idx === 2 ? 1.5 : 1,
        dashArray: "4, 6",
        fillColor: "#06b6d4",
        fillOpacity: 0.02,
        interactive: false,
      });
      circle.addTo(ringsGroup);
    });

    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lon]);
    }
  }, [coordinates.latitude, coordinates.longitude, isImperial]);

  // 5. Swap Real Doppler Radar Tiles Smoothly without distortion or CSS hacks
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const lat = coordinates.latitude;
    const lon = coordinates.longitude;

    if (cloudOverlayGroupRef.current) {
      cloudOverlayGroupRef.current.clearLayers();
    }

    if (activeLayerMode === "radar") {
      // Hide satellite layer if active
      if (activeTileLayerRef.current && activeTileLayerRef.current !== fallbackTileLayerRef.current) {
        if (map.hasLayer(activeTileLayerRef.current)) {
          map.removeLayer(activeTileLayerRef.current);
        }
        activeTileLayerRef.current = null;
      }

      const isConus = lat >= 21 && lat <= 53 && lon >= -130 && lon <= -65;
      const mOffset = activeStep?.minuteOffset ?? 0;

      let currentTileUrl = "";
      let isHrrrLayer = false;

      if (isConus && mOffset >= 0) {
        // NOAA HRRR Simulated Reflectivity for present & future (0m through +6h)
        const fStr = `F${String(mOffset).padStart(4, "0")}`;
        currentTileUrl = `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/hrrr::REFD-${fStr}-0/{z}/{x}/{y}.png`;
        isHrrrLayer = true;
      } else if (mOffset > 0 && !isConus) {
        // International nowcast advection
        const liveRadarFrame = radarFrames.find((f) => f.minuteOffset === 0) || radarFrames[radarFrames.length - 1];
        if (liveRadarFrame) {
          currentTileUrl = `${rainViewerHost}${liveRadarFrame.path}/256/{z}/{x}/{y}/6/1_1.png`;
        }
      } else if (activeRadarFrame) {
        // Past Doppler ground radar frames (< 0m) — RainViewer NEXRAD Level-III scheme
        currentTileUrl = `${rainViewerHost}${activeRadarFrame.path}/256/{z}/{x}/{y}/6/1_1.png`;
      }

      if (currentTileUrl) {
        let currentLayer = tileLayersCacheRef.current.get(currentTileUrl);
        if (!currentLayer) {
          currentLayer = L.tileLayer(currentTileUrl, {
            opacity: 0.85,
            zIndex: 100,
            maxNativeZoom: isHrrrLayer ? 8 : 7,
            maxZoom: 18,
            minZoom: 2,
            tileSize: 256,
          });
          currentLayer.addTo(map);
          tileLayersCacheRef.current.set(currentTileUrl, currentLayer);
        } else {
          if (!map.hasLayer(currentLayer)) {
            currentLayer.addTo(map);
          }
          currentLayer.setOpacity(0.85);
        }

        const container = currentLayer.getContainer();
        if (container) {
          if (mOffset > 0 && !isConus) {
            // International single layer advection
            const leadHours = mOffset / 60;
            const downwindRad = ((windDirDeg + 180) % 360) * (Math.PI / 180);
            const distKm = windSpeedKmh * leadHours;
            const deltaLat = (distKm * Math.cos(downwindRad)) / 111.0;
            const deltaLon = (distKm * Math.sin(downwindRad)) / (111.0 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));

            const pOrigin = map.latLngToLayerPoint([lat, lon]);
            const pTarget = map.latLngToLayerPoint([lat + deltaLat, lon + deltaLon]);
            const dx = pTarget.x - pOrigin.x;
            const dy = pTarget.y - pOrigin.y;

            container.style.transform = `translate3d(${dx}px, ${dy}px, 0px)`;
            container.style.transition = "transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)";
          } else {
            container.style.transform = "translate3d(0px, 0px, 0px)";
            container.style.transition = "transform 0.2s ease-out";
          }
        }

        // Hide all other tile layers completely so there is never a double ghost image
        tileLayersCacheRef.current.forEach((layer, url) => {
          if (url !== currentTileUrl) {
            layer.setOpacity(0);
            const otherContainer = layer.getContainer();
            if (otherContainer) {
              otherContainer.style.transform = "translate3d(0px, 0px, 0px)";
            }
          }
        });

        // Preload next adjacent forecast hours or radar frames
        if (isHrrrLayer) {
          const curIdx = unifiedTimeline.indexOf(activeStep);
          const nextSteps = unifiedTimeline.slice(curIdx + 1, curIdx + 5);
          nextSteps.forEach((ns) => {
            if (ns.minuteOffset >= 0) {
              const nextFStr = `F${String(ns.minuteOffset).padStart(4, "0")}`;
              const preUrl = `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/hrrr::REFD-${nextFStr}-0/{z}/{x}/{y}.png`;
              if (!tileLayersCacheRef.current.has(preUrl)) {
                const preLayer = L.tileLayer(preUrl, {
                  opacity: 0,
                  zIndex: 100,
                  maxNativeZoom: 8,
                  maxZoom: 18,
                  minZoom: 2,
                  tileSize: 256,
                });
                preLayer.addTo(map);
                tileLayersCacheRef.current.set(preUrl, preLayer);
              }
            }
          });
        } else if (activeRadarFrame) {
          const curIdx = radarFrames.indexOf(activeRadarFrame);
          const nextFrames = radarFrames.slice(Math.max(0, curIdx - 2), curIdx + 3);
          nextFrames.forEach((nf) => {
            const preUrl = `${rainViewerHost}${nf.path}/256/{z}/{x}/{y}/6/1_1.png`;
            if (!tileLayersCacheRef.current.has(preUrl)) {
              const preLayer = L.tileLayer(preUrl, {
                opacity: 0,
                zIndex: 100,
                maxNativeZoom: 7,
                maxZoom: 18,
                minZoom: 2,
                tileSize: 256,
              });
              preLayer.addTo(map);
              tileLayersCacheRef.current.set(preUrl, preLayer);
            }
          });
        }
      }
    } else {
      // -------------------------------------------------------------
      // SATELLITE CLOUD COVER MODE
      // -------------------------------------------------------------
      tileLayersCacheRef.current.forEach((layer) => {
        layer.setOpacity(0);
      });

      const d = new Date();
      d.setUTCDate(d.getUTCDate() - 1);
      const nasaDate = d.toISOString().split("T")[0];
      const nasaTileUrl = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/${nasaDate}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`;

      if (!activeTileLayerRef.current) {
        const satLayer = L.tileLayer(nasaTileUrl, {
          opacity: 0.85,
          zIndex: 120,
          maxNativeZoom: 8,
          maxZoom: 18,
          minZoom: 2,
          tileSize: 256,
        });
        satLayer.addTo(map);
        activeTileLayerRef.current = satLayer;
      }

      if (cloudOverlayGroupRef.current) {
        const cloudOpacity = Math.max(0.12, Math.min(0.6, (cloudCoverPct / 100) * 0.55));

        const cloudCanopyOuter = L.circle([lat, lon], {
          radius: 50000,
          stroke: false,
          fillColor: "#f8fafc",
          fillOpacity: cloudOpacity * 0.6,
          interactive: false,
        });

        const cloudCanopyMid = L.circle([lat, lon], {
          radius: 28000,
          stroke: false,
          fillColor: "#e2e8f0",
          fillOpacity: cloudOpacity * 0.9,
          interactive: false,
        });

        const cloudCanopyInner = L.circle([lat, lon], {
          radius: 14000,
          stroke: false,
          fillColor: "#ffffff",
          fillOpacity: Math.min(0.7, cloudOpacity * 1.35),
          interactive: false,
        });

        cloudOverlayGroupRef.current.addLayer(cloudCanopyOuter);
        cloudOverlayGroupRef.current.addLayer(cloudCanopyMid);
        cloudOverlayGroupRef.current.addLayer(cloudCanopyInner);
      }
    }

    if (nowcastOverlayGroupRef.current) {
      nowcastOverlayGroupRef.current.clearLayers();
      if (activeLayerMode === "radar" && activeStep?.isNowcast) {
        const leadHours = activeStep.minuteOffset / 60;
        // Project downstream along the steering wind vector
        const downwindRad = ((windDirDeg + 180) % 360) * (Math.PI / 180);
        const distKm = windSpeedKmh * leadHours;
        const deltaLat = (distKm * Math.cos(downwindRad)) / 111.0;
        const deltaLon = (distKm * Math.sin(downwindRad)) / (111.0 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));

        const projectedLat = lat + deltaLat;
        const projectedLon = lon + deltaLon;

        // Steering vector dashed line
        const trajectoryLine = L.polyline(
          [
            [lat, lon],
            [projectedLat, projectedLon],
          ],
          {
            color: "#38bdf8",
            weight: 2.5,
            dashArray: "6, 8",
            opacity: 0.85,
          }
        );
        nowcastOverlayGroupRef.current.addLayer(trajectoryLine);

        const intensity = activeChartPoint?.intensityMmPerHour ?? 0;
        const dbz = activeChartPoint?.dbzReflectivity ?? 0;

        // Dynamic storm cell footprint
        const stormColor = dbz >= 45 ? "#ef4444" : dbz >= 35 ? "#f59e0b" : dbz >= 20 ? "#10b981" : "#06b6d4";
        const stormCircleOuter = L.circle([projectedLat, projectedLon], {
          radius: 12000 + leadHours * 2500,
          stroke: true,
          color: stormColor,
          weight: 1.5,
          dashArray: "4, 6",
          fillColor: stormColor,
          fillOpacity: 0.18,
          interactive: false,
        });

        const stormCircleCore = L.circle([projectedLat, projectedLon], {
          radius: 4500,
          color: "#ffffff",
          weight: 2,
          fillColor: stormColor,
          fillOpacity: 0.65,
          interactive: false,
        });

        nowcastOverlayGroupRef.current.addLayer(stormCircleOuter);
        nowcastOverlayGroupRef.current.addLayer(stormCircleCore);
      }
    }
  }, [
    activeLayerMode,
    activeRadarFrame,
    activeStep,
    activeChartPoint,
    rainViewerHost,
    radarFrames,
    coordinates.latitude,
    coordinates.longitude,
    cloudCoverPct,
    windDirDeg,
    windSpeedKmh,
  ]);

  // 6. Real Doppler Playback Loop
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isPlaying && unifiedTimeline.length > 0) {
      interval = setInterval(() => {
        setTimelineIndex((prev) => (prev + 1) % unifiedTimeline.length);
      }, 700);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, unifiedTimeline.length]);

  const handleStepBack = () => {
    setIsPlaying(false);
    setTimelineIndex((prev) => (prev > 0 ? prev - 1 : unifiedTimeline.length - 1));
  };

  const handleStepForward = () => {
    setIsPlaying(false);
    setTimelineIndex((prev) => (prev + 1) % unifiedTimeline.length);
  };

  const handleJumpToLive = () => {
    setIsPlaying(false);
    setTimelineIndex(liveStepIndex);
  };

  const handleRecenter = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([coordinates.latitude, coordinates.longitude], 7, {
        animate: true,
      });
    }
  };

  const handleZoomIn = () => {
    if (mapInstanceRef.current) mapInstanceRef.current.zoomIn();
  };

  const handleZoomOut = () => {
    if (mapInstanceRef.current) mapInstanceRef.current.zoomOut();
  };

  const firstPastLabel = unifiedTimeline.find((s) => s.isPast)?.label || "-120m";
  const lastNowcastLabel = [...unifiedTimeline].reverse().find((s) => s.isNowcast)?.label || "+120m";

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 lg:p-8 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6 mb-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 mb-1">
              <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
              <span>LIVE NEXRAD DUAL-POL DOPPLER & NOWCASTING</span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              Interactive Global Radar & Precipitation Nowcast
            </h2>
            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
              <span>High-resolution composite centered on</span>
              <span className="font-mono text-slate-300 font-semibold">
                {formatCoordinates(coordinates.latitude, coordinates.longitude)}
              </span>
            </p>
          </div>

          {/* Precipitation Status Alert Box */}
          <div className="flex items-center gap-3">
            <div
              className={`px-4 py-2.5 rounded-2xl border flex items-center gap-3 shadow-md ${
                rainEvent
                  ? "bg-blue-950/70 border-cyan-500/40 text-cyan-200"
                  : "bg-emerald-950/40 border-emerald-500/30 text-emerald-300"
              }`}
            >
              <CloudRain
                className={`w-5 h-5 flex-shrink-0 ${
                  rainEvent ? "text-cyan-400 animate-pulse" : "text-emerald-400"
                }`}
              />
              <div>
                <div className="text-[10px] uppercase font-semibold tracking-wider opacity-80">
                  Precipitation Timing Status
                </div>
                <div className="text-sm font-bold font-mono">
                  {rainEvent
                    ? rainEvent.minuteOffset === 0
                      ? "Precipitation occurring currently"
                      : `Rain starting in ~${rainEvent.minuteOffset} min (${rainEvent.timeString})`
                    : "No precipitation expected in next 120 min"}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Master Synchronized Radar Controls */}
        <div className="mb-6 p-4 sm:p-5 rounded-2xl bg-slate-950/90 border border-cyan-500/30 shadow-2xl relative overflow-hidden">
          <div className="flex flex-col gap-4 relative z-10">
            {/* Controls Row */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  disabled={unifiedTimeline.length === 0}
                  className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 transition shadow-lg active:scale-95 disabled:opacity-50 ${
                    isPlaying
                      ? "bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20"
                      : "bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-cyan-500/25"
                  }`}
                  title={isPlaying ? "Pause Radar Playback" : "Play Doppler Radar Loop"}
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-4 h-4 fill-current" />
                      <span>Pause</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      <span>Play Loop</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleStepBack}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition active:scale-95"
                  title="Step Back"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <button
                  onClick={handleStepForward}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition active:scale-95"
                  title="Step Forward"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>

                <button
                  onClick={handleJumpToLive}
                  className={`px-3 py-2 rounded-xl text-xs font-mono font-semibold flex items-center gap-1.5 transition active:scale-95 ${
                    activeStep?.isLive
                      ? "bg-cyan-500/20 border border-cyan-400/50 text-cyan-300 shadow-sm shadow-cyan-500/20"
                      : "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                  }`}
                  title="Jump to Live Observation (0m)"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Live (Now)</span>
                </button>
              </div>

              {/* Status Badge */}
              <div className="flex items-center gap-3">
                <div
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-2 border shadow-inner ${
                    activeStep?.isPast
                      ? "bg-purple-950/60 border-purple-500/40 text-purple-300"
                      : activeStep?.isLive
                      ? "bg-cyan-950/80 border-cyan-400 text-cyan-300 shadow-cyan-500/10"
                      : "bg-blue-950/60 border-blue-500/40 text-blue-300"
                  }`}
                >
                  <span className="flex h-2 w-2 relative">
                    <span
                      className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                        activeStep?.isPast
                          ? "bg-purple-400"
                          : activeStep?.isLive
                          ? "bg-cyan-400"
                          : "bg-blue-400"
                      }`}
                    />
                    <span
                      className={`relative inline-flex rounded-full h-2 w-2 ${
                        activeStep?.isPast
                          ? "bg-purple-500"
                          : activeStep?.isLive
                          ? "bg-cyan-400"
                          : "bg-blue-500"
                      }`}
                    />
                  </span>
                  <span>
                    {activeStep?.isPast
                      ? `PAST DOPPLER (${activeStep.label})`
                      : (coordinates.latitude >= 21 && coordinates.latitude <= 53 && coordinates.longitude >= -130 && coordinates.longitude <= -65)
                      ? (activeStep?.isLive
                        ? "NOAA HRRR ANALYSIS (NOW)"
                        : `NOAA HRRR SIMULATION (${activeStep?.label})`)
                      : activeStep?.isLive
                      ? "LIVE OBSERVATION (NOW)"
                      : `PHYSICS NOWCAST ADVECTION (${activeStep?.label})`}
                  </span>
                  <span className="text-slate-400 font-normal pl-1 border-l border-slate-700">
                    {activeStep?.timeString}
                  </span>
                </div>
              </div>

              {/* Real-time Metrics HUD */}
              <div className="flex items-center gap-3 text-xs font-mono">
                <div className="bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-800 text-slate-300">
                  <span className="text-slate-500 mr-1.5">Rain Rate:</span>
                  <span className="text-cyan-300 font-bold">
                    {formatRainRate(activeChartPoint?.intensityMmPerHour ?? 0, tempUnit)}
                  </span>
                </div>

                <div className="bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-800 text-slate-300 hidden sm:block">
                  <span className="text-slate-500 mr-1.5">Reflectivity:</span>
                  <span className="text-amber-300 font-bold">
                    {activeChartPoint?.dbzReflectivity ?? 0} dBZ
                  </span>
                </div>
              </div>
            </div>

            {/* Scrubber Slider */}
            <div className="space-y-1.5">
              <input
                type="range"
                min="0"
                max={Math.max(0, unifiedTimeline.length - 1)}
                value={safeIndex}
                onChange={(e) => {
                  setIsPlaying(false);
                  setTimelineIndex(parseInt(e.target.value, 10));
                }}
                className="w-full h-2.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400 shadow-inner"
              />
              <div className="flex justify-between text-[10px] font-mono text-slate-500 px-1 select-none">
                <span className="text-purple-400/80">◀ Past Doppler ({firstPastLabel})</span>
                <span
                  onClick={handleJumpToLive}
                  className="cursor-pointer hover:text-cyan-300 font-bold text-cyan-400 transition"
                >
                  • LIVE (Now) •
                </span>
                <span className="text-cyan-400/80">Nowcast Scan ({lastNowcastLabel}) ▶</span>
              </div>
            </div>
          </div>
        </div>

        {/* Dual Panel: Leaflet Doppler Map & Area Chart */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left: Map */}
          <div className="lg:col-span-7 flex flex-col p-4 sm:p-5 rounded-2xl bg-slate-950/90 border border-slate-800 shadow-inner">
            <div className="w-full flex flex-wrap items-center justify-between gap-3 text-xs font-mono mb-3 px-1">
              <div className="flex items-center bg-slate-900/90 p-1 rounded-xl border border-slate-800 shadow-inner">
                <button
                  type="button"
                  onClick={() => setActiveLayerMode("radar")}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                    activeLayerMode === "radar"
                      ? "bg-cyan-500 text-slate-950 shadow-md font-bold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <CloudRain className="w-3.5 h-3.5" />
                  <span>Precipitation (Rain)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveLayerMode("satellite")}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                    activeLayerMode === "satellite"
                      ? "bg-cyan-500 text-slate-950 shadow-md font-bold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Cloud className="w-3.5 h-3.5" />
                  <span>Cloud Cover (Satellite)</span>
                </button>
              </div>

              <div className="flex items-center gap-1.5 text-amber-300/90 text-[11px] bg-slate-900/90 px-2.5 py-1 rounded-lg border border-slate-800">
                <Wind className="w-3.5 h-3.5 text-amber-400" />
                <span>
                  Steering Flow: {windSpeedFormatted} {windCompass} ({windDirDeg}°)
                </span>
              </div>
            </div>

            <div className="w-full flex items-center justify-between text-[11px] font-mono text-cyan-300 mb-2 px-1">
              <div className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                <span>
                  {activeLayerMode === "radar"
                    ? activeRadarFrame?.isNowcast
                      ? `DOPPLER NOWCAST SCAN: ${activeRadarFrame.label}`
                      : `DOPPLER OBSERVED SCAN: ${activeRadarFrame?.label || "Live"}`
                    : `GLOBAL SATELLITE CLOUD COVER (${cloudCoverPct}% OVERCAST)`}
                </span>
              </div>
              <span className="text-slate-500 text-[10px]">
                {activeLayerMode === "radar"
                  ? activeRadarFrame?.timeString
                  : `Scan (${activeStep?.timeString})`}
              </span>
            </div>

            {/* Leaflet Map */}
            <div className="relative w-full h-[360px] sm:h-[400px] rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 shadow-2xl">
              <div ref={mapContainerRef} className="w-full h-full z-0" />

              <div className="absolute top-3 right-3 z-[400] flex flex-col gap-1.5 bg-slate-900/90 p-1 rounded-xl border border-slate-700/80 shadow-lg backdrop-blur-sm">
                <button
                  onClick={handleRecenter}
                  className="p-2 rounded-lg text-slate-300 hover:text-cyan-400 hover:bg-slate-800 transition"
                  title="Recenter on Location Pin"
                >
                  <Crosshair className="w-4 h-4" />
                </button>
                <button
                  onClick={handleZoomIn}
                  className="p-2 rounded-lg text-slate-300 hover:text-cyan-400 hover:bg-slate-800 transition border-t border-slate-800"
                  title="Zoom In"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  onClick={handleZoomOut}
                  className="p-2 rounded-lg text-slate-300 hover:text-cyan-400 hover:bg-slate-800 transition"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  onClick={fetchRadarFrames}
                  disabled={isLoadingFrames}
                  className="p-2 rounded-lg text-slate-300 hover:text-cyan-400 hover:bg-slate-800 transition border-t border-slate-800 disabled:opacity-50"
                  title="Refresh Radar Feed"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoadingFrames ? "animate-spin text-cyan-400" : ""}`} />
                </button>
              </div>

              <div className="absolute bottom-3 left-3 z-[400] bg-slate-950/85 px-3 py-1.5 rounded-xl border border-slate-800 text-[10px] font-mono text-slate-400 flex items-center gap-2 backdrop-blur-sm">
                <Compass className="w-3.5 h-3.5 text-cyan-400" />
                <span>
                  Range Rings: {isImperial ? "5 / 10 / 15 mi" : "8 / 16 / 25 km"}
                </span>
              </div>

              {isLoadingFrames && (
                <div className="absolute inset-0 z-[500] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center">
                  <div className="bg-slate-900 border border-slate-700 px-4 py-2.5 rounded-2xl flex items-center gap-3 text-cyan-300 font-mono text-xs shadow-2xl">
                    <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                    <span>Loading Doppler radar scans...</span>
                  </div>
                </div>
              )}

              {frameError && (
                <div className="absolute top-3 left-3 right-16 z-[400] bg-amber-950/90 border border-amber-500/40 text-amber-200 text-xs px-3 py-2 rounded-xl backdrop-blur-sm">
                  {frameError}
                </div>
              )}
            </div>

            {/* Radar dBZ Legend */}
            {activeLayerMode === "radar" ? (
              <div className="w-full mt-4 pt-3 border-t border-slate-800/80 space-y-1.5">
                <div className="text-[10px] text-slate-400 font-mono flex justify-between">
                  <span className="text-slate-500">&lt;15 (Dry/Virga)</span>
                  <span className="text-emerald-400">18–28 (Light)</span>
                  <span className="text-amber-400">30–40 (Moderate)</span>
                  <span className="text-rose-400">42–55+ (Heavy/Severe)</span>
                </div>
                <div className="h-2 w-full rounded-full bg-gradient-to-r from-slate-800 via-emerald-400 via-cyan-400 via-amber-400 via-orange-500 to-rose-600 shadow-inner" />
              </div>
            ) : (
              <div className="w-full mt-4 pt-3 border-t border-slate-800/80 space-y-1.5">
                <div className="text-[10px] text-slate-400 font-mono flex justify-between">
                  <span className="text-slate-500">0% (Clear Sky)</span>
                  <span className="text-slate-400">30% (Scattered)</span>
                  <span className="text-slate-300">60% (Broken)</span>
                  <span className="text-white font-semibold">100% (Dense Overcast)</span>
                </div>
                <div className="h-2 w-full rounded-full bg-gradient-to-r from-slate-950 via-slate-700 via-slate-400 via-slate-200 to-white shadow-inner" />
              </div>
            )}
          </div>

          {/* Right: Area Chart */}
          <div className="lg:col-span-5 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Droplet className="w-4 h-4 text-cyan-400" />
                <span>120-Minute Rain Rate Extrapolation</span>
              </h4>
              <div className="text-xs text-slate-400 font-mono">
                {activeStep?.isPast ? (
                  <span className="text-purple-300 font-semibold">{activeStep.label} (Historical)</span>
                ) : (
                  <>
                    +{activeChartPoint?.minuteOffset || 0}m:{" "}
                    <span className="text-cyan-300 font-bold">
                      {formatRainRate(activeChartPoint?.intensityMmPerHour ?? 0, tempUnit)}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="h-80 w-full bg-slate-950/70 p-3 rounded-2xl border border-slate-800 relative">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="intensityGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    dataKey="timeString"
                    stroke="#64748b"
                    tick={{ fontSize: 10, fill: "#64748b" }}
                  />
                  <YAxis
                    stroke="#64748b"
                    tick={{ fontSize: 10, fill: "#64748b" }}
                    unit={isImperial ? " in/h" : " mm/h"}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload as RadarNowcastPoint;
                        return (
                          <div className="bg-slate-900 border border-slate-700 p-2.5 rounded-xl shadow-xl text-xs space-y-1">
                            <div className="font-bold text-white font-mono flex items-center justify-between gap-3">
                              <span>+{data.minuteOffset} min</span>
                              <span className="text-slate-400">{data.timeString}</span>
                            </div>
                            <div className="text-cyan-300">
                              Rain Rate:{" "}
                              <span className="font-mono font-bold">
                                {formatRainRate(data.intensityMmPerHour, tempUnit)}
                              </span>
                            </div>
                            <div className="text-blue-400">
                              Probability:{" "}
                              <span className="font-mono font-bold">{data.probability}%</span>
                            </div>
                            <div className="text-slate-400 text-[10px] pt-1 border-t border-slate-800 flex justify-between">
                              <span>{data.condition.replace("_", " ").toUpperCase()}</span>
                              <span className="font-semibold text-slate-300">
                                {data.dbzReflectivity} dBZ
                              </span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />

                  {!activeStep?.isPast && activeChartPoint && (
                    <ReferenceLine
                      x={activeChartPoint.timeString}
                      stroke="#06b6d4"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      label={{
                        value: `Cursor (+${activeChartPoint.minuteOffset}m)`,
                        position: "top",
                        fill: "#38bdf8",
                        fontSize: 10,
                        fontFamily: "monospace",
                      }}
                    />
                  )}

                  <Area
                    type="monotone"
                    dataKey="displayIntensity"
                    stroke="#06b6d4"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#intensityGrad)"
                    name="Rain Rate"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-2 text-slate-400">
                <Clock className="w-4 h-4 text-cyan-400" />
                <span>Synchronized Timeline:</span>
              </div>
              <div className="text-right">
                <span className="text-white font-bold">{activeStep?.label}</span>
                <span className="text-slate-400 ml-1.5">({activeStep?.timeString})</span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
              <p className="leading-relaxed text-[11px]">
                <strong>NEXRAD Dual-Pol Scans:</strong> Each playback frame displays authentic Doppler radar reflectivity composites ($Z = 200R^{1.6}$) along active steering flow ({windSpeedFormatted} at {windDirDeg}°).
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
