import React, { useState, useEffect, useRef } from "react";
import {
  Search,
  MapPin,
  Compass,
  Sliders,
  Navigation,
  Sparkles,
  Mountain,
  Layers,
  Check,
  RefreshCw,
  ArrowRight,
  Crosshair,
  ClipboardPaste,
  AlertCircle,
  X,
  Star,
  Bookmark,
  Volume2,
  VolumeX,
  Share2,
} from "lucide-react";
import { WeatherCoordinates } from "../types";
import {
  MICROCLIMATE_PRESETS,
  LocationPreset,
  formatElevation,
  parseCoordinateString,
  formatCoordinates,
} from "../utils/weatherUtils";

interface HeaderProps {
  currentCoords: WeatherCoordinates;
  onSelectCoords: (coords: WeatherCoordinates) => void;
  isLoading: boolean;
  isSyncing?: boolean;
  lastSyncedAt?: Date | null;
  autoRefreshIntervalSec?: number;
  secondsUntilNextSync?: number;
  isAutoRefreshEnabled?: boolean;
  onToggleAutoRefresh?: () => void;
  tempUnit: "C" | "F";
  onToggleTempUnit: () => void;
  activeTab: "forecast" | "nowcast" | "models" | "physics_ml" | "map" | "pipeline_code";
  onSelectTab: (tab: "forecast" | "nowcast" | "models" | "physics_ml" | "map" | "pipeline_code") => void;
  onRefresh: () => void;
  isGloballyOverridden?: boolean;
  onResetOverrides?: () => void;
  isSoundscapePlaying?: boolean;
  onToggleSoundscape?: () => void;
  onOpenShareModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentCoords,
  onSelectCoords,
  isLoading,
  isSyncing = false,
  lastSyncedAt = null,
  autoRefreshIntervalSec = 60,
  secondsUntilNextSync = 60,
  isAutoRefreshEnabled = true,
  onToggleAutoRefresh,
  tempUnit,
  onToggleTempUnit,
  activeTab,
  onSelectTab,
  onRefresh,
  isGloballyOverridden = false,
  onResetOverrides,
  isSoundscapePlaying = false,
  onToggleSoundscape,
  onOpenShareModal,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<WeatherCoordinates[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [customLat, setCustomLat] = useState(currentCoords.latitude ? currentCoords.latitude.toFixed(4) : "0.0000");
  const [customLon, setCustomLon] = useState(currentCoords.longitude ? currentCoords.longitude.toFixed(4) : "0.0000");
  const [quickPasteInput, setQuickPasteInput] = useState("");
  const [showCoordModal, setShowCoordModal] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  // Favorites / Pinned Locations State
  const [favorites, setFavorites] = useState<WeatherCoordinates[]>(() => {
    try {
      const saved = localStorage.getItem("precisioncast_favorites");
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn("Failed to load favorites from localStorage", e);
    }
    return [
      { latitude: 37.7749, longitude: -122.4194, locationName: "San Francisco (Marine Fog)", elevation: 16 },
      { latitude: 44.2704, longitude: -71.3033, locationName: "Mount Washington (Extreme Lapse)", elevation: 1917 },
      { latitude: 45.9763, longitude: 7.7491, locationName: "Zermatt Valley (Inversion)", elevation: 1608 },
    ];
  });

  // Save favorites to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("precisioncast_favorites", JSON.stringify(favorites));
    } catch (e) {
      console.warn("Failed to save favorites to localStorage", e);
    }
  }, [favorites]);

  const isCurrentLocationPinned = favorites.some(
    (f) =>
      Math.abs(f.latitude - currentCoords.latitude) < 0.005 &&
      Math.abs(f.longitude - currentCoords.longitude) < 0.005
  );

  const togglePinCurrentLocation = () => {
    if (isCurrentLocationPinned) {
      setFavorites((prev) =>
        prev.filter(
          (f) =>
            Math.abs(f.latitude - currentCoords.latitude) >= 0.005 ||
            Math.abs(f.longitude - currentCoords.longitude) >= 0.005
        )
      );
    } else {
      const newFav: WeatherCoordinates = {
        latitude: currentCoords.latitude,
        longitude: currentCoords.longitude,
        locationName: currentCoords.locationName || `Pin (${currentCoords.latitude.toFixed(2)}°, ${currentCoords.longitude.toFixed(2)}°)`,
        elevation: currentCoords.elevation,
        town: currentCoords.town,
        state: currentCoords.state,
      };
      setFavorites((prev) => [newFav, ...prev.slice(0, 7)]); // Keep max 8 favorites
    }
  };

  const removeFavorite = (e: React.MouseEvent, fav: WeatherCoordinates) => {
    e.stopPropagation();
    setFavorites((prev) =>
      prev.filter(
        (f) =>
          Math.abs(f.latitude - fav.latitude) >= 0.005 ||
          Math.abs(f.longitude - fav.longitude) >= 0.005
      )
    );
  };

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Auto-dismiss geolocation error after 7 seconds
  useEffect(() => {
    if (!geoError) return;
    const timer = setTimeout(() => setGeoError(null), 7000);
    return () => clearTimeout(timer);
  }, [geoError]);

  // Sync custom coordinates when current coordinates change from outside
  useEffect(() => {
    if (currentCoords.latitude != null) {
      setCustomLat(currentCoords.latitude.toFixed(4));
    }
    if (currentCoords.longitude != null) {
      setCustomLon(currentCoords.longitude.toFixed(4));
    }
  }, [currentCoords.latitude, currentCoords.longitude]);

  // Detected coordinates from current search query string
  const detectedCoords = parseCoordinateString(searchQuery);

  // Debounced geocoding search
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    // If already direct coordinates, we can show instant coordinate suggestion
    if (detectedCoords) {
      setSearchResults([
        {
          latitude: Number(detectedCoords.latitude.toFixed(4)),
          longitude: Number(detectedCoords.longitude.toFixed(4)),
          locationName: `Exact Coordinates (${detectedCoords.formatted})`,
          country: "Geographic Coordinate Target",
        },
      ]);
      setShowDropdown(true);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/weather/search?q=${encodeURIComponent(searchQuery.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.results || []);
          setShowDropdown(true);
        }
      } catch (err) {
        console.error("Failed to search locations:", err);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Close search dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handle Search Submission (Enter key or Click Search)
  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    // 1. Direct coordinate check (e.g. "37.7749, -122.4194" or "40.7128N 74.006W")
    const parsed = parseCoordinateString(query);
    if (parsed) {
      const lat = Number(parsed.latitude.toFixed(4));
      const lon = Number(parsed.longitude.toFixed(4));
      onSelectCoords({
        latitude: lat,
        longitude: lon,
        locationName: `Coordinates ${formatCoordinates(lat, lon)}`,
      });
      setShowDropdown(false);
      setSearchQuery("");
      return;
    }

    // 2. If dropdown already has results, select the first match
    if (searchResults.length > 0) {
      onSelectCoords(searchResults[0]);
      setShowDropdown(false);
      setSearchQuery("");
      return;
    }

    // 3. Fallback: Query search endpoint directly
    try {
      setIsSearching(true);
      const res = await fetch(`/api/weather/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          onSelectCoords(data.results[0]);
          setShowDropdown(false);
          setSearchQuery("");
        }
      }
    } catch (err) {
      console.error("Direct search error:", err);
    } finally {
      setIsSearching(false);
    }
  };

  // Handle Modal Coordinate Submission
  const handleApplyCoordinates = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = parseFloat(customLat);
    const lon = parseFloat(customLon);
    if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      const numLat = Number(lat.toFixed(4));
      const numLon = Number(lon.toFixed(4));
      onSelectCoords({
        latitude: numLat,
        longitude: numLon,
        locationName: `Coordinates ${formatCoordinates(numLat, numLon)}`,
      });
      setShowCoordModal(false);
      setQuickPasteInput("");
    }
  };

  // Quick Paste in Modal
  const handleQuickPasteChange = (val: string) => {
    setQuickPasteInput(val);
    const parsed = parseCoordinateString(val);
    if (parsed) {
      setCustomLat(parsed.latitude.toFixed(4));
      setCustomLon(parsed.longitude.toFixed(4));
    }
  };

  const handleGetGeolocation = () => {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError("Geolocation is not supported by your browser");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        onSelectCoords({
          latitude: Number(position.coords.latitude.toFixed(4)),
          longitude: Number(position.coords.longitude.toFixed(4)),
          locationName: "My Precise GPS Location",
          elevation: position.coords.altitude || undefined,
        });
      },
      (error) => {
        console.warn("Geolocation error:", error);
        setGeoError(error.message || "Location permission denied");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-slate-950/85 border-b border-slate-800/80 transition-all">
      {/* Top Banner with Brand, Coordinate Search & Quick Controls */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          
          {/* Logo & Subtitle */}
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 ring-1 ring-cyan-400/30 flex-shrink-0">
                <Compass className="w-4 h-4 sm:w-5 sm:h-5 text-white animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <h1 className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-1.5">
                    PrecisionCast
                    <span className="text-[9px] sm:text-[10px] uppercase font-mono tracking-wider px-1.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/25 whitespace-nowrap">
                      ML Bias-Correction
                    </span>
                  </h1>
                </div>
                <p className="text-[11px] sm:text-xs text-slate-400 font-normal truncate max-w-[190px] sm:max-w-none">
                  Downscaled Atmospheric Engine
                </p>
              </div>
            </div>

            {/* Mobile Top Actions: Soundscape, Share, GPS, Unit & Refresh */}
            <div className="flex items-center gap-1 md:hidden flex-shrink-0">
              {onToggleSoundscape && (
                <button
                  onClick={onToggleSoundscape}
                  className={`p-1.5 rounded-lg border transition ${
                    isSoundscapePlaying
                      ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300 shadow-sm shadow-cyan-500/20 animate-pulse"
                      : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
                  }`}
                  title={isSoundscapePlaying ? "Ambient Soundscape Active (Click to mute)" : "Enable Ambient Soundscape"}
                >
                  {isSoundscapePlaying ? <Volume2 className="w-3.5 h-3.5 text-cyan-400" /> : <VolumeX className="w-3.5 h-3.5" />}
                </button>
              )}

              {onOpenShareModal && (
                <button
                  onClick={onOpenShareModal}
                  className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-cyan-300 transition"
                  title="Share Forecast Snapshot"
                >
                  <Share2 className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                id="btn-current-gps-mobile"
                onClick={handleGetGeolocation}
                className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-cyan-300 transition"
                title="Use your precise GPS coordinates"
              >
                <Navigation className="w-3.5 h-3.5 text-cyan-400" />
              </button>

              <button
                id="btn-unit-toggle-mobile"
                onClick={onToggleTempUnit}
                className="px-2 py-1 text-xs font-semibold rounded-lg bg-slate-800 border border-slate-700 text-cyan-300 hover:bg-slate-700 transition"
                title="Toggle °F / °C"
              >
                °{tempUnit}
              </button>

              <button
                id="btn-refresh-mobile"
                onClick={onRefresh}
                disabled={isLoading}
                className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition disabled:opacity-50"
                title="Refresh predictions"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-cyan-400" : ""}`} />
              </button>
            </div>
          </div>

          {/* Search Bar & Direct Lat/Lon Input Form */}
          <div className="flex-1 max-w-xl relative" ref={searchContainerRef}>
            <form onSubmit={handleSearchSubmit} className="relative flex items-center">
              <Search className="w-4 h-4 absolute left-3 text-slate-400 pointer-events-none" />
              <input
                ref={searchInputRef}
                id="input-location-search"
                type="text"
                value={searchQuery ?? ""}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => searchQuery.trim().length >= 2 && setShowDropdown(true)}
                placeholder="Search address, city, or coordinates..."
                className="w-full pl-9 pr-20 sm:pr-28 py-2 text-xs sm:text-sm bg-slate-900/90 hover:bg-slate-900 border border-slate-700/80 focus:border-cyan-500/80 focus:ring-1 focus:ring-cyan-500/50 rounded-xl text-slate-100 placeholder-slate-400 shadow-inner transition outline-none"
              />
              <div className="absolute right-1.5 flex items-center gap-1">
                {isSearching ? (
                  <RefreshCw className="w-3.5 h-3.5 text-cyan-400 animate-spin mr-1" />
                ) : (
                  searchQuery.trim().length > 0 && (
                    <button
                      type="submit"
                      title="Run forecast for query"
                      className="p-1 text-xs rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition font-bold"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )
                )}
                <button
                  type="button"
                  id="btn-pin-favorite-location"
                  onClick={togglePinCurrentLocation}
                  title={isCurrentLocationPinned ? "Remove from Pinned Favorites" : "Pin Location to Favorites"}
                  className={`p-1.5 rounded-lg border transition flex items-center justify-center ${
                    isCurrentLocationPinned
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30"
                      : "bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-amber-300 border-slate-700"
                  }`}
                >
                  <Star className={`w-3.5 h-3.5 ${isCurrentLocationPinned ? "fill-amber-400 text-amber-400" : ""}`} />
                </button>
                <button
                  type="button"
                  id="btn-open-coord-modal"
                  onClick={() => {
                    setCustomLat(currentCoords?.latitude != null ? currentCoords.latitude.toFixed(4) : "0.0000");
                    setCustomLon(currentCoords?.longitude != null ? currentCoords.longitude.toFixed(4) : "0.0000");
                    setShowCoordModal(true);
                  }}
                  title="Open direct Lat/Lon coordinate editor"
                  className="p-1.5 sm:px-2 sm:py-1 text-xs font-mono rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-300 border border-slate-700 transition flex items-center gap-1"
                >
                  <MapPin className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                  <span className="hidden sm:inline font-semibold">Lat/Lon</span>
                </button>
              </div>
            </form>

            {/* Autocomplete & Instant Coordinate Dropdown */}
            {showDropdown && (searchResults.length > 0 || detectedCoords) && (
              <div className="absolute left-0 right-0 mt-1.5 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden z-50 divide-y divide-slate-800/60 max-h-80 overflow-y-auto">
                {/* Instant Coordinate Match Highlight Card */}
                {detectedCoords && (
                  <button
                    onClick={() => {
                      const lat = Number(detectedCoords.latitude.toFixed(4));
                      const lon = Number(detectedCoords.longitude.toFixed(4));
                      onSelectCoords({
                        latitude: lat,
                        longitude: lon,
                        locationName: `Exact Coordinates (${detectedCoords.formatted})`,
                      });
                      setShowDropdown(false);
                      setSearchQuery("");
                    }}
                    className="w-full text-left px-4 py-3 bg-cyan-950/40 hover:bg-cyan-900/50 border-b border-cyan-800/40 flex items-center justify-between group transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                        <Crosshair className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wider text-cyan-400 font-mono flex items-center gap-1.5">
                          <span>Target Exact Coordinates</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-400/20 text-cyan-300">Ready</span>
                        </div>
                        <div className="text-sm font-bold text-white font-mono mt-0.5">
                          {detectedCoords.formatted}
                        </div>
                        <div className="text-[11px] text-slate-300">
                          Click or press Enter to query atmospheric physics & ML downscaling
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-cyan-400 group-hover:translate-x-1 transition" />
                  </button>
                )}

                {/* Geocoding & Address Results */}
                {searchResults.map((item, idx) => (
                  <button
                    key={`${item.latitude}-${item.longitude}-${idx}`}
                    onClick={() => {
                      onSelectCoords(item);
                      setShowDropdown(false);
                      setSearchQuery("");
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-slate-800/80 flex items-center justify-between group transition"
                  >
                    <div className="flex-1 pr-2">
                      <div className="text-sm font-medium text-slate-200 group-hover:text-cyan-300 transition flex items-center gap-2 flex-wrap">
                        <span>{item.locationName}</span>
                        {item.town && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                            {item.town}
                          </span>
                        )}
                        {item.state && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700">
                            {item.state}
                          </span>
                        )}
                        {item.country && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                            {item.country}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 flex items-center gap-2 mt-1 flex-wrap">
                        <span className="font-mono text-[11px] text-cyan-400">
                          {formatCoordinates(item.latitude, item.longitude)}
                        </span>
                        {item.elevation != null && (
                          <>
                            <span>•</span>
                            <span className="text-emerald-400 font-mono text-[11px]">
                              {formatElevation(item.elevation, tempUnit)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <Check className="w-4 h-4 text-cyan-400 opacity-0 group-hover:opacity-100 transition flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Action Buttons: Geolocation, Unit Toggle, Auto-Sync Pill, Refresh */}
          <div className="hidden md:flex items-center gap-2">
            {/* Global Sandbox Override Active Badge */}
            {isGloballyOverridden && (
              <button
                onClick={onResetOverrides}
                className="px-2.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-300 text-xs font-mono transition flex items-center gap-1.5 shadow-sm shadow-amber-500/10 animate-pulse group"
                title="Custom hyperparameter overrides are active globally. Click to reset to machine-learned physics defaults."
              >
                <Sliders className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-semibold">⚡ Override Active</span>
                <X className="w-3 h-3 text-amber-400/80 group-hover:text-amber-200 ml-0.5" />
              </button>
            )}

            {/* Live Auto-Sync Status Indicator */}
            <button
              onClick={onToggleAutoRefresh}
              className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-xs font-mono transition flex items-center gap-2 shadow-sm group"
              title={isAutoRefreshEnabled ? `Live Auto-Sync Active (every ${autoRefreshIntervalSec}s). Click to pause.` : "Live Auto-Sync Paused. Click to resume."}
            >
              <span className="relative flex h-2 w-2">
                {isSyncing ? (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                ) : isAutoRefreshEnabled ? (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                ) : null}
                <span className={`relative inline-flex rounded-full h-2 w-2 ${
                  isSyncing ? "bg-cyan-400" : isAutoRefreshEnabled ? "bg-emerald-400" : "bg-slate-500"
                }`} />
              </span>
              <span className="text-[11px] text-slate-300">
                {isSyncing ? (
                  <span className="text-cyan-300 font-semibold">Syncing...</span>
                ) : isAutoRefreshEnabled ? (
                  <span>Sync: <strong className="text-emerald-300">{secondsUntilNextSync}s</strong></span>
                ) : (
                  <span className="text-slate-400">Paused</span>
                )}
              </span>
            </button>

            {onToggleSoundscape && (
              <button
                onClick={onToggleSoundscape}
                className={`px-3 py-1.5 text-xs font-medium rounded-xl border transition flex items-center gap-1.5 shadow-sm ${
                  isSoundscapePlaying
                    ? "bg-cyan-500/20 hover:bg-cyan-500/30 border-cyan-500/50 text-cyan-300 shadow-cyan-500/20"
                    : "bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-700"
                }`}
                title={isSoundscapePlaying ? "Ambient Soundscape Active (Click to mute)" : "Enable Ambient Atmospheric Soundscape"}
              >
                {isSoundscapePlaying ? (
                  <>
                    <Volume2 className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                    <span className="text-cyan-300 font-semibold">Audio On</span>
                  </>
                ) : (
                  <>
                    <VolumeX className="w-3.5 h-3.5 text-slate-400" />
                    <span>Audio</span>
                  </>
                )}
              </button>
            )}

            {onOpenShareModal && (
              <button
                onClick={onOpenShareModal}
                className="px-3 py-1.5 text-xs font-medium rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 hover:border-cyan-500/50 transition flex items-center gap-1.5 shadow-sm"
                title="Generate HD Shareable Weather Card"
              >
                <Share2 className="w-3.5 h-3.5 text-cyan-400" />
                <span>Share</span>
              </button>
            )}

            <button
              id="btn-current-gps"
              onClick={handleGetGeolocation}
              className="px-3 py-1.5 text-xs font-medium rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 hover:border-slate-600 transition flex items-center gap-1.5 shadow-sm"
              title="Use your browser's precise GPS"
            >
              <Navigation className="w-3.5 h-3.5 text-cyan-400" />
              <span>GPS Pin</span>
            </button>

            <button
              id="btn-unit-toggle-desktop"
              onClick={onToggleTempUnit}
              className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-700 hover:border-cyan-500/50 transition flex items-center gap-1.5 shadow-sm"
              title="Toggle between Fahrenheit (Imperial) and Celsius (Metric)"
            >
              <span className="font-bold">°{tempUnit}</span>
              <span className="text-[10px] text-slate-400 uppercase font-mono">({tempUnit === "F" ? "Imperial" : "Metric"})</span>
            </button>

            <button
              id="btn-refresh-desktop"
              onClick={onRefresh}
              disabled={isLoading || isSyncing}
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 transition disabled:opacity-50 flex items-center gap-1"
              title="Re-run physics ML prediction immediately"
            >
              <RefreshCw className={`w-4 h-4 ${(isLoading || isSyncing) ? "animate-spin text-cyan-400" : ""}`} />
            </button>
          </div>
        </div>

        {/* Geolocation Permission or Network Error Banner */}
        {geoError && (
          <div className="mt-2.5 px-4 py-2 rounded-xl bg-rose-950/90 border border-rose-600/70 text-xs text-rose-200 flex items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-2 flex-1">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>
                <strong>GPS Location Error:</strong> {geoError}. Please check browser location permissions or enter coordinates manually.
              </span>
            </div>
            <button
              onClick={() => setGeoError(null)}
              className="p-1 text-rose-300 hover:text-white rounded-lg hover:bg-rose-900/60 transition"
              title="Dismiss error notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Pinned Favorites Row */}
        {favorites.length > 0 && (
          <div className="mt-2.5 pt-2 border-t border-slate-800/40 flex items-center gap-1.5 overflow-x-auto pb-0.5 text-xs no-scrollbar">
            <span className="text-[11px] font-semibold text-amber-400/90 uppercase tracking-wider whitespace-nowrap flex items-center gap-1 pl-1">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> Pinned Locations:
            </span>
            {favorites.map((fav, idx) => {
              const isSelected =
                Math.abs(currentCoords.latitude - fav.latitude) < 0.005 &&
                Math.abs(currentCoords.longitude - fav.longitude) < 0.005;
              return (
                <div
                  key={`${fav.latitude}-${fav.longitude}-${idx}`}
                  className={`group inline-flex items-center rounded-lg text-xs whitespace-nowrap font-medium transition border ${
                    isSelected
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm"
                      : "bg-slate-900/90 text-slate-300 border-slate-800 hover:bg-slate-800 hover:text-slate-100 hover:border-slate-700"
                  }`}
                >
                  <button
                    onClick={() => onSelectCoords(fav)}
                    className="px-2.5 py-1 flex items-center gap-1.5"
                    title={`Switch to ${fav.locationName}`}
                  >
                    <span>{fav.locationName}</span>
                    <span className="text-[10px] font-mono text-slate-400 group-hover:text-amber-300/80">
                      {fav.latitude.toFixed(2)}°, {fav.longitude.toFixed(2)}°
                    </span>
                  </button>
                  <button
                    onClick={(e) => removeFavorite(e, fav)}
                    title="Remove from favorites"
                    className="pr-1.5 pl-0.5 py-1 text-slate-500 hover:text-rose-400 transition"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Microclimate Quick Benchmark Presets */}
        <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center gap-2 overflow-x-auto pb-1 text-xs no-scrollbar">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap flex items-center gap-1 pl-1">
            <Sparkles className="w-3 h-3 text-cyan-400" /> Microclimate Testbeds:
          </span>
          {MICROCLIMATE_PRESETS.map((preset) => {
            const isSelected =
              Math.abs(currentCoords.latitude - preset.latitude) < 0.02 &&
              Math.abs(currentCoords.longitude - preset.longitude) < 0.02;
            return (
              <button
                key={preset.name}
                onClick={() =>
                  onSelectCoords({
                    latitude: preset.latitude,
                    longitude: preset.longitude,
                    locationName: preset.name,
                    elevation: preset.elevation,
                  })
                }
                className={`px-2.5 py-1 rounded-lg text-xs whitespace-nowrap font-medium transition border flex items-center gap-1.5 ${
                  isSelected
                    ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm font-semibold"
                    : "bg-slate-900/80 text-slate-300 border-slate-800 hover:bg-slate-800 hover:text-slate-100 hover:border-slate-700"
                }`}
              >
                <span>{preset.name}</span>
                <span className="text-[10px] font-mono text-slate-400 opacity-80">
                  {formatElevation(preset.elevation, tempUnit)}
                </span>
              </button>
            );
          })}
        </div>

        {/* Navigation Tabs */}
        <div className="mt-3 flex items-center gap-1 overflow-x-auto border-t border-slate-800/60 pt-2 text-xs">
          {[
            { id: "forecast", label: "Precision Forecast", icon: Compass },
            { id: "nowcast", label: "0-120m Radar Nowcast", icon: Navigation },
            { id: "models", label: "Multi-Model Ensemble", icon: Layers },
            { id: "physics_ml", label: "ML Bias & Physics Breakdown", icon: Sliders },
            { id: "map", label: "Terrain & Contours Map", icon: Mountain },
            { id: "pipeline_code", label: "Python ML Pipeline Code", icon: Check },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id as any)}
                className={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 whitespace-nowrap ${
                  active
                    ? "bg-cyan-500 text-slate-950 font-semibold shadow-md shadow-cyan-500/20"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Direct Coordinate Modal */}
      {showCoordModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <MapPin className="w-4 h-4 text-cyan-400" />
                Set Exact Geographic Coordinates
              </h3>
              <button
                onClick={() => setShowCoordModal(false)}
                className="text-slate-400 hover:text-white text-sm px-2.5 py-1 rounded-lg hover:bg-slate-800 transition"
              >
                ✕
              </button>
            </div>
            
            <p className="text-xs text-slate-400">
              Enter decimal coordinates (e.g. <code>37.7749, -122.4194</code>) or specify latitude and longitude. The ML engine will evaluate high-resolution digital elevation models (DEM) and physics grids for that exact point.
            </p>

            {/* Quick Paste Field */}
            <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1.5">
              <label className="block text-[11px] font-semibold text-cyan-400 uppercase tracking-wider flex items-center gap-1">
                <ClipboardPaste className="w-3 h-3" />
                Quick Paste Coordinate Pair
              </label>
              <input
                type="text"
                value={quickPasteInput ?? ""}
                onChange={(e) => handleQuickPasteChange(e.target.value)}
                placeholder="e.g. 40.7128, -74.0060 or 45°N, 122°W"
                className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:border-cyan-500 outline-none"
              />
            </div>

            <form onSubmit={handleApplyCoordinates} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Latitude (-90° to +90°)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="-90"
                    max="90"
                    required
                    value={customLat ?? ""}
                    onChange={(e) => setCustomLat(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm focus:border-cyan-500 outline-none"
                    placeholder="e.g. 37.7749"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Longitude (-180° to +180°)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="-180"
                    max="180"
                    required
                    value={customLon ?? ""}
                    onChange={(e) => setCustomLon(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm focus:border-cyan-500 outline-none"
                    placeholder="e.g. -122.4194"
                  />
                </div>
              </div>

              {/* Quick Nudge Buttons */}
              <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono pt-1">
                <span>Microclimate Nudge (0.01° ≈ 1.1km):</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCustomLat((prev) => (parseFloat(prev || "0") + 0.01).toFixed(4))}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                  >
                    +Lat
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomLat((prev) => (parseFloat(prev || "0") - 0.01).toFixed(4))}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                  >
                    -Lat
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomLon((prev) => (parseFloat(prev || "0") + 0.01).toFixed(4))}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                  >
                    +Lon
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomLon((prev) => (parseFloat(prev || "0") - 0.01).toFixed(4))}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                  >
                    -Lon
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCoordModal(false)}
                  className="px-4 py-2 text-xs font-medium rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition shadow-lg shadow-cyan-500/25 flex items-center gap-1.5"
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span>Apply & Run Forecast</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
};
