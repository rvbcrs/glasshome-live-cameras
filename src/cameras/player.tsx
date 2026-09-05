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
import { mjpegPath, type Route, routesFor } from "./stream";

/** A rung that shows no frame within this window is skipped. */
const FIRST_FRAME_MS = 8000;
const SNAPSHOT_MS = 10_000;

type Stop = () => void;
type Signals = { onFrame: () => void; onFail: () => void };

export interface PlayerProps {
  entityId: string;
  /** First frame of whichever route won (placeholder counts). */
  onReady?: () => void;
  /** The route now on screen. */
  onRoute?: (route: Route) => void;
}

/**
 * Fills its parent with the camera. Walks the playback ladder from `routesFor`
 * and drops one rung on every failure, ending in a still placeholder.
 */
export function Player(props: PlayerProps) {
  const entity = useEntity(() => props.entityId);
  const [rung, setRung] = createSignal(0);
  const [route, setRoute] = createSignal<Route>("placeholder");
  let video!: HTMLVideoElement;
  let img!: HTMLImageElement;

  const ladder = (): Route[] => {
    const e = entity();
    if (!e || e.state === "unavailable" || e.state === "unknown") return ["placeholder"];
    // The Hub's demo camera has nothing behind it; the preview must not wait on a stream.
    if (e.attributes.access_token === "demo-token") return ["placeholder"];
    return routesFor(e.attributes);
  };

  createEffect(on(() => props.entityId, () => setRung(0), { defer: true }));

  // A boolean memo: the entity view is replaced on every HA update and must
  // not restart the stream each time.
  const loaded = createMemo(() => entity() !== undefined);

  createEffect(() => {
    const id = props.entityId;
    const r = rung();
    if (!loaded()) return;
    // Attributes rotate (tokens, pictures); only the ladder shape may restart a stream.
    const routes = untrack(ladder);
    const current = routes[Math.min(r, routes.length - 1)]!;
    setRoute(current);
    // Callbacks run untracked: the parent reads its own signals in them, and
    // those must not become dependencies of this effect.
    untrack(() => props.onRoute?.(current));
    if (current === "placeholder") {
      untrack(() => props.onReady?.());
      return;
    }

    let alive = true;
    let stop: Stop | undefined;
    const fail = () => {
      if (!alive) return;
      alive = false;
      clearTimeout(timer);
      stop?.();
      setRung((n) => n + 1);
    };
    const timer = setTimeout(fail, FIRST_FRAME_MS);
    const signals: Signals = {
      onFrame: () => {
        if (!alive) return;
        clearTimeout(timer);
        props.onReady?.();
      },
      onFail: fail,
    };
    onCleanup(() => {
      alive = false;
      clearTimeout(timer);
      stop?.();
    });

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
            ? Promise.resolve(startMjpeg(id, token, img, signals))
            : Promise.resolve(startSnapshot(picture, img, signals));
    start.then((s) => (alive ? (stop = s) : s()), fail);
  });

  const usesVideo = () => route() === "webrtc" || route() === "hls";
  const usesImg = () => route() === "mjpeg" || route() === "snapshot";

  return (
    <div class="relative h-full w-full overflow-hidden bg-black">
      <video ref={video} class="absolute inset-0 h-full w-full object-cover" classList={{ hidden: !usesVideo() }} autoplay muted playsinline />
      <img ref={img} class="absolute inset-0 h-full w-full object-cover" classList={{ hidden: !usesImg() }} alt="" draggable={false} />
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

  return () => {
    pc.close();
    video.srcObject = null;
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
  video.addEventListener("loadeddata", s.onFrame, { once: true });

  if (video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = url;
    void video.play().catch(() => {});
    return () => {
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
  return () => hls.destroy();
}

function startMjpeg(id: string, token: string | undefined, img: HTMLImageElement, s: Signals): Stop {
  img.onload = s.onFrame;
  img.onerror = s.onFail;
  img.src = hassMediaUrl(mjpegPath(id, token)) ?? "";
  return () => {
    img.onload = null;
    img.onerror = null;
    img.removeAttribute("src");
  };
}

function startSnapshot(picture: string | undefined, img: HTMLImageElement, s: Signals): Stop {
  const base = hassMediaUrl(picture);
  if (!base) {
    s.onFail();
    return () => {};
  }
  const load = () => {
    img.src = `${base}${base.includes("?") ? "&" : "?"}_ts=${Date.now()}`;
  };
  img.onload = s.onFrame;
  img.onerror = s.onFail;
  load();
  const timer = setInterval(load, SNAPSHOT_MS);
  return () => {
    clearInterval(timer);
    img.onload = null;
    img.onerror = null;
    img.removeAttribute("src");
  };
}
