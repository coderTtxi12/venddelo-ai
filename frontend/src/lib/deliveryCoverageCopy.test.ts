import { describe, expect, it } from 'vitest';
import { coverageCardCopy } from './deliveryCoverageCopy';

describe('coverageCardCopy', () => {
  it('names the matched zone', () => {
    const copy = coverageCardCopy({
      zone: { id: '1', name: 'Centro', provider_name: 'Mexy Reparto' },
      distance_km: 0.4,
    });
    expect(copy.title).toBe('Mexy Reparto · Centro');
    expect(copy.body).toBe(
      'Tu negocio está en esta zona. Al terminar, enviaremos la solicitud de reparto.',
    );
  });

  it('explains missing coverage', () => {
    const copy = coverageCardCopy({ zone: null, distance_km: null });
    expect(copy.title).toBe('Aún no hay cobertura de Mexy en tu ubicación');
    expect(copy.body).toBe(
      'Puedes activar entrega a domicilio y solicitar reparto cuando haya una zona cerca.',
    );
  });
});
