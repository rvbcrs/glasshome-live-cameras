import {
  Button,
  defineConfig,
  defineWidget,
  field,
  type Infer,
  ResponsiveDialog,
  ResponsiveDialogBody,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  SchemaForm,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useEntities,
  useEntity,
  useIntersectionPause,
  useStore,
  useWidgetContext,
  useWidgetDialog,
  useWidgetDimensions,
  useWidgetGestures,
  Widget,
  WidgetDialog,
} from "@glasshome/widget-sdk";
import { Icon } from "@iconify-icon/solid";
import { createEffect, createMemo, createSignal, For, on, onCleanup, Show } from "solid-js";
import { t } from "./i18n";
import { Player } from "./player";
import {
  type ActivityKind,
  activityKind,
  activitySensors,
  FITS,
  isActivity,
  type Layout,
  LAYOUTS,
  nextIndex,
  paneCount,
  type Route,
  shownCameras,
} from "./stream";

const configSchema = defineConfig({
  title: field.title(),
  cameras: field.entities("camera", { title: t("cfgCameras"), description: t("cfgCamerasDesc") }),
  layout: field.choice(LAYOUTS, { title: t("cfgLayout"), description: t("cfgLayoutDesc"), default: "Single" }),
  interval: field.number({ title: t("cfgInterval"), description: t("cfgIntervalDesc"), min: 3, max: 120, default: 10 }),
  fit: field.choice(FITS, { title: t("cfgFit"), description: t("cfgFitDesc"), default: "Fill" }),
  motion: field.toggle({ title: t("cfgMotion"), description: t("cfgMotionDesc"), default: true }),
  hold: field.number({ title: t("cfgHold"), description: t("cfgHoldDesc"), min: 5, max: 300, default: 30 }),
  showName: field.toggle({ title: t("cfgShowName"), description: t("cfgShowNameDesc"), default: true }),
  names: field.list(
    field.group({ camera: field.entity("camera", { title: t("cfgNameCamera") }), name: field.text({ title: t("cfgNameText") }) }, { title: t("cfgName") }),
    { title: t("cfgNames"), description: t("cfgNamesDesc"), max: 16, labelField: "name" },
  ),
});
type Config = Infer<typeof configSchema>;

const dialogUi = {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogBody,
  ResponsiveDialogFooter,
  Button,
  SchemaForm,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} as const;

const FADE_MS = 300;

type Activity = { kind: ActivityKind; until: number };

