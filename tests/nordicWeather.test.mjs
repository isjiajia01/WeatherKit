import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Console } from "@nsnanocat/util";
import { ByteBuffer } from "flatbuffers";
import DMI from "../src/class/DMI.mjs";
import METNorway from "../src/class/METNorway.mjs";
import METWeatherCode from "../src/class/METWeatherCode.mjs";
import NordicWeather from "../src/class/NordicWeather.mjs";
import WeatherKit2 from "../src/class/WeatherKit2.mjs";
import providerNameToLogo from "../src/function/providerNameToLogo.mjs";

Console.logLevel = "OFF";

// Load recorded fixtures
const [locationforecastFixture, nowcastFixture, dmiFixture] = await Promise.all([
    readFile(new URL("./fixtures/met_locationforecast_cph.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("./fixtures/met_nowcast_cph.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("./fixtures/dmi_metobs_cph.json", import.meta.url), "utf8").then(JSON.parse),
]);

test("METWeatherCode correctly maps all symbol categories and suffixes to Apple WeatherConditions", () => {
    // Clear & clouds
    assert.equal(METWeatherCode.toConditionCode("clearsky_day"), "CLEAR");
    assert.equal(METWeatherCode.toConditionCode("clearsky_night"), "CLEAR");
    assert.equal(METWeatherCode.toConditionCode("clearsky_polartwilight"), "CLEAR");
    assert.equal(METWeatherCode.toConditionCode("fair_day"), "MOSTLY_CLEAR");
    assert.equal(METWeatherCode.toConditionCode("partlycloudy_day"), "PARTLY_CLOUDY");
    assert.equal(METWeatherCode.toConditionCode("partlycloudy_night"), "PARTLY_CLOUDY");
    assert.equal(METWeatherCode.toConditionCode("cloudy"), "CLOUDY");
    assert.equal(METWeatherCode.toConditionCode("fog"), "FOGGY");

    // Rain
    assert.equal(METWeatherCode.toConditionCode("lightrain"), "DRIZZLE");
    assert.equal(METWeatherCode.toConditionCode("lightrainshowers_day"), "DRIZZLE");
    assert.equal(METWeatherCode.toConditionCode("rain"), "RAIN");
    assert.equal(METWeatherCode.toConditionCode("rainshowers_night"), "RAIN");
    assert.equal(METWeatherCode.toConditionCode("heavyrain"), "HEAVY_RAIN");
    assert.equal(METWeatherCode.toConditionCode("heavyrainshowers_day"), "HEAVY_RAIN");

    // Sleet & Snow
    assert.equal(METWeatherCode.toConditionCode("sleet"), "WINTRY_MIX");
    assert.equal(METWeatherCode.toConditionCode("lightsleetshowers_day"), "WINTRY_MIX");
    assert.equal(METWeatherCode.toConditionCode("lightsnow"), "FLURRIES");
    assert.equal(METWeatherCode.toConditionCode("snow"), "SNOW");
    assert.equal(METWeatherCode.toConditionCode("snowshowers_day"), "SNOW");
    assert.equal(METWeatherCode.toConditionCode("heavysnow"), "HEAVY_SNOW");
    assert.equal(METWeatherCode.toConditionCode("heavysnowandthunder"), "BLIZZARD");

    // Thunder
    assert.equal(METWeatherCode.toConditionCode("rainandthunder"), "THUNDERSTORMS");
    assert.equal(METWeatherCode.toConditionCode("lightrainshowersandthunder_day"), "ISOLATED_THUNDERSTORMS");

    // Typo tolerance in official MET codes
    assert.equal(METWeatherCode.toConditionCode("lightssnowshowersandthunder_day"), "THUNDERSTORMS");
    assert.equal(METWeatherCode.toConditionCode("lightssleetshowersandthunder_day"), "THUNDERSTORMS");

    // Unknown code defense
    assert.equal(METWeatherCode.toConditionCode("non_existent_weather_code"), null);
    assert.deepEqual(METWeatherCode.toConditionCodeField("non_existent_weather_code"), {});
    assert.deepEqual(METWeatherCode.toConditionCodeField("rain_day"), { conditionCode: "RAIN" });
});

test("METWeatherCode toPrecipitationType detects precipitation types reliably", () => {
    assert.equal(METWeatherCode.toPrecipitationType("clearsky_day"), "CLEAR");
    assert.equal(METWeatherCode.toPrecipitationType("rain_day"), "RAIN");
    assert.equal(METWeatherCode.toPrecipitationType("lightrainshowers_night"), "RAIN");
    assert.equal(METWeatherCode.toPrecipitationType("snow_day"), "SNOW");
    assert.equal(METWeatherCode.toPrecipitationType("heavysnowshowers_night"), "SNOW");
    assert.equal(METWeatherCode.toPrecipitationType("sleet_day"), "SLEET");
    assert.equal(METWeatherCode.toPrecipitationType("lightsleetshowers_night"), "SLEET");
});

test("DMI isDenmark correctly identifies Danish boundaries and rejects non-Danish coordinates", () => {
    const cph = new DMI({ latitude: 55.6761, longitude: 12.5683, country: "DK" });
    assert.equal(cph.isDenmark(), true);

    const aarhus = new DMI({ latitude: 56.1629, longitude: 10.2039 });
    assert.equal(aarhus.isDenmark(), true);

    const bornholm = new DMI({ latitude: 55.1328, longitude: 14.9142 });
    assert.equal(bornholm.isDenmark(), true);

    const oslo = new DMI({ latitude: 59.9139, longitude: 10.7522, country: "NO" });
    assert.equal(oslo.isDenmark(), false);

    const stockholm = new DMI({ latitude: 59.3293, longitude: 18.0686, country: "SE" });
    assert.equal(stockholm.isDenmark(), false);

    const helsinki = new DMI({ latitude: 60.1699, longitude: 24.9384, country: "FI" });
    assert.equal(helsinki.isDenmark(), false);

    const london = new DMI({ latitude: 51.5074, longitude: -0.1278, country: "GB" });
    assert.equal(london.isDenmark(), false);
});

test("DMI calculateDistance accurately computes distance between geographical points", () => {
    // Copenhagen downtown (55.6761, 12.5683) to Kastrup Airport (55.6140, 12.6454) is approx 8 km
    const dist = DMI.calculateDistance(55.6761, 12.5683, 55.614, 12.6454);
    assert.ok(dist >= 7.5 && dist <= 9.0, `Expected ~8 km, got ${dist}`);
});

test("DMI extracts nearest atmospheric station observation and normalizes units", async () => {
    const dmi = new DMI({ latitude: 55.6761, longitude: 12.5683, country: "DK" });
    // Mock fetchObservations with fixture
    dmi.fetchObservations = async () => dmiFixture;

    const enhancement = await dmi.getObservationEnhancement({ maxAgeMs: Number.POSITIVE_INFINITY });
    assert.ok(enhancement, "Enhancement should be extracted");
    assert.equal(enhancement.providerName, "Danish Meteorological Institute");
    assert.ok(enhancement.distanceKm <= 35, "Station should be within 35 km");
    assert.ok(typeof enhancement.temperature === "number", "Temperature should be a number");
    assert.ok(typeof enhancement.humidity === "number", "Humidity should be a number");
    assert.ok(enhancement.humidity >= 0 && enhancement.humidity <= 100, "Humidity in valid percent range");
    assert.ok(enhancement.observedAt > 0, "observedAt timestamp present");
});

test("METNorway parses Locationforecast fixture into valid Apple WeatherKit products", async () => {
    const met = new METNorway({ latitude: 55.6761, longitude: 12.5683, language: "en", country: "DK" });
    met.fetchLocationforecast = async () => locationforecastFixture;

    // 1. CurrentWeather
    const current = await met.CurrentWeather();
    assert.ok(current, "Current weather should be generated");
    assert.equal(current.metadata.providerName, "MET Norway");
    assert.ok(typeof current.temperature === "number");
    assert.ok(typeof current.pressure === "number");
    assert.ok(typeof current.humidity === "number");
    assert.ok(typeof current.conditionCode === "string");
    assert.ok(Array.isArray(current.precipitationAmountNext1hByType));

    // 2. ForecastHourly
    const hourly = await met.ForecastHourly(48);
    assert.ok(hourly, "Hourly forecast should be generated");
    assert.equal(hourly.hours.length, 48);
    for (const h of hourly.hours) {
        assert.ok(h.forecastStart > 0);
        assert.ok(typeof h.temperature === "number");
        assert.ok(typeof h.humidity === "number");
        assert.ok(typeof h.conditionCode === "string");
        assert.ok(h.uvIndex >= 0 && h.uvIndex <= 11);
    }

    // 3. Daily
    const daily = await met.Daily(7);
    assert.ok(daily, "Daily forecast should be generated");
    assert.ok(daily.days.length > 0 && daily.days.length <= 7);
    for (const d of daily.days) {
        assert.ok(d.forecastStart < d.forecastEnd);
        assert.ok(d.temperatureMin <= d.temperatureMax);
        assert.ok(d.temperatureMinTime >= d.forecastStart);
        assert.ok(d.temperatureMaxTime >= d.forecastStart);
        assert.ok(typeof d.conditionCode === "string");
        assert.ok(Array.isArray(d.precipitationAmountByType));
        if (d.daytimeForecast) {
            assert.ok(Array.isArray(d.daytimeForecast.precipitationAmountByType));
            assert.equal(d.daytimeForecast.daylight, true);
        }
        if (d.overnightForecast) {
            assert.ok(Array.isArray(d.overnightForecast.precipitationAmountByType));
            assert.equal(d.overnightForecast.daylight, false);
        }
    }
});

test("METNorway Nowcast fixture parses into valid Apple WeatherKit ForecastNextHour", async () => {
    const met = new METNorway({ latitude: 55.6761, longitude: 12.5683, language: "en", country: "DK" });
    met.fetchNowcast = async () => nowcastFixture;

    const nextHour = await met.Minutely();
    assert.ok(nextHour, "ForecastNextHour should be created");
    assert.equal(nextHour.minutes.length, 60, "Should have exactly 60 minutes for next hour");
    assert.ok(Array.isArray(nextHour.minutes));
    assert.ok(nextHour.minutes.length >= 60, "Should have at least 60 minutes");
    assert.ok(Array.isArray(nextHour.summary));
    assert.ok(Array.isArray(nextHour.condition));

    for (let i = 0; i < nextHour.minutes.length; i++) {
        const m = nextHour.minutes[i];
        assert.ok(m.startTime > 0);
        assert.ok(typeof m.precipitationIntensity === "number");
        assert.ok(typeof m.condition === "string");
        if (i > 0) {
            assert.equal(m.startTime, nextHour.minutes[i - 1].startTime + 60, "Minutes must be 60 seconds apart");
        }
    }
});

test("NordicWeather shares DMI enhancement for current weather only", async () => {
    const cph = new NordicWeather({ latitude: 55.6761, longitude: 12.5683, country: "DK" }, { maxAgeMs: Number.POSITIVE_INFINITY });
    cph.met.fetchLocationforecast = async () => locationforecastFixture;
    cph.met.fetchNowcast = async () => nowcastFixture;
    cph.dmi.fetchObservations = async () => dmiFixture;
    let dmiCalls = 0;
    const getObservationEnhancement = cph.dmi.getObservationEnhancement.bind(cph.dmi);
    cph.dmi.getObservationEnhancement = async options => {
        dmiCalls += 1;
        return getObservationEnhancement(options);
    };

    const [current, hourly, daily, minutely] = await Promise.all([cph.CurrentWeather(), cph.ForecastHourly(2), cph.Daily(2), cph.Minutely()]);
    assert.equal(dmiCalls, 1, "Only current weather should query DMI");
    assert.equal(current.metadata.providerName, "MET Norway · DMI");
    assert.equal(current.metadata.providerLogo, providerNameToLogo("MET Norway · DMI"));
    for (const forecast of [hourly, daily, minutely]) {
        assert.equal(forecast.metadata.providerName, "MET Norway");
        assert.equal(forecast.metadata.attributionUrl, "https://www.met.no/");
        assert.equal("providerLogo" in forecast.metadata, false);
    }

    const oslo = new NordicWeather({ latitude: 59.9139, longitude: 10.7522, country: "NO" });
    oslo.met.fetchLocationforecast = async () => locationforecastFixture;
    oslo.dmi.getObservationEnhancement = async () => { throw new Error("DMI must not be queried outside Denmark"); };
    const [osloCurrent, osloHourly] = await Promise.all([oslo.CurrentWeather(), oslo.ForecastHourly(2)]);
    assert.equal(osloCurrent.metadata.providerName, "MET Norway");
    assert.equal(osloCurrent.metadata.providerLogo, providerNameToLogo("MET Norway"));
    assert.equal(osloHourly.metadata.providerName, "MET Norway");
    assert.equal("providerLogo" in osloHourly.metadata, false);

    const resilient = new NordicWeather({ latitude: 55.6761, longitude: 12.5683, country: "DK" });
    resilient.met.fetchLocationforecast = async () => locationforecastFixture;
    resilient.dmi.getObservationEnhancement = async () => { throw new Error("Simulated DMI upstream outage"); };
    const resilientCurrent = await resilient.CurrentWeather();
    assert.ok(resilientCurrent);
    assert.equal(resilientCurrent.metadata.providerName, "MET Norway");
    assert.equal(resilientCurrent.metadata.providerLogo, providerNameToLogo("MET Norway"));

    const noOp = new NordicWeather({ latitude: 55.6761, longitude: 12.5683, country: "DK" });
    noOp.met.fetchLocationforecast = async () => locationforecastFixture;
    noOp.dmi.getObservationEnhancement = async () => ({ stationId: "no-op", observedAt: 1, providerName: "Danish Meteorological Institute" });
    const noOpCurrent = await noOp.CurrentWeather();
    assert.equal(noOpCurrent.metadata.providerName, "MET Norway");
    assert.equal(noOpCurrent.metadata.providerLogo, providerNameToLogo("MET Norway"));
});

test("NordicWeather full product suite round-trips through Apple WeatherKit FlatBuffers codec", async () => {
    const provider = new NordicWeather({ latitude: 55.6761, longitude: 12.5683, country: "DK" }, { maxAgeMs: Number.POSITIVE_INFINITY });
    provider.met.fetchLocationforecast = async () => locationforecastFixture;
    provider.met.fetchNowcast = async () => nowcastFixture;
    provider.dmi.fetchObservations = async () => dmiFixture;

    const [currentWeather, forecastHourly, forecastDaily, forecastNextHour] = await Promise.all([provider.CurrentWeather(), provider.ForecastHourly(24), provider.Daily(5), provider.Minutely()]);

    const patch = {
        currentWeather,
        forecastHourly,
        forecastDaily,
        forecastNextHour,
    };

    // Encode patch without existing source (standalone)
    const rawBinary = WeatherKit2.encode(undefined, patch);
    assert.ok(rawBinary.byteLength > 1000, "Binary payload must be non-trivial");

    // Decode and verify schema fields
    const bb = new ByteBuffer(rawBinary);
    const decoded = WeatherKit2.decode(bb, ["currentWeather", "forecastHourly", "forecastDaily", "forecastNextHour"]);

    assert.equal(decoded.currentWeather.metadata.providerName, "MET Norway · DMI");
    assert.equal(decoded.currentWeather.metadata.providerLogo, providerNameToLogo("MET Norway · DMI"));
    assert.ok(typeof decoded.currentWeather.temperature === "number");
    assert.ok(decoded.currentWeather);

    assert.ok(decoded.forecastHourly);
    assert.equal(decoded.forecastHourly.metadata.providerName, "MET Norway");
    assert.equal(decoded.forecastHourly.metadata.attributionUrl, "https://www.met.no/");
    assert.equal(decoded.forecastHourly.metadata.providerLogo, null);
    assert.equal(decoded.forecastHourly.hours.length, 24);

    assert.ok(decoded.forecastDaily);
    assert.equal(decoded.forecastDaily.metadata.providerName, "MET Norway");
    assert.equal(decoded.forecastDaily.metadata.attributionUrl, "https://www.met.no/");
    assert.equal(decoded.forecastDaily.metadata.providerLogo, null);
    assert.equal(decoded.forecastNextHour.metadata.providerName, "MET Norway");
    assert.equal(decoded.forecastNextHour.metadata.attributionUrl, "https://www.met.no/");
    assert.equal(decoded.forecastNextHour.metadata.providerLogo, null);
    assert.equal(decoded.forecastDaily.days.length > 0, true);
    assert.ok(decoded.forecastNextHour.minutes.length >= 60);
});
test("NordicWeather forecast-only requests do not query DMI", async () => {
    const provider = new NordicWeather({ latitude: 55.6761, longitude: 12.5683, country: "DK" });
    provider.met.fetchLocationforecast = async () => locationforecastFixture;
    provider.met.fetchNowcast = async () => nowcastFixture;
    provider.dmi.getObservationEnhancement = async () => { throw new Error("Forecast-only request must not query DMI"); };
    const [hourly, daily, minutely] = await Promise.all([provider.ForecastHourly(2), provider.Daily(2), provider.Minutely()]);
    for (const forecast of [hourly, daily, minutely]) {
        assert.equal(forecast.metadata.providerName, "MET Norway");
        assert.equal(forecast.metadata.attributionUrl, "https://www.met.no/");
        assert.equal("providerLogo" in forecast.metadata, false);
    }
});

test("providerNameToLogo assigns appropriate assets for MET Norway and DMI", () => {
    assert.equal(providerNameToLogo("MET Norway"), "https://weatherkit.s232278.workers.dev/images/icon/v2/METNorway.png");
    assert.equal(providerNameToLogo("MET Norway · DMI"), "https://weatherkit.s232278.workers.dev/images/icon/v2/METNorway_DMI.png");
    assert.equal(providerNameToLogo("DMI"), "https://weatherkit.s232278.workers.dev/images/icon/v2/DMI.png");
    assert.equal(providerNameToLogo("Danish Meteorological Institute"), "https://weatherkit.s232278.workers.dev/images/icon/v2/DMI.png");
    // Ensure Apple and WeatherKit remain unbranded
    assert.equal(providerNameToLogo("Apple"), undefined);
    assert.equal(providerNameToLogo("WeatherKit"), undefined);
});
