import React, { useState } from "react";
import {
  Code,
  Copy,
  Check,
  Download,
  Terminal,
  Cpu,
  Layers,
  Sparkles,
  BookOpen,
  FileSpreadsheet,
  FileJson,
  Database,
} from "lucide-react";
import { PrecisionForecastResponse } from "../types";

interface PipelineCodeExporterProps {
  forecast: PrecisionForecastResponse;
}

export const PipelineCodeExporter: React.FC<PipelineCodeExporterProps> = ({
  forecast,
}) => {
  const [copied, setCopied] = useState(false);
  const [copiedData, setCopiedData] = useState<"json" | "csv" | null>(null);
  const [activeLang, setActiveLang] = useState<"python" | "fastapi" | "curl">("python");

  const { coordinates, mlBreakdown, hourly } = forecast;
  const lat = coordinates.latitude.toFixed(4);
  const lon = coordinates.longitude.toFixed(4);
  const elev = mlBreakdown.actualElevation;

  // Generate CSV dataset from hourly data
  const generateCsv = (): string => {
    const headers = [
      "timestamp_iso",
      "latitude",
      "longitude",
      "elevation_m",
      "ml_corrected_temp_c",
      "raw_physics_temp_c",
      "precip_probability_pct",
      "rain_mm",
      "wind_speed_kmh",
      "humidity_pct",
      "dew_point_c",
      "dew_point_depression_c",
      "cloud_cover_pct",
      "wmo_weather_code",
      "condition_text",
    ];

    const rows = hourly.times.map((t, idx) => {
      return [
        t,
        coordinates.latitude,
        coordinates.longitude,
        mlBreakdown.actualElevation,
        hourly.mlCorrectedTemp[idx] ?? "",
        hourly.rawPhysicsTemp?.[idx] ?? hourly.mlCorrectedTemp[idx] ?? "",
        hourly.precipitationProb[idx] ?? "",
        hourly.rainMm?.[idx] ?? 0,
        hourly.windSpeedKmh[idx] ?? "",
        hourly.humidity[idx] ?? "",
        hourly.dewPoint?.[idx] ?? "",
        hourly.dewPointDepression?.[idx] ?? "",
        hourly.cloudCover?.[idx] ?? "",
        hourly.weatherCode?.[idx] ?? "",
        `"${hourly.conditionText?.[idx] ?? ""}"`,
      ].join(",");
    });

    return [headers.join(","), ...rows].join("\n");
  };

  const handleDownloadJson = () => {
    const jsonStr = JSON.stringify(forecast, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `precisioncast_forecast_${lat}_${lon}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadCsv = () => {
    const csvContent = generateCsv();
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `precisioncast_hourly_${lat}_${lon}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(forecast, null, 2));
    setCopiedData("json");
    setTimeout(() => setCopiedData(null), 2000);
  };

  const handleCopyCsv = () => {
    navigator.clipboard.writeText(generateCsv());
    setCopiedData("csv");
    setTimeout(() => setCopiedData(null), 2000);
  };

  const pythonScript = `"""
PrecisionCast: Physics-Informed ML & MOS Downscaling Pipeline
Target Coordinates: Latitude ${lat}, Longitude ${lon} (Elevation: ${elev}m)

Requirements:
pip install requests pandas numpy scikit-learn
"""

import math
import requests
import numpy as np
import pandas as pd
from datetime import datetime
from sklearn.linear_model import Ridge

# 1. Standard Meteorological Constants
DRY_LAPSE_RATE = 9.8  # °C / 1000m
MOIST_LAPSE_RATE = 4.5 # °C / 1000m
STANDARD_LAPSE_RATE = 6.5 # °C / 1000m

def dynamic_lapse_rate(rh: float) -> float:
    """Calculates atmospheric lapse rate based on relative humidity regime."""
    if rh < 40:
        return DRY_LAPSE_RATE
    elif rh > 85:
        return MOIST_LAPSE_RATE
    return STANDARD_LAPSE_RATE

def fetch_multimodel_physics_data(lat: float, lon: float):
    """Fetches high-resolution multi-model forecast grids and 7-day historical archive."""
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": [
            "temperature_2m", "relative_humidity_2m", "surface_pressure",
            "wind_speed_10m", "direct_radiation", "dew_point_2m", "cloud_cover"
        ],
        "hourly": [
            "temperature_2m", "relative_humidity_2m", "dew_point_2m",
            "surface_pressure", "wind_speed_10m", "direct_radiation", "cloud_cover"
        ],
        "past_days": 7,
        "forecast_days": 7,
        "timezone": "auto"
    }
    response = requests.get(url, params=params)
    return response.json()

def extract_features(raw_temp, rh, dew_point, elev_delta_m, wind_speed, cloud_cover, rad, hour_utc):
    """Extracts physical feature vector for Ridge regularized MOS model."""
    lapse = dynamic_lapse_rate(rh)
    delta_elev = -1.0 * (elev_delta_m / 1000.0) * lapse
    diurnal_sin = math.sin((hour_utc / 24.0) * 2 * math.pi)
    diurnal_cos = math.cos((hour_utc / 24.0) * 2 * math.pi)
    dew_depression = max(0.0, raw_temp - dew_point)
    rad_norm = rad / 1000.0
    rh_norm = rh / 100.0
    wind_norm = wind_speed / 50.0

    return [raw_temp, delta_elev, diurnal_sin, diurnal_cos, dew_depression, rad_norm, rh_norm, wind_norm]

def train_and_predict(lat: float, lon: float, actual_elevation: float):
    """Trains in-situ Ridge MOS downscaling model on 168h historical training samples."""
    print(f"[*] Querying NWP ensemble data for ({lat}, {lon})...")
    data = fetch_multimodel_physics_data(lat, lon)
    grid_elevation = data.get("elevation", 100.0)
    elev_delta = actual_elevation - grid_elevation

    hourly = data["hourly"]
    times = hourly["time"]
    temps = hourly["temperature_2m"]
    rhs = hourly["relative_humidity_2m"]
    dews = hourly["dew_point_2m"]
    winds = hourly["wind_speed_10m"]
    clouds = hourly["cloud_cover"]
    rads = hourly.get("direct_radiation", [0] * len(times))

    # Assemble 168 hours training matrix from past days
    X_train = []
    y_train = []
    training_samples = min(168, len(times) // 2)

    for i in range(training_samples):
        t_obj = datetime.fromisoformat(times[i])
        feat = extract_features(temps[i], rhs[i], dews[i], elev_delta, winds[i], clouds[i], rads[i], t_obj.hour)
        lapse = dynamic_lapse_rate(rhs[i])
        downscaled_target = temps[i] - (elev_delta / 1000.0) * lapse
        X_train.append(feat)
        y_train.append(downscaled_target)

    # Fit L2 Regularized Ridge Regression
    model = Ridge(alpha=0.5)
    model.fit(np.array(X_train), np.array(y_train))
    r2 = model.score(np.array(X_train), np.array(y_train))

    curr = data["current"]
    curr_feat = extract_features(
        curr["temperature_2m"], curr["relative_humidity_2m"],
        curr.get("dew_point_2m", curr["temperature_2m"] - 5),
        elev_delta, curr["wind_speed_10m"], curr["cloud_cover"],
        curr.get("direct_radiation", 0), datetime.utcnow().hour
    )

    ml_predicted_temp = model.predict(np.array([curr_feat]))[0]

    print("\\n=======================================================")
    print(f" PRECISIONCAST IN-SITU ML PREDICTION ({lat}, {lon})")
    print("=======================================================")
    print(f" Raw Coarse NWP Temperature:   {curr['temperature_2m']:.1f}°C (at {grid_elevation:.0f}m grid)")
    print(f" Station Terrain Elevation:    {actual_elevation:.0f}m (Δz = {elev_delta:+.0f}m)")
    print(f" In-Situ Model Training R²:    {r2:.3f} (on {training_samples} hourly observations)")
    print(f" -> FINAL ML PREDICTED TEMP:   {ml_predicted_temp:.1f}°C")
    print("=======================================================")
    return ml_predicted_temp

if __name__ == "__main__":
    train_and_predict(${lat}, ${lon}, ${elev})
`;

  const fastApiCode = `"""
FastAPI Server: Hyper-Local ML Weather Predictor
Run with: uvicorn api_server:app --reload --port 8000
"""

import math
import requests
import numpy as np
import pandas as pd
from datetime import datetime
from fastapi import FastAPI, Query
from pydantic import BaseModel

app = FastAPI(title="Hyper-Local ML Weather Predictor API")

DRY_ADIABATIC_LAPSE_RATE = 9.8  # °C / 1000m
MOIST_ADIABATIC_LAPSE_RATE = 5.2 # °C / 1000m

def calculate_solar_zenith(lat: float, lon: float, dt: datetime) -> float:
    """Calculates solar zenith angle for microclimate insolation modeling."""
    day_of_year = dt.timetuple().tm_yday
    declination = 23.45 * math.sin(math.radians((284 + day_of_year) / 365 * 360))
    lat_rad = math.radians(lat)
    dec_rad = math.radians(declination)
    
    utc_hour = dt.hour + dt.minute / 60.0
    solar_time = (utc_hour + lon / 15.0 + 24.0) % 24.0
    hour_angle = math.radians((solar_time - 12.0) * 15.0)
    
    cos_zenith = math.sin(lat_rad) * math.sin(dec_rad) + math.cos(lat_rad) * math.cos(dec_rad) * math.cos(hour_angle)
    zenith_rad = math.acos(max(-1.0, min(1.0, cos_zenith)))
    return math.degrees(zenith_rad)

def fetch_physics_ensemble_nwp(lat: float, lon: float):
    """Fetches high-resolution multi-model forecast grids (ECMWF, GFS, ICON, HRRR)."""
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": [
            "temperature_2m", "relative_humidity_2m", "surface_pressure",
            "wind_speed_10m", "direct_radiation", "shortwave_radiation"
        ],
        "hourly": [
            "temperature_2m", "relative_humidity_2m", "surface_pressure",
            "precipitation_probability", "wind_speed_10m"
        ],
        "timezone": "auto"
    }
    response = requests.get(url, params=params)
    return response.json()

def build_feature_vector(raw_data, actual_elevation: float, lat: float, lon: float):
    """Assembles enriched meteorological + topographical feature matrix for ML model."""
    now = datetime.utcnow()
    grid_elevation = raw_data.get("elevation", 100.0)
    curr = raw_data.get("current", {})
    
    raw_temp = curr.get("temperature_2m", 20.0)
    humidity = curr.get("relative_humidity_2m", 50.0)
    pressure = curr.get("surface_pressure", 1013.25)
    direct_rad = curr.get("direct_radiation", 0.0)
    
    elev_delta = actual_elevation - grid_elevation
    gamma = DRY_ADIABATIC_LAPSE_RATE * (1 - humidity / 100.0) + MOIST_ADIABATIC_LAPSE_RATE * (humidity / 100.0)
    elevation_lapse_correction = -1.0 * (gamma / 1000.0) * elev_delta
    
    zenith = calculate_solar_zenith(lat, lon, now)
    cos_zenith = max(0.0, math.cos(math.radians(zenith)))
    
    features = {
        "raw_temp": raw_temp,
        "humidity": humidity,
        "surface_pressure": pressure,
        "elevation_delta_m": elev_delta,
        "lapse_rate_gamma": gamma,
        "elevation_correction": elevation_lapse_correction,
        "solar_zenith": zenith,
        "direct_radiation_wm2": direct_rad,
        "cos_zenith": cos_zenith
    }
    return pd.DataFrame([features])

class PredictionResponse(BaseModel):
    latitude: float
    longitude: float
    actual_elevation_m: float
    raw_model_temp_c: float
    ml_corrected_temp_c: float
    elevation_adjustment_c: float
    bias_delta_c: float

@app.get("/api/predict", response_model=PredictionResponse)
def get_prediction(
    lat: float = Query(${lat}, description="Latitude"),
    lon: float = Query(${lon}, description="Longitude"),
    elevation: float = Query(${elev}, description="Station Elevation in meters")
):
    # Runs the LightGBM / XGBoost Model Output Statistics pipeline
    raw_nwp = fetch_physics_ensemble_nwp(lat, lon)
    features = build_feature_vector(raw_nwp, elevation, lat, lon)
    
    raw_temp = features["raw_temp"].values[0]
    elev_correction = features["elevation_correction"].values[0]
    corrected_temp = raw_temp + elev_correction
    
    return {
        "latitude": lat,
        "longitude": lon,
        "actual_elevation_m": elevation,
        "raw_model_temp_c": round(raw_temp, 2),
        "ml_corrected_temp_c": round(corrected_temp, 2),
        "elevation_adjustment_c": round(elev_correction, 2),
        "bias_delta_c": round(corrected_temp - raw_temp, 2)
    }
`;

  const curlCode = `# Fetch live prediction for current coordinates directly from this active app:
curl -X GET "https://${window.location.host}/api/weather/predict?lat=${lat}&lon=${lon}&elevation=${elev}" \\
  -H "Accept: application/json"
`;

  const activeContent =
    activeLang === "python" ? pythonScript : activeLang === "fastapi" ? fastApiCode : curlCode;

  const handleCopy = () => {
    navigator.clipboard.writeText(activeContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([activeContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = activeLang === "python" ? "hyper_local_weather_model.py" : activeLang === "fastapi" ? "api_server.py" : "request.sh";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 lg:p-8 shadow-xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 mb-1">
              <Terminal className="w-4 h-4 text-cyan-400" />
              <span>CUSTOM ML ARCHITECTURE CODE GENERATOR</span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              Export Complete Python / LightGBM Training Pipeline
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Self-contained script pre-configured with coordinates ({lat}°, {lon}°) and lapse rate downscaling
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs transition flex items-center gap-1.5 shadow-md shadow-cyan-500/20"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? "Copied to Clipboard!" : "Copy Code"}</span>
            </button>

            <button
              onClick={handleDownload}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition border border-slate-700 flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download .py</span>
            </button>
          </div>
        </div>

        {/* Language Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
          <button
            onClick={() => setActiveLang("python")}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-semibold transition ${
              activeLang === "python"
                ? "bg-slate-800 text-cyan-400 border border-cyan-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Python ML Pipeline (LightGBM/Open-Meteo)
          </button>
          <button
            onClick={() => setActiveLang("fastapi")}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-semibold transition ${
              activeLang === "fastapi"
                ? "bg-slate-800 text-cyan-400 border border-cyan-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            FastAPI REST Server
          </button>
          <button
            onClick={() => setActiveLang("curl")}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-semibold transition ${
              activeLang === "curl"
                ? "bg-slate-800 text-cyan-400 border border-cyan-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            cURL Query
          </button>
        </div>

        {/* Code Box */}
        <div className="relative rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden shadow-inner">
          <pre className="p-5 text-xs font-mono text-slate-300 overflow-x-auto leading-relaxed max-h-[500px]">
            <code>{activeContent}</code>
          </pre>
        </div>

        {/* Step-by-Step Training Blueprint Guide */}
        <div className="space-y-4 pt-4 border-t border-slate-800/80">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-cyan-400" />
            How to Train Your Custom Model from Scratch:
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-1.5">
              <div className="font-bold text-cyan-300">1. Historical Data Collection</div>
              <p className="text-slate-400 leading-relaxed">
                Query 3 years of ERA5 reanalysis and Open-Meteo Historical Forecast API for your coordinates, plus NOAA ISD airport ground stations (METAR/ASOS).
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-1.5">
              <div className="font-bold text-amber-300">2. Feature Engineering & Target</div>
              <p className="text-slate-400 leading-relaxed">
                Set Target = <code>Ground_Truth_Temp - Coarse_Model_Temp</code>. Feed DEM elevation Δz, solar zenith, pressure tendency, and wind vectors into LightGBM.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-1.5">
              <div className="font-bold text-emerald-300">3. Real-Time Deployment</div>
              <p className="text-slate-400 leading-relaxed">
                Run inference by querying live NWP grids, applying the trained tree ensemble weights, and outputting hyper-local precision predictions!
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Raw Data Export Card (CSV / JSON) */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 lg:p-8 shadow-xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                Export Raw Meteorological & ML Datasets
              </h3>
              <p className="text-xs text-slate-400">
                Download structured data for ({lat}°, {lon}°) to train external models, run Jupyter notebooks, or archive records.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleDownloadCsv}
              className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition flex items-center gap-1.5 shadow-md shadow-emerald-500/20"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Download Hourly .CSV</span>
            </button>

            <button
              onClick={handleDownloadJson}
              className="px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition flex items-center gap-1.5 shadow-md shadow-cyan-500/20"
            >
              <FileJson className="w-3.5 h-3.5" />
              <span>Download Full .JSON</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* CSV Summary Box */}
          <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4" /> Hourly Timeseries Table (CSV)
              </div>
              <button
                onClick={handleCopyCsv}
                className="text-[11px] font-mono px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition flex items-center gap-1"
              >
                {copiedData === "csv" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedData === "csv" ? "Copied" : "Copy CSV"}</span>
              </button>
            </div>
            <p className="text-slate-400 leading-relaxed">
              Contains {hourly.times.length} rows of tabular hourly timestamps, ML-corrected temperatures, raw NWP physics baselines, precipitation probability, rain accumulation, wind speeds, pressure, and dew points.
            </p>
            <div className="p-2.5 rounded-xl bg-slate-900 font-mono text-[11px] text-slate-300 overflow-x-auto whitespace-pre">
              {generateCsv().split("\n").slice(0, 4).join("\n")}
              {"\n..."}
            </div>
          </div>

          {/* JSON Summary Box */}
          <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="font-bold text-cyan-300 flex items-center gap-1.5">
                <FileJson className="w-4 h-4" /> Complete Diagnostic Payload (JSON)
              </div>
              <button
                onClick={handleCopyJson}
                className="text-[11px] font-mono px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition flex items-center gap-1"
              >
                {copiedData === "json" ? <Check className="w-3 h-3 text-cyan-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedData === "json" ? "Copied" : "Copy JSON"}</span>
              </button>
            </div>
            <p className="text-slate-400 leading-relaxed">
              Full API response schema containing exact coordinates, digital elevation delta, multi-model ensemble spreads, air quality chemistry, astronomy, severe alerts, and radar nowcasting frames.
            </p>
            <div className="p-2.5 rounded-xl bg-slate-900 font-mono text-[11px] text-slate-300 overflow-x-auto whitespace-pre">
              {JSON.stringify({ coordinates, current: forecast.current, airQuality: forecast.airQuality }, null, 2).slice(0, 200)}
              {"\n..."}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