function CamerasWidget(props: { config: Config }) {
  const ctx = useWidgetContext();
  const { showDialog, setShowDialog, openDialog, dialogProps } = useWidgetDialog();

  const cameras = () => props.config.cameras ?? [];
  // A blank name means "use the one from Home Assistant".
  const nameFor = (id: string) => props.config.names?.find((n) => (Array.isArray(n.camera) ? n.camera[0] : n.camera) === id)?.name?.trim() || undefined;
  const layout = (): Layout => props.config.layout ?? "Single";
  const holdMs = () => Math.max(5, props.config.hold ?? 30) * 1000;
  const [index, setIndex] = createSignal(0);
  const panes = createMemo(() => shownCameras(cameras(), layout(), index()));
  const [holdUntil, setHoldUntil] = createSignal(0);
  const [now, setNow] = createSignal(Date.now());
  const clock = setInterval(() => setNow(Date.now()), 1000);
  onCleanup(() => clearInterval(clock));

  /** Go to a camera and keep it there for a while; rotation waits. */
  const jumpTo = (i: number, ms: number) => {
    setIndex(nextIndex(i, cameras().length, 0));
    setHoldUntil(Date.now() + ms);
  };
  const advance = (step = 1) => jumpTo(index() + step, holdMs());

  // Rotation: the incoming pane fades in on its first frame, so a slow camera
  // never leaves a black gap. The stack below handles the crossfade.
  createEffect(() => {
    if (layout() !== "Rotate all" || cameras().length < 2) return;
    const timer = setInterval(() => {
      if (Date.now() < holdUntil()) return;
      setIndex((i) => nextIndex(i, cameras().length));
    }, Math.max(3, props.config.interval ?? 10) * 1000);
    onCleanup(() => clearInterval(timer));
  });

  // Motion and doorbell: sensors on the same HA device as each camera. A
  // firing sensor pulls its camera on screen and holds it there.
  const registry = useStore((s) => s.entityRegistry);
  const cameraViews = useEntities(cameras);
  const sensorMap = createMemo(() => {
    const map = new Map<string, string>(); // sensor id -> camera id
    if (!(props.config.motion ?? true)) return map;
    const entries = Object.values(registry() ?? {});
    for (const cam of cameraViews()) {
      for (const s of activitySensors(entries, cam.deviceId)) if (!map.has(s.entity_id)) map.set(s.entity_id, cam.id);
    }
    return map;
  });
  const sensorViews = useEntities(() => [...sensorMap().keys()]);
  const [activity, setActivity] = createSignal<Record<string, Activity>>({});
  const previous = new Map<string, string>();
  createEffect(() => {
    const map = sensorMap();
    for (const v of sensorViews()) {
      const cam = map.get(v.id);
      if (!cam) continue;
      const fired = isActivity(v.id, v.state, previous.get(v.id));
      previous.set(v.id, v.state);
      if (!fired) continue;
      const entry = registry()?.[v.id];
      const kind: ActivityKind = (entry && activityKind(entry)) || "motion";
      setActivity((a) => ({ ...a, [cam]: { kind, until: Date.now() + holdMs() } }));
      // Doorbell beats motion: a ring should not be pushed aside by a leaf blowing.
      const cams = cameras();
      const i = cams.indexOf(cam);
      const showing = activity()[cams[nextIndex(index(), cams.length, 0)]!];
      const outranked = kind === "motion" && showing?.kind === "doorbell" && showing.until > Date.now();
      if (i >= 0 && !panes().includes(cam) && !outranked) jumpTo(i, holdMs());
    }
  });
  const activityFor = (id: string): ActivityKind | undefined => {
    const a = activity()[id];
    return a && a.until > now() ? a.kind : undefined;
  };

  // Hidden tab or scrolled away: no player exists at all, no stream stays open.
  const [root, setRoot] = createSignal<HTMLDivElement>();
  const offscreen = useIntersectionPause(root);
  const [hidden, setHidden] = createSignal(typeof document !== "undefined" && document.hidden);
  const onVisibility = () => setHidden(document.hidden);
  document.addEventListener("visibilitychange", onVisibility);
  onCleanup(() => document.removeEventListener("visibilitychange", onVisibility));
  const paused = () => offscreen() || hidden();

  const gestures = useWidgetGestures(() => ({
    tap: cameras().length > paneCount(layout()) ? () => advance() : undefined,
    hold: { action: openDialog },
  }));
  onCleanup(gestures.dispose);

  const [muted, setMuted] = createSignal(true);
  const title = () => props.config.title || t("cameras");
  const emptyState = () =>
    cameras().length === 0
      ? { icon: <Icon icon="mdi:cctv-off" width={32} />, title: t("noCameras"), message: t("noCamerasHelp") }
      : undefined;
  const grid = () => panes().length > 2;
  const current = () => cameras()[nextIndex(index(), cameras().length, 0)]!;

  return (
    <>
      <Widget gestures={gestures} variant="classic-glass" emptyState={emptyState()}>
        <div
          ref={setRoot}
          class="absolute inset-0 gap-1 overflow-hidden rounded-[inherit]"
          classList={{ flex: !grid(), "grid grid-cols-2 grid-rows-2": grid() }}
        >
          <Show when={!paused() && cameras().length > 0}>
            <For each={panes()}>
              {(id) => (
                <Stack
                  entityId={id}
                  name={nameFor(id)}
                  showName={props.config.showName ?? true}
                  fit={props.config.fit}
                  activity={activityFor(id)}
                  dots={layout() === "Rotate all" && cameras().length > 1 ? { count: cameras().length, active: index() } : undefined}
                />
              )}
            </For>
          </Show>
        </div>
      </Widget>
      <WidgetDialog
        {...dialogUi}
        {...dialogProps}
        title={title()}
        maxWidth="lg"
        configSchema={configSchema}
        config={props.config}
        onConfigSave={(config) => {
          ctx.updateConfig(config);
          setShowDialog(false);
        }}
        controlsContent={
          <Show when={showDialog() && cameras().length > 0}>
            <div class="flex flex-col gap-3">
              <div class="relative w-full overflow-hidden rounded-xl bg-black" style={{ "aspect-ratio": "16 / 9" }}>
                {/* Only while open: controlsContent is built eagerly, and a hidden player would still stream. */}
                <Stack entityId={current()} name={nameFor(current())} showName large fit="Fit" muted={muted()} activity={activityFor(current())} />
              </div>
              <div class="flex items-center justify-between gap-2">
                <Button variant="outline" size="sm" disabled={cameras().length < 2} onClick={() => advance(-1)}>
                  <Icon icon="mdi:chevron-left" width={18} /> {t("prev")}
                </Button>
                <span class="text-xs tabular-nums text-muted-foreground">
                  {nextIndex(index(), cameras().length, 0) + 1} / {cameras().length}
                </span>
                <Button variant="outline" size="sm" onClick={() => setMuted((m) => !m)} aria-pressed={!muted()}>
                  <Icon icon={muted() ? "mdi:volume-off" : "mdi:volume-high"} width={18} /> {muted() ? t("unmute") : t("mute")}
                </Button>
                <Button variant="outline" size="sm" disabled={cameras().length < 2} onClick={() => advance()}>
                  {t("next")} <Icon icon="mdi:chevron-right" width={18} />
                </Button>
              </div>
            </div>
          </Show>
        }
      />
    </>
  );
}

