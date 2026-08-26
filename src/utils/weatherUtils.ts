export function formatTemp(tempC: number, unit?: "C" | "F" | string): string {
  if (unit === "F" || unit === "imperial") {
    const tempF = (tempC * 9) / 5 + 32;
    return `${tempF.toFixed(1)}°F`;
  }
  return `${tempC.toFixed(1)}°C`;
}

export function formatTempShort(tempC: number, unit?: "C" | "F" | string): string {
  if (unit === "F" || unit === "imperial") {
    const tempF = (tempC * 9) / 5 + 32;
    return `${Math.round(tempF)}°`;
  }
  return `${Math.round(tempC)}°`;
}

export function formatTempDelta(deltaC: number, unit?: "C" | "F" | string): string {
  if (unit === "F" || unit === "imperial") {
    const deltaF = deltaC * 1.8;
    return `${deltaF >= 0 ? "+" : ""}${deltaF.toFixed(1)}°F`;
  }
  return `${deltaC >= 0 ? "+" : ""}${deltaC.toFixed(1)}°C`;
}

export function formatWind(kmh: number, unit?: "C" | "F" | "metric" | "imperial" | string): string {
  if (unit === "imperial" || unit === "F") {
    const mph = kmh * 0.621371;
    return `${mph.toFixed(1)} mph`;
  }
  return `${kmh.toFixed(1)} km/h`;
}

export function formatElevation(meters: number, unit?: "C" | "F" | "metric" | "imperial" | string): string {
  if (unit === "imperial" || unit === "F") {
    const feet = meters * 3.28084;
    return `${Math.round(feet).toLocaleString()} ft`;
  }
  return `${Math.round(meters).toLocaleString()} m`;
}

export function formatPrecip(mm: number, unit?: "C" | "F" | "metric" | "imperial" | string): string {
  if (unit === "imperial" || unit === "F") {
    const inches = mm * 0.0393701;
    return `${inches.toFixed(2)} in`;
  }
  return `${mm.toFixed(1)} mm`;
}

export function formatRainRate(mmPerHour: number, unit?: "C" | "F" | "metric" | "imperial" | string): string {
  if (unit === "imperial" || unit === "F") {
    const inPerHour = mmPerHour * 0.0393701;
    return `${inPerHour.toFixed(2)} in/hr`;
  }
  return `${mmPerHour.toFixed(1)} mm/h`;
}

export function formatPressure(hPa: number, unit?: "C" | "F" | "metric" | "imperial" | string): string {
  if (unit === "imperial" || unit === "F") {
    const inHg = hPa * 0.02953;
    return `${inHg.toFixed(2)} inHg`;
  }
  return `${hPa} hPa`;
}

export function formatCoordinates(lat: number, lon: number): string {
  const latDir = lat >= 0 ? "N" : "S";
  const lonDir = lon >= 0 ? "E" : "W";
  const absLat = Math.abs(lat).toFixed(4);
  const absLon = Math.abs(lon).toFixed(4);
  return `(${absLat}° ${latDir}, ${absLon}° ${lonDir})`;
}

/**
 * Safely parses daily date strings (e.g. "2026-08-24") without UTC timezone conversion skew.
 * In standard JS, new Date("YYYY-MM-DD") is parsed as UTC midnight, which in Western timezones
 * shifts the displayed date 1 day backwards (e.g. 8/24 becomes 8/23 Sun).
 */
