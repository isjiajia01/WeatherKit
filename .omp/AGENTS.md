# @nsringo/weatherkit — Project Agent Guide

## Build & Test Commands
- Install: `NODE_AUTH_TOKEN=$(gh auth token) npm install`
- Test: `node --test tests/*.test.mjs`
- Single test: `node --test tests/<filename>.test.mjs`
- Build: `npm run build` (Rollup compiles `src/request.js` and `src/response.js` to `dist/`)
- Lint & format check: `npx @biomejs/biome check src tests`

## Architecture & Conventions
- **ESM**: Project uses native ECMAScript modules (`"type": "module"`, `.mjs` files for internal modules, `.js` for entrypoints).
- **FlatBuffers Pipeline**: Apple WeatherKit responses are encoded as Apple FlatBuffers (`application/vnd.apple.flatbuffer`).
  - Decoder & Encoder: `src/class/WeatherKit2.mjs` with root processor `@nsnanocat/flatbuffer-root` and FlatBuffers schemas `@nsringo/weatherkit`.
  - Selective slot decode & encode: Only requested dataSets are decoded and encoded to preserve unmodeled slots and avoid overhead.
- **Provider Architecture**:
  - `src/class/`: Domain & provider classes (`Weather`, `ForecastNextHour`, `ColorfulClouds`, `QWeather`, `WAQI`, etc.).
  - `src/process/`: Core interception logic (`Request.mjs`, `Response.mjs`, dev variants).
  - `src/function/`: Utilities (`database.mjs`, `setENV.mjs`, `parseWeatherKitURL.mjs`, `providerNameToLogo.mjs`).
- **Data Sets**:
  - `currentWeather`: Current conditions (asOf, temperature, humidity, pressure, wind, conditionCode, etc.).
  - `forecastHourly`: 1-hour intervals (temperature, apparent temp, precipitationChance, conditionCode, etc.).
  - `forecastDaily`: Daily aggregates (temperatureMin/Max, daytimeForecast, overnightForecast, etc.).
  - `forecastNextHour`: Minute-by-minute precipitation nowcasting (minutes, summary, condition).
  - `airQuality`: AQI & pollutants.
  - `weatherAlerts`: Severe weather alerts.
- **Design Invariants**:
  - Never overwrite existing providers or break their contracts.
  - Opaque FlatBuffer slots must remain untouched.
  - Unknown condition enum values must not be sent to FlatBuffer encoder (preventing default CLEAR).
  - Provide fallback to original Apple WeatherKit data when third-party provider calls fail or are out of coverage.
