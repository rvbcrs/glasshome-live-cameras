import {
  getEntityAttribute,
  getStream,
  getWebRtcClientConfig,
  hassMediaUrl,
  sendWebRtcCandidate,
  startWebRtcSession,
  state,
  useEntity,
} from "@glasshome/widget-sdk";
import { Icon } from "@iconify-icon/solid";
import Hls from "hls.js/light";
import { createEffect, createMemo, createSignal, on, onCleanup, untrack } from "solid-js";
import { type Fit, fitClass, mjpegPath, releaseAllBut, type Route, routesFor } from "./stream";

/** A rung that shows no frame within this window is skipped. */
const FIRST_FRAME_MS = 8000;
const SNAPSHOT_MS = 10_000;
/** A video that stops advancing for this long is reconnected. */
const STALL_MS = 12_000;
/** Pause before reconnecting a stream that was playing and then failed. */
const RECONNECT_MS = 3000;
/** A camera that fell all the way to the placeholder is retried at this pace. */
const RETRY_MS = 60_000;

type Stop = () => void;
type Signals = { onFrame: () => void; onFail: () => void };

export interface PlayerProps {
  entityId: string;
  muted?: boolean;
  fit?: Fit;
  /** First frame of whichever route won (placeholder counts). */
  onReady?: () => void;
  /** The route now on screen. */
  onRoute?: (route: Route) => void;
  /** A new frame arrived on an image route (MJPEG or snapshot). */
  onFrame?: (at: number) => void;
}

/**
 * Fills its parent with the camera. Walks the playback ladder from `routesFor`
 * and drops one rung on every failure before the first frame, ending in a
 * still placeholder. A stream that played and then died is reconnected from
 * the top of the ladder instead, and a placeholder is retried once a minute.
 */
export function Player(props: PlayerProps) {
  const entity = useEntity(() => props.entityId);
  const [rung, setRung] = createSignal(0);
  const [attempt, setAttempt] = createSignal(0);
  const [route, setRoute] = createSignal<Route>("placeholder");
  // Each picture element stays hidden until a frame really landed on it, and
  // keeps that frame across reconnects and rung changes: a stream that dies
  // (the host's media proxy cuts MJPEG after ~10 s of silence) must neither
  // blank the tile nor show Safari's broken-image icon.
  const [videoOk, setVideoOk] = createSignal(false);
  const [imgOk, setImgOk] = createSignal(false);
  let video!: HTMLVideoElement;
  let img!: HTMLImageElement;
  // MJPEG frames on this element, oldest first; the last one stays on screen between streams.
  const blobs: string[] = [];
  onCleanup(() => releaseAllBut(blobs, "", URL.revokeObjectURL));

  const ladder = (): Route[] => {
    const e = entity();
    if (!e || e.state === "unavailable" || e.state === "unknown") return ["placeholder"];
    // The Hub's demo camera has nothing behind it; the preview must not wait on a stream.
    if (e.attributes.access_token === "demo-token") return ["placeholder"];
    return routesFor(e.attributes);
  };

  createEffect(
    on(
      () => props.entityId,
      () => {
        setRung(0);
        setVideoOk(false);
        setImgOk(false);
      },
      { defer: true },
    ),
  );
  createEffect(() => {
    video.muted = props.muted ?? true;
  });

  // A boolean memo: the entity view is replaced on every HA update and must
  // not restart the stream each time.
  const loaded = createMemo(() => entity() !== undefined);

  createEffect(() => {
    const id = props.entityId;
    const r = rung();
    attempt();
    if (!loaded()) return;
    // Attributes rotate (tokens, pictures); only the ladder shape may restart a stream.
    const routes = untrack(ladder);
    const current = routes[Math.min(r, routes.length - 1)]!;
    setRoute(current);
    // Callbacks run untracked: the parent reads its own signals in them, and
    // those must not become dependencies of this effect.
    untrack(() => props.onRoute?.(current));

    let alive = true;
    let stop: Stop | undefined;
    let hadFrame = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (fn: () => void, ms: number) => timers.push(setTimeout(fn, ms));
    onCleanup(() => {
      alive = false;
      for (const t of timers) clearTimeout(t);
      stop?.();
    });

    if (current === "placeholder") {
      untrack(() => props.onReady?.());
      if (routes.length > 1) later(() => setRung(0), RETRY_MS);
      return;
    }

    const fail = () => {
      if (!alive) return;
      alive = false;
      for (const t of timers) clearTimeout(t);
      stop?.();
      // Died mid-stream: come back from the top after a breather. Never showed
      // a frame: this route is not for this camera, try the next one.
      if (hadFrame) timers.push(setTimeout(() => (r === 0 ? setAttempt((n) => n + 1) : setRung(0)), RECONNECT_MS));
      else setRung((n) => n + 1);
    };
    later(() => !hadFrame && fail(), FIRST_FRAME_MS);
    const signals: Signals = {
      onFrame: () => {
        if (!alive) return;
        const first = !hadFrame;
        hadFrame = true;
        (current === "webrtc" || current === "hls" ? setVideoOk : setImgOk)(true);
        untrack(() => {
          if (first) props.onReady?.();
          if (current === "mjpeg" || current === "snapshot") props.onFrame?.(Date.now());
        });
      },
      onFail: fail,
    };

    // The entity view is a store proxy: a tracked read here would restart the
    // stream on every attribute update, so the token and picture are read untracked.
    const { token, picture } = untrack(() => {
      const e = entity()!;
      return { token: getEntityAttribute<string>(e, "access_token"), picture: getEntityAttribute<string>(e, "entity_picture") };
    });
    const start =
      current === "webrtc"
        ? startWebrtc(id, video, signals)
        : current === "hls"
          ? startHls(id, video, signals)
          : current === "mjpeg"
            ? startMjpeg(id, token, img, blobs, signals)
            : Promise.resolve(startSnapshot(picture, img, signals));
    start.then((s) => (alive ? (stop = s) : s()), fail);

    // Watchdog for video routes: a frozen picture is worse than a reconnect.
    if (current === "webrtc" || current === "hls") {
      let lastTime = -1;
      let lastProgress = Date.now();
      const tick = setInterval(() => {
        if (!alive) return clearInterval(tick);
        if (video.currentTime !== lastTime) {
          lastTime = video.currentTime;
          lastProgress = Date.now();
        } else if (hadFrame && Date.now() - lastProgress > STALL_MS) fail();
      }, 2000);
      onCleanup(() => clearInterval(tick));
    }
  });

  const usesVideo = () => route() === "webrtc" || route() === "hls";
  const usesImg = () => route() === "mjpeg" || route() === "snapshot";
  const fit = () => fitClass(props.fit);

  return (
    <div class="relative h-full w-full overflow-hidden bg-black">
      <video ref={video} class={`absolute inset-0 h-full w-full ${fit()}`} classList={{ hidden: !usesVideo() || !videoOk() }} autoplay playsinline />
      <img ref={img} class={`absolute inset-0 h-full w-full ${fit()}`} classList={{ hidden: !usesImg() || !imgOk() }} alt="" draggable={false} />
      <div
        class="absolute inset-0 flex items-center justify-center text-white/40"
        classList={{ hidden: route() !== "placeholder" }}
        style={{ background: "radial-gradient(120% 90% at 50% 110%, #2a3140 0%, #12151c 60%, #0a0c10 100%)" }}
      >
        <Icon icon="mdi:cctv" width={28} />
      </div>
    </div>
  );
}

