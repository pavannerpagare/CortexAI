
import { searchTool } from "../config/tavily.js";

const OPEN_METEO_GEOCODING_URL =
  "https://geocoding-api.open-meteo.com/v1/search";

const OPEN_METEO_FORECAST_URL =
  "https://api.open-meteo.com/v1/forecast";

const WEATHER_INTENT =
  /\b(weather|forecast|humidity|rainfall|precipitation|wind speed|wind direction|current conditions|temperature)\b/i;

const HISTORICAL_WEATHER =
  /\b(historical weather|past weather|weather history|recorded weather|weather data for \d{4}|weather between)\b/i;

const WEATHER_CODES = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snowfall",
  73: "Moderate snowfall",
  75: "Heavy snowfall",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};

function getCheckedOn() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Extract a location following wording such as:
 * "weather in Pune", "forecast for Pimpri, Maharashtra",
 * or "current temperature at Mumbai".
 */

function extractWeatherLocation(prompt) {
  const text = String(prompt || "").trim();

  const pattern =
    /\b(?:weather|forecast|conditions|temperature|humidity|rainfall|precipitation|wind)\b[\s\S]{0,100}?\b(?:in|for|at|near)\s+(.+?)(?=,\s*(?:including|with|showing|covering|plus)\b|\s+(?:including|with|showing|covering)\b|[.!?;]|$)/i;

  const match = text.match(pattern);

  if (!match) {
    return "";
  }

  return match[1]
    .trim()
    .replace(/[,. ]+$/, "");
}


async function fetchJson(url, label) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) {
    throw new Error(`${label} returned HTTP ${response.status}.`);
  }

  const data = await response.json();

  if (data?.error) {
    throw new Error(
      `${label} error: ${data.reason || "Unknown API error."}`,
    );
  }

  return data;
}

function formatValue(value, unit = "") {
  return value === null || value === undefined
    ? "Not available"
    : `${value}${unit}`;
}

/**
 * Retrieve actual weather data instead of relying on an LLM's memory.
 */
