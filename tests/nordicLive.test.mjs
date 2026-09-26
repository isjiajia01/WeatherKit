import assert from "node:assert/strict";
import test from "node:test";
import { ByteBuffer } from "flatbuffers";
import NordicWeather from "../src/class/NordicWeather.mjs";
import WeatherKit2 from "../src/class/WeatherKit2.mjs";

test("Live validation: Copenhagen (55.6761, 12.5683) retrieves and merges live MET Norway + DMI", async () => {
    const cph = new NordicWeather({ latitude: 55.6761, longitude: 12.5683, country: "DK" });

    const current = await cph.CurrentWeather();
    assert.ok(current, "Copenhagen current weather must be available");
    assert.ok(typeof current.temperature === "number");
    assert.ok(current.temperature >= -40 && current.temperature <= 50, "Plausible Nordic temperature range");
    assert.ok(typeof current.conditionCode === "string");
    console.log(`[Live Copenhagen] Provider: ${current.metadata.providerName}, Temp: ${current.temperature}°C, Condition: ${current.conditionCode}`);

    const hourly = await cph.ForecastHourly(24);
    assert.ok(hourly, "Copenhagen hourly forecast must be available");
    assert.equal(hourly.hours.length, 24);
    console.log(`[Live Copenhagen] 24h forecast loaded. First hour temp: ${hourly.hours[0].temperature}°C, UV: ${hourly.hours[0].uvIndex}`);

    const daily = await cph.Daily(5);
    assert.ok(daily, "Copenhagen daily forecast must be available");
    console.log(`[Live Copenhagen] Daily days loaded (${daily.days.length}). Day 0 min/max: ${daily.days[0].temperatureMin}°C / ${daily.days[0].temperatureMax}°C`);

    const nextHour = await cph.Minutely();
    assert.equal(nextHour.minutes.length, 60, "Copenhagen next-hour minutes must be exactly 60");
    assert.ok(nextHour.minutes.length >= 60);
    console.log(`[Live Copenhagen] Next-hour minutes count: ${nextHour.minutes.length}, Summary: ${nextHour.summary?.[0]?.condition}`);

    // Verify binary FlatBuffer encoding with live data
    const rawBinary = WeatherKit2.encode(undefined, {
        currentWeather: current,
        forecastHourly: hourly,
        forecastDaily: daily,
        forecastNextHour: nextHour,
    });
    assert.ok(rawBinary.byteLength > 2000, "FlatBuffer encoding must produce valid binary payload");

    const decoded = WeatherKit2.decode(new ByteBuffer(rawBinary), ["currentWeather", "forecastHourly", "forecastDaily", "forecastNextHour"]);
    assert.equal(decoded.currentWeather?.metadata?.providerName, current.metadata.providerName);
    console.log(`[Live Copenhagen] Successfully encoded & decoded FlatBuffer payload (${rawBinary.byteLength} bytes)`);
});

test("Live validation: Oslo, Norway (59.9139, 10.7522) retrieves MET Norway forecast", async () => {
    const oslo = new NordicWeather({ latitude: 59.9139, longitude: 10.7522, country: "NO" });
    const current = await oslo.CurrentWeather();
    assert.ok(current, "Oslo current weather must be available");
    assert.equal(current.metadata.providerName, "MET Norway");
    assert.ok(typeof current.temperature === "number");
    console.log(`[Live Oslo] Temp: ${current.temperature}°C, Condition: ${current.conditionCode}`);
});

test("Live validation: Stockholm, Sweden (59.3293, 18.0686) retrieves MET Norway forecast", async () => {
    const stockholm = new NordicWeather({ latitude: 59.3293, longitude: 18.0686, country: "SE" });
    const current = await stockholm.CurrentWeather();
    assert.ok(current, "Stockholm current weather must be available");
    assert.equal(current.metadata.providerName, "MET Norway");
    assert.ok(typeof current.temperature === "number");
    console.log(`[Live Stockholm] Temp: ${current.temperature}°C, Condition: ${current.conditionCode}`);
});
