import { describe, expect, it } from 'vitest';
import {
  restaurantCourierServiceNotice,
  restaurantCourierUnavailableCopy,
} from './courierUnavailableCopy';

describe('restaurantCourierUnavailableCopy', () => {
  it('explains a manual pause', () => {
    const copy = restaurantCourierUnavailableCopy(
      'El servicio de reparto no está disponible en este momento. Mexy pausó las entregas temporalmente.',
    );

    expect(copy.title).toBe('El servicio de reparto no está disponible en este momento.');
    expect(copy.detail).toBe(
      'Mexy pausó las entregas. No puedes solicitar un repartidor hasta que lo reactiven.',
    );
  });

  it('explains closed hours and when they resume', () => {
    const copy = restaurantCourierUnavailableCopy(
      'El servicio de reparto no está disponible en este momento. Está fuera del horario de operación. Reanuda mañana a las 9:00 a.m.',
    );

    expect(copy.detail).toBe(
      'Está fuera del horario de operación de Mexy. Reanuda mañana a las 9:00 a.m.',
    );
  });

  it('explains intense rain during closed hours', () => {
    const copy = restaurantCourierUnavailableCopy(
      'El servicio de reparto no está disponible en este momento. Está fuera del horario de operación. Reanuda hoy a las 9:00 a.m. Además, las entregas están suspendidas por lluvia intensa.',
    );

    expect(copy.detail).toBe(
      'Mexy pausó las entregas por lluvia intensa. El horario reanuda hoy a las 9:00 a.m.',
    );
  });

  it('explains intense rain', () => {
    const copy = restaurantCourierUnavailableCopy(
      'El servicio de reparto no está disponible en este momento. Servicio suspendido por lluvia intensa.',
    );

    expect(copy.detail).toBe(
      'Mexy pausó las entregas por lluvia intensa. No puedes solicitar un repartidor hasta que las condiciones mejoren.',
    );
  });

  it('keeps other backend reasons as the explanation', () => {
    const copy = restaurantCourierUnavailableCopy(
      'El restaurante no tiene ubicación configurada para calcular entregas.',
    );

    expect(copy.title).toBe('El servicio de reparto no está disponible en este momento.');
    expect(copy.detail).toBe(
      'El restaurante no tiene ubicación configurada para calcular entregas.',
    );
  });
});

describe('restaurantCourierServiceNotice', () => {
  it('hides light and heavy rain while the service stays open', () => {
    expect(
      restaurantCourierServiceNotice({
        available: true,
        reason: null,
        weather_mode: 'light',
      }),
    ).toBeNull();
    expect(
      restaurantCourierServiceNotice({
        available: true,
        reason: null,
        weather_mode: 'heavy',
      }),
    ).toBeNull();
  });

  it('shows intense rain when the service is blocked', () => {
    const copy = restaurantCourierServiceNotice({
      available: false,
      reason:
        'El servicio de reparto no está disponible en este momento. Servicio suspendido por lluvia intensa.',
      weather_mode: 'intense',
    });

    expect(copy?.title).toBe('El servicio de reparto no está disponible en este momento.');
    expect(copy?.detail).toContain('lluvia intensa');
  });
});
