# Cameras Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A GlassHome widget that shows live HA cameras: one, two side by side, or rotating through all.

**Architecture:** One widget `cameras`. A pure `stream.ts` decides the playback ladder per camera and does the index maths; `player.tsx` runs the ladder (WebRTC → HLS → MJPEG → snapshot → placeholder) against a `<video>`/`<img>`; `index.tsx` composes panes, rotation with crossfade, the scrim overlay, gestures and the dialog.

**Tech Stack:** Bun, Vite, SolidJS, `@glasshome/widget-sdk` ^1.14.3, `hls.js` (light build), `@iconify-icon/solid`.

**Spec:** `docs/superpowers/specs/2026-09-05-cameras-widget-design.md`

## Global Constraints

- SDK range in manifest: `^1.14.1`. Capability: `{ domain: "camera", access: "read" }`.
- Languages en, nl, de, fr; every locale carries the full English key set (tested).
- Commits get plain messages, no attribution trailers.
- `bun test`, `bun run build` and `bunx glasshome-widget validate` pass before every commit.

---

### Task 1: Pure stream helpers

**Files:**
- Create: `src/cameras/stream.ts`
- Test: `src/cameras/stream.test.ts`

**Interfaces:**
- Produces: `type Route = "webrtc" | "hls" | "mjpeg" | "snapshot" | "placeholder"`, `routesFor(attrs)`, `mjpegPath(id, token)`, `nextIndex(i, n, step?)`, `type Layout = "Single" | "Side by side" | "Rotate all"`, `shownCameras(all, layout)`.

- [ ] **Step 1: Failing tests**

```ts
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
  });
});

describe("shownCameras", () => {
  const all = ["camera.a", "camera.b", "camera.c"];
  test("single shows the first, pair the first two, rotate all", () => {
    expect(shownCameras(all, "Single")).toEqual(["camera.a"]);
    expect(shownCameras(all, "Side by side")).toEqual(["camera.a", "camera.b"]);
    expect(shownCameras(all, "Rotate all")).toEqual(all);
  });
  test("pair with one camera shows one pane", () => {
    expect(shownCameras(["camera.a"], "Side by side")).toEqual(["camera.a"]);
  });
});
```

- [ ] **Step 2: Run** `bun test src/cameras/stream.test.ts` → fails, module missing.

- [ ] **Step 3: Implement**

```ts
export type Route = "webrtc" | "hls" | "mjpeg" | "snapshot" | "placeholder";
export type Layout = "Single" | "Side by side" | "Rotate all";
export const LAYOUTS = ["Single", "Side by side", "Rotate all"] as const;

/** The playback ladder for one camera, best route first. */
export function routesFor(attrs: Record<string, unknown> | undefined): Route[] {
  const type = attrs?.frontend_stream_type;
  if (type === "web_rtc") return ["webrtc", "hls", "mjpeg", "snapshot", "placeholder"];
  if (type === "hls") return ["hls", "mjpeg", "snapshot", "placeholder"];
  return ["mjpeg", "snapshot", "placeholder"];
}

export function mjpegPath(id: string, token: string | undefined): string {
  return `/api/camera_proxy_stream/${id}${token ? `?token=${encodeURIComponent(token)}` : ""}`;
}

export function nextIndex(i: number, n: number, step = 1): number {
  if (n <= 0) return 0;
  return (((i + step) % n) + n) % n;
}

export function shownCameras(all: string[], layout: Layout): string[] {
  if (layout === "Single") return all.slice(0, 1);
  if (layout === "Side by side") return all.slice(0, 2);
  return all;
}
```

- [ ] **Step 4: Run** → pass. **Step 5: Commit** `Add pure stream helpers`.

---

### Task 2: Strings

**Files:** `src/cameras/i18n.ts`, `src/cameras/i18n.test.ts` (same pattern as Sky's `src/shared/i18n.ts`: `STRINGS`, `detectLocale`, `setLocale`, `t`).

Keys: `cameras, live, off, noStream, noCameras, noCamerasHelp, unavailable, cfgCameras, cfgCamerasDesc, cfgLayout, cfgLayoutDesc, cfgInterval, cfgIntervalDesc, cfgShowName, cfgShowNameDesc, prev, next`.

Test: every locale has the English key set and no empty values. Commit `Add strings`.

---

### Task 3: Player

**Files:** `src/cameras/player.tsx`

**Interfaces:**
- Consumes: `routesFor`, `mjpegPath` from Task 1; SDK `getStream`, `getWebRtcClientConfig`, `startWebRtcSession`, `sendWebRtcCandidate`, `hassMediaUrl`, `useEntity`; `isDemoMode` from `@glasshome/sync-layer` (host-provided).
- Produces: `<Player entityId onReady? onRoute? class? />`. Renders a fill-parent surface. Calls `onReady()` on the first frame of whichever route wins; `onRoute(route)` whenever the active route changes (`"placeholder"` means nothing plays).

Behaviour: `createEffect` keyed on `(entityId, rung)` starts a route and registers `onCleanup` for its teardown; a route fails → `setRung(r => r + 1)`. First-frame timeout 8 s. Demo mode jumps straight to `placeholder`. Snapshot refreshes every 10 s with a cache-busting query.

Commit `Add camera player with playback ladder`.

---

### Task 4: Widget

**Files:** `src/cameras/index.tsx`, `src/cameras/manifest.json`, `src/cameras/cameras.css`

Config: `title`, `cameras: field.entities("camera")`, `layout: field.choice(LAYOUTS, { default: "Single" })`, `interval: field.number({ default: 10, min: 3, max: 120 })`, `showName: field.toggle({ default: true })`.

Body: `Pane` (Player + scrim + name + live dot) per shown camera; rotate keeps `index` and `incoming`, mounts the incoming Pane hidden, swaps on `onReady` with a 300 ms opacity crossfade. `useIntersectionPause` on the widget root and `visibilitychange` unmount the players. Gestures: tap → `nextIndex`, hold → dialog with a large Player and prev/next. Empty states for no cameras and for `unavailable`.

Commit `Add Cameras widget`.

---

### Task 5: Build, validate, preview, connect

- `bun run build && bunx glasshome-widget validate && bunx glasshome-widget preview`
- `bunx glasshome-widget connect http://192.168.0.248:3124` in the background; verify each route on the live dashboard.
- README with usage and the escape-pattern note (video owns the surface). Commit `Add README and previews`.