async function startWebrtc(id: string, video: HTMLVideoElement, s: Signals): Promise<Stop> {
  const cfg = await getWebRtcClientConfig(id);
  const pc = new RTCPeerConnection(cfg.configuration as RTCConfiguration);
  if (cfg.dataChannel) pc.createDataChannel(cfg.dataChannel);
  pc.addTransceiver("video", { direction: "recvonly" });
  pc.addTransceiver("audio", { direction: "recvonly" });

  // Candidates on both sides can arrive before the session id or the answer exist.
  const localQueue: RTCIceCandidateInit[] = [];
  const remoteQueue: RTCIceCandidateInit[] = [];
  let sessionId: string | null = null;
  let answered = false;
  pc.onicecandidate = (ev) => {
    if (!ev.candidate) return;
    const c = ev.candidate.toJSON();
    if (sessionId) void sendWebRtcCandidate(id, sessionId, c as Record<string, unknown>).catch(() => {});
    else localQueue.push(c);
  };
  pc.ontrack = (ev) => {
    video.srcObject = ev.streams[0] ?? new MediaStream([ev.track]);
    void video.play().catch(() => {});
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed" || pc.connectionState === "closed") s.onFail();
  };
  video.addEventListener("loadeddata", s.onFrame, { once: true });

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  const { answer, session } = await startWebRtcSession(id, offer.sdp!, (cand) => {
    const c = cand as RTCIceCandidateInit;
    if (answered) void pc.addIceCandidate(c).catch(() => {});
    else remoteQueue.push(c);
  });
  sessionId = session.sessionId;
  await pc.setRemoteDescription({ type: "answer", sdp: answer });
  answered = true;
  for (const c of remoteQueue) void pc.addIceCandidate(c).catch(() => {});
  if (sessionId) for (const c of localQueue) void sendWebRtcCandidate(id, sessionId, c as Record<string, unknown>).catch(() => {});

  // The ended stream stays attached: the element keeps its last frame until
  // the next route replaces it.
  return () => {
    pc.close();
    void session.unsubscribe?.();
  };
}

/**
 * HA's HLS endpoints live on the HA origin. Native players do not care, hls.js
 * fetches and does, so its requests go through the same media proxy that
 * images use whenever the host provides one.
 */
