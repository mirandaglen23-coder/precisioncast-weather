export interface WeatherCoordinates {
  latitude: number;
  longitude: number;
  locationName?: string;
  town?: string;
  city?: string;
  state?: string;
  country?: string;
  countryCode?: string;
  formattedAddress?: string;
  elevation?: number;
  timezone?: string;
}

export interface ModelPrediction {
  modelName: string;
  displayName: string;
  source: string;
  resolutionKm: number;
  currentTemp: number;
  precipitationProb: number;
  windSpeed: number;
  hourly: {
    time: string[];
    temperature_2m: number[];
    precipitation_probability: number[];
    wind_speed_10m: number[];
    surface_pressure?: number[];
  };
}

export interface LearnedFeatureWeight {
  featureName: string;
  weight: number;
  importanceScore: number;
  physicalInterpretation: string;
}

export interface EnsembleModelWeight {
  modelKey: string;
  displayName: string;
  weightPercent: number;
  historicalMae: number;
  sampleCount: number;
}

export interface MLCorrectionBreakdown {
  rawEnsembleMeanTemp: number;
  correctedTemp: number;
  temperatureResidualOffset: number;
  elevationAdjustment: number;
  gridElevation: number;
  actualElevation: number;
  elevationLapseRate: number; // °C per 1000m
  solarRadiationBonus: number;
  solarZenithAngle: number;
  marineLayerDamping: number;
  isCoastalRegion?: boolean;
  urbanHeatIslandBonus: number;
  dewPointDepression: number;
  dewPoint: number;
  humidity: number;
  pressureTendency3h: number;
  instabilityCAPE: number;
  modelConfidenceScore: number; // 0 - 100%
  modelDivergenceSpread: number; // standard deviation across models
  isInversionActive?: boolean; // Nocturnal cold air drainage / valley inversion flag
  inversionDampingOffset?: number; // Inversion offset in °C
  ensembleModelWeights?: EnsembleModelWeight[];
  learnedFeatureWeights?: LearnedFeatureWeight[];
  trainingR2Score?: number;
  pblHeightM?: number; // Planetary Boundary Layer height in meters
  lclHeightM?: number; // Lifted Condensation Level in meters
  cinJkg?: number; // Convective Inhibition in J/kg
}

export interface RadarNowcastPoint {
  minuteOffset: number; // 0, 5, 10 ... 120
  timeString: string;
  intensityMmPerHour: number;
  probability: number;
  condition: 'dry' | 'light_rain' | 'moderate_rain' | 'heavy_rain' | 'thunderstorm';
  dbzReflectivity: number;
}

export interface AirQualityData {
  usAqi: number;
  aqiCategory: "Good" | "Moderate" | "Sensitive" | "Unhealthy" | "Very Unhealthy" | "Hazardous";
  pm25: number; // µg/m³
  pm10: number; // µg/m³
  ozone: number; // µg/m³
  nitrogenDioxide: number; // µg/m³
  sulphurDioxide: number; // µg/m³
  healthRecommendation: string;
  dominantPollutant: string;
  inversionTrappingRisk: boolean;
  hourlyAqi?: number[];
  hourlyTimes?: string[];
}

export interface SevereWeatherAlert {
  id: string;
  event: string;
  severity: "advisory" | "watch" | "warning" | "emergency";
  headline: string;
  description: string;
  instruction?: string;
  effective: string;
  expires: string;
  urgency?: "Immediate" | "Expected" | "Future";
}

export interface AstronomyData {
  solarNoon: string;
  sunrise: string;
  sunset: string;
  goldenHourMorning: string;
  goldenHourEvening: string;
  blueHourMorning: string;
  blueHourEvening: string;
  daylightDurationHours: number;
  sunAltitudeDeg: number;
  moonPhase: string;
  moonPhaseIcon: string;
  moonIlluminationPercent: number;
  moonAgeDays: number;
}

export interface PrecisionForecastResponse {
  coordinates: WeatherCoordinates;
  generatedAt: string;
  current: {
    temperature: number;
    rawPhysicsTemp: number;
    apparentTemperature: number;
    weatherCode: number;
    weatherDescription: string;
    humidity: number;
    dewPoint: number;
    dewPointDepression: number;
    pressureHpa: number;
    windSpeedKmh: number;
    windDirectionDeg: number;
    windGustsKmh: number;
    cloudCoverPercent: number;
    uvIndex: number;
    solarRadiationWm2: number;
    visibilityKm: number;
    pblHeightM: number; // Planetary boundary layer height
    capeJkg: number; // Convective Available Potential Energy
  };
  hourly: {
    times: string[];
    mlCorrectedTemp: number[];
    rawPhysicsTemp: number[];
    ecmwfTemp: (number | null)[];
    gfsTemp: (number | null)[];
    iconTemp: (number | null)[];
    hrrrTemp: (number | null)[];
    precipitationProb: number[];
    rainMm: number[];
    humidity: number[];
    windSpeedKmh: number[];
    windDirection?: number[];
    confidenceUpper: number[];
    confidenceLower: number[];
    weatherCode: number[];
    cloudCover: number[];
    isDay: number[];
    dewPoint: number[];
    dewPointDepression: number[];
    conditionText: string[];
  };
  daily: {
    date: string[];
    tempMax: number[];
    tempMin: number[];
    precipitationSum: number[];
    weatherCode: number[];
    sunrise: string[];
    sunset: string[];
  };
  models: ModelPrediction[];
  mlBreakdown: MLCorrectionBreakdown;
  radarNowcast: RadarNowcastPoint[];
  airQuality?: AirQualityData;
  severeAlerts?: SevereWeatherAlert[];
  astronomy?: AstronomyData;
  historicalBenchmark: {
    dates: string[];
    rawModelError: number[];
    mlCorrectedError: number[];
    groundTruthTemp: number[];
    modelPredictedTemp: number[];
    mlPredictedTemp: number[];
    rmseRaw: number;
    rmseMl: number;
    improvementPercent: number;
  };
}

export interface GeminiAtmosphericAnalysis {
  synopticOverview: string;
  microclimateFactors: string[];
  whyStandardAppsFailHere: string;
  ensembleAgreementAnalysis: string;
  radarNowcastingSummary: string;
  mlFeatureImportanceHighlights: {
    feature: string;
    impact: string;
    explanation: string;
  }[];
}

export interface WeatherChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

