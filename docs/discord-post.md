📹 Live Cameras — your Home Assistant cameras on the dashboard, the way they actually look right now

Live Cameras
Install: search "camera" in the widget browser (@rvbcrs/live-cameras). Pick any number of cameras, that's the whole setup.

Layouts:

Single, two side by side, four in a 2x2 grid, or all cameras in turn
Rotation crossfades: the next camera is loaded off screen and only swaps in on its first frame, so you never look at a black tile
Picture fills the tile and crops, or shows the whole frame with bars, or fills anchored to the top or bottom

Motion and doorbell:

Sensors on the same Home Assistant device as a camera are found by themselves: binary_sensor and event entities with a motion, occupancy or doorbell class
When one fires, that camera comes on screen with a badge and stays for the hold time you set. A doorbell is never pushed aside by motion elsewhere

Playback:

Plays WebRTC where Home Assistant offers it, HLS otherwise, and falls back to MJPEG and stills, so every camera shows something
A stream that dies reconnects on its own, a frozen video counts as dead, and a camera that gave up is retried once a minute
Streams stop when the tile scrolls off screen or the tab is hidden, and pick up again when it comes back

Overlay:

Camera name, a pulsing LIVE dot, REC while recording, and for stills how old the picture is
The dot goes grey and the text tells you when a camera is off, unavailable or only delivers stills

Interactions:

Tap → next camera, and it holds there for a while before rotation resumes
Hold → the camera large, with previous and next, a sound toggle, and the settings

Sizes from 1x1 up; the smallest tiles keep just the picture and the dot.

UI text adapts to English, Dutch, German or French based on your browser locale.
