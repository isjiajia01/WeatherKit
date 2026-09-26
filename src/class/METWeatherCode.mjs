import { Console } from "@nsnanocat/util";

/**
 * MET Norway Weather Symbol Codes to Apple WeatherKit WeatherCondition mapping.
 * Official MET Norway Locationforecast / Weathericon 2.0 defines 40+ base condition codes
 * optionally suffixed with _day, _night, or _polartwilight.
 */
export default class METWeatherCode {
    static #BASE_MAP = {
        // Clear & Clouds
        clearsky: "CLEAR",
        fair: "MOSTLY_CLEAR",
        partlycloudy: "PARTLY_CLOUDY",
        cloudy: "CLOUDY",
        fog: "FOGGY",

        // Rain
        lightrain: "DRIZZLE",
        lightrainshowers: "DRIZZLE",
        rain: "RAIN",
        rainshowers: "RAIN",
        heavyrain: "HEAVY_RAIN",
        heavyrainshowers: "HEAVY_RAIN",

        // Sleet & Mixed
        lightsleet: "WINTRY_MIX",
        lightsleetshowers: "WINTRY_MIX",
        sleet: "WINTRY_MIX",
        sleetshowers: "WINTRY_MIX",
        heavysleet: "WINTRY_MIX",
        heavysleetshowers: "WINTRY_MIX",

        // Snow
        lightsnow: "FLURRIES",
        lightsnowshowers: "FLURRIES",
        snow: "SNOW",
        snowshowers: "SNOW",
        heavysnow: "HEAVY_SNOW",
        heavysnowshowers: "HEAVY_SNOW",

        // Thunder & Showers
        lightrainandthunder: "ISOLATED_THUNDERSTORMS",
        lightrainshowersandthunder: "ISOLATED_THUNDERSTORMS",
        rainandthunder: "THUNDERSTORMS",
        rainshowersandthunder: "THUNDERSTORMS",
        heavyrainandthunder: "THUNDERSTORMS",
        heavyrainshowersandthunder: "THUNDERSTORMS",

        lightsleetandthunder: "THUNDERSTORMS",
        lightsleetshowersandthunder: "THUNDERSTORMS",
        lightssleetshowersandthunder: "THUNDERSTORMS", // MET Norway typo preserved for compatibility
        sleetandthunder: "THUNDERSTORMS",
        sleetshowersandthunder: "THUNDERSTORMS",
        heavysleetandthunder: "THUNDERSTORMS",
        heavysleetshowersandthunder: "THUNDERSTORMS",

        lightsnowandthunder: "THUNDERSTORMS",
        lightsnowshowersandthunder: "THUNDERSTORMS",
        lightssnowshowersandthunder: "THUNDERSTORMS", // MET Norway typo preserved for compatibility
        snowandthunder: "THUNDERSTORMS",
        snowshowersandthunder: "THUNDERSTORMS",
        heavysnowandthunder: "BLIZZARD",
        heavysnowshowersandthunder: "BLIZZARD",
    };

    /**
     * Map a MET Norway symbol_code string to an Apple WeatherCondition identifier.
     * @param {string} symbolCode - e.g. "rainshowers_day", "clearsky_night"
     * @returns {string|null} Apple WeatherCondition enum name or null if unknown
     */
    static toConditionCode(symbolCode) {
        if (!symbolCode || typeof symbolCode !== "string") {
            return null;
        }
        // Strip _day, _night, _polartwilight suffixes
        const base = symbolCode.replace(/_(day|night|polartwilight)$/, "");
        const code = METWeatherCode.#BASE_MAP[base];
        if (!code) {
            Console.warn("METWeatherCode", `Unknown MET symbol_code: ${symbolCode}`);
            return null;
        }
        return code;
    }

    /**
     * Determine PrecipitationType from MET symbol_code.
     * @param {string} symbolCode - e.g. "snow_day", "heavyrain"
     * @returns {"CLEAR"|"RAIN"|"SNOW"|"SLEET"|"MIXED"} Apple PrecipitationType enum name
     */
    static toPrecipitationType(symbolCode) {
        if (!symbolCode || typeof symbolCode !== "string") {
            return "CLEAR";
        }
        const base = symbolCode.replace(/_(day|night|polartwilight)$/, "").toLowerCase();
        if (base.includes("sleet")) {
            return "SLEET";
        }
        if (base.includes("snow")) {
            return "SNOW";
        }
        if (base.includes("rain")) {
            return "RAIN";
        }
        return "CLEAR";
    }

    /**
     * Safely wraps conditionCode for object spreading so unknown codes are omitted.
     * @param {string} symbolCode
     * @returns {{conditionCode?: string}}
     */
    static toConditionCodeField(symbolCode) {
        const conditionCode = METWeatherCode.toConditionCode(symbolCode);
        return conditionCode ? { conditionCode } : {};
    }
}