async function researchLiveWeather(prompt, checkedOn) {
  const location =
    extractWeatherLocation(prompt) ||
    process.env.WEATHER_DEFAULT_LOCATION?.trim();

  if (!location) {
    throw new Error(
      "A location is required for a weather report. " +
        "Specify a city in your prompt, or configure " +
        "WEATHER_DEFAULT_LOCATION in the Agent service .env file.",
    );
  }

  // Step 1: Resolve the location to coordinates.
  const geocodingUrl = new URL(OPEN_METEO_GEOCODING_URL);
  geocodingUrl.searchParams.set("name", location);
  geocodingUrl.searchParams.set("count", "5");
  geocodingUrl.searchParams.set("language", "en");
  geocodingUrl.searchParams.set("format", "json");

  const geocoding = await fetchJson(
    geocodingUrl,
    "Open-Meteo geocoding",
  );

  const place = geocoding.results?.[0];

  if (!place) {
    throw new Error(
      `No matching location was found for "${location}". ` +
        "Include the city and state or country.",
    );
  }

  // Step 2: Retrieve current conditions and a seven-day outlook.
  const forecastUrl = new URL(OPEN_METEO_FORECAST_URL);

  forecastUrl.searchParams.set("latitude", String(place.latitude));
  forecastUrl.searchParams.set("longitude", String(place.longitude));

  forecastUrl.searchParams.set(
    "current",
    [
      "temperature_2m",
      "relative_humidity_2m",
      "apparent_temperature",
      "is_day",
      "precipitation",
      "rain",
      "weather_code",
      "cloud_cover",
      "wind_speed_10m",
      "wind_direction_10m",
    ].join(","),
  );

  forecastUrl.searchParams.set(
    "daily",
    [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_probability_max",
      "precipitation_sum",
      "wind_speed_10m_max",
    ].join(","),
  );

  forecastUrl.searchParams.set("timezone", "auto");
  forecastUrl.searchParams.set("forecast_days", "7");

  const weather = await fetchJson(
    forecastUrl,
    "Open-Meteo forecast",
  );

  const current = weather.current;
  const daily = weather.daily;

  if (
    !current ||
    current.temperature_2m === null ||
    current.temperature_2m === undefined
  ) {
    throw new Error(
      `No current temperature was returned for ${place.name}. ` +
        "No weather report was generated.",
    );
  }

  const locationName = [
    place.name,
    place.admin1,
    place.country,
  ]
    .filter(Boolean)
    .join(", ");

  const weatherDescription =
    WEATHER_CODES[current.weather_code] ||
    "Weather description unavailable";

  const lines = [
    "LIVE WEATHER DATA",
    `Requested location: ${location}`,
    `Resolved location: ${locationName}`,
    `Coordinates: ${place.latitude}, ${place.longitude}`,
    `Report verification date: ${checkedOn}`,
    `Weather data timestamp: ${current.time || "Not supplied"}`,
    `Local time zone: ${weather.timezone || "Not supplied"}`,
    "",
    "CURRENT CONDITIONS",
    `Conditions: ${weatherDescription}`,
    `Temperature: ${formatValue(current.temperature_2m, " °C")}`,
    `Feels-like temperature: ${formatValue(current.apparent_temperature, " °C")}`,
    `Relative humidity: ${formatValue(current.relative_humidity_2m, "%")}`,
    `Wind speed: ${formatValue(current.wind_speed_10m, " km/h")}`,
    `Wind direction: ${formatValue(current.wind_direction_10m, "°")}`,
    `Cloud cover: ${formatValue(current.cloud_cover, "%")}`,
    `Precipitation: ${formatValue(current.precipitation, " mm")}`,
    `Rain: ${formatValue(current.rain, " mm")}`,
    "",
    "DAILY FORECAST",
  ];

  if (Array.isArray(daily?.time)) {
    daily.time.forEach((date, index) => {
      const code = daily.weather_code?.[index];

      lines.push(
        `${date}: ${WEATHER_CODES[code] || "Conditions unavailable"}; ` +
          `high ${formatValue(daily.temperature_2m_max?.[index], " °C")}; ` +
          `low ${formatValue(daily.temperature_2m_min?.[index], " °C")}; ` +
          `precipitation chance ${formatValue(daily.precipitation_probability_max?.[index], "%")}; ` +
          `precipitation total ${formatValue(daily.precipitation_sum?.[index], " mm")}; ` +
          `maximum wind ${formatValue(daily.wind_speed_10m_max?.[index], " km/h")}`,
      );
    });
  }

  lines.push(
    "",
    "SOURCE AND ATTRIBUTION",
    "Provider: Open-Meteo",
    `Forecast data URL: ${forecastUrl.toString()}`,
    "Documentation: https://open-meteo.com/en/docs",
    "Attribution: Open-Meteo weather data, CC BY 4.0.",
    "",
    "IMPORTANT",
    "These are weather-model/API values for the resolved location. " +
      "They should not be described as direct measurements from a local weather station.",
    "Use the timestamp and time zone above when reporting when the conditions apply.",
  );

  return {
    checkedOn,
    context: lines.join("\n"),
  };
}

/**
 * Existing Tavily research path for non-weather topics.
 */
async function researchWithTavily(prompt, checkedOn) {
  const query = `
Research the latest reliable information for this request:
${prompt}

Prioritize official sources and reputable statistical databases.
Include exact dates, figures, source URLs, and publication dates.
Cross-check important totals against multiple reliable sources.
Clearly identify conflicting or unverified information.
If sources are irrelevant or insufficient, state this clearly.
`;

  const results = await searchTool.invoke({ query });

  const context =
    typeof results === "string"
      ? results
      : JSON.stringify(results ?? [], null, 2);

  if (
    !context.trim() ||
    ["[]", "{}", "null", '""'].includes(context.trim())
  ) {
    throw new Error(
      "Live research returned no usable sources. " +
        "Cannot verify current facts.",
    );
  }

  return {
    checkedOn,
    context: context.slice(0, 12000),
  };
}

export async function researchCurrentFacts(prompt) {
  const request = String(prompt || "").trim();

  if (!request) {
    throw new Error("A research prompt is required.");
  }

  const checkedOn = getCheckedOn();

  const isWeatherRequest =
    WEATHER_INTENT.test(request) &&
    !HISTORICAL_WEATHER.test(request);

  if (isWeatherRequest) {
    try {
      return await researchLiveWeather(request, checkedOn);
    } catch (error) {
      console.error(
        "[research] Live weather retrieval failed:",
        error.message,
      );

      // Fail explicitly instead of generating a report containing
      // invented conditions or generic advice in place of weather data.
      throw new Error(
        `Unable to retrieve live weather: ${error.message}`,
      );
    }
  }

  return researchWithTavily(request, checkedOn);
}
