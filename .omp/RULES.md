# @nsringo/weatherkit — Project Sticky Rules

1. **Preserve FlatBuffer Slot Integrity**: Never overwrite unrequested or unknown FlatBuffer root slots; preserve opaque bytes to avoid corrupting Apple Weather responses.
2. **Defensive Weather Enums**: Never pass `null` or unmapped condition codes into FlatBuffers that map to default `CLEAR`. If a provider weather code is unknown, omit it or fallback to Apple.
3. **Graceful Multi-Tier Fallback**: Nordic provider calls must never crash the response. DMI failure falls back to MET; MET Nowcast failure preserves Locationforecast; MET failure preserves Apple WeatherKit data.
4. **Identifiable MET Norway User-Agent**: Every request to `api.met.no` must carry a compliant User-Agent header with application name, version, repo URL, and contact information.
5. **No Blind Network Coupling in Unit Tests**: Unit tests must use recorded fixtures and mocks; live network tests must be in dedicated optional live validation scripts.
6. **Timezone & Epoch Invariants**: All forecastStart/forecastEnd timestamps must be Unix epoch seconds in UTC; handle DST transitions safely.
7. **Clean Branch & Git History**: Work on `feat/nordic-weather-provider` with semantic commits; keep working tree clean.
