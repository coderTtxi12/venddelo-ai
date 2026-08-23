import type { Metadata } from 'next';
import Link from 'next/link';
import LegalDocument from '@/components/legal/LegalDocument';

export const metadata: Metadata = {
  title: 'Términos y Condiciones | Mexy AI',
  description: 'Condiciones de uso de la plataforma Mexy AI para dueños de restaurante.',
};

export default function TermsPage() {
  return (
    <LegalDocument
      title="Términos y Condiciones"
      lastUpdated="22 de agosto de 2026"
      currentPath="/terminos"
    >
      <p>
        Estos Términos y Condiciones regulan el acceso y uso de Mexy AI, la plataforma para
        gestionar el menú digital, pedidos, horarios, analíticas, marketing y delivery de tu
        restaurante. Al hacer clic en «Continuar con Google», crear una cuenta o usar el
        servicio, aceptas estos términos y la{' '}
        <Link href="/privacidad">Política de Privacidad</Link>.
      </p>

      <h2>1. El servicio</h2>
      <p>
        Mexy AI permite a restaurantes administrar su operación digital: carta, productos,
        pedidos, horarios, reportes, herramientas de marketing y, cuando esté disponible,
        solicitudes de entrega. El servicio se ofrece «tal cual» y puede evolucionar con
        nuevas funciones, mejoras o retiros de módulos.
      </p>

      <h2>2. Quién puede usarlo</h2>
      <p>
        El panel está pensado para dueños, administradores y personal autorizado del
        restaurante. Debes tener capacidad legal para contratar y, si actúas en nombre de un
        negocio, facultades suficientes para aceptar estos términos por esa empresa.
      </p>

      <h2>3. Cuenta y acceso</h2>
      <ul>
        <li>El ingreso se realiza con Google. Eres responsable de la cuenta que uses.</li>
        <li>
          Debes mantener actualizados los datos de tu restaurante y no compartir el acceso
          con personas no autorizadas.
        </li>
        <li>
          Podemos suspender o restringir el acceso si detectamos uso indebido, fraude o
          incumplimiento de estos términos.
        </li>
      </ul>

      <h2>4. Uso permitido</h2>
      <p>Te comprometes a usar Mexy AI solo para operar tu restaurante de forma lícita. No está permitido:</p>
      <ul>
        <li>Intentar acceder a cuentas, restaurantes o datos que no te correspondan.</li>
        <li>Interferir con la seguridad, disponibilidad o integridad de la plataforma.</li>
        <li>Cargar contenido ilegal, engañoso o que vulnere derechos de terceros.</li>
        <li>Usar el servicio para enviar spam o comunicaciones no solicitadas.</li>
      </ul>

      <h2>5. Contenido del restaurante</h2>
      <p>
        El menú, fotos, precios, horarios, textos y demás información que publiques son
        responsabilidad tuya. Conservas la titularidad de ese contenido y nos otorgas una
        licencia limitada para alojarlo, mostrarlo y operarlo dentro de Mexy AI (incluido el
        menú público y el flujo de pedidos).
      </p>
      <p>
        Debes asegurarte de que precios, disponibilidad, alérgenos y descripciones sean
        exactos. Mexy AI no es responsable de reclamos de clientes derivados de información
        incorrecta que hayas publicado.
      </p>

      <h2>6. Pedidos, delivery y terceros</h2>
      <p>
        Los pedidos que recibas a través del menú digital o de integraciones de entrega se
        formalizan entre tu restaurante y el cliente. Si usas delivery, pueden participar
        proveedores, operadores o repartidores independientes. Mexy AI facilita la
        coordinación tecnológica; no garantiza tiempos de entrega ni el resultado de cada
        pedido.
      </p>

      <h2>7. Asistente y automatizaciones</h2>
      <p>
        Algunas funciones usan inteligencia artificial para ayudarte a crear o actualizar
        contenido. Debes revisar el resultado antes de publicarlo. Las sugerencias
        automatizadas no sustituyen tu criterio operativo ni legal.
      </p>

      <h2>8. Disponibilidad</h2>
      <p>
        Procuramos que la plataforma esté disponible de forma continua, pero puede haber
        interrupciones por mantenimiento, fallas técnicas o causas fuera de nuestro control.
        No garantizamos un nivel de servicio ininterrumpido salvo que se pacte por escrito.
      </p>

      <h2>9. Limitación de responsabilidad</h2>
      <p>
        En la medida permitida por la ley, Mexy AI no será responsable de daños indirectos,
        lucro cesante, pérdida de datos o interrupción del negocio. Nuestra responsabilidad
        total, si la hubiera, se limita a lo efectivamente pagado por el servicio en los
        tres meses anteriores al reclamo, o a un monto simbólico si el plan es gratuito.
      </p>

      <h2>10. Terminación</h2>
      <p>
        Puedes dejar de usar el servicio en cualquier momento. También podemos dar por
        terminado el acceso si incumples estos términos. Tras el cierre, podremos conservar
        cierta información cuando la ley o la seguridad lo requieran, según la{' '}
        <Link href="/privacidad">Política de Privacidad</Link>.
      </p>

      <h2>11. Cambios</h2>
      <p>
        Podemos actualizar estos términos. La versión vigente se publica en esta página con
        su fecha de actualización. El uso continuado del servicio después de un cambio
        relevante implica que aceptas la nueva versión.
      </p>

      <h2>12. Ley aplicable</h2>
      <p>
        Estos términos se interpretan de conformidad con las leyes aplicables en México. Si
        alguna cláusula se declara inválida, el resto permanecerá en vigor.
      </p>
    </LegalDocument>
  );
}
