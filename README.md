# Flashbang Overlay

Flashbang Overlay is an Electron utility for Windows, Ubuntu, and Kubuntu that creates native, transparent, click-through overlays only while a flash is playing. The normal control window starts a randomized scheduler or manually triggers a bouncing flashbang marker followed by a white flash.

## Run

```bash
npm install
npm run dev
```

On Kubuntu/Ubuntu Wayland with Xwayland available, use the explicit X11 launcher for reliable multi-monitor placement:

```bash
npm run dev:x11
```

Useful commands:

```bash
npm run typecheck
npm test
npm run build
npm run package:win
npm run package:linux
npm run package:dir
```

The dev command starts Vite for both renderer pages, compiles the Electron main and preload processes, then opens the native control window. Overlay windows are created only when a flash is triggered.

## Desktop Packaging

All desktop artifacts are written to `release/`.

- `npm run package:win` builds Windows NSIS installer and portable artifacts.
- `npm run package:linux` builds Linux AppImage and Debian (`.deb`) artifacts.
- `npm run package:dir` creates an unpacked application directory for the current platform.

Build Windows artifacts on Windows, or validate the build under Wine. Build Linux artifacts on Linux. Packaging is unsigned, so operating-system trust prompts can appear.

## Shared Rooms

Start the standalone server on one trusted machine:

```bash
npm run build:main
npm run server
```

Or run the production container:

```bash
docker build -t flashoverlay-room-server .
docker run --rm -p 7331:7331 flashoverlay-room-server
```

The container runs as the unprivileged `node` user and defaults to `HOST=0.0.0.0` and `PORT=7331`. Override either setting when needed, while publishing the same port externally:

```bash
docker run --rm -e PORT=7444 -p 7444:7444 flashoverlay-room-server
```

The Docker healthcheck opens a local WebSocket connection to the configured `PORT`; it does not add an HTTP endpoint. The direct `npm run server` command listens on all interfaces by default (`0.0.0.0:7331`) so trusted-LAN clients can connect. Set `HOST=127.0.0.1` to restrict it to the local machine. In each app, enter the server machine's LAN address, such as `ws://192.168.1.20:7331`, and the same room code, then connect. Every connected participant can choose `Everyone` or an individual participant and trigger a flash for that target. The first member is still leader for scheduled start, pause, and resume; other members can manually flash without becoming leader. If the leader leaves, the server promotes a follower, but scheduling remains paused until the promoted member explicitly starts or resumes it.

Shared rooms intentionally have no authentication, TLS, persistence, NAT traversal, or access control. Use plain `ws://` only on a trusted LAN. Do not expose the server to the public internet. Windows hosts need an inbound Windows Firewall rule for TCP port `7331` (or the configured port); Linux hosts may need an equivalent firewall rule when `HOST=0.0.0.0` is used.

## Controls

- Set a minimum and maximum interval between 10 and 3600 seconds.
- Set flash intensity from 20% through 100%.
- Start, pause, or resume the recursive randomized scheduler.
- Trigger an immediate flash without starting the scheduler.
- The grenade is shown on one randomly selected display per event, while the whiteout is synchronized across every connected display. The overlay respects `prefers-reduced-motion` by skipping grenade travel and using a lower-intensity cue.

## Native Overlay Notes

- No overlay `BrowserWindow` exists while idle. A flash snapshots Electron's current displays, creates one hidden overlay per display using that display's global `bounds`, waits for it to load, delivers the event, and destroys the overlays after the six-second sequence.
- Visible overlays are transparent, frameless, non-focusable, click-through, and requested to skip the taskbar. Linux requests the `screen-saver` always-on-top level; other platforms use Electron's default always-on-top level. The normal control window remains a separate, usable application window.
- The app must remain running. Closing the control window exits the process and destroys any active overlays.
- Windows uses the default `npm run dev` launcher. Windows compositor policy, exclusive fullscreen apps, and UAC secure desktop can still prevent a window from remaining above every app.
- Ubuntu and Kubuntu X11 provide the most predictable transparent, click-through, and positioning behavior. For a native Kubuntu Wayland session, use `npm run dev:electron:x11` with Xwayland available when strict positioning or stacking is required.
- Wayland compositors retain authority over stacking, display bounds, focus, input routing, Alt-Tab/taskbar presentation, and workspace visibility. KDE policy can prevent Electron from remaining above every app or from being fully click-through. These behaviors are best effort on every platform; test the target compositor before relying on the effect.
- Displays added, removed, or resized during a flash are handled only for that active flash. The next flash always uses a fresh snapshot of current global display bounds.
