# Nordic Weather Provider Architecture Note

## 1. Executive Summary & Objective

This document defines the architecture for the **Nordic Weather Provider** integration in `@nsringo/weatherkit`.
The objective is to enrich Apple Weather data for Nordic regions (Denmark, Norway, Sweden, Finland, Iceland) by combining:
1. **MET Norway Locationforecast 2.0 (Complete)** as primary forecast provider (hourly, daily, current model conditions).
2. **MET Norway Nowcast 2.0** for short-term precipitation radar nowcasting (next-hour minute-by-minute forecast).
3. **DMI Open Data (metObs v2)** as a Denmark-specific high-resolution observational enhancement layer.
4. **Apple WeatherKit** as robust, field-level and product-level fallback.

---

## 2. Current Repository Architecture Analysis

- **Traffic Interception Pipeline**:
  - `src/process/Request.mjs`: Rewrites incoming requests from Apple Weather client, intercepts `/api/v1/weatherAlerts`, `/api/v1/airQualityScale/...`, and injects query parameters.
  - `src/process/Response.mjs`: Receives response from Apple (`weatherkit.apple.com/api/v2/weather/...`), parses FlatBuffers payload via `WeatherKit2.decode`, identifies active dataSets (`currentWeather`, `forecastDaily`, `forecastHourly`, `forecastNextHour`, `weatherAlerts`, `airQuality`), calls `Inject*` methods for each product, and re-encodes via `WeatherKit2.encode`.
- **FlatBuffer Root Processor**:
  - Built on `@nsnanocat/flatbuffer-root` and `@nsringo/weatherkit` schemas.
  - Employs selective slot decoding: only configured and requested slots are decoded into JS objects; untouched and unknown slots remain as opaque binary slices, ensuring complete binary compatibility and zero slot corruption.
- **Provider Protocol**:
  - Existing providers (`ColorfulClouds`, `QWeather`) implement domain methods:
    - `CurrentWeather()` -> returns `{ metadata, ...currentWeatherFields }`
    - `ForecastHourly(steps, begin)` -> returns `{ metadata, hours: [...] }`
    - `Daily(steps, begin)` -> returns `{ metadata, days: [...] }`
    - `Minutely()` -> returns `{ metadata, forecastNextHour: { ... } }`
- **Merging & Attribution**:
  - `Weather.mergeForecast(to, from)`: Timestamp-aligned array merging preserving Apple-exclusive fields while overriding provider fields.
  - `providerNameToLogo(name)`: Attaches provider logo icon or fallback.

---

## 3. Proposed Integration Points & Components

```text
Apple Weather Client
        │
        ▼ (HTTPS)
   Request Hook (Request.mjs)
        │
        ▼ (Apple WeatherKit Backend)
   Response Interceptor (Response.mjs)
        │
        ├─ FlatBuffers Decode (WeatherKit2.decode)
        │
        ├─ Provider Selection (Settings.Weather.Provider == "Nordic" | "METNorway")
        │       │
        │       ▼
        │  NordicWeather / METNorway Provider
        │       │
        │       ├── Locationforecast 2.0 (MET Norway) ─────────────┐
        │       │   - Current Weather                              │
        │       │   - Hourly Forecast (up to 60+ hours)            │
        │       │   - Daily Forecast (up to 10 days)               │
        │       │                                                  │
        │       ├── Nowcast 2.0 (MET Norway) ──────────────────────┤
        │       │   - Next-Hour Precipitation (5-min intervals)    ├──> Normalization & Field Merge
        │       │   - Coverage detection (422 outside area)        │
        │       │                                                  │
        │       └── DMI Open Data metObs v2 (Denmark only) ────────┘
        │           - Real-time station observations (Kastrup, etc.)
        │           - Corrects temperature, humidity, pressure, wind
        │
        ├─ Field-level Fallback & Error Isolation
        │   - If DMI fails or station too far -> keep MET model data
        │   - If Nowcast fails/outside coverage -> keep Apple NextHour or omit
        │   - If MET fails -> retain original Apple WeatherKit data
        │
        ├─ FlatBuffers Re-Encode (WeatherKit2.encode)
        │
        ▼ (Binary FlatBuffer Response)
   Apple Weather Client (iOS / iPadOS / macOS / watchOS)
```

