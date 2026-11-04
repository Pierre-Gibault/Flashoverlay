# Flashbang Overlay Design System

## 0. Research Log
- Embedded refs: shortlisted Raycast, Warp, and Linear → picked the operational `taste-skill` direction with a tactical-console adaptation because the product is a compact desktop utility, not a marketing page.
- Lazyweb: skipped — no network research needed for a native utility surface.
- Imagen drafts: skipped — the flash event and grenade are rendered as functional UI states, not brand imagery.

## 1. Atmosphere & Identity
Flashbang Overlay feels like a restrained training console: dark graphite, signal amber, and a bright event state that makes the utility's purpose unmistakable. The signature is the contrast between a quiet, instrument-like control panel and a full-screen whiteout that briefly takes over the desktop.

## 2. Color

### Palette
| Role | Token | Value | Usage |
|------|-------|-------|-------|
| Surface/primary | --surface-primary | #0c1015 | App background |
| Surface/secondary | --surface-secondary | #131922 | Cards and control zones |
| Surface/elevated | --surface-elevated | #1b2430 | Inputs and active panels |
| Text/primary | --text-primary | #f4f6f8 | Headings and controls |
| Text/secondary | --text-secondary | #9aa7b5 | Explanatory copy |
| Text/tertiary | --text-tertiary | #647180 | Metadata |
| Border/default | --border-default | #2a3644 | Surface outlines |
| Border/subtle | --border-subtle | #1d2732 | Quiet separators |
| Accent/primary | --accent-primary | #f2b84b | Primary action and signal |
| Accent/hover | --accent-hover | #ffd071 | Hover and focus |
| Status/success | --status-success | #7ed6a0 | Running state |
| Status/warning | --status-warning | #f2b84b | Paused and countdown |
| Status/error | --status-error | #ff7f6e | Invalid settings |
| Flash | --flash-white | #ffffff | Native overlay flash |
| Elevation/window | --shadow-window | 0 18px 48px rgb(0 0 0 / 35%) | Control window shell |

### Rules
- Accent amber is reserved for interaction and system signal, never decoration.
- Surfaces use tonal shift plus subtle borders; no large decorative gradients.
- The flash overlay is intentionally pure white to preserve the perceptual effect.
- The control window uses `--shadow-window` as its single restrained elevation treatment.

## 3. Typography
### Scale
| Level | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| Display | 48px | 700 | 1.1 | Countdown value |
| H1 | 32px | 700 | 1.15 | Window title |
| H2 | 20px | 650 | 1.3 | Card headings |
| Body | 15px | 400 | 1.55 | Explanatory copy |
| Body/sm | 13px | 500 | 1.4 | Control labels |
| Caption | 11px | 600 | 1.3 | Status metadata |

### Font Stack
- Primary: `Inter, ui-sans-serif, system-ui, sans-serif`
- Mono: `JetBrains Mono, ui-monospace, SFMono-Regular, monospace`

## 4. Spacing & Layout
### Base Unit
All spacing derives from a 4px base unit.

| Token | Value | Usage |
|-------|-------|-------|
| --space-1 | 4px | Icon-to-label |
| --space-2 | 8px | Compact groups |
| --space-3 | 12px | Field padding |
| --space-4 | 16px | Standard card padding |
| --space-6 | 24px | Card separation |
| --space-8 | 32px | Major section spacing |
| --space-12 | 48px | Window breathing room |

### Grid
- Control window max width: 760px.
- Two-column settings grid above 640px; one column below.
- Window content uses 24px outer padding and 16px card gaps.

## 5. Components
### Control Panel
- **Structure**: header, status strip, settings card, action row, footer note.
- **Variants**: idle, running, paused, flashing.
- **Spacing**: `--space-4` internal, `--space-6` between cards.
- **States**: default, hover, active, focus, disabled, invalid.
- **Accessibility**: semantic labels, keyboard reachable buttons, live status region.
- **Motion**: status dot opacity pulse while running; no layout animation.
- **Layout**: centered single-column shell.

### Native Flash Overlay
- **Structure**: transient transparent native window per current display containing grenade scene and flash layer. No native overlay exists while idle.
- **Variants**: grenade-flight, whiteout, fade-back.
- **Spacing**: viewport-relative positioning; no content interaction.
- **States**: idle without an overlay window, loading hidden, visible, reduced-motion.
- **Accessibility**: visible overlays are click-through and excluded from keyboard navigation; control window announces events.
- **Motion**: transform-only bounce followed by opacity fade.
- **Layout**: viewport overlay owned by the native window.

### Signal Button
- **Structure**: native button with label and optional icon glyph.
- **Variants**: primary, secondary, danger.
- **Spacing**: 12px horizontal, 10px vertical.
- **States**: default, hover, active, focus, disabled.
- **Accessibility**: visible focus ring and descriptive label.
- **Motion**: 100ms press transform.
- **Layout**: cluster within action row.

### Shared Room Card
- **Structure**: server URL, room code, role signal, connection status, and connect controls.
- **Variants**: local, connecting, leader, follower, reconnecting.
- **States**: follower disables scheduling and manual trigger actions; disconnected preserves local controls.
- **Accessibility**: live connection status and native labeled fields.

## 6. Motion & Interaction
### Timing
| Type | Duration | Easing | Usage |
|------|----------|--------|-------|
| Micro | 100ms | ease-out | Button press |
| Standard | 240ms | ease-in-out | State transitions |
| Emphasis | 2200ms | cubic-bezier(0.22, 0.61, 0.36, 1) | Random-display throw and three floor bounces |
| Flash fade | 3600ms | ease-out | Cross-display whiteout return to normal |

### Rules
- Animate only transform and opacity.
- Random scheduling uses recursive timeouts so pause and stop are deterministic.
- Reduced motion skips grenade travel but preserves a lower-intensity whiteout cue on every display for the full session lifecycle.
- A flash snapshots each display's global Electron bounds without work-area or scale-factor conversion, creates one hidden overlay per display, and removes it after the six-second sequence.
- Windows request skip-taskbar, non-focusable, click-through behavior while visible. Ubuntu and Kubuntu X11 are supported; native Kubuntu Wayland positioning and stacking remain best effort, with Xwayland recommended when strict behavior is required.

## 7. Depth & Surface
### Strategy
Mixed: tonal-shift surfaces with 1px borders and one restrained elevation shadow on the window shell.

## 8. Accessibility Constraints & Accepted Debt
### Constraints
- WCAG 2.2 AA target, 4.5:1 body contrast minimum.
- Full keyboard reachability in the control window.
- Visible focus for all interactive elements.
- Respect `prefers-reduced-motion`.
- Native overlay is click-through by design and does not expose interactive content.

### Accepted Debt
| Item | Location | Why accepted | Owner / Exit |
|------|----------|--------------|--------------|
| OS tray integration | Main process | Not required for the first usable background prototype | Add when packaging/distribution is requested |
