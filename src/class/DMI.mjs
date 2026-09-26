import { Console, fetch } from "@nsnanocat/util";

export default class DMI {
    static Name = "DMI";
    static Version = "1.0.0";
    static BaseUrl = "https://opendataapi.dmi.dk/v2/metObs/collections/observation/items";
    static MaxStationDistanceKm = 35; // Maximum distance to accept a Danish weather station
    static MaxObservationAgeMs = 30 * 60 * 1000; // 30 minutes freshness threshold

    // In-memory cache for recent observations
    static #Cache = new Map();

    /**
     * Clear DMI in-memory cache
     */
    static clearCache() {
        DMI.#Cache.clear();
    }

    constructor(parameters = {}, options = {}) {
        this.latitude = Number(parameters.latitude);
        this.longitude = Number(parameters.longitude);
        this.country = parameters.country;
        this.timeout = options.timeout ?? 4000; // short deadline to prevent delaying responses
    }

    /**
     * Check if coordinates or country are within Denmark's bounding box
     * Denmark approx: lat 54.5°N - 57.9°N, lon 8.0°E - 15.3°E
     * @returns {boolean}
     */
    isDenmark() {
        if (this.country === "DK") return true;
        if (!Number.isFinite(this.latitude) || !Number.isFinite(this.longitude)) return false;
        return this.latitude >= 54.4 && this.latitude <= 57.95 && this.longitude >= 7.9 && this.longitude <= 15.4;
    }

    get cacheKey() {
        if (!Number.isFinite(this.latitude) || !Number.isFinite(this.longitude)) return null;
        return `${this.latitude.toFixed(2)},${this.longitude.toFixed(2)}`;
    }

    /**
     * Calculate Haversine distance between two coordinates in km
     * @param {number} lat1
     * @param {number} lon1
     * @param {number} lat2
     * @param {number} lon2
     * @returns {number} distance in km
     */
    static calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth radius in km
        const dLat = ((lat2 - lat1) * Math.PI) / 180;
        const dLon = ((lon2 - lon1) * Math.PI) / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    /**
     * Fetch recent observations near coordinates
     * @returns {Promise<object|null>}
     */
    async fetchObservations() {
        Console.info("☑️ DMI.fetchObservations");
        if (!this.isDenmark()) {
            Console.info("DMI.fetchObservations", "Location is outside Denmark, skipping");
            return null;
        }

        const key = this.cacheKey;
        const now = Date.now();
        const cached = key ? DMI.#Cache.get(key) : null;
        if (cached && now < cached.expiresAt) {
            Console.info("DMI.fetchObservations", "Using memory cache");
            return cached.data;
        }

        // Bounding box: +/- 0.35 degrees around coordinate
        const minLat = (this.latitude - 0.35).toFixed(3);
        const maxLat = (this.latitude + 0.35).toFixed(3);
        const minLon = (this.longitude - 0.35).toFixed(3);
        const maxLon = (this.longitude + 0.35).toFixed(3);

        const url = `${DMI.BaseUrl}?bbox=${minLon},${minLat},${maxLon},${maxLat}&period=latest-10-minutes&limit=100`;

        try {
            const response = await fetch({
                url,
                method: "GET",
                headers: {
                    Accept: "application/geo+json, application/json",
                    "User-Agent": "WeatherKit/3.3.2 (https://github.com/NSRingo/WeatherKit; isjiajia01@gmail.com)",
                },
                timeout: this.timeout,
            });

            const statusCode = response.statusCode ?? response.status ?? 200;
            if (statusCode !== 200) {
                Console.warn("DMI.fetchObservations", `upstream status: ${statusCode}`);
                return cached ? cached.data : null;
            }

            const rawBody = response.body ?? "{}";
            const data = typeof rawBody === "string" ? JSON.parse(rawBody) : rawBody;

            if (key) {
                DMI.#Cache.set(key, {
                    data,
                    expiresAt: now + 5 * 60 * 1000, // 5 min TTL
                });
            }

