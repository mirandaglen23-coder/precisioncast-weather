import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { getPrecisionForecast, searchLocations, reverseGeocodeCoordinates } from "./server/weatherService.js";
import { generateAtmosphericAnalysis, answerWeatherChatQuestion } from "./server/gemini.js";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Geocoding location search (supports addresses, cities, landmarks, coordinates)
  app.get("/api/weather/search", async (req, res) => {
    try {
      const query = (req.query.q as string) || "";
      const results = await searchLocations(query);
      res.json({ results });
    } catch (error: any) {
      console.error("Search API error:", error);
      res.status(500).json({ error: error.message || "Failed to search locations" });
    }
  });

  // Reverse geocoding endpoint for coordinates
  app.get("/api/weather/reverse-geocode", async (req, res) => {
    try {
      const lat = parseFloat(req.query.lat as string);
      const lon = parseFloat(req.query.lon as string);
      if (isNaN(lat) || isNaN(lon)) {
        return res.status(400).json({ error: "Invalid latitude or longitude" });
      }
      const result = await reverseGeocodeCoordinates(lat, lon);
      res.json(result);
    } catch (error: any) {
      console.error("Reverse geocoding API error:", error);
      res.status(500).json({ error: error.message || "Failed to reverse geocode" });
    }
  });

  // NOAA NWS Live Severe Weather Active Alerts & Warning Polygons
  app.get("/api/weather/alerts", async (req, res) => {
    try {
      const lat = parseFloat(req.query.lat as string);
      const lon = parseFloat(req.query.lon as string);
      if (isNaN(lat) || isNaN(lon)) {
        return res.status(400).json({ error: "Invalid latitude or longitude" });
      }

      // Query NOAA Weather API for point-specific active alerts
      const pointUrl = `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`;
      const response = await fetch(pointUrl, {
        headers: {
          "User-Agent": "(PrecisionCast Weather, contact@precisioncast.app)",
          "Accept": "application/geo+json",
        },
      });

      if (!response.ok) {
        // Return empty alerts gracefully if outside US coverage or NOAA throttled
        return res.json({ alerts: [], features: [] });
      }

      const data: any = await response.json();
      const features = data.features || [];
      const alerts = features.map((f: any) => ({
        id: f.properties.id || f.id,
        event: f.properties.event,
        severity: (f.properties.severity || "Unknown").toLowerCase(),
        headline: f.properties.headline || f.properties.event,
        description: f.properties.description || "",
        instruction: f.properties.instruction || "",
        effective: f.properties.effective,
        expires: f.properties.expires,
        areaDesc: f.properties.areaDesc,
        geometry: f.geometry,
      }));

      res.json({ alerts, features });
    } catch (error: any) {
      console.warn("NOAA Alerts API warning:", error.message);
      res.json({ alerts: [], features: [] });
    }
  });

  // Hyper-local ML weather prediction
  app.get("/api/weather/predict", async (req, res) => {
    try {
      const lat = parseFloat(req.query.lat as string);
      const lon = parseFloat(req.query.lon as string);
      const name = req.query.name as string | undefined;
      const elevation = req.query.elevation ? parseFloat(req.query.elevation as string) : undefined;

      if (isNaN(lat) || isNaN(lon)) {
        return res.status(400).json({ error: "Invalid or missing latitude/longitude query parameters" });
      }

      const forecast = await getPrecisionForecast({
        latitude: lat,
        longitude: lon,
        locationName: name,
        elevation,
      });

      res.json(forecast);
    } catch (error: any) {
      console.error("Predict API error:", error);
      res.status(500).json({ error: error.message || "Failed to generate precision forecast" });
    }
  });

  // Gemini AI Atmospheric Reasoning & Diagnostic Synthesis
  app.post("/api/gemini/analyze", async (req, res) => {
    try {
      const forecast = req.body;
      const unit = (req.body.unit as "C" | "F") || "F";
      if (!forecast || !forecast.coordinates) {
        return res.status(400).json({ error: "Missing forecast payload in request body" });
      }

      const analysis = await generateAtmosphericAnalysis(forecast, unit);
      res.json(analysis);
    } catch (error: any) {
      console.error("Gemini Analysis API error:", error);
      res.status(500).json({ error: error.message || "Failed to generate atmospheric analysis" });
    }
  });

  // Gemini AI Conversational Weather Assistant (Layman Q&A)
  app.post("/api/gemini/chat", async (req, res) => {
    try {
      const { message, history, forecast } = req.body;
      if (!message || !forecast) {
        return res.status(400).json({ error: "Missing message or forecast context in request body" });
      }

      const reply = await answerWeatherChatQuestion(message, history || [], forecast);
      res.json({ reply });
    } catch (error: any) {
      console.error("Gemini Chat API error:", error);
      res.status(500).json({ error: error.message || "Failed to generate chat response" });
    }
  });

  // Vite development middleware or static production serving
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[PrecisionCast] Server listening on http://0.0.0.0:${PORT}`);

    // Render Free-Tier Anti-Spin-Down Self-Ping
    const publicUrl = process.env.RENDER_EXTERNAL_URL || process.env.KEEP_ALIVE_URL;
    if (publicUrl) {
      console.log(`[Keep-Alive] Initialized self-ping service for: ${publicUrl}`);
      setInterval(async () => {
        try {
          const res = await fetch(`${publicUrl.replace(/\/$/, "")}/api/health`);
          if (res.ok) {
            console.log(`[Keep-Alive] Self-ping successful at ${new Date().toISOString()}`);
          }
        } catch (err: any) {
          console.warn(`[Keep-Alive] Ping warning: ${err.message}`);
        }
      }, 10 * 60 * 1000); // Every 10 minutes (prevents 15m idle shutdown)
    }
  });
}

startServer().catch((err) => {
  console.error("Failed to start PrecisionCast server:", err);
  process.exit(1);
});