interface StackProps {
  entityId: string;
  /** Overrides the Home Assistant name. */
  name?: string;
  showName: boolean;
  large?: boolean;
  fit?: Config["fit"];
  muted?: boolean;
  activity?: ActivityKind;
  dots?: { count: number; active: number };
}

type Slot = { id: string; key: number; ready: () => boolean; setReady: (v: boolean) => void };

/**
 * One pane. Every camera change pushes a new player on top at opacity 0; on
 * its first frame it fades in and the ones below are dropped. So a switch
 * never shows black, and a camera that never delivers still resolves to the
 * placeholder through the player's ladder.
 */
function Stack(props: StackProps) {
  const [slots, setSlots] = createSignal<Slot[]>([]);
  const [route, setRoute] = createSignal<Route>("placeholder");
  const [frameAt, setFrameAt] = createSignal(0);
  const [now, setNow] = createSignal(Date.now());
  let seq = 0;

  createEffect(
    on(
      () => props.entityId,
      (id) => {
        const [ready, setReady] = createSignal(false);
        const slot: Slot = { id, key: ++seq, ready, setReady };
        // Keep the last ready slot as the backdrop; a stale unready one is dead weight.
        setSlots((s) => [...s.filter((x) => x.ready()).slice(-1), slot]);
      },
    ),
  );

  const settle = (slot: Slot) => {
    slot.setReady(true);
    setTimeout(() => setSlots((s) => s.filter((x) => x.key >= slot.key)), FADE_MS);
  };

  // The age counter only ticks while a still is on screen.
  createEffect(() => {
    if (route() !== "snapshot") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    onCleanup(() => clearInterval(timer));
  });

  const top = () => slots().at(-1);
  const entity = useEntity(() => top()?.id ?? "");
  const state = () => entity()?.state;
  const off = () => state() === "unavailable" || state() === "unknown";
  // The top player has not shown a frame yet; the slot below (if any) is still on screen.
  const loading = () => !off() && !!top() && !top()!.ready();
  const blank = () => loading() && slots().length === 1;
  const live = () => !off() && !loading() && route() !== "placeholder" && route() !== "snapshot";
  const recording = () => live() && state() === "recording";
  const status = () =>
    off() ? t("unavailable") : loading() ? t("loading") : live() ? t("live") : route() === "snapshot" ? t("noStream") : state() === "idle" || state() === "streaming" || state() === "recording" ? t("noStream") : t("off");
  const age = () => (route() === "snapshot" && frameAt() ? t("ago", { s: Math.max(0, Math.round((now() - frameAt()) / 1000)) }) : null);

  // The dialog's large pane lives outside <Widget>, where the size hook throws.
  const dims = props.large ? undefined : useWidgetDimensions();
  const tiny = () => !!dims && dims().width <= 150 && dims().height <= 150;

  return (
    <div class="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-black">
      <For each={slots()}>
        {(slot) => (
          <div
            class="absolute inset-0 transition-opacity ease-out"
            style={{ "transition-duration": `${FADE_MS}ms` }}
            classList={{ "opacity-0": !slot.ready() }}
          >
            <Player
              entityId={slot.id}
              fit={props.fit}
              muted={props.muted ?? true}
              onReady={() => settle(slot)}
              onRoute={(r) => slot === top() && setRoute(r)}
              onFrame={(at) => slot === top() && setFrameAt(at)}
            />
          </div>
        )}
      </For>

      <Show when={blank()}>
        <div class="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span class="h-7 w-7 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
        </div>
      </Show>

      <div class="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/65 via-black/25 to-transparent px-2.5 pb-2 pt-6 text-white">
        <Show when={props.showName && !tiny()}>
          <span class="min-w-0 truncate text-xs font-semibold drop-shadow" classList={{ "text-sm": props.large }}>
            {props.name ?? entity()?.friendlyName ?? top()?.id}
          </span>
        </Show>
        <span class="ml-auto flex shrink-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider drop-shadow">
          <Show when={age() && !tiny()}>
            <span class="normal-case tracking-normal opacity-75">{age()}</span>
          </Show>
          <Show when={recording()}>
            <span class="text-red-400">{t("rec")}</span>
          </Show>
          <Show when={loading()}>
            <span class="h-2.5 w-2.5 animate-spin rounded-full border-[1.5px] border-white/30 border-t-white" />
          </Show>
          <span class="relative flex h-1.5 w-1.5" classList={{ hidden: loading() }}>
            <Show when={live()}>
              <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            </Show>
            <span class="relative inline-flex h-1.5 w-1.5 rounded-full" classList={{ "bg-red-500": live(), "bg-white/50": !live() }} />
          </span>
          <Show when={!tiny()}>{status()}</Show>
        </span>
      </div>

      <Show when={props.activity}>
        <div class="pointer-events-none absolute left-2 top-2 flex items-center gap-1 rounded-full bg-amber-400/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-black shadow">
          <Icon icon={props.activity === "doorbell" ? "mdi:doorbell" : "mdi:motion-sensor"} width={12} />
          <Show when={!tiny()}>{props.activity === "doorbell" ? t("doorbell") : t("motion")}</Show>
        </div>
      </Show>

      <Show when={props.dots && !tiny()}>
        <div class="pointer-events-none absolute right-2 top-2 flex gap-1 rounded-full bg-black/35 px-1.5 py-1">
          <For each={Array.from({ length: props.dots!.count })}>
            {(_, i) => (
              <span class="h-1.5 w-1.5 rounded-full" classList={{ "bg-white": i() === props.dots!.active, "bg-white/40": i() !== props.dots!.active }} />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

const DEMO = "camera.front_door_camera";
const DEMO_CFG = { interval: 10, fit: "Fill", motion: true, hold: 30, names: [] as Config["names"] } as const;

export default defineWidget<Config>({
  manifest: {
    name: "Live Cameras",
    description:
      "Your Home Assistant cameras live on the dashboard: one camera, two side by side, four in a grid, or all of them in turn with a crossfade. Jumps to the camera whose motion or doorbell sensor fires and holds it there. Plays WebRTC where the camera offers it, HLS otherwise, and falls back to MJPEG and stills, so every camera shows something; frozen streams reconnect on their own. Tap for the next camera, hold for a large view with sound. Streams stop when the tile is off screen. English, Dutch, German and French.",
    icon: "mdi:cctv",
    minSize: { w: 1, h: 1 },
    maxSize: { w: 6, h: 4 },
    defaultSize: { w: 3, h: 2 },
    sdkVersion: "^1.14.1",
    configVersion: 3,
    capabilities: [
      { domain: "camera", access: "read" },
      { domain: "binary_sensor", access: "read" },
      { domain: "event", access: "read" },
    ],
    examples: [
      { label: "Single", size: { w: 3, h: 2 }, config: { ...DEMO_CFG, cameras: [DEMO], layout: "Single", showName: true } },
      { label: "Side by side", size: { w: 4, h: 2 }, config: { ...DEMO_CFG, cameras: [DEMO, DEMO], layout: "Side by side", showName: true } },
      { label: "Grid", size: { w: 4, h: 3 }, config: { ...DEMO_CFG, cameras: [DEMO, DEMO, DEMO, DEMO], layout: "Grid 2x2", showName: true } },
      { label: "Compact", size: { w: 1, h: 1 }, config: { ...DEMO_CFG, cameras: [DEMO], layout: "Single", showName: false } },
    ],
  },
  configSchema,
  component: CamerasWidget,
});