export function formatDailyForecastDate(dateStr: string, index: number, timezone?: string): {
  dayName: string;
  monthDay: string;
  isToday: boolean;
  isTomorrow: boolean;
  fullDate: string;
  weekday: string;
} {
  if (!dateStr) {
    return {
      dayName: index === 0 ? "Today" : index === 1 ? "Tomorrow" : "",
      monthDay: "",
      isToday: index === 0,
      isTomorrow: index === 1,
      fullDate: "",
      weekday: "",
    };
  }

  const opt = timezone ? { timeZone: timezone } : undefined;

  // Handle "YYYY-MM-DD"
  const cleanDate = dateStr.split("T")[0];
  const parts = cleanDate.split("-");

  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const localDate = new Date(year, month, day, 12, 0, 0); // Noon prevents any midnight boundary or DST shift

    const weekday = localDate.toLocaleDateString("en-US", { ...opt, weekday: "short" });
    const dayName = index === 0 ? "Today" : index === 1 ? "Tomorrow" : weekday;
    const monthDay = `${month + 1}/${day}`;
    const fullDate = localDate.toLocaleDateString("en-US", { ...opt, weekday: "short", month: "short", day: "numeric" });

    return { dayName, monthDay, isToday: index === 0, isTomorrow: index === 1, fullDate, weekday };
  }

  const d = new Date(dateStr);
  const weekday = d.toLocaleDateString("en-US", { ...opt, weekday: "short" });
  return {
    dayName: index === 0 ? "Today" : index === 1 ? "Tomorrow" : weekday,
    monthDay: d.toLocaleDateString("en-US", { ...opt, month: "numeric", day: "numeric" }),
    isToday: index === 0,
    isTomorrow: index === 1,
    fullDate: d.toLocaleDateString("en-US", { ...opt, weekday: "short", month: "short", day: "numeric" }),
    weekday,
  };
}

/**
 * Parses user input string into latitude and longitude if it matches coordinate patterns.
 * Supports decimal pairs, degrees with cardinal directions (N/S/E/W), lat/lon labels, etc.
 */
export function parseCoordinateString(input: string): { latitude: number; longitude: number; formatted: string } | null {
  if (!input) return null;
  const clean = input.trim().replace(/^\(+|\)+$/g, "").replace(/^\[+|\]+$/g, "").trim();

  // Pattern 1: Labeled format (e.g., "lat: 37.7749, lon: -122.4194" or "latitude 40.71, longitude -74.00")
  const labeled = clean.match(/lat(?:itude)?[:\s=]+(-?\d+(?:\.\d+)?)\s*°?\s*([NSns])?[,\s;/]+lon(?:gitude)?[:\s=]+(-?\d+(?:\.\d+)?)\s*°?\s*([EWew])?/i);
  if (labeled) {
    let lat = parseFloat(labeled[1]);
    if (labeled[2]?.toUpperCase() === "S") lat = -Math.abs(lat);
    let lon = parseFloat(labeled[3]);
    if (labeled[4]?.toUpperCase() === "W") lon = -Math.abs(lon);

    if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      return {
        latitude: lat,
        longitude: lon,
        formatted: formatCoordinates(lat, lon),
      };
    }
  }

  // Pattern 2: Cardinal degrees format (e.g., "37.7749 N, 122.4194 W" or "37.7749°N 122.4194°W" or "37.7749N, 122.4194W")
  const cardinal = clean.match(/^(\d+(?:\.\d+)?)\s*°?\s*([NSns])[,\s;/]+(\d+(?:\.\d+)?)\s*°?\s*([EWew])$/i);
  if (cardinal) {
    let lat = parseFloat(cardinal[1]);
    if (cardinal[2].toUpperCase() === "S") lat = -lat;
    let lon = parseFloat(cardinal[3]);
    if (cardinal[4].toUpperCase() === "W") lon = -lon;

    if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      return {
        latitude: lat,
        longitude: lon,
        formatted: formatCoordinates(lat, lon),
      };
    }
  }

  // Pattern 3: Standard decimal pair (e.g., "37.7749, -122.4194" or "37.7749 -122.4194" or "37.7749; -122.4194" or "37.7749 / -122.4194")
  const standard = clean.match(/^(-?\d+(?:\.\d+)?)\s*°?\s*[,\s;/]+\s*(-?\d+(?:\.\d+)?)\s*°?$/);
  if (standard) {
    const lat = parseFloat(standard[1]);
    const lon = parseFloat(standard[2]);

    if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      return {
        latitude: lat,
        longitude: lon,
        formatted: formatCoordinates(lat, lon),
      };
    }
  }

  return null;
}

