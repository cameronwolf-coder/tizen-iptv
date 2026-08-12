# Wolf TV Companion Remote Design System

## 1. Atmosphere & Identity

The remote is a midnight control panel: calm enough to read in a dark room, bright enough to operate at arm's length. Its signature is the electric-blue navigation rail—an inherited TV focus cue translated into a mobile control surface, where one confident blue mark tells the user exactly what will happen next.

## 2. Color

### Palette

| Role | Token | Value | Usage |
|---|---|---|---|
| Canvas | `--color-canvas` | `#0b0f17` | Page background |
| Surface | `--color-surface` | `#101728` | Fields and controls |
| Surface raised | `--color-surface-raised` | `#121a2b` | Panels and channel rows |
| Surface hover | `--color-surface-hover` | `#1a2336` | Hovered controls |
| Surface selected | `--color-surface-selected` | `#182746` | Selected channel row |
| Text primary | `--color-text-primary` | `#e8edf5` | Headings and control labels |
| Text secondary | `--color-text-secondary` | `#aeb9cc` | Support copy |
| Text muted | `--color-text-muted` | `#7e8aa6` | Metadata and inactive states |
| Border | `--color-border` | `#243152` | Inputs and grouped controls |
| Border subtle | `--color-border-subtle` | `#1d2740` | Dividers |
| Accent | `--color-accent` | `#3a7aff` | Focus, selection, primary action |
| Accent hover | `--color-accent-hover` | `#5d92ff` | Pointer hover |
| Accent wash | `--color-accent-wash` | `rgba(58, 122, 255, 0.24)` | Focus and selected surface wash |
| Success | `--color-success` | `#39c48a` | Paired state |
| Warning | `--color-warning` | `#f5b301` | Attention state |
| Error | `--color-error` | `#ff6b78` | Pairing failure and retry |
| Scrim | `--color-scrim` | `rgba(4, 8, 16, 0.72)` | Subtle depth overlays |

### Rules

- Accent communicates selection, keyboard focus, and the next primary action; it is not decoration.
- Status colors always pair with written status, never color alone.
- Remote CSS may use only the palette variables above, including gradients and shadows composed as named tokens.

## 3. Typography

### Scale

| Level | Token | Size | Weight | Line height | Usage |
|---|---|---:|---:|---:|---|
| Display | `--type-display` | 1.75rem | 700 | 1.15 | Remote title |
| H1 | `--type-h1` | 1.25rem | 700 | 1.25 | Panel heading |
| H2 | `--type-h2` | 1rem | 650 | 1.35 | Section title |
| Body | `--type-body` | 0.9375rem | 500 | 1.45 | Control labels and copy |
| Small | `--type-small` | 0.8125rem | 500 | 1.45 | Metadata and helper copy |
| Label | `--type-label` | 0.6875rem | 700 | 1.3 | Section labels and badges |

### Font Stack

- Primary: `"Tizen Sans", "Segoe UI", Roboto, system-ui, sans-serif`
- Mono: `ui-monospace, "SFMono-Regular", Consolas, monospace`

### Rules

- Body text never drops below `--type-small`; label text is reserved for short, uppercase metadata.
- Long TV channel names may truncate only after their channel number remains visible.

## 4. Spacing & Layout

### Base Unit

All spacing derives from a 4px base.

| Token | Value | Usage |
|---|---:|---|
| `--space-1` | 0.25rem | Inline nudges |
| `--space-2` | 0.5rem | Tight clusters |
| `--space-3` | 0.75rem | Field interiors |
| `--space-4` | 1rem | Default component gap |
| `--space-5` | 1.25rem | Form groups |
| `--space-6` | 1.5rem | Panel padding |
| `--space-8` | 2rem | Section separation |
| `--space-10` | 2.5rem | Large separation |
| `--space-12` | 3rem | Wide-shell padding |
| `--target-min` | 2.75rem | Minimum touch target |
| `--border-width` | 0.0625rem | Default control and surface border |
| `--opacity-disabled` | 0.72 | Disabled control readability |
| `--radius-control` | 0.75rem | Inputs and buttons |
| `--radius-panel` | 1rem | Panels and status states |
| `--content-max` | 80rem | Wide-screen content width |

### Grid

- 375px: one column with `--space-4` shell padding; control groups stack.
- 768px: two-column controller and channels layout; paired form fields may sit side-by-side.
- 1280px: a three-region workspace; the control rail remains readable and the channel/state laboratory takes the remaining width.
- Browser mechanics use intrinsic sizing, `minmax()`, `clamp()`, and container width; no primary content has horizontal scrolling.

## 5. Components

### Remote action button
- **Structure**: `button.remote-action > span.action-label`
- **Variants**: primary, secondary, quiet, compact
- **Spacing**: `--space-3` horizontal/vertical interior; `--target-min` minimum height
- **States**: default, hover, active, focus-visible, disabled
- **Accessibility**: native button, text label, keyboard reachable, visible focus
- **Motion**: beui.dev Button mechanism adapted as a restrained press scale (`0.98`) and hover lift (`1.01`); no motion under reduced-motion preference
- **Layout**: cluster

