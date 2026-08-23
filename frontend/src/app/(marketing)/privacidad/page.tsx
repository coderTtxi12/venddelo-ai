import type { Metadata } from 'next';
import Link from 'next/link';
import LegalDocument from '@/components/legal/LegalDocument';

export const metadata: Metadata = {
  title: 'Política de Privacidad | Mexy AI',
  description: 'Cómo Mexy AI trata los datos personales de dueños de restaurante y sus clientes.',
};

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Política de Privacidad"
      lastUpdated="22 de agosto de 2026"
      currentPath="/privacidad"
    >
      <p>
        Esta Política de Privacidad explica qué datos trata Mexy AI cuando usas el panel del
        restaurante, el menú digital o funciones asociadas. Al hacer clic en «Continuar con
        Google» también aceptas esta política y los{' '}
        <Link href="/terminos">Términos y Condiciones</Link>.
      </p>

      <h2>1. Responsable</h2>
      <p>
        El responsable del tratamiento es Mexy AI, en su carácter de operador de la
        plataforma. Si tienes dudas sobre tus datos, puedes escribirnos desde la
        configuración de tu cuenta o a través de los canales de soporte de la plataforma.
      </p>

      <h2>2. Datos que recopilamos</h2>
      <h3>Cuenta y autenticación</h3>
      <p>
        Cuando entras con Google, recibimos el identificador de tu cuenta, nombre, correo y,
        si Google lo comparte, foto de perfil. Usamos esa información para crear o reconocer
        tu sesión y asociarla a tu restaurante.
      </p>
      <h3>Datos del restaurante</h3>
      <p>
        Recopilamos la información que cargas para operar el negocio: nombre, datos de
        contacto, dirección, horarios, menú, productos, precios, imágenes y configuración
        del panel.
      </p>
      <h3>Pedidos y clientes</h3>
      <p>
        Si un comensal pide desde el menú digital, podemos tratar nombre, teléfono,
        dirección de entrega, notas del pedido y el detalle de lo solicitado. Esos datos se
        usan para completar el pedido y, cuando aplica, coordinar el delivery.
      </p>
      <h3>Uso de la plataforma</h3>
      <p>
        Registramos eventos técnicos necesarios para seguridad, diagnóstico y mejora del
        servicio: tipo de dispositivo, registros de acceso y acciones relevantes en el
        panel.
      </p>

      <h2>3. Para qué usamos los datos</h2>
      <ul>
        <li>Autenticarte y darte acceso al panel de tu restaurante.</li>
        <li>Mostrar y administrar tu menú, pedidos, horarios y reportes.</li>
        <li>Coordinar entregas cuando activas delivery o un proveedor asociado.</li>
        <li>Ofrecer el asistente y otras automatizaciones que tú dispares.</li>
        <li>Prevenir fraude, abuso y fallas de seguridad.</li>
        <li>Cumplir obligaciones legales y atender solicitudes de autoridades.</li>
      </ul>

      <h2>4. Con quién compartimos información</h2>
      <p>No vendemos tus datos personales. Podemos compartirlos solo cuando es necesario para:</p>
      <ul>
        <li>Autenticación con Google.</li>
        <li>
          Proveedores de infraestructura, analítica o mensajería que nos ayudan a operar el
          servicio, bajo obligaciones de confidencialidad.
        </li>
        <li>
          Operadores o repartidores involucrados en una entrega que tú o tu restaurante
          soliciten.
        </li>
        <li>Autoridades competentes, cuando la ley lo exija.</li>
      </ul>

      <h2>5. Conservación</h2>
      <p>
        Conservamos la información mientras tu cuenta esté activa y el tiempo adicional
        necesario para resolver disputas, cumplir la ley o mantener la seguridad. Los datos
        de pedidos pueden retenerse para historial operativo e impuestos, según corresponda.
      </p>

      <h2>6. Tus derechos</h2>
      <p>
        De acuerdo con la normativa mexicana de protección de datos, puedes solicitar
        acceso, rectificación, cancelación u oposición (derechos ARCO), así como limitar el
        uso o revocar tu consentimiento cuando proceda. Para ejercerlos, contáctanos desde
        la plataforma indicando el correo de tu cuenta Google.
      </p>

      <h2>7. Cookies y almacenamiento local</h2>
      <p>
        Usamos cookies y almacenamiento del navegador para mantener tu sesión, recordar
        preferencias y proteger el acceso. Si bloqueas estas tecnologías, es posible que
        algunas funciones del panel no funcionen.
      </p>

      <h2>8. Seguridad</h2>
      <p>
        Aplicamos medidas técnicas y organizativas razonables para proteger la información.
        Ningún sistema es infalible; te pedimos que también cuides el acceso a tu cuenta
        Google y no compartas sesiones abiertas en equipos públicos.
      </p>

      <h2>9. Menores</h2>
      <p>
        El panel no está dirigido a menores de 18 años. Si detectamos una cuenta creada por
        un menor sin autorización, la deshabilitaremos.
      </p>

      <h2>10. Cambios a esta política</h2>
      <p>
        Podemos actualizar esta política para reflejar cambios legales o del servicio. La
        versión vigente siempre estará en esta página, con su fecha de actualización.
      </p>
    </LegalDocument>
  );
}
