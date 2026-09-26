import { Console, fetch } from "@nsnanocat/util";
import providerNameToLogo from "../function/providerNameToLogo.mjs";
import ForecastNextHour from "./ForecastNextHour.mjs";
import METWeatherCode from "./METWeatherCode.mjs";

export default class METNorway {
    static Name = "METNorway";
    static Version = "1.0.0";
    static DefaultUserAgent = "WeatherKit/3.3.2 (https://github.com/NSRingo/WeatherKit; isjiajia01@gmail.com)";

    // In-memory cache for Locationforecast and Nowcast responses
    static #Cache = {
        locationforecast: new Map(),
        nowcast: new Map(),
    };

    /**
     * Clear all in-memory caches (useful for testing)
     */
    static clearCache() {
        METNorway.#Cache.locationforecast.clear();
        METNorway.#Cache.nowcast.clear();
    }

    constructor(parameters = {}, options = {}) {
        this.latitude = Number(parameters.latitude);
        this.longitude = Number(parameters.longitude);
        this.language = parameters.language || "en";
        this.country = parameters.country;
        this.userAgent = options.userAgent || METNorway.DefaultUserAgent;
        this.timeout = options.timeout ?? 8000;
    }

    get cacheKey() {
        if (!Number.isFinite(this.latitude) || !Number.isFinite(this.longitude)) {
            return null;
        }
        return `${this.latitude.toFixed(3)},${this.longitude.toFixed(3)}`;
    }

    /**
     * Fetch Locationforecast from MET Norway
     * @param {boolean} [complete=true]
     * @returns {Promise<object|null>}
     */
    async fetchLocationforecast(complete = true) {
        Console.info("☑️ METNorway.fetchLocationforecast");
        const key = this.cacheKey;
        if (!key) {
            Console.warn("METNorway.fetchLocationforecast", "Invalid coordinates");
            return null;
        }

        const now = Date.now();
        const cached = METNorway.#Cache.locationforecast.get(key);
        if (cached && now < cached.expiresAt) {
            Console.info("METNorway.fetchLocationforecast", "Using memory cache");
            return cached.data;
        }

        const url = `https://api.met.no/weatherapi/locationforecast/2.0/${complete ? "complete" : "compact"}?lat=${this.latitude.toFixed(4)}&lon=${this.longitude.toFixed(4)}`;
        const headers = {
            "User-Agent": this.userAgent,
            Accept: "application/json",
        };

        if (cached?.lastModified) {
            headers["If-Modified-Since"] = cached.lastModified;
        }

        try {
            const response = await fetch({
                url,
                method: "GET",
                headers,
                timeout: this.timeout,
            });

            const statusCode = response.statusCode ?? response.status ?? 200;

            if (statusCode === 304 && cached) {
                Console.info("METNorway.fetchLocationforecast", "304 Not Modified");
                return cached.data;
            }

            if (statusCode !== 200) {
                Console.warn("METNorway.fetchLocationforecast", `upstream status: ${statusCode}`);
                return cached ? cached.data : null;
            }

            const rawBody = response.body ?? "{}";
            const data = typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody;

            // Extract expiry from response headers
            const expiresHeader = response.headers?.expires || response.headers?.Expires;
            let expiresAt = now + 20 * 60 * 1000; // default 20 minutes
            if (expiresHeader) {
                const parsed = Date.parse(expiresHeader);
                if (!Number.isNaN(parsed) && parsed > now) {
                    expiresAt = parsed;
                }
            }

            const lastModified = response.headers?.["last-modified"] || response.headers?.["Last-Modified"];

            METNorway.#Cache.locationforecast.set(key, {
                data,
                expiresAt,
                lastModified,
            });

            Console.info("✅ METNorway.fetchLocationforecast");
            return data;
        } catch (error) {
            Console.error("METNorway.fetchLocationforecast", error);
            return cached ? cached.data : null;
        }
    }
    /**
     * Fetch Nowcast 2.0 from MET Norway
     * @returns {Promise<object|null>}
     */
    async fetchNowcast() {
        Console.info("☑️ METNorway.fetchNowcast");
        const key = this.cacheKey;
        if (!key) {
            Console.warn("METNorway.fetchNowcast", "Invalid coordinates");
            return null;
        }

        const now = Date.now();
        const cached = METNorway.#Cache.nowcast.get(key);
        if (cached && now < cached.expiresAt) {
            Console.info("METNorway.fetchNowcast", "Using memory cache");
            return cached.data;
        }

        const url = `https://api.met.no/weatherapi/nowcast/2.0/complete?lat=${this.latitude.toFixed(4)}&lon=${this.longitude.toFixed(4)}`;
        const headers = {
            "User-Agent": this.userAgent,
            Accept: "application/json",
        };

        if (cached?.lastModified) {
            headers["If-Modified-Since"] = cached.lastModified;
        }

        try {
            const response = await fetch({
                url,
                method: "GET",
                headers,
                timeout: this.timeout,
            });

            const statusCode = response.statusCode ?? response.status ?? 200;

            if (statusCode === 304 && cached) {
                Console.info("METNorway.fetchNowcast", "304 Not Modified");
                return cached.data;
            }

            // 422 indicates location is outside MET Norway radar coverage area
            if (statusCode === 422 || statusCode === 404) {
                Console.info("METNorway.fetchNowcast", `Outside coverage or not available (status ${statusCode})`);
                return null;
            }

            if (statusCode !== 200) {
                Console.warn("METNorway.fetchNowcast", `upstream status: ${statusCode}`);
                return cached ? cached.data : null;
            }

            const rawBody = response.body ?? "{}";
            const data = typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody;

            const expiresHeader = response.headers?.expires || response.headers?.Expires;
            let expiresAt = now + 4 * 60 * 1000; // default 4 minutes
            if (expiresHeader) {
                const parsed = Date.parse(expiresHeader);
                if (!Number.isNaN(parsed) && parsed > now) {
                    expiresAt = parsed;
                }
            }

            const lastModified = response.headers?.["last-modified"] || response.headers?.["Last-Modified"];

            METNorway.#Cache.nowcast.set(key, {
                data,
                expiresAt,
                lastModified,
            });

            Console.info("✅ METNorway.fetchNowcast");
            return data;
        } catch (error) {
            Console.error("METNorway.fetchNowcast", error);
            return cached ? cached.data : null;
        }
    }

    /**
     * Map MET Nowcast to Apple WeatherKit ForecastNextHour
     * @returns {Promise<object|null>}
     */
    async Minutely() {
        Console.info("☑️ METNorway.Minutely");
        const data = await this.fetchNowcast();
        const timeseries = data?.properties?.timeseries;
        if (!Array.isArray(timeseries) || timeseries.length === 0) {
            Console.warn("METNorway.Minutely", "No nowcast timeseries available");
            return null;
        }

        const timeStamp = Math.floor(Date.now() / 1000);
        const reportedTime = Math.floor(Date.parse(timeseries[0]?.time ?? new Date().toISOString()) / 1000);
        const minuteStemp = Math.floor(Date.now() / 60000) * 60; // align to minute boundary

        const dominantSymbol = timeseries[0]?.data?.next_1_hours?.summary?.symbol_code || "";
        const temp = timeseries[0]?.data?.instant?.details?.air_temperature;
        let description = "晴朗";

        // Expand 5-minute timestep entries into 1-minute steps
        const rawMinutes = [];
        for (let i = 0; i < timeseries.length; i++) {
            const entry = timeseries[i];
            const startTime = Math.floor(Date.parse(entry.time) / 1000);
            const rate = entry.data?.instant?.details?.precipitation_rate ?? 0;
            const nextEntry = timeseries[i + 1];
            const nextRate = nextEntry?.data?.instant?.details?.precipitation_rate ?? rate;
            const stepDuration = nextEntry ? Math.max(60, Math.floor(Date.parse(nextEntry.time) / 1000) - startTime) : 300;
            const minuteSteps = Math.max(1, Math.min(10, Math.round(stepDuration / 60)));

            for (let m = 0; m < minuteSteps; m++) {
                const fraction = m / minuteSteps;
                const interpolatedRate = Math.max(0, rate + (nextRate - rate) * fraction);
                const chance = interpolatedRate > 0 ? Math.min(100, Math.max(20, Math.round(interpolatedRate * 30))) : 0;
                rawMinutes.push({
                    startTime: startTime + m * 60,
                    precipitationIntensity: Math.trunc(interpolatedRate * 1000000) / 1000000,
                    precipitationChance: chance,
                    perceivedPrecipitationIntensity: 0,
                });
            }
            if (rawMinutes.length >= 60) break;
        }

        if (rawMinutes.length === 0) {
            return null;
        }

        const minutes = rawMinutes
            .map((item, idx) => ({
                ...item,
                startTime: minuteStemp + idx * 60,
            }))
            .slice(0, 60);

        // Determine description
        const maxRate = Math.max(...minutes.map(m => m.precipitationIntensity));
        if (maxRate > 0) {
            if (temp != null && temp <= 0) {
                description = "snow";
            } else if (dominantSymbol.includes("sleet") || (temp != null && temp <= 2 && dominantSymbol.includes("rain"))) {
                description = "雨夹雪";
            } else {
                description = "rain";
            }
        }

        const normalizedMinutes = ForecastNextHour.Minute(minutes, description, "mmph");
        const summary = ForecastNextHour.Summary(normalizedMinutes);
        const condition = ForecastNextHour.Condition(summary);

        const forecastNextHour = {
            metadata: {
                attributionUrl: "https://www.met.no/",
                expireTime: timeStamp + ForecastNextHour.ExpirationInterval,
                language: this.language,
                latitude: this.latitude,
                longitude: this.longitude,
                providerName: "MET Norway",
                providerLogo: providerNameToLogo("MET Norway"),
                readTime: timeStamp,
                reportedTime,
                version: 1,
            },
            forecastStart: minuteStemp,
            forecastEnd: minuteStemp + 60 * normalizedMinutes.length,
            minutes: normalizedMinutes,
            summary,
            condition,
        };

        Console.info("✅ METNorway.Minutely");
        return forecastNextHour;
    }

    /**
     * Map MET Locationforecast to Apple WeatherKit CurrentWeather
     * @returns {Promise<object|null>}
     */
    async CurrentWeather() {
        Console.info("☑️ METNorway.CurrentWeather");
        const data = await this.fetchLocationforecast(true);
        const timeseries = data?.properties?.timeseries;
        if (!Array.isArray(timeseries) || timeseries.length === 0) {
            Console.warn("METNorway.CurrentWeather", "Empty timeseries");
            return null;
        }

        const nowSeconds = Math.floor(Date.now() / 1000);
        // Find timeseries closest to now
        let currentEntry = timeseries[0];
        let smallestDiff = Number.POSITIVE_INFINITY;
        for (const entry of timeseries) {
            const entryTime = Math.floor(Date.parse(entry.time) / 1000);
            const diff = Math.abs(nowSeconds - entryTime);
            if (diff < smallestDiff) {
                smallestDiff = diff;
                currentEntry = entry;
            }
            if (entryTime > nowSeconds + 3600) break;
        }

        const instant = currentEntry.data?.instant?.details ?? {};
        const next1h = currentEntry.data?.next_1_hours;
        const next6h = currentEntry.data?.next_6_hours;
        const symbolCode = next1h?.summary?.symbol_code || next6h?.summary?.symbol_code || "fair_day";
        const asOf = Math.floor(Date.parse(currentEntry.time) / 1000);

        const conditionCode = METWeatherCode.toConditionCode(symbolCode);
        const isDaylight = symbolCode.endsWith("_day") || !symbolCode.endsWith("_night");

        const currentWeather = {
            metadata: {
                attributionUrl: "https://www.met.no/",
                expireTime: nowSeconds + 20 * 60,
                language: this.language,
                latitude: this.latitude,
                longitude: this.longitude,
                providerName: "MET Norway",
                providerLogo: providerNameToLogo("MET Norway"),
                readTime: nowSeconds,
                reportedTime: asOf,
                version: 1,
            },
            asOf,
            temperature: instant.air_temperature ?? 0,
            temperatureApparent: instant.apparent_air_temperature ?? instant.air_temperature ?? 0,
            temperatureDewPoint: instant.dew_point_temperature ?? 0,
            humidity: instant.relative_humidity ?? 0,
            pressure: instant.air_pressure_at_sea_level ?? 1013.25,
            pressureTrend: "STEADY",
            windSpeed: instant.wind_speed ?? 0,
            windGust: instant.wind_speed_of_gust ?? instant.wind_speed ?? 0,
            windDirection: instant.wind_from_direction ?? 0,
            cloudCover: instant.cloud_area_fraction != null ? Math.min(1, Math.max(0, instant.cloud_area_fraction / 100)) : undefined,
            cloudCoverHighAltPct: instant.cloud_area_fraction_high,
            cloudCoverLowAltPct: instant.cloud_area_fraction_low,
            cloudCoverMidAltPct: instant.cloud_area_fraction_medium,
            uvIndex: instant.ultraviolet_index_clear_sky != null ? Math.min(11, Math.max(0, Math.round(instant.ultraviolet_index_clear_sky))) : 0,
            daylight: isDaylight,
            precipitationIntensity: next1h?.details?.precipitation_amount ?? 0,
            precipitationAmount1h: next1h?.details?.precipitation_amount ?? 0,
            precipitationAmount6h: next6h?.details?.precipitation_amount ?? 0,
            precipitationAmountNext1hByType: [],
            precipitationAmountNext24hByType: [],
            precipitationAmountNext6hByType: [],
            precipitationAmountPrevious1hByType: [],
            precipitationAmountPrevious24hByType: [],
            precipitationAmountPrevious6hByType: [],
        };

        if (conditionCode) {
            currentWeather.conditionCode = conditionCode;
        }

        Console.info("✅ METNorway.CurrentWeather");
        return currentWeather;
    }

    /**
     * Map MET Locationforecast to Apple WeatherKit HourlyForecast
     * @param {number} [hourlysteps=72]
     * @param {number} [begin] - Unix epoch timestamp in seconds
     * @returns {Promise<{metadata: object, hours: array}|null>}
     */
    async ForecastHourly(hourlysteps = 72, begin = undefined) {
        Console.info("☑️ METNorway.ForecastHourly");
        const data = await this.fetchLocationforecast(true);
        const timeseries = data?.properties?.timeseries;
        if (!Array.isArray(timeseries) || timeseries.length === 0) {
            return null;
        }

        const nowSeconds = Math.floor(Date.now() / 1000);
        const filterStart = begin ? Math.max(begin, nowSeconds - 7200) : nowSeconds - 1800;

        const hours = [];
        for (const entry of timeseries) {
            const entryTime = Math.floor(Date.parse(entry.time) / 1000);
            if (entryTime < filterStart) continue;

            const instant = entry.data?.instant?.details ?? {};
            const next1h = entry.data?.next_1_hours;
            const next6h = entry.data?.next_6_hours;
            const symbolCode = next1h?.summary?.symbol_code || next6h?.summary?.symbol_code || "fair_day";
            const conditionCode = METWeatherCode.toConditionCode(symbolCode);
            const precipitationType = METWeatherCode.toPrecipitationType(symbolCode);
            const isDaylight = symbolCode.endsWith("_day") || !symbolCode.endsWith("_night");

            const hour = {
                forecastStart: entryTime,
                temperature: instant.air_temperature ?? 0,
                temperatureApparent: instant.apparent_air_temperature ?? instant.air_temperature ?? 0,
                temperatureDewPoint: instant.dew_point_temperature ?? 0,
                humidity: instant.relative_humidity ?? 0,
                pressure: instant.air_pressure_at_sea_level ?? 1013.25,
                pressureTrend: "STEADY",
                windSpeed: instant.wind_speed ?? 0,
                windGust: instant.wind_speed_of_gust ?? instant.wind_speed ?? 0,
                windDirection: instant.wind_from_direction ?? 0,
                cloudCover: instant.cloud_area_fraction != null ? Math.min(1, Math.max(0, instant.cloud_area_fraction / 100)) : 0,
                cloudCoverHighAltPct: instant.cloud_area_fraction_high ?? 0,
                cloudCoverLowAltPct: instant.cloud_area_fraction_low ?? 0,
                cloudCoverMidAltPct: instant.cloud_area_fraction_medium ?? 0,
                uvIndex: instant.ultraviolet_index_clear_sky != null ? Math.min(11, Math.max(0, Math.round(instant.ultraviolet_index_clear_sky))) : 0,
                daylight: isDaylight,
                precipitationAmount: next1h?.details?.precipitation_amount ?? (next6h?.details?.precipitation_amount ? next6h.details.precipitation_amount / 6 : 0),
                precipitationChance: next1h?.details?.probability_of_precipitation != null ? Math.round(next1h.details.probability_of_precipitation) : next1h?.details?.precipitation_amount > 0 ? 100 : 0,
                precipitationIntensity: next1h?.details?.precipitation_amount ?? 0,
                precipitationType,
            };

            if (conditionCode) {
                hour.conditionCode = conditionCode;
            }

            hours.push(hour);
            if (hours.length >= hourlysteps) break;
        }

        Console.info("✅ METNorway.ForecastHourly", `hours count: ${hours.length}`);
        return {
            metadata: {
                attributionUrl: "https://www.met.no/",
                expireTime: nowSeconds + 20 * 60,
                language: this.language,
                latitude: this.latitude,
                longitude: this.longitude,
                providerName: "MET Norway",
                providerLogo: providerNameToLogo("MET Norway"),
                readTime: nowSeconds,
                reportedTime: hours[0]?.forecastStart ?? nowSeconds,
                version: 1,
            },
            hours,
        };
    }

    /**
     * Map MET Locationforecast to Apple WeatherKit DailyForecast
     * @param {number} [dailysteps=10]
     * @param {number} [begin]
     * @returns {Promise<{metadata: object, days: array}|null>}
     */
    async Daily(dailysteps = 10, begin = undefined) {
        Console.info("☑️ METNorway.Daily");
        const data = await this.fetchLocationforecast(true);
        const timeseries = data?.properties?.timeseries;
        if (!Array.isArray(timeseries) || timeseries.length === 0) {
            return null;
        }

        const nowSeconds = Math.floor(Date.now() / 1000);

        // Group timeseries into 24-hour day groups based on calendar day (UTC)
        const dayGroups = new Map();
        for (const entry of timeseries) {
            const entryTime = Math.floor(Date.parse(entry.time) / 1000);
            const dateStr = entry.time.slice(0, 10); // YYYY-MM-DD
            if (!dayGroups.has(dateStr)) {
                dayGroups.set(dateStr, []);
            }
            dayGroups.get(dateStr).push({ ...entry, epochSeconds: entryTime });
        }

        const days = [];
        for (const [dateStr, entries] of dayGroups.entries()) {
            if (days.length >= dailysteps) break;

            const dayStart = Math.floor(Date.parse(`${dateStr}T00:00:00Z`) / 1000);
            const dayEnd = dayStart + 86400;

            if (begin && dayEnd <= begin) continue;

            let tempMin = Number.POSITIVE_INFINITY;
            let tempMax = Number.NEGATIVE_INFINITY;
            let temperatureMinTime = dayStart;
            let temperatureMaxTime = dayStart;
            let precipTotal = 0;
            let precipChanceMax = 0;
            let windSpeedSum = 0;
            let windSpeedMax = 0;
            let windGustMax = 0;
            let humidityMin = Number.POSITIVE_INFINITY;
            let humidityMax = Number.NEGATIVE_INFINITY;
            let maxUv = 0;

            const conditionCount = new Map();
            const dayEntries = [];
            const nightEntries = [];

            for (const item of entries) {
                const details = item.data?.instant?.details ?? {};
                const t = details.air_temperature;
                if (t != null) {
                    if (t < tempMin) {
                        tempMin = t;
                        temperatureMinTime = item.epochSeconds;
                    }
                    if (t > tempMax) {
                        tempMax = t;
                        temperatureMaxTime = item.epochSeconds;
                    }
                }

                if (details.relative_humidity != null) {
                    humidityMin = Math.min(humidityMin, details.relative_humidity);
                    humidityMax = Math.max(humidityMax, details.relative_humidity);
                }

                if (details.wind_speed != null) {
                    windSpeedSum += details.wind_speed;
                    windSpeedMax = Math.max(windSpeedMax, details.wind_speed);
                }
                if (details.wind_speed_of_gust != null) {
                    windGustMax = Math.max(windGustMax, details.wind_speed_of_gust);
                }
                if (details.ultraviolet_index_clear_sky != null) {
                    maxUv = Math.max(maxUv, Math.round(details.ultraviolet_index_clear_sky));
                }

                const n1h = item.data?.next_1_hours;
                const n6h = item.data?.next_6_hours;
                const p = n1h?.details?.precipitation_amount ?? (n6h?.details?.precipitation_amount ? n6h.details.precipitation_amount / 6 : 0);
                precipTotal += p;

                const pChance = n1h?.details?.probability_of_precipitation ?? n6h?.details?.probability_of_precipitation ?? 0;
                precipChanceMax = Math.max(precipChanceMax, pChance);

                const sym = n1h?.summary?.symbol_code || n6h?.summary?.symbol_code;
                if (sym) {
                    const cond = METWeatherCode.toConditionCode(sym);
                    if (cond) {
                        conditionCount.set(cond, (conditionCount.get(cond) || 0) + 1);
                    }
                }

                // Partition daytime (06:00 to 18:00 UTC) vs night
                const hourOfDay = new Date(item.epochSeconds * 1000).getUTCHours();
                if (hourOfDay >= 6 && hourOfDay < 18) {
                    dayEntries.push(item);
                } else {
                    nightEntries.push(item);
                }
            }

            // Find dominant condition
            let dominantCondition = "PARTLY_CLOUDY";
            let maxCount = 0;
            for (const [cond, count] of conditionCount.entries()) {
                if (count > maxCount) {
                    maxCount = count;
                    dominantCondition = cond;
                }
            }

            const dayObj = {
                forecastStart: dayStart,
                forecastEnd: dayEnd,
                conditionCode: dominantCondition,
                temperatureMin: tempMin === Number.POSITIVE_INFINITY ? 0 : tempMin,
                temperatureMinTime,
                temperatureMax: tempMax === Number.NEGATIVE_INFINITY ? 0 : tempMax,
                temperatureMaxTime,
                precipitationAmount: Math.round(precipTotal * 10) / 10,
                precipitationChance: Math.round(precipChanceMax),
                precipitationType: precipTotal > 0 ? (dominantCondition.includes("SNOW") ? "SNOW" : "RAIN") : "CLEAR",
                humidityMin: humidityMin === Number.POSITIVE_INFINITY ? 0 : humidityMin,
                humidityMax: humidityMax === Number.NEGATIVE_INFINITY ? 100 : humidityMax,
                windSpeedAvg: entries.length > 0 ? Math.round((windSpeedSum / entries.length) * 10) / 10 : 0,
                windSpeedMax,
                windGustSpeedMax: windGustMax,
                maxUvIndex: Math.min(11, maxUv),
                precipitationAmountByType: [],
            };

            // Aggregate daytimeForecast & overnightForecast
            if (dayEntries.length > 0) {
                dayObj.daytimeForecast = this.#aggregateSubPeriod(dayEntries, dayStart + 6 * 3600, dayStart + 18 * 3600, true);
            }
            if (nightEntries.length > 0) {
                dayObj.overnightForecast = this.#aggregateSubPeriod(nightEntries, dayStart + 18 * 3600, dayStart + 30 * 3600, false);
            }

            days.push(dayObj);
        }

        Console.info("✅ METNorway.Daily", `days count: ${days.length}`);
        return {
            metadata: {
                attributionUrl: "https://www.met.no/",
                expireTime: nowSeconds + 20 * 60,
                language: this.language,
                latitude: this.latitude,
                longitude: this.longitude,
                providerName: "MET Norway",
                providerLogo: providerNameToLogo("MET Norway"),
                readTime: nowSeconds,
                reportedTime: days[0]?.forecastStart ?? nowSeconds,
                version: 1,
            },
            days,
        };
    }

    #aggregateSubPeriod(subEntries, start, end, isDaylight) {
        let tMin = Number.POSITIVE_INFINITY;
        let tMax = Number.NEGATIVE_INFINITY;
        let pTotal = 0;
        let pChanceMax = 0;
        let windMax = 0;
        let windSum = 0;
        let cloudSum = 0;
        const subConditions = new Map();

        for (const item of subEntries) {
            const d = item.data?.instant?.details ?? {};
            if (d.air_temperature != null) {
                tMin = Math.min(tMin, d.air_temperature);
                tMax = Math.max(tMax, d.air_temperature);
            }
            if (d.wind_speed != null) {
                windMax = Math.max(windMax, d.wind_speed);
                windSum += d.wind_speed;
            }
            if (d.cloud_area_fraction != null) {
                cloudSum += d.cloud_area_fraction;
            }
            const n1 = item.data?.next_1_hours;
            const n6 = item.data?.next_6_hours;
            const p = n1?.details?.precipitation_amount ?? (n6?.details?.precipitation_amount ? n6.details.precipitation_amount / 6 : 0);
            pTotal += p;
            const pC = n1?.details?.probability_of_precipitation ?? n6?.details?.probability_of_precipitation ?? 0;
            pChanceMax = Math.max(pChanceMax, pC);

            const sym = n1?.summary?.symbol_code || n6?.summary?.symbol_code;
            if (sym) {
                const cond = METWeatherCode.toConditionCode(sym);
                if (cond) {
                    subConditions.set(cond, (subConditions.get(cond) || 0) + 1);
                }
            }
        }

        let dominant = isDaylight ? "PARTLY_CLOUDY" : "CLEAR";
        let maxCount = 0;
        for (const [cond, count] of subConditions.entries()) {
            if (count > maxCount) {
                maxCount = count;
                dominant = cond;
            }
        }

        return {
            forecastStart: start,
            forecastEnd: end,
            conditionCode: dominant,
            temperatureMin: tMin === Number.POSITIVE_INFINITY ? 0 : tMin,
            temperatureMax: tMax === Number.NEGATIVE_INFINITY ? 0 : tMax,
            precipitationAmount: Math.round(pTotal * 10) / 10,
            precipitationChance: Math.round(pChanceMax),
            precipitationType: pTotal > 0 ? (dominant.includes("SNOW") ? "SNOW" : "RAIN") : "CLEAR",
            windSpeed: subEntries.length > 0 ? Math.round((windSum / subEntries.length) * 10) / 10 : 0,
            windSpeedMax: windMax,
            cloudCover: subEntries.length > 0 ? Math.min(1, Math.max(0, Math.round(cloudSum / subEntries.length) / 100)) : 0,
            daylight: isDaylight,
            precipitationAmountByType: [],
        };
    }
}
