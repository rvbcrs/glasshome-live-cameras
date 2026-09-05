# Cameras widget

A GlassHome widget that shows live Home Assistant cameras: one camera, two side
by side, or all configured cameras in rotation.

## Config

- `title`: optional display name override.
- `cameras`: `field.entities("camera")`. Order is display order.
- `layout`: `field.choice(["single", "pair", "rotate"])`, default `single`.
  Single shows the first camera, pair the first two, rotate cycles through all.
- `interval`: `field.number`, seconds per camera in rotate, default 10, min 3, max 120.
- `showName`: `field.toggle`, default true. Camera name in the overlay.
- Capability: `{ domain: "camera", access: "read" }`.

## Playback ladder

Per camera a `Player` walks a ladder and drops to the next rung on failure:

1. **WebRTC** when the entity attribute `frontend_stream_type` is `web_rtc`.
   Native `RTCPeerConnection`, config from `getWebRtcClientConfig`, offer through
   `startWebRtcSession`, local ICE through `sendWebRtcCandidate`. `<video>` gets
   the remote stream as `srcObject`.
2. **HLS** via `getStream(id, { format: "hls" })`. Native when the video element
   can play `application/vnd.apple.mpegurl`, otherwise hls.js (light build).
3. **MJPEG** through `hassMediaUrl("/api/camera_proxy_stream/<id>?token=<access_token>")`
   in an `<img>`.
4. **Snapshot** (`entity_picture`) with the state text "No stream".

`pickRoute(attributes)` is pure and unit-tested. A rung fails on an error, a
null URL, or no first frame within 8 s.

## Behaviour

- Rotate: the next player mounts hidden; on its first frame the widget swaps with
  a 300 ms crossfade. Only the current and the incoming player exist.
- Tap: next camera (when more than one). Hold: dialog with the current camera
  large, previous/next, and the config tab.
- Off-screen (`useIntersectionPause`) or hidden tab (`visibilitychange`): players
  are torn down and remounted when visible again.
- Entity `unavailable` or `unknown`: shell `emptyState` with `mdi:camera-off`.
- No cameras configured: `emptyState` asking to pick cameras.

## Look

- `classic-glass` shell, neutral, video edge to edge under the rounded corners,
  `object-fit: cover`.
- Bottom scrim (transparent to black/55%) with camera name and a pulsing red dot
  plus "LIVE". The dot is grey and the text reads the entity state when not
  streaming.
- Rotate: small position dots top right.
- Tiles at most 150 px in both dimensions show only the dot.
- Pair: two panes with a 4 px gap, each with its own scrim.
- Languages: en, nl, de, fr from the browser locale, same table pattern as Sky.

## Preview / demo

In demo mode (`isDemoMode()`), and whenever no live connection exists, the player
renders a still gradient frame instead of video so the Hub screenshot shows the
overlay design and the preview harness never waits on a stream.

## Local testing

`glasshome-widget connect http://192.168.0.248:3124` in the background keeps the
widget registered on the live dashboard with rebuild on save. Playback is
verified there on real cameras before publishing.

## Tests

`bun test` covers `pickRoute`, the MJPEG url builder, rotation index maths, and
locale parity. Playback is verified manually on the dashboard.

## Files

```
src/cameras/index.tsx     widget, layouts, dialog
src/cameras/player.tsx    Player: ladder, video/img, first-frame signal
src/cameras/stream.ts     pure: pickRoute, mjpegUrl, nextIndex
src/cameras/i18n.ts       strings
src/cameras/manifest.json
```