            Console.info("✅ DMI.fetchObservations");
            return data;
        } catch (error) {
            Console.error("DMI.fetchObservations", error);
            return cached ? cached.data : null;
        }
    }

    /**
     * Extract normalized observation enhancement data from nearest station
     * @returns {Promise<object|null>}
     */
    async getObservationEnhancement() {
        Console.info("☑️ DMI.getObservationEnhancement");
        const data = await this.fetchObservations();
        const features = data?.features;
        if (!Array.isArray(features) || features.length === 0) {
            Console.info("DMI.getObservationEnhancement", "No station features in bbox");
            return null;
        }

        const now = Date.now();

        // Group observations by stationId
        const stations = new Map();
        for (const feature of features) {
            const coords = feature.geometry?.coordinates;
            const props = feature.properties;
            if (!coords || !props?.stationId || !props?.parameterId) continue;

            const observedTime = props.observed ? Date.parse(props.observed) : 0;
            if (now - observedTime > DMI.MaxObservationAgeMs) {
                continue; // Stale observation
            }

            const stationId = props.stationId;
            if (!stations.has(stationId)) {
                const distanceKm = DMI.calculateDistance(this.latitude, this.longitude, coords[1], coords[0]);
                stations.set(stationId, {
                    stationId,
                    coordinates: coords,
                    distanceKm,
                    observedTime,
                    parameters: new Map(),
                });
            }

            const st = stations.get(stationId);
            st.parameters.set(props.parameterId, props.value);
            if (observedTime > st.observedTime) {
                st.observedTime = observedTime;
            }
        }

        // Sort stations by distance
        const validStations = Array.from(stations.values())
            .filter(s => s.distanceKm <= DMI.MaxStationDistanceKm)
            .sort((a, b) => a.distanceKm - b.distanceKm);

        if (validStations.length === 0) {
            Console.info("DMI.getObservationEnhancement", "No active stations within range");
            return null;
        }
        // Find closest station with atmospheric observations (temp_dry or wind_speed)
        const atmosphericStation = validStations.find(s => s.parameters.has("temp_dry") || s.parameters.has("wind_speed") || s.parameters.has("pressure_at_sea")) || validStations[0];

        const params = atmosphericStation.parameters;

        const enhancement = {
            stationId: atmosphericStation.stationId,
            distanceKm: Math.round(atmosphericStation.distanceKm * 10) / 10,
            observedAt: Math.floor(atmosphericStation.observedTime / 1000),
            providerName: "Danish Meteorological Institute",
        };

        if (params.has("temp_dry")) {
            enhancement.temperature = params.get("temp_dry");
        }
        if (params.has("temp_dew")) {
            enhancement.temperatureDewPoint = params.get("temp_dew");
        }
        if (params.has("humidity")) {
            enhancement.humidity = params.get("humidity");
        }
        if (params.has("pressure_at_sea")) {
            enhancement.pressure = params.get("pressure_at_sea");
        }
        if (params.has("wind_speed")) {
            enhancement.windSpeed = params.get("wind_speed");
        }
        if (params.has("wind_dir")) {
            enhancement.windDirection = params.get("wind_dir");
        }
        if (params.has("wind_max") || params.has("wind_gust_always_past10min")) {
            enhancement.windGust = params.get("wind_max") ?? params.get("wind_gust_always_past10min");
        }
        if (params.has("visibility") || params.has("visib_mean_last10min")) {
            enhancement.visibility = params.get("visibility") ?? params.get("visib_mean_last10min");
        }
        if (params.has("cloud_cover")) {
            enhancement.cloudCover = Math.min(1, Math.max(0, params.get("cloud_cover") / 100));
        }

        // If any closer station has precip_past10min, include it
        for (const st of validStations) {
            if (st.parameters.has("precip_past10min") && enhancement.precipitationAmount10m == null) {
                enhancement.precipitationAmount10m = st.parameters.get("precip_past10min");
                break;
            }
        }

        Console.info("✅ DMI.getObservationEnhancement", `station: ${atmosphericStation.stationId}, distance: ${enhancement.distanceKm} km, temp: ${enhancement.temperature}°C`);
        return enhancement;
    }
}
