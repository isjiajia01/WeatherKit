# Nordic Weather Provider Implementation Report

## 1. What Was Implemented

A production-grade Nordic Weather Provider pipeline was designed, implemented, and fully verified for `@nsringo/weatherkit`. This implementation enriches Apple WeatherKit responses across Nordic countries (Denmark, Norway, Sweden, Finland, Iceland) by combining:
- **MET Norway Locationforecast 2.0 (Complete)**: Primary meteorological forecast engine providing current conditions, hourly forecasts up to 72 hours, and 10-day daily forecasts.
- **MET Norway Nowcast 2.0**: High-resolution radar precipitation nowcasting generating minute-by-minute next-hour forecasts (`forecastNextHour`).
- **DMI Open Data (metObs v2)**: High-resolution Danish meteorological observation layer that discovers nearby active DMI stations (e.g. Kastrup, Copenhagen Landbohøjskolen) and refines real-time temperature, dew point, humidity, barometric pressure, wind speed, wind gust, wind direction, and visibility.
- **Apple WeatherKit Fallback Engine**: Multi-tiered field-level and product-level fallback ensuring that any regional, network, or upstream failure falls back transparently to original Apple Weather data without response disruption.

---

## 2. Architecture & Pipeline

```text
Apple Weather Client (iOS, iPadOS, macOS, watchOS)
                    │
                    ▼ (HTTPS intercept)
            Response.mjs / Response.dev.mjs
                    │
                    ├─ WeatherKit2.decode (selective slot decoding)
                    │
                    ├─ Geographic Routing & Provider Selection
                    │   - Check Settings.Weather.Provider ("Nordic" | "METNorway")
                    │   - Evaluate country code (DK, NO, SE, FI, IS)
                    │
                    ▼
            NordicWeather Composite Provider
                    │
          ┌─────────┴─────────┐
          │                   │ (Denmark only)
          ▼                   ▼
     METNorway               DMI (metObs v2)
  - Locationforecast      - Haversine station lookup (≤ 35 km)
  - Nowcast (Radar)       - Freshness threshold (< 30 min)
          │                   │
          └─────────┬─────────┘
                    ▼
     Deterministic Field Merge & Fallback
     - Denmark: DMI Observation > MET Locationforecast Instant > Apple
     - Nordic: MET Locationforecast > Apple
     - NextHour: MET Nowcast (coverage detection) > Apple NextHour
                    │
                    ├─ WeatherKit2.encode (FlatBuffers binary serialization)
                    ▼
Apple Weather Client (valid, seamless native rendering)
```

---

## 3. Important Files Added & Changed

### New Source Files
- `src/class/METWeatherCode.mjs`: Semantic mapping between 40+ MET Norway symbol codes (and polar/day/night variants) and Apple WeatherKit `WeatherCondition` / `PrecipitationType` enums with unknown code safety.
- `src/class/METNorway.mjs`: Complete client for Locationforecast 2.0 & Nowcast 2.0, supporting RFC-compliant User-Agent, in-memory HTTP cache with `Expires` and `If-Modified-Since`, timeseries normalizers for `CurrentWeather`, `ForecastHourly`, `Daily`, and `Minutely`.
- `src/class/DMI.mjs`: Client for DMI Open Data OGC Features API (`metObs v2`), implementing spatial bounding box lookup, Haversine nearest-station selection, age freshness guard, and observation extraction.
- `src/class/NordicWeather.mjs`: Composite provider orchestrating concurrent requests to MET Norway and DMI, applying deterministic field-level precedence.
- `docs/nordic-provider-design.md`: Architecture design document.

### Modified Source Files
- `src/function/providerNameToLogo.mjs`: Added brand logo resolution for MET Norway (`MET Norway`, `MET Norway · DMI`) and DMI.
- `src/function/database.mjs`: Added default configuration and API settings for MET Norway.
- `src/process/Response.mjs` & `src/process/Response.dev.mjs`: Added provider instantiation, automatic Nordic region replacement, and injection handling for `currentWeather`, `forecastDaily`, `forecastHourly`, and `forecastNextHour`.
- `src/types.d.ts`: Updated `Provider` enums to include `"METNorway"` and `"Nordic"`.
- `package.json`: Added test scripts (`npm test`, `npm run test:nordic`, `npm run test:nordic-live`).

### Test Files & Fixtures
- `tests/fixtures/met_locationforecast_cph.json`: Realistic Copenhagen Locationforecast fixture.
- `tests/fixtures/met_nowcast_cph.json`: Realistic Copenhagen Nowcast fixture.
- `tests/fixtures/dmi_metobs_cph.json`: Realistic Copenhagen DMI metObs station observations fixture.
- `tests/nordicWeather.test.mjs`: Deterministic unit test suite covering condition mapping, DMI distance calculation, station filtering, Locationforecast normalization, Nowcast conversion, DMI merge, and FlatBuffers round-trip encoding.
- `tests/nordicLive.test.mjs`: Live integration test script verifying Copenhagen, Oslo, and Stockholm.

---

## 4. Data Source Matrix

