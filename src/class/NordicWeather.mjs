import { Console } from "@nsnanocat/util";
import providerNameToLogo from "../function/providerNameToLogo.mjs";
import DMI from "./DMI.mjs";
import METNorway from "./METNorway.mjs";

/**
 * Composite Nordic Weather Provider.
 * Integrates MET Norway (Locationforecast 2.0 & Nowcast 2.0) with DMI Open Data (metObs v2)
 * for Denmark-specific observational enhancement, with graceful field-level and product fallback.
 */
export default class NordicWeather {
    static Name = "NordicWeather";
    static Version = "1.0.0";

    constructor(parameters = {}, options = {}) {
        this.latitude = Number(parameters.latitude);
        this.longitude = Number(parameters.longitude);
        this.language = parameters.language || "en";
        this.country = parameters.country;
        this.options = options;

        this.met = new METNorway(parameters, options);
        this.dmi = new DMI(parameters, options);
    }

    /**
     * Current weather with DMI Denmark observation enhancement
     * @returns {Promise<object|null>}
     */
    async CurrentWeather() {
        Console.info("☑️ NordicWeather.CurrentWeather");

        // Concurrently query MET Norway and DMI
        const [metResult, dmiResult] = await Promise.allSettled([this.met.CurrentWeather(), this.dmi.isDenmark() ? this.dmi.getObservationEnhancement(this.options) : Promise.resolve(null)]);

        const currentWeather = metResult.status === "fulfilled" ? metResult.value : null;
        if (!currentWeather) {
            Console.warn("NordicWeather.CurrentWeather", "MET Norway current weather failed");
            return null; // Triggers fallback to Apple WeatherKit
        }

        const dmiEnhancement = dmiResult.status === "fulfilled" ? dmiResult.value : null;

        // Apply DMI observation enhancement if available.
        if (dmiEnhancement) {
            Console.info("NordicWeather.CurrentWeather", `Applying DMI observation enhancement from station ${dmiEnhancement.stationId} (${dmiEnhancement.distanceKm} km)`);
            const dmiFields = [
                ["temperature", "temperature"],
                ["temperatureDewPoint", "temperatureDewPoint"],
                ["humidity", "humidity"],
                ["pressure", "pressure"],
                ["windSpeed", "windSpeed"],
                ["windDirection", "windDirection"],
                ["windGust", "windGust"],
                ["visibility", "visibility"],
            ];
            let appliedDmiField = false;
            for (const [sourceKey, targetKey] of dmiFields) {
                if (dmiEnhancement[sourceKey] != null) {
                    currentWeather[targetKey] = dmiEnhancement[sourceKey];
                    appliedDmiField = true;
                }
            }
            if (appliedDmiField) {
                currentWeather.metadata.providerName = "MET Norway · DMI";
                currentWeather.metadata.attributionUrl = "https://www.met.no/";
                currentWeather.metadata.providerLogo = providerNameToLogo("MET Norway · DMI");
                currentWeather.asOf = dmiEnhancement.observedAt || currentWeather.asOf;
            }
        }

        Console.info("✅ NordicWeather.CurrentWeather");
        return currentWeather;
    }

    /**
     * Hourly forecast using MET Norway Locationforecast
     * @param {number} [hourlysteps=72]
     * @param {number} [begin]
     * @returns {Promise<object|null>}
     */
    async ForecastHourly(hourlysteps = 72, begin = undefined) {
        Console.info("☑️ NordicWeather.ForecastHourly");
        return await this.met.ForecastHourly(hourlysteps, begin);
    }

    async Daily(dailysteps = 10, begin = undefined) {
        Console.info("☑️ NordicWeather.Daily");
        return await this.met.Daily(dailysteps, begin);
    }

    async Minutely() {
        Console.info("☑️ NordicWeather.Minutely");
        return await this.met.Minutely();
    }
}