### Status badge
- **Structure**: `p.status-badge > span.status-dot + span`
- **Variants**: paired, connecting, attention, unavailable
- **Spacing**: `--space-2` cluster gap
- **States**: semantic color plus text; connecting is nonessential opacity pulse
- **Accessibility**: status is written and announced in the surrounding status copy
- **Layout**: cluster

### Pairing form
- **Structure**: `form > label > input` plus primary action and helper text
- **Variants**: ready, validating, invalid, paired
- **Spacing**: `--space-3` field gap and `--space-6` form gap
- **States**: default, focus-visible, error, disabled, loading
- **Accessibility**: persistent labels, `aria-describedby` helper/error links, autocomplete set to off for room code
- **Layout**: stack

### Filter chip
- **Structure**: `button.filter-chip[aria-pressed]`
- **Variants**: default, selected, disabled
- **Spacing**: `--space-2`/`--space-3`
- **States**: hover, active, focus-visible, selected
- **Accessibility**: native button and explicit pressed state
- **Layout**: wrapping cluster

### Channel row
- **Structure**: `button.channel-row > span.channel-number + span.channel-copy + span.channel-state`
- **Variants**: default, selected, focused, unavailable
- **Spacing**: `--space-3` row gap; `--space-4` row interior
- **States**: default, hover, active, focus-visible, selected, disabled
- **Accessibility**: one full-row touch target; name, number, and availability are conveyed in text
- **Motion**: selected rail fades and press scale follows the action-button rule
- **Layout**: list

### Feedback state
- **Structure**: `section.feedback-state` with title, explanation, and retry/next action
- **Variants**: loading, empty, error
- **States**: loading uses a non-color-only activity indicator; error offers retry
- **Accessibility**: `role="status"` for loading/empty and `role="alert"` for error
- **Layout**: centered stack

## 6. Motion & Interaction

| Token | Value | Usage |
|---|---|---|
| `--motion-press` | 90ms `cubic-bezier(0.16, 1, 0.3, 1)` | Press scale |
| `--motion-state` | 160ms `cubic-bezier(0.16, 1, 0.3, 1)` | Color, opacity, focus states |
| `--motion-status` | 1200ms `cubic-bezier(0.16, 1, 0.3, 1)` | Connection activity pulse |
| `--scale-press` | `0.98` | Press response |
| `--scale-hover` | `1.01` | Fine-pointer hover response |

- Beui reference consulted: `button` source at `https://beui.dev/r/button/raw`; preserved mechanism is hover capability gating plus press feedback, simplified to CSS for this zero-dependency showcase.
- Only `transform`, `opacity`, and color are transitioned. Motion indicates a press, selected route, or connection activity; the connecting badge dot pulses until status changes.
- `prefers-reduced-motion: reduce` removes transforms and turns connecting feedback into a static status.

## 7. Depth & Surface

### Strategy

Mixed, led by tonal shift. Midnight surfaces step from `--color-canvas` to `--color-surface-raised`; low-contrast borders preserve boundaries. Floating shell depth uses one navy-tinted shadow token and a faint accent rim only around active/focused controls.

| Token | Value | Usage |
|---|---|---|
| `--shadow-shell` | `0 1.25rem 3.5rem rgba(0, 0, 0, 0.34)` | Remote shell at wide widths |
| `--shadow-focus` | `0 0 0 0.1875rem rgba(58, 122, 255, 0.38)` | Visible focus ring |
| `--gradient-canvas` | `linear-gradient(135deg, #0b0f17, #121a2b)` | Page canvas |
| `--gradient-selected` | `linear-gradient(90deg, rgba(58, 122, 255, 0.24), rgba(58, 122, 255, 0))` | Selected channel wash |

## 8. Accessibility Constraints & Accepted Debt

### Constraints

- WCAG 2.2 AA target: body text meets a 4.5:1 contrast floor; large status labels and focus treatment meet 3:1 minimum.
- Every control has a 44px (`--target-min`) minimum touch target, keyboard reachability, and an obvious focus-visible ring.
- One-handed use: thumb-reachable primary media actions precede the longer channel list on mobile.
- Low vision/200% zoom: content stacks without clipping or horizontal primary-content overflow; text uses rem units.
- Situational glare: primary state pairs the accent with white label contrast and does not depend on a subtle border alone.
- Motion-sensitive users receive static connection feedback and no press/hover transforms.

### Accepted Debt

| Item | Location | Why accepted | Owner / Exit |
|---|---|---|---|
| Pairing submission is a visual state only | `remote/showcase.html` | This handoff intentionally has no product transport or device-discovery layer | Product UI composition adds real validation and live announcements |
| Channel filters are state specimens, not a working query | `remote/showcase.html` | Showcase proves state anatomy before the data model exists | Product UI composition wires filter state to channel data |