| Product | Denmark (DK) | Norway / Sweden / Finland / Iceland | Non-Nordic / Fallback |
| :--- | :--- | :--- | :--- |
| **Current Weather** | DMI station observation (temp, dew point, humidity, pressure, wind, visibility) layered on MET Locationforecast instant | MET Norway Locationforecast instant | Original Apple WeatherKit |
| **Hourly Forecast** | MET Norway Locationforecast (up to 72 hours) | MET Norway Locationforecast (up to 72 hours) | Original Apple WeatherKit |
| **Daily Forecast** | MET Norway Locationforecast daily aggregation (up to 10 days) | MET Norway Locationforecast daily aggregation (up to 10 days) | Original Apple WeatherKit |
| **Next-Hour Precipitation** | MET Norway Nowcast 2.0 (radar-derived minute-by-minute) | MET Norway Nowcast 2.0 (where covered) | Original Apple WeatherKit |
| **Severe Weather Alerts** | Native WeatherKit / QWeather / ColorfulClouds | Native WeatherKit | Original Apple WeatherKit |
| **Air Quality** | Native Apple / WAQI / configured algorithm | Native Apple / WAQI | Original Apple WeatherKit |

---

## 5. Fallback Behavior

The fallback engine operates on zero-cascade degradation:
1. **DMI Outage or Station Out of Range**: If DMI query fails, times out (4000ms), or no station is within 35 km, `NordicWeather` continues seamlessly using pure MET Norway model data.
2. **Nowcast Out of Coverage (HTTP 422)**: If location is outside MET Norway radar range (e.g., open sea or non-covered zones), Nowcast returns `null`, and `InjectForecastNextHour` retains Apple's native next-hour forecast or omits the slot safely.
3. **MET Norway Outage (5xx / 429 / Timeout)**: If MET Norway is unavailable, `CurrentWeather()`, `ForecastHourly()`, or `Daily()` return `null`, causing `InjectCurrentWeather` and related methods to preserve Apple WeatherKit's original data untouched.
4. **Field-Level Safety**: Unknown weather codes are omitted rather than serialized as `null`, avoiding FlatBuffer silent fallback to `CLEAR`.

---

## 6. Caching Strategy

- **Locationforecast**: In-memory cache keyed by 3-decimal-place coordinates (~110m resolution). Respects upstream HTTP `Expires` header (typically 20–40 min TTL). Re-validates with `If-Modified-Since` (handling 304 Not Modified).
- **Nowcast**: In-memory cache with short TTL (3–5 min aligned with `Expires`).
- **DMI Observations**: In-memory cache with 5 min TTL.
- **Fair Use**: MET Norway requests identify this public fork using its repository contact URL in the User-Agent, following MET Norway's API identification terms.

---

## 7. Tests & Verification Results

```text
> test
> node --test tests/*.test.mjs

ℹ tests 121
ℹ suites 0
ℹ pass 121
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```
- **108 Original Regression Tests**: 100% passing (AirQuality, QWeather, ColorfulClouds, FlatBufferRootProcessor, SelectiveDecode, etc.).
- **10 Nordic Unit Tests**:
  - METWeatherCode symbol mapping & precipitation detection.
  - DMI boundary checks & Haversine distance calculations.
  - DMI observation parsing & nearest station selection.
  - Locationforecast timeseries normalization.
  - Nowcast minute expansion and summary generation.
  - Composite merge rules and resilience under DMI failure.
  - FlatBuffer binary round-trip encode/decode.
  - Provider logo resolution.
- **3 Live Integration Tests**:
  - Live Copenhagen (55.6761, 12.5683): Successfully fetches MET + DMI (Station 06186 Kastrup/Copenhagen), verifies next-hour radar nowcast, encodes and decodes FlatBuffers binary.
  - Live Oslo (59.9139, 10.7522): Successfully fetches pure MET Norway.
  - Live Stockholm (59.3293, 18.0686): Successfully fetches pure MET Norway.
- **Rollup Build**: `./dist/request.bundle.js` and `./dist/response.bundle.js` build cleanly in ~1.4s.
- **Biome Linter/Formatter**: 0 errors, 0 diagnostics across all new code.

---

## 8. How to Enable Nordic Provider

In user settings (via BoxJs or `$argument`):
```json
{
  "Weather": {
    "Provider": "Nordic",
    "Replace": ["DK", "NO", "SE", "FI", "IS"]
  },
  "NextHour": {
    "Provider": "Nordic"
  }
}
```
Or for pure MET Norway without DMI observations:
```json
{
  "Weather": {
    "Provider": "METNorway"
  },
  "NextHour": {
    "Provider": "METNorway"
  }
}
```

---

## 9. Known Limitations

- **MET Norway Nowcast Coverage**: Primarily covers Norway, Sweden, Finland, Denmark, and the Baltic Sea. Locations far offshore or outside Fennoscandia/Denmark will return HTTP 422 and fall back to Apple WeatherKit.
- **DMI Station Density**: In remote rural Denmark, the nearest station may be near the 35 km threshold. If no station is active within 35 km, it automatically uses MET Norway model data.
- **Weather Alerts**: Nordic mode currently leaves severe weather alert handling to Apple WeatherKit or configured alert providers (e.g. QWeather for East Asia), as MET Norway CAP alert ingestion is out of current scope.
