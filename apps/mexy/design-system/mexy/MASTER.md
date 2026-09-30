# Mexy Owner

Operational app for restaurant owners. Dense kitchen UI, phone and tablet, portrait and landscape.

## Decisions

- Style: data-dense dashboard. Spacing stays on an 8dp rhythm without shrinking touch targets below 48dp.
- Color: Mexy indigo `#4F46E5` from the restaurant panel. Amber and green are status colors, with text labels so color is never the only signal.
- Type: system UI fonts. The design-system search suggested Fira Code for headings; that pairing was rejected because monospace titles are hard to read in Spanish on a kitchen tablet and they break from the existing Mexy panel (Inter / system sans).
- Navigation: bottom bar under 600dp. Navigation rail from 600dp, extended from 1080dp. Orders, printer and delivery become two panes from 840dp.
- Motion: 180ms ease-out, disabled when the system asks for reduced motion.
- No web views. Printer discovery goes through a native Android/iOS channel. Location is an address field until a native map is added.
- Flutter stack search returned no verified match for adaptive navigation. The rail/bar split follows Material window size classes.

## Pages

- Órdenes: filters, ticket list, detail, confirm/advance, cancel, print.
- Impresora: bonded Bluetooth and USB on Android, IP on both platforms, live ticket preview.
- Envíos: request form, active/history, two-step cancel and cash confirmation.
- Ajustes: identity, WhatsApp, services, payments, address, hours, admins.