export function formatLapseRate(cPerKm: number, unit?: "C" | "F" | "metric" | "imperial" | string): string {
  if (unit === "imperial" || unit === "F") {
    const fPer1kFt = cPerKm * 0.54864;
    return `${fPer1kFt.toFixed(1)}°F/1k ft`;
  }
  return `${cPerKm.toFixed(1)}°C/km`;
}

export function getWindDirectionCompass(degrees: number): string {
  const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const index = Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16;
  return directions[index];
}

export type WeatherIconType =
  | "sun"
  | "moon"
  | "cloud-sun"
  | "cloud-moon"
  | "cloud"
  | "fog"
  | "drizzle"
  | "rain"
  | "snow"
  | "thunderstorm";

export interface HourlyWeatherDisplayInfo {
  condition: string;
  iconType: WeatherIconType;
  iconColor: string;
}

export function getHourlyWeatherDisplayInfo(params: {
  weatherCode?: number;
  cloudCover?: number;
  isDay?: number | boolean;
  dewPointDepression?: number;
  humidity?: number;
  capeJkg?: number;
}): HourlyWeatherDisplayInfo {
  const {
    weatherCode = 0,
    cloudCover = 0,
    isDay = true,
    dewPointDepression = 10,
    humidity = 50,
    capeJkg = 0,
  } = params;

  const isDaytime = typeof isDay === "boolean" ? isDay : isDay === 1;

  // 1. Mandatory Fog Rule: If dew point depression < 1°C and relative humidity > 95%, display 'Overcast/Dense Fog'
  if (dewPointDepression < 1.0 && humidity > 95) {
    return {
      condition: "Overcast/Dense Fog",
      iconType: "fog",
      iconColor: "text-slate-300",
    };
  }

  // 2. Thunderstorm WMO codes: 95, 96, 99
  if (weatherCode === 95 || weatherCode === 96 || weatherCode === 99) {
    return {
      condition: weatherCode === 95 ? "Thunderstorm" : "Thunderstorm w/ Hail",
      iconType: "thunderstorm",
      iconColor: "text-amber-400",
    };
  }

  // 3. Snow WMO codes: 71, 73, 75, 77, 85, 86
  if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) {
    let cond = "Snow";
    if (weatherCode === 71) cond = "Light Snow";
    if (weatherCode === 73) cond = "Moderate Snow";
    if (weatherCode === 75) cond = "Heavy Snow";
    if (weatherCode === 85 || weatherCode === 86) cond = "Snow Showers";
    return {
      condition: cond,
      iconType: "snow",
      iconColor: "text-sky-200",
    };
  }

  // 4. Freezing Rain / Drizzle: 56, 57, 66, 67
  if ([56, 57, 66, 67].includes(weatherCode)) {
    return {
      condition: "Freezing Rain",
      iconType: "snow",
      iconColor: "text-cyan-200",
    };
  }

  // 5. Rain & Showers WMO codes: 61, 63, 65, 80, 81, 82
  if ([61, 63, 65, 80, 81, 82].includes(weatherCode)) {
    let cond = "Rain";
    if (weatherCode === 61) cond = capeJkg >= 500 ? "Passing Showers" : "Light Rain";
    if (weatherCode === 63) cond = "Moderate Rain";
    if (weatherCode === 65) cond = "Heavy Rain";
    if (weatherCode === 80) cond = capeJkg >= 500 ? "Passing Showers" : "Light Showers";
    if (weatherCode === 81) cond = "Rain Showers";
    if (weatherCode === 82) cond = "Heavy Showers";
    return {
      condition: cond,
      iconType: "rain",
      iconColor: "text-blue-400",
    };
  }

  // 6. Drizzle WMO codes: 51, 53, 55 (Fix the "Drizzle" Bug: reserve drizzle strictly for low-energy stratiform regimes)
  if ([51, 53, 55].includes(weatherCode)) {
    if (capeJkg >= 500) {
      return {
        condition: "Isolated Showers",
        iconType: "rain",
        iconColor: "text-blue-400",
      };
    } else if (capeJkg >= 300) {
      return {
        condition: "Passing Showers",
        iconType: "rain",
        iconColor: "text-blue-400",
      };
    }
    return {
      condition: "Drizzle",
      iconType: "drizzle",
      iconColor: "text-cyan-300",
    };
  }

  // 7. Fog / Depositing Rime Fog WMO codes: 45, 48
  if (weatherCode === 45 || weatherCode === 48) {
    return {
      condition: "Overcast/Dense Fog",
      iconType: "fog",
      iconColor: "text-slate-300",
    };
  }

  // 8. Overcast: WMO code 3 or cloudCover >= 80%
  if (weatherCode === 3 || cloudCover >= 80) {
    return {
      condition: "Overcast",
      iconType: "cloud",
      iconColor: "text-slate-300",
    };
  }

  // 9. Partly Cloudy: WMO code 2 or cloudCover between 30% and 80%
  if (weatherCode === 2 || (cloudCover >= 30 && cloudCover < 80)) {
    return {
      condition: isDaytime ? "Partly Sunny" : "Partly Cloudy",
      iconType: isDaytime ? "cloud-sun" : "cloud-moon",
      iconColor: isDaytime ? "text-amber-300" : "text-indigo-300",
    };
  }

  // 10. Mainly Clear / Mostly Sunny: WMO code 1 or cloudCover between 10% and 30%
  if (weatherCode === 1 || (cloudCover >= 10 && cloudCover < 30)) {
    return {
      condition: isDaytime ? "Mostly Sunny" : "Mostly Clear",
      iconType: isDaytime ? "sun" : "moon",
      iconColor: isDaytime ? "text-amber-400" : "text-indigo-200",
    };
  }

  // 11. Clear Sky (WMO code 0 or cloudCover < 10%)
  return {
    condition: isDaytime ? "Clear Sky" : "Clear Night",
    iconType: isDaytime ? "sun" : "moon",
    iconColor: isDaytime ? "text-amber-400" : "text-indigo-200",
  };
}

