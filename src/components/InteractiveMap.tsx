import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { MapPin, Mountain, Compass, Navigation, Info, Layers } from "lucide-react";
import { WeatherCoordinates } from "../types";
import { formatElevation, formatCoordinates } from "../utils/weatherUtils";

interface InteractiveMapProps {
  coordinates: WeatherCoordinates;
  onSelectCoords: (coords: WeatherCoordinates) => void;
  elevationMeters: number;
  tempUnit?: "C" | "F";
}

export const InteractiveMap: React.FC<InteractiveMapProps> = ({
  coordinates,
  onSelectCoords,
  elevationMeters,
  tempUnit = "F",
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const [mapLayer, setMapLayer] = useState<"topo" | "street" | "satellite">("topo");
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  // Initialize Leaflet map once on container mount with clean unmount
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [coordinates.latitude, coordinates.longitude],
        zoom: 11,
        zoomControl: true,
      });

      // High-performance Esri World Topographic Basemap with elevation contours
      const tileUrl = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}";
      const tileLayer = L.tileLayer(tileUrl, {
        maxZoom: 18,
        attribution: "Tiles © Esri — Source: USGS, Esri, DeLorme, NAVTEQ, METI/NASA",
      }).addTo(map);

      tileLayerRef.current = tileLayer;

      // Custom marker icon
      const customIcon = L.divIcon({
        className: "custom-map-pin",
        html: `<div style="
          width: 28px; 
          height: 28px; 
          background: #06b6d4; 
          border: 3px solid #ffffff; 
          border-radius: 50%; 
          box-shadow: 0 0 15px rgba(6, 182, 212, 0.8), 0 4px 6px rgba(0,0,0,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        ">
          <div style="width: 8px; height: 8px; background: #ffffff; border-radius: 50%;"></div>
        </div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker([coordinates.latitude, coordinates.longitude], {
        icon: customIcon,
        draggable: true,
      }).addTo(map);

      marker.on("dragend", (e) => {
        const latLng = e.target.getLatLng();
        onSelectCoords({
          latitude: Number(latLng.lat.toFixed(4)),
          longitude: Number(latLng.lng.toFixed(4)),
          locationName: `Map Pin (${latLng.lat.toFixed(4)}°, ${latLng.lng.toFixed(4)}°)`,
        });
      });

      map.on("click", (e) => {
        const lat = Number(e.latlng.lat.toFixed(4));
        const lon = Number(e.latlng.lng.toFixed(4));
        marker.setLatLng([lat, lon]);
        onSelectCoords({
          latitude: lat,
          longitude: lon,
          locationName: `Map Pick (${lat}°, ${lon}°)`,
        });
      });

      markerRef.current = marker;
      mapInstanceRef.current = map;

      setTimeout(() => {
        map.invalidateSize();
      }, 100);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
        tileLayerRef.current = null;
      }
    };
  }, []);

  // Smoothly update center and marker when coordinates change
  useEffect(() => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([coordinates.latitude, coordinates.longitude], 11, {
        duration: 1.0,
      });
    }
    if (markerRef.current) {
      markerRef.current.setLatLng([coordinates.latitude, coordinates.longitude]);
    }
  }, [coordinates.latitude, coordinates.longitude]);

  // Switch Map Tile Layers
  const handleLayerChange = (layerType: "topo" | "street" | "satellite") => {
    if (!mapInstanceRef.current) return;
    setMapLayer(layerType);

    if (tileLayerRef.current) {
      mapInstanceRef.current.removeLayer(tileLayerRef.current);
    }

    let url = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}";
    let attr = "Tiles © Esri — USGS, NOAA";

    if (layerType === "street") {
      url = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
      attr = "© CARTO";
    } else if (layerType === "satellite") {
      url = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
      attr = "© Esri";
    }

    const newTileLayer = L.tileLayer(url, {
      maxZoom: 18,
      attribution: attr,
    }).addTo(mapInstanceRef.current);

    tileLayerRef.current = newTileLayer;
  };

  // NOAA NWS Live Warning Polygons Layer
  const alertsLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const [showAlertsLayer, setShowAlertsLayer] = useState<boolean>(true);
  const [activeAlertCount, setActiveAlertCount] = useState<number>(0);

  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    if (!alertsLayerGroupRef.current) {
      alertsLayerGroupRef.current = L.layerGroup().addTo(map);
    }
    const alertGroup = alertsLayerGroupRef.current;
    alertGroup.clearLayers();

    if (!showAlertsLayer) return;

    // Fetch active alerts and polygons
    const fetchAlerts = async () => {
      try {
        const res = await fetch(`/api/weather/alerts?lat=${coordinates.latitude}&lon=${coordinates.longitude}`);
        if (!res.ok) return;
        const data = await res.json();
        const alerts = data.alerts || [];
        const features = data.features || [];
        setActiveAlertCount(alerts.length);

        features.forEach((feature: any) => {
          if (!feature.geometry) return;

          const severity = (feature.properties?.severity || "").toLowerCase();
          const color = severity === "extreme" || severity === "severe" ? "#ef4444" : severity === "moderate" ? "#f59e0b" : "#06b6d4";

          try {
            const geoJsonLayer = L.geoJSON(feature, {
              style: {
                color,
                weight: 2.5,
                opacity: 0.9,
                fillColor: color,
                fillOpacity: 0.22,
                dashArray: severity === "extreme" ? "4, 6" : undefined,
              },
            });

            const props = feature.properties || {};
            const popupContent = `
              <div style="font-family: sans-serif; padding: 6px; max-width: 280px; color: #f8fafc;">
                <div style="font-size: 11px; font-weight: bold; color: ${color}; text-transform: uppercase;">
                  ⚠️ NOAA ACTIVE WARNING
                </div>
                <div style="font-size: 14px; font-weight: bold; margin-top: 2px;">
                  ${props.event || "Severe Weather Alert"}
                </div>
                <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">
                  ${props.headline || props.areaDesc || ""}
                </div>
              </div>
            `;
            geoJsonLayer.bindPopup(popupContent);
            geoJsonLayer.addTo(alertGroup);
          } catch {
            // ignore invalid geometry
          }
        });
      } catch (err) {
        console.warn("Failed to render NWS alert polygons:", err);
      }
    };

    fetchAlerts();
  }, [coordinates.latitude, coordinates.longitude, showAlertsLayer]);

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 lg:p-8 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6 mb-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 mb-1">
              <Mountain className="w-4 h-4 text-cyan-400" />
              <span>HIGH-RESOLUTION TOPOGRAPHY & CONTOUR EXPLORER</span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              Interactive Microclimate Coordinate Picker
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Click anywhere on the map or drag the pin to trigger instant physics downscaling for that terrain feature
            </p>
          </div>

          {/* Layer Selector */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowAlertsLayer(!showAlertsLayer)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border flex items-center gap-1.5 ${
                showAlertsLayer
                  ? activeAlertCount > 0
                    ? "bg-rose-500/20 text-rose-300 border-rose-500/60 shadow-md shadow-rose-500/20 animate-pulse"
                    : "bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-md shadow-cyan-500/10"
                  : "bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800"
              }`}
              title="Toggle Live NOAA NWS Severe Weather Warning Polygons"
            >
              <span>⚠️ NOAA Warnings</span>
              {activeAlertCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-slate-950 font-bold text-[10px]">
                  {activeAlertCount}
                </span>
              )}
            </button>

            <button
              onClick={() => handleLayerChange("topo")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border flex items-center gap-1.5 ${
                mapLayer === "topo"
                  ? "bg-cyan-500 text-slate-950 border-cyan-400 shadow-md"
                  : "bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800"
              }`}
            >
              <Mountain className="w-3.5 h-3.5" />
              <span>Topography</span>
            </button>

            <button
              onClick={() => handleLayerChange("satellite")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border flex items-center gap-1.5 ${
                mapLayer === "satellite"
                  ? "bg-cyan-500 text-slate-950 border-cyan-400 shadow-md"
                  : "bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Satellite</span>
            </button>

            <button
              onClick={() => handleLayerChange("street")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border flex items-center gap-1.5 ${
                mapLayer === "street"
                  ? "bg-cyan-500 text-slate-950 border-cyan-400 shadow-md"
                  : "bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800"
              }`}
            >
              <span>Street</span>
            </button>
          </div>
        </div>

        {/* Map Container */}
        <div className="relative w-full h-[450px] rounded-2xl overflow-hidden border border-slate-800 shadow-inner">
          <div ref={mapContainerRef} className="w-full h-full" />

          {/* Floating Coordinate & Elevation HUD Overlay */}
          <div className="absolute bottom-4 left-4 z-[500] bg-slate-950/90 backdrop-blur-md border border-slate-700/90 px-4 py-3 rounded-2xl shadow-2xl text-xs font-mono space-y-1 max-w-sm">
            <div className="flex items-center gap-2 text-cyan-400 font-bold">
              <MapPin className="w-3.5 h-3.5" />
              <span>ACTIVE PIN TARGET</span>
            </div>
            <div className="text-white font-bold">
              {formatCoordinates(coordinates.latitude, coordinates.longitude)}
            </div>
            {(coordinates.town || coordinates.state || coordinates.country) && (
              <div className="text-slate-300 flex items-center gap-1.5 flex-wrap text-[11px]">
                {coordinates.town && <span className="text-cyan-300 font-semibold">{coordinates.town},</span>}
                {coordinates.state && <span>{coordinates.state},</span>}
                {coordinates.country && <span className="text-slate-400">{coordinates.country}</span>}
              </div>
            )}
            <div className="text-slate-300 text-[11px]">
              Terrain Elevation: <span className="text-emerald-400 font-bold">{formatElevation(elevationMeters, tempUnit)}</span>
            </div>
          </div>
        </div>

        {/* Map Tip */}
        <div className="mt-4 p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
          <p>
            <strong>Pro Tip:</strong> Click along steep mountain ridge-lines, coastal beaches, or deep valley floors. Notice how the ML model dynamically calculates adiabatic cooling on peaks and radiative heat retention in valleys!
          </p>
        </div>
      </div>
    </div>
  );
};
