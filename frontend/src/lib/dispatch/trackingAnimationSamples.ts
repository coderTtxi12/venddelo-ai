export type TrackingAnimationState = 'accepted' | 'scheduled' | 'searching';

export type TrackingAnimationSample = {
  state: TrackingAnimationState;
  eyebrow: string;
  title: string;
  detail: string;
};

export const TRACKING_ANIMATION_SAMPLES: readonly TrackingAnimationSample[] = [
  {
    state: 'accepted',
    eyebrow: 'Estado inicial',
    title: 'Pedido aceptado',
    detail: 'El restaurante ya aceptó tu pedido.',
  },
  {
    state: 'scheduled',
    eyebrow: 'Preparación',
    title: 'Preparando tu pedido',
    detail: 'El negocio está preparando tu pedido.',
  },
  {
    state: 'searching',
    eyebrow: 'Asignación',
    title: 'Buscando repartidor',
    detail: 'Estamos buscando al repartidor más cercano.',
  },
] as const;
