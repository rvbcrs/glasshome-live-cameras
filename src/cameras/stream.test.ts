import { describe, expect, test } from "bun:test";
import { mjpegPath, nextIndex, routesFor, shownCameras } from "./stream";

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
  test("single and rotate show one camera, pair shows two", () => {
    expect(shownCameras(all, "Single")).toEqual(["camera.a"]);
    expect(shownCameras(all, "Rotate all", 2)).toEqual(["camera.c"]);
    expect(shownCameras(all, "Side by side")).toEqual(["camera.a", "camera.b"]);
  });
  test("pair wraps around from the index", () => {
    expect(shownCameras(all, "Side by side", 2)).toEqual(["camera.c", "camera.a"]);
  });
  test("pair with one camera shows one pane, and nothing shows nothing", () => {
    expect(shownCameras(["camera.a"], "Side by side")).toEqual(["camera.a"]);
    expect(shownCameras([], "Side by side")).toEqual([]);
  });
});
