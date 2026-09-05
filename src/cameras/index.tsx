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
  useEntity,
  useIntersectionPause,
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
import { type Layout, LAYOUTS, nextIndex, type Route, shownCameras } from "./stream";

const configSchema = defineConfig({
  title: field.title(),
  cameras: field.entities("camera", { title: t("cfgCameras"), description: t("cfgCamerasDesc") }),
  layout: field.choice(LAYOUTS, { title: t("cfgLayout"), description: t("cfgLayoutDesc"), default: "Single" }),
  interval: field.number({ title: t("cfgInterval"), description: t("cfgIntervalDesc"), min: 3, max: 120, default: 10 }),
  showName: field.toggle({ title: t("cfgShowName"), description: t("cfgShowNameDesc"), default: true }),
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

function CamerasWidget(props: { config: Config }) {
  const ctx = useWidgetContext();
  const { showDialog, setShowDialog, openDialog, dialogProps } = useWidgetDialog();

  const cameras = () => props.config.cameras ?? [];
  const layout = (): Layout => props.config.layout ?? "Single";
  const [index, setIndex] = createSignal(0);
  const panes = createMemo(() => shownCameras(cameras(), layout(), index()));
  const advance = (step = 1) => setIndex((i) => nextIndex(i, cameras().length, step));

  // Rotation: the incoming pane fades in on its first frame, so a slow camera
  // never leaves a black gap. The stack below handles the crossfade.
  createEffect(() => {
    if (layout() !== "Rotate all" || cameras().length < 2) return;
    const timer = setInterval(() => advance(), Math.max(3, props.config.interval ?? 10) * 1000);
    onCleanup(() => clearInterval(timer));
  });

  // Hidden tab or scrolled away: no player exists at all, no stream stays open.
  const [root, setRoot] = createSignal<HTMLDivElement>();
  const offscreen = useIntersectionPause(root);
  const [hidden, setHidden] = createSignal(typeof document !== "undefined" && document.hidden);
  const onVisibility = () => setHidden(document.hidden);
  document.addEventListener("visibilitychange", onVisibility);
  onCleanup(() => document.removeEventListener("visibilitychange", onVisibility));
  const paused = () => offscreen() || hidden();

  const gestures = useWidgetGestures(() => ({
    tap: cameras().length > 1 ? () => advance() : undefined,
    hold: { action: openDialog },
  }));
  onCleanup(gestures.dispose);

  const title = () => props.config.title || t("cameras");
  const emptyState = () =>
    cameras().length === 0
      ? { icon: <Icon icon="mdi:cctv-off" width={32} />, title: t("noCameras"), message: t("noCamerasHelp") }
      : undefined;

  return (
    <>
      <Widget gestures={gestures} variant="classic-glass" emptyState={emptyState()}>
        <div ref={setRoot} class="absolute inset-0 flex gap-1 overflow-hidden rounded-[inherit]">
          <Show when={!paused() && cameras().length > 0}>
            <For each={panes()}>
              {(id) => (
                <Stack
                  entityId={id}
                  showName={props.config.showName ?? true}
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
                <Stack entityId={cameras()[nextIndex(index(), cameras().length, 0)]!} showName large />
              </div>
              <Show when={cameras().length > 1}>
                <div class="flex items-center justify-between gap-2">
                  <Button variant="outline" size="sm" onClick={() => advance(-1)}>
                    <Icon icon="mdi:chevron-left" width={18} /> {t("prev")}
                  </Button>
                  <span class="text-xs tabular-nums text-muted-foreground">
                    {nextIndex(index(), cameras().length, 0) + 1} / {cameras().length}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => advance()}>
                    {t("next")} <Icon icon="mdi:chevron-right" width={18} />
                  </Button>
                </div>
              </Show>
            </div>
          </Show>
        }
      />
    </>
  );
}

interface StackProps {
  entityId: string;
  showName: boolean;
  large?: boolean;
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

  const top = () => slots().at(-1);
  const entity = useEntity(() => top()?.id ?? "");
  const state = () => entity()?.state;
  const off = () => state() === "unavailable" || state() === "unknown";
  const live = () => !off() && route() !== "placeholder" && route() !== "snapshot";
  const status = () => (off() ? t("unavailable") : live() ? t("live") : route() === "snapshot" ? t("noStream") : state() === "idle" || state() === "streaming" || state() === "recording" ? t("noStream") : t("off"));

  // The dialog's large pane lives outside <Widget>, where the size hook throws.
  const dims = props.large ? undefined : useWidgetDimensions();
  const tiny = () => !!dims && dims().width <= 150 && dims().height <= 150;

  return (
    <div class="relative min-w-0 flex-1 overflow-hidden bg-black">
      <For each={slots()}>
        {(slot) => (
          <div
            class="absolute inset-0 transition-opacity ease-out"
            style={{ "transition-duration": `${FADE_MS}ms` }}
            classList={{ "opacity-0": !slot.ready() }}
          >
            <Player entityId={slot.id} onReady={() => settle(slot)} onRoute={(r) => slot === top() && setRoute(r)} />
          </div>
        )}
      </For>

      <div class="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/65 via-black/25 to-transparent px-2.5 pb-2 pt-6 text-white">
        <Show when={props.showName && !tiny()}>
          <span class="min-w-0 truncate text-xs font-semibold drop-shadow" classList={{ "text-sm": props.large }}>
            {entity()?.friendlyName ?? top()?.id}
          </span>
        </Show>
        <span class="ml-auto flex shrink-0 items-center gap-1 text-[10px] font-semibold uppercase tracking-wider drop-shadow">
          <span class="relative flex h-1.5 w-1.5">
            <Show when={live()}>
              <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            </Show>
            <span class="relative inline-flex h-1.5 w-1.5 rounded-full" classList={{ "bg-red-500": live(), "bg-white/50": !live() }} />
          </span>
          <Show when={!tiny()}>{status()}</Show>
        </span>
      </div>

      <Show when={props.dots && !tiny()}>
        <div class="pointer-events-none absolute right-2 top-2 flex gap-1">
          <For each={Array.from({ length: props.dots!.count })}>
            {(_, i) => (
              <span class="h-1.5 w-1.5 rounded-full shadow" classList={{ "bg-white": i() === props.dots!.active, "bg-white/40": i() !== props.dots!.active }} />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

export default defineWidget<Config>({
  manifest: {
    name: "Cameras",
    description:
      "Your Home Assistant cameras live on the dashboard: one camera, two side by side, or all of them in turn with a crossfade. Plays WebRTC where the camera offers it, HLS otherwise, and falls back to MJPEG and stills, so every camera shows something. Tap for the next camera, hold for a large view. Streams stop when the tile is off screen. English, Dutch, German and French.",
    icon: "mdi:cctv",
    minSize: { w: 1, h: 1 },
    maxSize: { w: 6, h: 4 },
    defaultSize: { w: 3, h: 2 },
    sdkVersion: "^1.14.1",
    configVersion: 1,
    capabilities: [{ domain: "camera", access: "read" }],
    examples: [
      { label: "Single", size: { w: 3, h: 2 }, config: { cameras: ["camera.front_door_camera"], layout: "Single", interval: 10, showName: true } },
      {
        label: "Side by side",
        size: { w: 4, h: 2 },
        config: { cameras: ["camera.front_door_camera", "camera.front_door_camera"], layout: "Side by side", interval: 10, showName: true },
      },
      { label: "Compact", size: { w: 1, h: 1 }, config: { cameras: ["camera.front_door_camera"], layout: "Single", interval: 10, showName: false } },
    ],
  },
  configSchema,
  component: CamerasWidget,
});
