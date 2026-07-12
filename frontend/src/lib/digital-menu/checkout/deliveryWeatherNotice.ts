export type DeliveryWeatherMode = 'none' | 'light' | 'heavy' | 'intense';

export function getDeliveryWeatherNotice(
  mode: DeliveryWeatherMode | undefined,
  context: 'fee' | 'blocked',
): string | null {
  if (!mode || mode === 'none') return null;

  if (context === 'fee') {
    if (mode === 'light') {
      return 'Hay lluvia ligera: el costo de envío incluye un pequeño ajuste. Gracias por tu comprensión';
    }
    if (mode === 'heavy') {
      return 'Hay lluvia fuerte: el costo contempla condiciones más difíciles. Gracias por tu comprensión.';
    }
    return null;
  }

  if (mode === 'intense') {
    return 'Por seguridad, pausamos entregas mientras la lluvia es muy intensa. Puedes intentar más tarde o recoger en el local.';
  }

  return null;
}
