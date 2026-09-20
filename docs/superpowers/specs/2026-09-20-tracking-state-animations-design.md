# Tracking State Animations Design

## Goal

Create a mobile-first web showcase for three public tracking states: Aceptado, Cocinando, and Buscando repartidor. The samples replace the map visually only inside the showcase; production tracking behavior remains unchanged until the samples are approved.

## Visual direction

- Reuse the tracking page palette: indigo `#4f46e5`, slate text, white surfaces, and pale indigo backgrounds.
- Use one primary loop per state to keep motion calm and legible.
- Draw illustrations as responsive inline SVG so they stay sharp and themeable.
- Use Motion for SVG transforms, opacity, and state transitions.

## Samples

1. **Aceptado:** an order bag and receipt receive a checkmark, followed by a soft confirmation ring.
2. **Cocinando:** a covered dish gently breathes while three steam strokes rise asynchronously.
3. **Buscando repartidor:** a radar sweep scans concentric rings and reveals a delivery motorcycle marker.

## Mobile-first layout

- One column by default, with large 16:10 animation canvases and readable status copy.
- Three columns on wide screens.
- Controls have at least 44px touch targets.
- A single Play/Pause control manages all samples.

## Accessibility and performance

- SVG illustrations are decorative and hidden from assistive technology; equivalent state copy remains visible.
- `prefers-reduced-motion` renders a clear static final state.
- Animation uses only transform and opacity where possible.
- Motion is loaded only by the client showcase component.

## Route and boundaries

- Preview URL: `/rastreo/muestras`.
- `TrackingStateAnimation` owns one illustration.
- `TrackingAnimationShowcase` owns the responsive gallery and play/pause state.
- A data module defines the supported sample states and copy for lightweight unit testing.

## Acceptance criteria

- All three states are visible on a 320px-wide viewport without horizontal overflow.
- The page uses the public tracking visual language.
- Play/Pause and reduced-motion behavior work.
- The existing `/rastreo/[token]` page is not changed by this preview.
