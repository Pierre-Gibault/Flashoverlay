# Flashbang Overlay

Flashbang Overlay is a Linux-targeted Electron utility that keeps a native, transparent, click-through overlay above the desktop while the app is running. The normal control window starts a randomized scheduler or manually triggers a bouncing flashbang marker followed by a white flash.

## Run

```bash
npm install
npm run dev
```

Useful commands:

```bash
npm run typecheck
npm test
npm run build
```

The dev command starts Vite for both renderer pages, compiles the Electron main and preload processes, then opens the native control window and overlay. The build output is intended for local execution with Electron; packaging and tray integration are deliberately out of scope.

## Controls

- Set a minimum and maximum interval between 10 and 3600 seconds.
- Set flash intensity from 20% through 100%.
- Start, pause, or resume the recursive randomized scheduler.
- Trigger an immediate flash without starting the scheduler.
- The grenade is shown on one randomly selected display per event, while the whiteout is synchronized across every connected display. The overlay respects `prefers-reduced-motion` by skipping grenade travel and using a lower-intensity cue.

## Linux Native Overlay Notes

- The overlay is a real Electron `BrowserWindow`, not a browser viewport effect. It is transparent, frameless, fullscreen, click-through, non-focusable, and requested at the `screen-saver` always-on-top level.
- The app must remain running. Closing the control window exits the process and destroys the overlay.
- X11 provides the most predictable transparent, click-through, always-on-top behavior.
- The development launcher uses Electron's `--ozone-platform=x11` path so Wayland desktops use Xwayland for reliable window positioning and stacking. Xwayland must be available on the system.
- Wayland compositors retain authority over stacking, fullscreen windows, focus, and input routing. GNOME, KDE, and other compositor policies can prevent Electron from remaining above every app or from being fully click-through. Test the target compositor before relying on the effect.
- The overlay creates one native window per connected display and updates coverage when displays are added, removed, or resized. Distribution packaging is not included.
