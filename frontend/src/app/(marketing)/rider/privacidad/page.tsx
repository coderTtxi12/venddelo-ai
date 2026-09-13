import type { Metadata } from 'next';
import Link from 'next/link';
import LegalDocument from '@/components/legal/LegalDocument';

export const metadata: Metadata = {
  title: 'Política de Privacidad | Mexy Rider',
  description:
    'Cómo Mexy Rider trata los datos personales de repartidores que usan la aplicación móvil.',
};

export default function RiderPrivacyPage() {
  return (
    <LegalDocument
      title="Política de Privacidad — Mexy Rider"
      lastUpdated="12 de septiembre de 2026"
      currentPath="/rider/privacidad"
    >
      <p>
        Esta Política de Privacidad explica qué datos trata Mexy AI al operar la aplicación
        móvil Mexy Rider («la App») para repartidores. Al tocar «Continuar con Google»
        también aceptas esta política y los{' '}
        <Link href="/rider/terminos">Términos y Condiciones</Link>.
      </p>

      <h2>1. Responsable</h2>
      <p>
        El responsable del tratamiento es Mexy AI, en su carácter de operador de la
        plataforma y de la App Mexy Rider. Si tienes dudas sobre tus datos, puedes
        contactarnos a través de los canales de soporte de la plataforma indicando el
        correo de tu cuenta Google.
      </p>

      <h2>2. Datos que recopilamos</h2>
      <h3>Cuenta y autenticación</h3>
      <p>
        Cuando entras con Google, recibimos el identificador de tu cuenta, nombre, correo
        y, si Google lo comparte, foto de perfil. Usamos esa información para crear o
        reconocer tu sesión y verificar que estás autorizado como repartidor.
      </p>
      <h3>Perfil de repartidor</h3>
      <p>
        Podemos tratar datos asociados a tu alta operativa: nombre, teléfono, foto,
        identificadores internos y estado de disponibilidad o autorización.
      </p>
      <h3>Ubicación</h3>
      <p>
        Con tu permiso, la App puede recopilar ubicación precisa del dispositivo,
        incluyendo en segundo plano mientras realizas entregas o mantienes el servicio de
        ubicación activo. Esa información se usa para ofrecer entregas cercanas, mostrar tu
        posición a operaciones o al restaurante cuando corresponda, y coordinar la ruta.
      </p>
      <h3>Pedidos y actividad de entrega</h3>
      <p>
        Tratamos información de las ofertas y entregas que aceptas o rechazas: detalle del
        pedido, direcciones de recolección y entrega, estados, tiempos y notas operativas
        necesarias para completar el servicio.
      </p>
      <h3>Dispositivo y uso de la App</h3>
      <p>
        Registramos eventos técnicos necesarios para seguridad, notificaciones push,
        diagnóstico y mejora del servicio: tipo de dispositivo, versión de la App,
        registros de acceso y acciones relevantes (por ejemplo, aceptación de una oferta).
      </p>

      <h2>3. Para qué usamos los datos</h2>
      <ul>
        <li>Autenticarte y darte acceso a Mexy Rider.</li>
        <li>Verificar que eres un repartidor autorizado.</li>
        <li>Enviarte ofertas de entrega y notificaciones relacionadas.</li>
        <li>Coordinar recolección, ruta y entrega con restaurantes y operaciones.</li>
        <li>Mostrar tu ubicación cuando sea necesario para el servicio de delivery.</li>
        <li>Prevenir fraude, abuso y fallas de seguridad.</li>
        <li>Cumplir obligaciones legales y atender solicitudes de autoridades.</li>
      </ul>

      <h2>4. Con quién compartimos información</h2>
      <p>No vendemos tus datos personales. Podemos compartirlos solo cuando es necesario para:</p>
      <ul>
        <li>Autenticación con Google.</li>
        <li>
          Proveedores de infraestructura, mapas, mensajería push o analítica que nos ayudan
          a operar el servicio, bajo obligaciones de confidencialidad.
        </li>
        <li>
          Restaurantes, operadores de delivery u otros actores involucrados en una entrega
          que aceptes (por ejemplo, datos de contacto o ubicación relevantes al pedido).
        </li>
        <li>Autoridades competentes, cuando la ley lo exija.</li>
      </ul>

      <h2>5. Conservación</h2>
      <p>
        Conservamos la información mientras tu cuenta de repartidor esté activa y el tiempo
        adicional necesario para resolver disputas, cumplir la ley o mantener la seguridad.
        Los datos de entregas pueden retenerse para historial operativo e impuestos, según
        corresponda.
      </p>

      <h2>6. Tus derechos</h2>
      <p>
        De acuerdo con la normativa mexicana de protección de datos, puedes solicitar
        acceso, rectificación, cancelación u oposición (derechos ARCO), así como limitar el
        uso o revocar tu consentimiento cuando proceda (incluido el de ubicación desde los
        ajustes del dispositivo). Para ejercerlos, contáctanos indicando el correo de tu
        cuenta Google.
      </p>

      <h2>7. Permisos del dispositivo</h2>
      <p>
        La App puede solicitar ubicación, notificaciones y, según el sistema operativo,
        otros permisos necesarios para el servicio. Puedes revocarlos en la configuración
        del teléfono; algunas funciones (por ejemplo, recibir ofertas cercanas) dejarán de
        estar disponibles.
      </p>

      <h2>8. Seguridad</h2>
      <p>
        Aplicamos medidas técnicas y organizativas razonables para proteger la información.
        Ningún sistema es infalible; te pedimos que también cuides el acceso a tu cuenta
        Google y no compartas sesiones abiertas en equipos ajenos.
      </p>

      <h2>9. Menores</h2>
      <p>
        Mexy Rider no está dirigida a menores de 18 años. Si detectamos una cuenta usada por
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
