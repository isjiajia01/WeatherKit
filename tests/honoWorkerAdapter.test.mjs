import assert from "node:assert/strict";
import test from "node:test";
import HonoWorkerAdapter from "../src/class/HonoWorkerAdapter.mjs";

test("WeatherKit endpoints route requests to Apple", () => {
    const cases = [
        ["https://weatherkit.pages.dev/api/v1/weatherAlerts?ids=jianye-101190110", "api/v1/weatherAlerts", "https://weatherkit.apple.com/api/v1/weatherAlerts?ids=jianye-101190110"],
        ["https://weatherkit.pages.dev/weatherkit.apple.com/api/v1/weatherAlerts?ids=jianye-101190110", "weatherkit.apple.com/api/v1/weatherAlerts", "https://weatherkit.apple.com/api/v1/weatherAlerts?ids=jianye-101190110"],
        ["https://custom-nordic-worker.workers.dev/api/v2/weather/en-US/55.6761/12.5683", "api/v2/weather/en-US/55.6761/12.5683", "https://weatherkit.apple.com/api/v2/weather/en-US/55.6761/12.5683"],
        ["https://custom-nordic-pages.pages.dev/api/v2/weather/en-US/55.6761/12.5683", "api/v2/weather/en-US/55.6761/12.5683", "https://weatherkit.apple.com/api/v2/weather/en-US/55.6761/12.5683"],
        ["https://weather.nanocat.cloud/weatherkit.apple.com/api/v2/weather/en-US/55.6761/12.5683", "weatherkit.apple.com/api/v2/weather/en-US/55.6761/12.5683", "https://weatherkit.apple.com/api/v2/weather/en-US/55.6761/12.5683"],
        ["https://weather.zhangjiajia.me/api/v2/weather/en-US/55.6761/12.5683", "api/v2/weather/en-US/55.6761/12.5683", "https://weatherkit.apple.com/api/v2/weather/en-US/55.6761/12.5683"],
    ];
    for (const [input, restPath, expected] of cases) {
        const url = HonoWorkerAdapter.routeRewrite(new URL(input), restPath);
        assert.equal(url.toString(), expected, input);
    }
});
