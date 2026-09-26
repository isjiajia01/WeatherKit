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

        // Apply DMI observation enhancement if available
        if (dmiEnhancement) {
            Console.info("NordicWeather.CurrentWeather", `Applying DMI observation enhancement from station ${dmiEnhancement.stationId} (${dmiEnhancement.distanceKm} km)`);

            if (dmiEnhancement.temperature != null) {
                currentWeather.temperature = dmiEnhancement.temperature;
            }
            if (dmiEnhancement.temperatureDewPoint != null) {
                currentWeather.temperatureDewPoint = dmiEnhancement.temperatureDewPoint;
            }
            if (dmiEnhancement.humidity != null) {
                currentWeather.humidity = dmiEnhancement.humidity;
            }
            if (dmiEnhancement.pressure != null) {
                currentWeather.pressure = dmiEnhancement.pressure;
            }
            if (dmiEnhancement.windSpeed != null) {
                currentWeather.windSpeed = dmiEnhancement.windSpeed;
            }
            if (dmiEnhancement.windDirection != null) {
                currentWeather.windDirection = dmiEnhancement.windDirection;
            }
            if (dmiEnhancement.windGust != null) {
                currentWeather.windGust = dmiEnhancement.windGust;
            }
            if (dmiEnhancement.visibility != null) {
                currentWeather.visibility = dmiEnhancement.visibility;
            }

            // Update metadata to reflect both MET Norway and DMI
            currentWeather.metadata.providerName = "MET Norway · DMI";
            currentWeather.metadata.attributionUrl = "https://www.met.no/";
            currentWeather.metadata.providerLogo = providerNameToLogo("MET Norway · DMI");
            currentWeather.asOf = dmiEnhancement.observedAt || currentWeather.asOf;
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
        return this.met.ForecastHourly(hourlysteps, begin);
    }

    /**
     * Daily forecast using MET Norway Locationforecast
     * @param {number} [dailysteps=10]
     * @param {number} [begin]
     * @returns {Promise<object|null>}
     */
    async Daily(dailysteps = 10, begin = undefined) {
        Console.info("☑️ NordicWeather.Daily");
        return this.met.Daily(dailysteps, begin);
    }

    /**
     * Next-hour precipitation nowcast using MET Norway Nowcast
     * @returns {Promise<object|null>}
     */
    async Minutely() {
        Console.info("☑️ NordicWeather.Minutely");
        return this.met.Minutely();
    }
}
