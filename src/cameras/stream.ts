export type Route = "webrtc" | "hls" | "mjpeg" | "snapshot" | "placeholder";
// ponytail: enum values double as their labels, the host shows them raw.
export const LAYOUTS = ["Single", "Side by side", "Rotate all"] as const;
export type Layout = (typeof LAYOUTS)[number];

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

/** The camera ids on screen for a layout, starting at `index`. Never repeats a camera. */
export function shownCameras(all: string[], layout: Layout, index = 0): string[] {
  if (all.length === 0) return [];
  const i = nextIndex(index, all.length, 0);
  if (layout === "Side by side" && all.length > 1) return [all[i]!, all[nextIndex(i, all.length)]!];
  return [all[i]!];
}
