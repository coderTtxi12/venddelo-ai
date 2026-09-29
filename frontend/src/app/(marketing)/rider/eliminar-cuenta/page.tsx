import type { Metadata } from 'next';
import Link from 'next/link';
import LegalDocument from '@/components/legal/LegalDocument';

export const metadata: Metadata = {
  title: 'Eliminar cuenta | Mexy Rider',
  description:
    'Cómo solicitar la eliminación de tu cuenta de repartidor Mexy Rider y qué datos se borran o conservan.',
};

export default function RiderDeleteAccountPage() {
  return (
    <LegalDocument
      title="Eliminar cuenta — Mexy Rider"
      lastUpdated="22 de septiembre de 2026"
      currentPath="/rider/eliminar-cuenta"
    >
      <p>
        Esta página explica cómo los repartidores de <strong>Mexy Rider</strong> pueden
        solicitar que se elimine su cuenta y los datos asociados. El proceso es el mismo
        si llegaste desde Google Play o desde la aplicación.
      </p>

      <h2>1. Cómo solicitar la eliminación</h2>
      <ol>
        <li>
          Envía un correo a{' '}
          <a href="mailto:soporte@mxy.mx?subject=Eliminar%20cuenta%20Mexy%20Rider">
            soporte@mxy.mx
          </a>{' '}
          con el asunto <strong>Eliminar cuenta Mexy Rider</strong>.
        </li>
        <li>
          Usa el <strong>mismo correo de Google</strong> con el que entras a la App (o
          indícalo claramente en el mensaje).
        </li>
        <li>
          Escribe: «Solicito eliminar mi cuenta de repartidor Mexy Rider y los datos
          personales asociados.»
        </li>
        <li>
          Te confirmaremos la recepción. Procesamos las solicitudes en un plazo máximo de{' '}
          <strong>30 días</strong> desde que verificamos tu identidad.
        </li>
      </ol>
      <p>
        También puedes pedir la eliminación a través de los canales de soporte de Mexy con
        los que operas habitualmente, indicando el mismo correo de Google.
      </p>

      <h2>2. Datos que se eliminan</h2>
      <p>Tras verificar la solicitud, eliminamos o anonimizamos, en la medida posible:</p>
      <ul>
        <li>Acceso a Mexy Rider (sesión y autorización como repartidor).</li>
        <li>
          Datos de perfil operativo ligados a tu cuenta (nombre mostrado, teléfono y foto
          de repartidor, cuando existan).
        </li>
        <li>Tokens de notificaciones push asociados a tus dispositivos.</li>
        <li>
          Ubicación en tiempo real y rastros recientes de posición usados solo para
          operar entregas.
        </li>
      </ul>

      <h2>3. Datos que podemos conservar</h2>
      <p>
        Por obligaciones legales, fiscales, seguridad o resolución de disputas, podemos
        conservar durante un tiempo limitado:
      </p>
      <ul>
        <li>
          Historial de entregas y registros operativos (direcciones, estados, tiempos)
          necesarios para el negocio y cumplimiento normativo.
        </li>
        <li>
          Registros de seguridad o fraude cuando exista una investigación activa o un
          requerimiento legal.
        </li>
        <li>
          Datos agregados o anonimizados que ya no te identifiquen de forma directa.
        </li>
      </ul>
      <p>
        El periodo de retención adicional suele ser el necesario para cumplir la ley
        aplicable en México (por ejemplo, obligaciones fiscales o de comprobación), y en
        todo caso se limita a lo estrictamente requerido. Detalles adicionales están en la{' '}
        <Link href="/rider/privacidad">Política de Privacidad</Link>.
      </p>

      <h2>4. Efectos de la eliminación</h2>
      <ul>
        <li>Dejarás de poder iniciar sesión en Mexy Rider con esa cuenta.</li>
        <li>No recibirás ofertas ni notificaciones de entrega.</li>
        <li>
          Si más adelante necesitas volver a operar, deberás ser dado de alta de nuevo por
          Mexy o por el operador asociado.
        </li>
      </ul>

      <h2>5. Documentos relacionados</h2>
      <ul>
        <li>
          <Link href="/rider/privacidad">Política de Privacidad — Mexy Rider</Link>
        </li>
        <li>
          <Link href="/rider/terminos">Términos y Condiciones — Mexy Rider</Link>
        </li>
      </ul>
    </LegalDocument>
  );
}
