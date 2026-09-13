import type { Metadata } from 'next';
import Link from 'next/link';
import LegalDocument from '@/components/legal/LegalDocument';

export const metadata: Metadata = {
  title: 'Términos y Condiciones | Mexy Rider',
  description:
    'Condiciones de uso de la aplicación Mexy Rider para repartidores de entrega.',
};

export default function RiderTermsPage() {
  return (
    <LegalDocument
      title="Términos y Condiciones — Mexy Rider"
      lastUpdated="12 de septiembre de 2026"
      currentPath="/rider/terminos"
    >
      <p>
        Estos Términos y Condiciones regulan el acceso y uso de la aplicación móvil Mexy
        Rider («la App»), destinada a repartidores autorizados para recibir y gestionar
        ofertas de entrega. Al tocar «Continuar con Google» o usar la App, aceptas estos
        términos y la{' '}
        <Link href="/rider/privacidad">Política de Privacidad</Link>.
      </p>

      <h2>1. El servicio</h2>
      <p>
        Mexy Rider permite a repartidores dados de alta recibir ofertas de entrega,
        consultar detalles del pedido, navegar hacia puntos de recolección y entrega, y
        actualizar el estado de la entrega. El servicio se ofrece «tal cual» y puede
        evolucionar con nuevas funciones, mejoras o retiros de módulos.
      </p>

      <h2>2. Quién puede usarlo</h2>
      <p>
        La App está pensada exclusivamente para repartidores autorizados por Mexy o por un
        operador asociado. Debes tener capacidad legal para contratar y usar el mismo
        correo con el que fuiste dado de alta. No está permitido crear o usar cuentas sin
        autorización.
      </p>

      <h2>3. Cuenta y acceso</h2>
      <ul>
        <li>
          El ingreso se realiza con Google. Eres responsable de la cuenta y del dispositivo
          que uses.
        </li>
        <li>
          No compartas tu sesión ni tu cuenta con personas no autorizadas.
        </li>
        <li>
          Podemos suspender o restringir el acceso si detectamos uso indebido, fraude,
          incumplimiento de estos términos o pérdida de la autorización como repartidor.
        </li>
      </ul>

      <h2>4. Uso permitido</h2>
      <p>
        Te comprometes a usar Mexy Rider solo para realizar entregas de forma lícita y
        conforme a las instrucciones operativas aplicables. No está permitido:
      </p>
      <ul>
        <li>Intentar acceder a cuentas, ofertas o datos que no te correspondan.</li>
        <li>Interferir con la seguridad, disponibilidad o integridad de la plataforma.</li>
        <li>
          Manipular ubicación, estados de entrega u otra información de forma engañosa.
        </li>
        <li>Usar la App para fines ajenos a las entregas autorizadas.</li>
      </ul>

      <h2>5. Ubicación y operación en tiempo real</h2>
      <p>
        Para asignar y coordinar entregas, la App puede solicitar permisos de ubicación
        (incluida ubicación en segundo plano cuando esté habilitada) y notificaciones. El
        uso de esos permisos se describe en la{' '}
        <Link href="/rider/privacidad">Política de Privacidad</Link>. Debes cumplir las
        normas de tránsito y la legislación aplicable mientras realizas entregas; Mexy no
        es responsable de infracciones o incidentes en vía pública.
      </p>

      <h2>6. Pedidos, clientes y terceros</h2>
      <p>
        Las entregas se formalizan entre el restaurante (o quien solicite el servicio), el
        cliente y tú como repartidor. Mexy Rider facilita la coordinación tecnológica; no
        garantiza tiempos de entrega ni el resultado de cada pedido. Pueden participar
        operadores, restaurantes o proveedores asociados.
      </p>

      <h2>7. Disponibilidad</h2>
      <p>
        Procuramos que la App y los servicios asociados estén disponibles de forma
        continua, pero puede haber interrupciones por mantenimiento, fallas técnicas,
        cobertura de red o causas fuera de nuestro control. No garantizamos un nivel de
        servicio ininterrumpido salvo que se pacte por escrito.
      </p>

      <h2>8. Limitación de responsabilidad</h2>
      <p>
        En la medida permitida por la ley, Mexy AI / Mexy Rider no serán responsables de
        daños indirectos, lucro cesante, pérdida de datos o interrupción de la actividad
        como repartidor. Nuestra responsabilidad total, si la hubiera, se limita a un monto
        simbólico cuando el uso de la App no implique un pago directo por tu parte, o a lo
        efectivamente pagado por servicios relacionados en los tres meses anteriores al
        reclamo cuando aplique.
      </p>

      <h2>9. Terminación</h2>
      <p>
        Puedes dejar de usar la App en cualquier momento. También podemos dar por
        terminado el acceso si incumples estos términos o dejas de estar autorizado como
        repartidor. Tras el cierre, podremos conservar cierta información cuando la ley o
        la seguridad lo requieran, según la{' '}
        <Link href="/rider/privacidad">Política de Privacidad</Link>.
      </p>

      <h2>10. Cambios</h2>
      <p>
        Podemos actualizar estos términos. La versión vigente se publica en esta página con
        su fecha de actualización. El uso continuado de la App después de un cambio
        relevante implica que aceptas la nueva versión.
      </p>

      <h2>11. Ley aplicable</h2>
      <p>
        Estos términos se interpretan de conformidad con las leyes aplicables en México. Si
        alguna cláusula se declara inválida, el resto permanecerá en vigor.
      </p>
    </LegalDocument>
  );
}
