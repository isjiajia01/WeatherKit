import { Hono } from "hono/tiny";
import { fetch } from "@nsnanocat/util";
import * as flatbuffers from "flatbuffers";
import HonoWorkerAdapter from "./class/HonoWorkerAdapter.mjs";
import NordicWeather from "./class/NordicWeather.mjs";
import WeatherKit2 from "./class/WeatherKit2.mjs";
import { Request } from "./process/Request.mjs";
import { Response } from "./process/Response.mjs";

const SHADOWROCKET_MODULE = `#!name =  iRingo: 🌤 WeatherKit (Nordic Rewrite)
#!desc = iOS 18 & macOS 15 & watchOS 11\\n专为北欧定制的 Apple WeatherKit 重写模块，直连专属 Cloudflare Nordic 服务端点，集成 MET Norway 及丹麦 DMI 地面实测数据。
#!openUrl = http://boxjs.com/#/app/iRingo.WeatherKit
#!author = VirgilClyne, WordlessEcho, 001, hhh2210 & Jiajia
#!homepage = https://github.com/isjiajia01/WeatherKit
#!icon = https://developer.apple.com/assets/elements/icons/weatherkit/weatherkit-128x128.png
#!category =  iRingo

[Rule]
DOMAIN,weather-analytics-events.apple.com,REJECT-DROP
DOMAIN-SUFFIX,tthr.apple.com,REJECT-DROP
DOMAIN,tether.edge.apple,REJECT-DROP
AND,((IP-CIDR,17.0.0.0/8,no-resolve),(PROTOCOL,UDP)),REJECT-DROP
AND,((OR,((IP-ASN,714,no-resolve),(IP-ASN,6185,no-resolve))),(PROTOCOL,QUIC)),REJECT-DROP
[URL Rewrite]
# 🌤 WeatherKit.api.v1.availability.response
^https?:\\/\\/weatherkit\\.apple\\.com\\/api\\/v1\\/availability\\/ https://weatherkit.s232278.workers.dev/api/v1/availability/ header
# 🌤 WeatherKit.api.v2.weather.response
^https?:\\/\\/weatherkit\\.apple\\.com\\/api\\/v2\\/weather\\/ https://weatherkit.s232278.workers.dev/api/v2/weather/ header
# 🌤 WeatherKit.api.v1.weatherAlerts.response
^https?:\\/\\/weatherkit\\.apple\\.com\\/api\\/v1\\/weatherAlerts\\?([^#]*&ids=[^&#]*-[0-9]{9}(?:&[^#]*)?)$ https://weatherkit.s232278.workers.dev/api/v1/weatherAlerts?$1 header
^https?:\\/\\/weatherkit\\.apple\\.com\\/api\\/v1\\/weatherAlerts\\?([^#]*&ids=-?[0-9]+(?:\\.[0-9]+)?,-?[0-9]+(?:\\.[0-9]+)?(?:&[^#]*)?)$ https://weatherkit.s232278.workers.dev/api/v1/weatherAlerts?$1 header

[MITM]
hostname = %APPEND% weatherkit.apple.com
`;
const requestLogs = [];

export default new Hono()
    .get("/", c => c.text("OK"))
    .get("/stats", c => c.json({ count: requestLogs.length, recent: requestLogs }))
    .get("/module/shadowrocket", c => {
        c.header("Content-Type", "text/plain; charset=utf-8");
        return c.text(SHADOWROCKET_MODULE);
    })
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
        requestLogs.unshift({
            time: new Date().toISOString(),
            method: c.req.method,
            url: c.req.url,
            path: c.req.path,
            userAgent: c.req.header("user-agent") || "",
            country: c.req.header("cf-ipcountry") || "",
        });
        if (requestLogs.length > 50) requestLogs.pop();
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
