import type { MexyCoverageResponse } from '@/lib/api/types';

export function coverageCardCopy(coverage: MexyCoverageResponse): { title: string; body: string } {
  if (coverage.zone) {
    return {
      title: `${coverage.zone.provider_name} · ${coverage.zone.name}`,
      body: 'Tu negocio está en esta zona. Al terminar, enviaremos la solicitud de reparto.',
    };
  }

  return {
    title: 'Aún no hay cobertura de Mexy en tu ubicación',
    body: 'Puedes activar entrega a domicilio y solicitar reparto cuando haya una zona cerca.',
  };
}
