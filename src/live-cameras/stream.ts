export type Route = "webrtc" | "hls" | "mjpeg" | "snapshot" | "placeholder";
// ponytail: enum values double as their labels, the host shows them raw.
export const LAYOUTS = ["Single", "Side by side", "Grid 2x2", "Rotate all"] as const;
export type Layout = (typeof LAYOUTS)[number];
export const FITS = ["Fill", "Fit", "Fill top", "Fill bottom"] as const;
export type Fit = (typeof FITS)[number];

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

/**
 * Frees every blob url except `keep`, the frame on screen. That one stays in
 * the list and is freed by the next frame that lands, so a reconnect never
 * blanks the picture and never leaks more than one frame.
 */
export function releaseAllBut(urls: string[], keep: string, release: (u: string) => void): void {
  for (const u of urls.splice(0)) if (u === keep) urls.push(u);
  else release(u);
}

export function nextIndex(i: number, n: number, step = 1): number {
  if (n <= 0) return 0;
  return (((i + step) % n) + n) % n;
}

/** How many panes a layout shows at once. */
export function paneCount(layout: Layout): number {
  return layout === "Side by side" ? 2 : layout === "Grid 2x2" ? 4 : 1;
}

/** The camera ids on screen for a layout, starting at `index`. Never repeats a camera. */
export function shownCameras(all: string[], layout: Layout, index = 0): string[] {
  const n = Math.min(paneCount(layout), all.length);
  const out: string[] = [];
  for (let k = 0; k < n; k++) out.push(all[nextIndex(index, all.length, k)]!);
  return out;
}

/** Tailwind classes for a fit choice; literal strings so the compiler keeps them. */
export function fitClass(fit: Fit | undefined): string {
  if (fit === "Fit") return "object-contain object-center";
  if (fit === "Fill top") return "object-cover object-top";
  if (fit === "Fill bottom") return "object-cover object-bottom";
  return "object-cover object-center";
}

/** The slice of an HA entity registry entry the activity lookup reads. */
export interface RegistryLike {
  entity_id: string;
  device_id?: string | null;
  device_class?: string | null;
  original_device_class?: string | null;
}

export type ActivityKind = "motion" | "doorbell";

const ACTIVITY: Record<string, ActivityKind> = {
  motion: "motion",
  occupancy: "motion",
  moving: "motion",
  doorbell: "doorbell",
};

export function activityKind(entry: RegistryLike): ActivityKind | undefined {
  return ACTIVITY[entry.device_class ?? entry.original_device_class ?? ""];
}

/**
 * Motion and doorbell sensors that live on the same HA device as a camera:
 * `binary_sensor`s and `event` entities with a matching device class. This is
 * how Nest, Unifi, Reolink and Frigate expose them, so no configuration is
 * needed to pair them.
 */
export function activitySensors(entries: Iterable<RegistryLike>, deviceId: string | null | undefined): RegistryLike[] {
  if (!deviceId) return [];
  const out: RegistryLike[] = [];
  for (const e of entries) {
    if (e.device_id !== deviceId) continue;
    const domain = e.entity_id.split(".")[0];
    if (domain !== "binary_sensor" && domain !== "event") continue;
    if (activityKind(e)) out.push(e);
  }
  return out;
}

/**
 * Whether a sensor state change means "something is happening now". A binary
 * sensor is active while `on`; an event entity's state is the timestamp of its
 * last event, so any change after the first observed value is a new event.
 */
export function isActivity(entityId: string, state: string | undefined, previous: string | undefined): boolean {
  if (!state || state === "unavailable" || state === "unknown") return false;
  if (entityId.startsWith("event.")) return previous !== undefined && previous !== state;
  return state === "on";
}