### New Modules
1. `src/class/METNorway.mjs`:
   - Handles network requests to `https://api.met.no/weatherapi/locationforecast/2.0/complete` and `/nowcast/2.0/complete`.
   - Sends strictly compliant `User-Agent` (`iRingoWeatherKit/3.3.2 (https://github.com/NSRingo/WeatherKit; isjiajia01@gmail.com)`).
   - In-memory cache with HTTP `Expires` / `Last-Modified` / `If-Modified-Since` awareness.
   - Converts MET GeoJSON timeseries into normalized Apple WeatherKit domain representations.
2. `src/class/DMI.mjs`:
   - Handles queries to `https://opendataapi.dmi.dk/v2/metObs/collections/observation/items`.
   - Spatial station lookup: fetches observations within bounding box around coordinates, selects closest active station within threshold (max 30 km).
   - Freshness guard: rejects observations older than 30 minutes.
   - Extracts real-time `temp_dry`, `temp_dew`, `humidity`, `pressure_at_sea`, `wind_speed`, `wind_dir`, `wind_max`, `precip_past10min`, `visibility`, `cloud_cover`.
3. `src/class/NordicWeather.mjs`:
   - Composite provider unifying MET Norway and DMI.
   - Coordinates concurrent fetches (MET Locationforecast + MET Nowcast + DMI).
   - Applies deterministic field precedence:
     - In Denmark: DMI Observation (fresh & near) > MET Locationforecast Instant > Apple Fallback.
     - In other Nordic countries: MET Locationforecast > Apple Fallback.
     - Next-hour precipitation: MET Nowcast > Apple Fallback.
4. `src/class/METWeatherCode.mjs`:
   - Authoritative mapping between MET Norway `symbol_code` strings and Apple WeatherKit `WeatherCondition` enums.
   - Covers 80+ standard MET symbol codes including day/night and polarity variations.

---

## 4. Geographic Routing Policy

- **Denmark (DK)**:
  - Latitude: 54.5°N - 57.9°N, Longitude: 8.0°E - 15.3°E.
  - Providers: MET Norway Locationforecast + MET Norway Nowcast + DMI Observation Layer + Apple Fallback.
- **Norway (NO)**:
  - Providers: MET Norway Locationforecast + MET Norway Nowcast + Apple Fallback.
- **Sweden (SE)**:
  - Providers: MET Norway Locationforecast + MET Norway Nowcast + Apple Fallback.
- **Finland (FI)**:
  - Providers: MET Norway Locationforecast + MET Norway Nowcast + Apple Fallback.
- **Iceland (IS)**:
  - Providers: MET Norway Locationforecast + Apple Fallback.
- **Other Countries**:
  - Preserves standard existing behavior / Apple WeatherKit / other configured provider.

---

## 5. Normalization & Mapping Strategy

### 5.1 Weather Conditions
MET Norway symbol codes (e.g. `clearsky_day`, `partlycloudy_night`, `fair_day`, `cloudy`, `fog`, `heavyrain`, `heavyrainshowers_day`, `lightsnow`, `sleet`, `thunder`, `heavysnowshowersandthunder_day`) map directly to Apple FlatBuffer enums:
- `clearsky_*` -> `CLEAR`
- `fair_*` -> `MOSTLY_CLEAR`
- `partlycloudy_*` -> `PARTLY_CLOUDY`
- `cloudy` -> `CLOUDY`
- `fog` -> `FOGGY`
- `lightrain` / `lightrainshowers_*` -> `DRIZZLE`
- `rain` / `rainshowers_*` -> `RAIN`
- `heavyrain` / `heavyrainshowers_*` -> `HEAVY_RAIN`
- `lightsnow` / `lightsnowshowers_*` -> `FLURRIES`
- `snow` / `snowshowers_*` -> `SNOW`
- `heavysnow` / `heavysnowshowers_*` -> `HEAVY_SNOW`
- `sleet` / `sleetshowers_*` -> `SLEET`
- `rainandthunder` / `heavyrainandthunder` -> `THUNDERSTORMS`
- Defends against unknown enums: returns `null` so the field is omitted, avoiding FlatBuffer silent fallback to `CLEAR`.

