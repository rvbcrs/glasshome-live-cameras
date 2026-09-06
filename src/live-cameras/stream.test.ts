import { describe, expect, test } from "bun:test";
import { activitySensors, fitClass, isActivity, mjpegPath, nextIndex, routesFor, shownCameras } from "./stream";

describe("routesFor", () => {
  test("web_rtc cameras try WebRTC first, then the rest of the ladder", () => {
    expect(routesFor({ frontend_stream_type: "web_rtc" })).toEqual(["webrtc", "hls", "mjpeg", "snapshot", "placeholder"]);
  });
  test("hls cameras skip WebRTC", () => {
    expect(routesFor({ frontend_stream_type: "hls" })).toEqual(["hls", "mjpeg", "snapshot", "placeholder"]);
  });
  test("cameras without a stream type go straight to MJPEG", () => {
    expect(routesFor({})).toEqual(["mjpeg", "snapshot", "placeholder"]);
    expect(routesFor(undefined)).toEqual(["mjpeg", "snapshot", "placeholder"]);
  });
});

describe("mjpegPath", () => {
  test("carries the signed token", () => {
    expect(mjpegPath("camera.door", "a b")).toBe("/api/camera_proxy_stream/camera.door?token=a%20b");
  });
  test("works without a token", () => {
    expect(mjpegPath("camera.door", undefined)).toBe("/api/camera_proxy_stream/camera.door");
  });
});

describe("nextIndex", () => {
  test("wraps both ways", () => {
    expect(nextIndex(2, 3)).toBe(0);
    expect(nextIndex(0, 3, -1)).toBe(2);
    expect(nextIndex(5, 0)).toBe(0);
    expect(nextIndex(7, 3, 0)).toBe(1);
  });
});

describe("shownCameras", () => {
  const all = ["camera.a", "camera.b", "camera.c"];
  test("single and rotate show one camera, pair shows two, grid up to four", () => {
    expect(shownCameras(all, "Single")).toEqual(["camera.a"]);
    expect(shownCameras(all, "Rotate all", 2)).toEqual(["camera.c"]);
    expect(shownCameras(all, "Side by side")).toEqual(["camera.a", "camera.b"]);
    expect(shownCameras([...all, "camera.d", "camera.e"], "Grid 2x2", 3)).toEqual(["camera.d", "camera.e", "camera.a", "camera.b"]);
  });
  test("pair wraps around from the index", () => {
    expect(shownCameras(all, "Side by side", 2)).toEqual(["camera.c", "camera.a"]);
  });
  test("never repeats a camera, and nothing shows nothing", () => {
    expect(shownCameras(["camera.a"], "Side by side")).toEqual(["camera.a"]);
    expect(shownCameras(all, "Grid 2x2")).toEqual(all);
    expect(shownCameras([], "Grid 2x2")).toEqual([]);
  });
});

describe("fitClass", () => {
  test("maps the four choices onto object-fit and position classes", () => {
    expect(fitClass("Fill")).toBe("object-cover object-center");
    expect(fitClass("Fit")).toContain("object-contain");
    expect(fitClass("Fill top")).toContain("object-top");
    expect(fitClass("Fill bottom")).toContain("object-bottom");
    expect(fitClass(undefined)).toContain("object-cover");
  });
});

describe("activitySensors", () => {
  const registry = [
    { entity_id: "camera.door", device_id: "dev1" },
    { entity_id: "binary_sensor.door_motion", device_id: "dev1", original_device_class: "motion" },
    { entity_id: "binary_sensor.door_online", device_id: "dev1", original_device_class: "connectivity" },
    { entity_id: "event.door_chime", device_id: "dev1", original_device_class: "doorbell" },
    { entity_id: "sensor.door_battery", device_id: "dev1", original_device_class: "battery" },
    { entity_id: "binary_sensor.garden_motion", device_id: "dev2", original_device_class: "motion" },
    { entity_id: "binary_sensor.overridden", device_id: "dev1", device_class: "occupancy", original_device_class: "motion" },
  ];
  test("finds motion and doorbell sensors on the camera's device only", () => {
    expect(activitySensors(registry, "dev1").map((e) => e.entity_id)).toEqual([
      "binary_sensor.door_motion",
      "event.door_chime",
      "binary_sensor.overridden",
    ]);
  });
  test("a camera without a device has no sensors", () => {
    expect(activitySensors(registry, null)).toEqual([]);
  });
});

describe("isActivity", () => {
  test("binary sensors are active while on", () => {
    expect(isActivity("binary_sensor.m", "on", "off")).toBe(true);
    expect(isActivity("binary_sensor.m", "on", undefined)).toBe(true);
    expect(isActivity("binary_sensor.m", "off", "on")).toBe(false);
    expect(isActivity("binary_sensor.m", "unavailable", "on")).toBe(false);
  });
  test("event entities fire on a timestamp change, not on first sight", () => {
    expect(isActivity("event.chime", "2026-09-05T20:00:00+00:00", undefined)).toBe(false);
    expect(isActivity("event.chime", "2026-09-05T20:00:00+00:00", "2026-09-05T20:00:00+00:00")).toBe(false);
    expect(isActivity("event.chime", "2026-09-05T20:01:00+00:00", "2026-09-05T20:00:00+00:00")).toBe(true);
  });
});
