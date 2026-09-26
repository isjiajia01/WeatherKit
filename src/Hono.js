import { Hono } from "hono/tiny";
import { fetch } from "@nsnanocat/util";
import * as flatbuffers from "flatbuffers";
import HonoWorkerAdapter from "./class/HonoWorkerAdapter.mjs";
import NordicWeather from "./class/NordicWeather.mjs";
import WeatherKit2 from "./class/WeatherKit2.mjs";
import { Request } from "./process/Request.mjs";
import { Response } from "./process/Response.mjs";

export default new Hono()
    .get("/", c => c.text("OK"))
    .get("/test/nordic", async c => {
        const lat = Number(c.req.query("lat") || "55.6761");
        const lon = Number(c.req.query("lon") || "12.5683");
        const country = c.req.query("country") || "DK";
        const lang = c.req.query("lang") || "en";

        const provider = new NordicWeather({ latitude: lat, longitude: lon, country, language: lang });
        const [currentWeather, forecastHourly, forecastDaily, forecastNextHour] = await Promise.all([
            provider.CurrentWeather(),
            provider.ForecastHourly(24),
            provider.Daily(5),
            provider.Minutely(),
        ]);

        const rawBinary = WeatherKit2.encode(undefined, {
            currentWeather,
            forecastHourly,
            forecastDaily,
            forecastNextHour,
        });

        const bb = new flatbuffers.ByteBuffer(rawBinary);
        const decoded = WeatherKit2.decode(bb, ["currentWeather", "forecastHourly", "forecastDaily", "forecastNextHour"]);

        return c.json({
            status: "OK",
            environment: "Cloudflare Worker",
            target: { latitude: lat, longitude: lon, country },
            current: {
                provider: currentWeather?.metadata?.providerName,
                temperature: currentWeather?.temperature,
                condition: currentWeather?.conditionCode,
                asOf: currentWeather?.asOf,
            },
            hourly: {
                count: forecastHourly?.hours?.length,
                firstHourTemp: forecastHourly?.hours?.[0]?.temperature,
            },
            daily: {
                count: forecastDaily?.days?.length,
                min: forecastDaily?.days?.[0]?.temperatureMin,
                max: forecastDaily?.days?.[0]?.temperatureMax,
            },
            nextHour: {
                minutes: forecastNextHour?.minutes?.length,
                summary: forecastNextHour?.summary?.[0]?.condition,
            },
            flatbuffer: {
                encodedBytes: rawBinary.byteLength,
                decodedProvider: decoded.currentWeather?.metadata?.providerName,
                decodedTemp: decoded.currentWeather?.temperature,
            },
        });
    })
    .all("/:rest{.*}", async c => {
        let $request = await HonoWorkerAdapter.buildRequest(c.req);
        $request = HonoWorkerAdapter.buildArgument($request);
        let $response;
        ({ $request, $response } = await Request($request));
        switch (typeof $response) {
            case "undefined":
                $response = await fetch($request);
                $response = await Response($request, $response);
                break;
            case "object":
                break;
            default:
                throw new TypeError(`Invalid response type: ${typeof $response}`);
        }
        return HonoWorkerAdapter.writeResponse(c, $response);
    })
    .onError((e, c) => {
        console.error(e);
        return c.body(e.message, 500);
    });