function proxied(url: string): string {
  const base = state.hassUrl?.replace(/\/$/, "");
  if (!base || !url.startsWith(base)) return url;
  return hassMediaUrl(url.slice(base.length)) ?? url;
}

async function startHls(id: string, video: HTMLVideoElement, s: Signals): Promise<Stop> {
  const data = await getStream(id, { format: "hls" });
  const url = data.stream.url;
  if (!url) throw new Error("no HLS url");
  // A stream object left by WebRTC would win over `src`.
  video.srcObject = null;
  video.addEventListener("loadeddata", s.onFrame, { once: true });
  video.addEventListener("error", s.onFail, { once: true });

  if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = url;
    void video.play().catch(() => {});
    return () => {
      video.removeEventListener("error", s.onFail);
      video.removeAttribute("src");
      video.load();
    };
  }
  if (!Hls.isSupported()) throw new Error("HLS unsupported");
  const hls = new Hls({
    enableWorker: false,
    lowLatencyMode: true,
    backBufferLength: 30,
    xhrSetup: (xhr, u) => xhr.open("GET", proxied(u), true),
  });
  hls.on(Hls.Events.ERROR, (_ev, err) => {
    if (err.fatal) s.onFail();
  });
  hls.on(Hls.Events.MANIFEST_PARSED, () => void video.play().catch(() => {}));
  hls.loadSource(url);
  hls.attachMedia(video);
  return () => {
    video.removeEventListener("error", s.onFail);
    hls.destroy();
  };
}

const SOI = [0xff, 0xd8, 0xff];
const EOI = [0xff, 0xd9];

function indexOf(buf: Uint8Array, pat: number[], from = 0): number {
  outer: for (let i = from; i <= buf.length - pat.length; i++) {
    for (let k = 0; k < pat.length; k++) if (buf[i + k] !== pat[k]) continue outer;
    return i;
  }
  return -1;
}

/**
 * MJPEG through fetch, not `<img src>`: the browser only shows a multipart
 * part once the boundary of the next part arrives, and HA sends a new part
 * only when the picture changes, so a still camera would sit on a black tile.
 * Every complete JPEG is shown the moment its end marker is in.
 */
async function startMjpeg(id: string, token: string | undefined, img: HTMLImageElement, blobs: string[], s: Signals): Promise<Stop> {
  const url = hassMediaUrl(mjpegPath(id, token));
  if (!url) throw new Error("no MJPEG url");
  const ctrl = new AbortController();
  const res = await fetch(url, { credentials: "include", signal: ctrl.signal });
  if (!res.ok || !res.body) throw new Error(`MJPEG ${res.status}`);
  const reader = res.body.getReader();
  const show = (jpeg: Uint8Array) => {
    const u = URL.createObjectURL(new Blob([jpeg as BlobPart], { type: "image/jpeg" }));
    blobs.push(u);
    img.onload = () => {
      // Everything older than what is on screen can go, including the frame a previous stream left.
      while (blobs.length > 1 && blobs[0] !== u) URL.revokeObjectURL(blobs.shift()!);
      s.onFrame();
    };
    img.src = u;
  };

  void (async () => {
    let buf = new Uint8Array(0);
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const next = new Uint8Array(buf.length + value.length);
        next.set(buf);
        next.set(value, buf.length);
        buf = next;
        for (;;) {
          const start = indexOf(buf, SOI);
          if (start < 0) {
            buf = buf.subarray(Math.max(0, buf.length - 2));
            break;
          }
          const end = indexOf(buf, EOI, start + 3);
          if (end < 0) {
            buf = buf.subarray(start);
            break;
          }
          show(buf.slice(start, end + 2));
          buf = buf.subarray(end + 2);
        }
      }
      if (!ctrl.signal.aborted) s.onFail();
    } catch {
      if (!ctrl.signal.aborted) s.onFail();
    }
  })();

  return () => {
    ctrl.abort();
    void reader.cancel().catch(() => {});
    img.onload = null;
    releaseAllBut(blobs, img.src, URL.revokeObjectURL);
  };
}

function startSnapshot(picture: string | undefined, img: HTMLImageElement, s: Signals): Stop {
  const base = hassMediaUrl(picture);
  if (!base) {
    s.onFail();
    return () => {};
  }
  // Each still is fetched off screen first; the visible element only ever
  // swaps to a picture that decoded, so a refresh never flashes or breaks.
  let alive = true;
  const load = () => {
    const probe = new Image();
    probe.onload = () => {
      if (!alive) return;
      img.src = probe.src;
      s.onFrame();
    };
    probe.onerror = () => alive && s.onFail();
    probe.src = `${base}${base.includes("?") ? "&" : "?"}_ts=${Date.now()}`;
  };
  load();
  const timer = setInterval(load, SNAPSHOT_MS);
  return () => {
    alive = false;
    clearInterval(timer);
  };
}