export interface LocationPreset {
  name: string;
  region: string;
  category: "Alpine" | "Urban Heat Island" | "Coastal / Marine" | "Desert Valley" | "Orographic Lift";
  latitude: number;
  longitude: number;
  elevation: number;
  description: string;
}

export const MICROCLIMATE_PRESETS: LocationPreset[] = [
  {
    name: "Mount Washington, NH",
    region: "Appalachian Alpine",
    category: "Alpine",
    latitude: 44.2704,
    longitude: -71.3032,
    elevation: 1917,
    description: "Famous for extreme lapse rate cooling & hurricane-force summit winds that coarse 13km models severely underestimate.",
  },
  {
    name: "Twin Peaks, San Francisco, CA",
    region: "Pacific Marine Layer",
    category: "Coastal / Marine",
    latitude: 37.7544,
    longitude: -122.4477,
    elevation: 281,
    description: "Sharp microclimate dividing foggy marine inversion from sunny east-side valleys within 3 miles.",
  },
  {
    name: "Badwater Basin, Death Valley, CA",
    region: "Below Sea Level Basin",
    category: "Desert Valley",
    latitude: 36.2503,
    longitude: -116.8258,
    elevation: -86,
    description: "Depression basin where adiabatic compression traps intense nocturnal heat missed by averaged grid cells.",
  },
  {
    name: "Boulder Foothills, CO",
    region: "Rocky Mountain Front Range",
    category: "Orographic Lift",
    latitude: 40.015,
    longitude: -105.2705,
    elevation: 1655,
    description: "Intense chinook wind compression and rapid orographic precipitation dumping along steep topography.",
  },
  {
    name: "Shinjuku, Tokyo",
    region: "High-Density Megacity",
    category: "Urban Heat Island",
    latitude: 35.6895,
    longitude: 139.6917,
    elevation: 38,
    description: "Dense concrete canopy creates a nocturnal +2.2°C thermal island and altered convective triggers.",
  },
  {
    name: "Chamonix-Mont-Blanc, France",
    region: "Alpine Valley Basin",
    category: "Alpine",
    latitude: 45.9237,
    longitude: 6.8694,
    elevation: 1035,
    description: "Severe winter temperature inversions where freezing air pools in valley floors while peaks stay warmer.",
  },
];