### 5.2 Unit Harmonization
- Temperature: Celsius (°C)
- Pressure: hPa
- Humidity: Percentage (0 - 100)
- Wind speed & gusts: m/s (Apple WeatherKit internally stores m/s, client formats to km/h or mph)
- Wind direction: degrees (0 - 360)
- Precipitation: mm (hourly accumulation / nowcast rate mm/h)
- Visibility: meters (m)
- UV Index: 0 - 11 integer scale

### 5.3 Daily Forecast Aggregation
MET Norway provides hourly timeseries. Daily aggregates are computed by grouping timeseries entries into local calendar day boundaries:
- `temperatureMin` / `temperatureMax`: min/max of hourly temperatures across the day.
- `temperatureMinTime` / `temperatureMaxTime`: timestamp of min/max temperature.
- `precipitationAmount`: sum of hourly precipitation amounts.
- `precipitationChance`: maximum probability of precipitation.
- `daytimeForecast`: dominant condition and aggregates between 06:00 and 18:00 local time.
- `overnightForecast`: dominant condition and aggregates between 18:00 and 06:00 local time.

### 5.4 Next-Hour Precipitation
- MET Nowcast provides 5-minute timestep precipitation rates (`precipitation_rate` in mm/h) for the next 90-120 minutes.
- `ForecastNextHour.Minute`: Converts 5-min intervals into 1-minute steps (interpolated) or 60 minute entries.
- Generates `summary` and `condition` sequences using the existing `ForecastNextHour` state machine.

---

## 6. Multi-Tier Fallback & Resilience Strategy

1. **Network Timeouts**:
   - Primary (MET Locationforecast): 8000 ms.
   - Enhancement (DMI): 4000 ms (short deadline so it never delays response).
   - Nowcast: 5000 ms.
2. **Graceful Degradation**:
   - DMI fails -> Use MET model data seamlessly without logging errors.
   - MET Nowcast returns 422 (outside coverage) or fails -> Retain Apple's `forecastNextHour` (or omit if null).
   - MET Locationforecast fails (5xx, 429, timeout) -> Retain original Apple WeatherKit `currentWeather`, `forecastHourly`, `forecastDaily`.
   - Partial field missing -> Omit specific field; do not destroy entire slot.

---

## 7. Caching & Performance

- In-memory cache keyed by rounded coordinates (3 decimal places ≈ 110m precision):
  - Locationforecast: Respects `Expires` header (typically 20-40 min TTL).
  - Nowcast: Respects `Expires` header (typically 3-5 min TTL).
  - DMI Observations: 5 min TTL.
- Concurrent execution: `Promise.allSettled` for MET Locationforecast, Nowcast, and DMI, bounded by timeouts.

---

## 8. Testing & Validation Strategy

1. **Unit Tests (`node --test`)**:
   - MET Locationforecast parser & timeseries extraction.
   - MET Nowcast next-hour precipitation mapping.
   - DMI station distance calculation & observation parameter extraction.
   - Weather condition mapping (all 80+ symbol codes).
   - Field-level merge with DMI and Apple fallback.
   - Geographic routing (Copenhagen, Aarhus, Oslo, Stockholm, Helsinki, London).
   - DST transitions and epoch timestamp validity.
   - Error handling (422 outside coverage, 429 rate limit, 500 server error, malformed JSON).
   - Regression tests: existing ColorfulClouds and QWeather tests must continue passing (108/108 tests).
2. **Live Validation Tool**:
   - `tests/nordicLive.test.mjs` verifying live requests to `api.met.no` and `opendataapi.dmi.dk` for Copenhagen (55.6761, 12.5683), Oslo, and Stockholm.
