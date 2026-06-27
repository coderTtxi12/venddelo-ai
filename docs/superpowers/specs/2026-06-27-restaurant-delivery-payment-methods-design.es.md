# Métodos de pago de entrega a domicilio — restaurante + courier

## Contexto

Con partnership activo, el dashboard del restaurant owner bloqueaba la edición de métodos de pago de entrega a domicilio y el checkout exponía solo los métodos activos del courier.

## Objetivo

Cada restaurante elige qué métodos de pago acepta para entrega a domicilio, pero solo puede activar métodos que el courier tenga disponibles (activos).

## Comportamiento acordado

- **Default al activar partnership (opción A):** todos los métodos activos del courier quedan habilitados para el restaurante (opt-out).
- **Checkout:** intersección `courier activo ∧ restaurante activo`.
- **UI:** toggles editables solo para métodos que el courier ofrece; el resto aparece deshabilitado con indicación.
- **Sin partnership activo:** sin cambios (el restaurante controla delivery libremente).
- **Validación backend:** rechazar guardar un método delivery activo que el courier no tenga disponible.

## Cambios

### Backend

1. `checkout_payments.py` — delivery con courier usa intersección restaurante + provider.
2. `DeliveryPartnershipService` — seed al aceptar partnership; validación en `set_payment_methods`.
3. `restaurants/api.py` — validar antes de persistir métodos de pago.
4. Eliminar fallback en `OrderService._validate_payment_method` que ignoraba restricciones del courier.

### Frontend

1. `SettingsPage` — mantener preferencias del restaurante; courier solo define disponibilidad.
2. `restaurantPaymentConfig.ts` — helper para clamp de métodos no disponibles.
3. Guardar siempre takeout + delivery.

## Fuera de alcance

- Cambios en onboarding (solo takeout hoy).
- Cambios en delivery-dashboard del courier.
- Live menu: auto-seed de métodos delivery faltantes en checkout-config y pedidos; sección de pago en delivery visible solo tras cotización exitosa.
