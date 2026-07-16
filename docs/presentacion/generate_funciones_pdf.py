#!/usr/bin/env python3
"""Genera PDF de funciones del panel (frontend) para dueños de restaurantes."""

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

OUTPUT = Path(__file__).parent / "Mexy-AI-Funciones-Panel.pdf"

PAGE_W, PAGE_H = A4
RED = colors.HexColor("#DC2626")
INDIGO = colors.HexColor("#4f46e5")
CREAM = colors.HexColor("#FFF8F0")
DARK = colors.HexColor("#1F2937")
MUTED = colors.HexColor("#6B7280")
WHITE = colors.white
AI_BG = colors.HexColor("#EEF2FF")

MARGIN_L = 20 * mm
MARGIN_R = 20 * mm
MARGIN_T = 18 * mm
MARGIN_B = 16 * mm
CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R

SECTIONS = [
    {
        "title": "Mexy AI — Tu asistente inteligente",
        "highlight": True,
        "intro": "La IA es el corazón del sistema. Te ayuda a armar y gestionar tu negocio hablando en lenguaje natural.",
        "items": [
            ("Chat inteligente", "Habla con Mexy AI desde cualquier pantalla del panel."),
            ("Importar menú con IA", "Sube PDF, Word o fotos y la IA digitaliza tu menú completo."),
            ("Preguntas de aclaración", "Si algo no queda claro en tu menú, responde un cuestionario corto."),
            ("Consultas sobre tu menú", "Pregunta qué categorías, productos o promociones tienes activas."),
            ("Crear y editar catálogo", "La IA crea y actualiza productos, precios, descripciones y opciones."),
            ("Cambios masivos", "Renombra productos o actualiza precios de varios platillos a la vez."),
            ("Crear promociones", "Pide ofertas 2×1, descuentos o combos y la IA las configura."),
            ("Adjuntar archivos", "Envía documentos o imágenes al chat con el clip o arrastrándolos."),
            ("Sugerencias rápidas", "Atajos como importar menú o ver promociones activas."),
            ("Proceso en vivo", "Ves en tiempo real qué está haciendo la IA por ti."),
            ("Nueva conversación", "Reinicia el chat cuando quieras empezar un tema distinto."),
        ],
        "examples_block": {
            "title": "Ejemplos de peticiones — solo algunos ejemplos",
            "note": "Puedes pedirle a Mexy AI muchas más cosas; estas son solo ideas para empezar:",
            "items": [
                "«¿Qué categorías tengo?»",
                "«Quiero importar mi menú» (adjuntando PDF o fotos)",
                "«¿Qué promociones están activas?»",
                "«Cambia el precio de la quesadilla a $85»",
                "«Agrega una promoción 2×1 en tacos los martes»",
                "«Renombra todos los productos de la categoría Postres»",
                "«Pon la hamburguesa como borrador»",
                "«Agrega un grupo de salsa obligatorio al pozole»",
                "«Para el producto Bolas de helado, agrégale estas opciones, a elegir, solo puede elegir una, y es obligatorio: Chocolate, Fresa, Vainilla»",
                "«Sube $10 el precio de todos los desayunos»",
            ],
        },
    },
    {
        "title": "Menú digital",
        "items": [
            ("Vista previa en vivo", "Ve exactamente cómo tus clientes verán el menú."),
            ("Enlace y QR", "Comparte tu menú por internet o imprime un código QR."),
            ("Temas visuales del menú", "59 diseños de color y tipografía para tu menú digital."),
            ("Estilos de código QR", "116 diseños de QR listos para personalizar, descargar e imprimir."),
            ("Identidad visual", "Edita portada, logo, nombre y descripción."),
            ("Ordenar contenido", "Arrastra categorías y productos para definir el orden."),
            ("Vista por categoría", "Muestra productos en lista, horizontal o cuadrícula."),
            ("Secciones especiales", "Activa bloques de Promociones y Por tiempo limitado."),
            ("Opciones del producto", "Ajusta complementos y variantes desde el editor."),
        ],
    },
    {
        "title": "Pedidos (Cocina)",
        "items": [
            ("Pedidos en tiempo real", "Los pedidos llegan solos, sin recargar la página."),
            ("Alerta sonora", "Suena una notificación cuando entra un pedido nuevo."),
            ("Filtros por estado", "Nuevos, confirmados, preparando, listos, entregados o cancelados."),
            ("Flujo de trabajo", "Avanza cada pedido: Confirmar → Preparar → Listo → Entregado."),
            ("Detalle completo", "Cliente, WhatsApp, tipo de entrega, pago y notas."),
            ("Totales desglosados", "Subtotal, descuentos, envío y total final."),
            ("Pago en efectivo", "Ve con cuánto paga el cliente y el cambio a entregar."),
            ("WhatsApp al cliente", "Al confirmar o cancelar, se abre un mensaje listo para enviar."),
            ("Cancelar pedido", "Cancela con motivo: agotado, fuera de zona, cerrado, etc."),
        ],
    },
    {
        "title": "Productos",
        "items": [
            ("Categorías", "Crea, edita y activa o desactiva secciones del menú."),
            ("Platillos", "Alta y edición con nombre, descripción, foto y precio."),
            ("Varias categorías", "Un mismo platillo puede aparecer en más de una sección."),
            ("Descuentos", "Define descuento fijo ($) o porcentaje (%) por producto."),
            ("Estados", "En menú, borrador o inactivo según quieras venderlo."),
            (
                "Una opción · Obligatorio",
                "El cliente debe elegir exactamente 1. Ej: «Elige tu salsa» (roja, verde o habanero).",
            ),
            (
                "Una opción · Opcional",
                "El cliente puede elegir 1 o ninguna. Ej: «¿Con o sin cebolla?»",
            ),
            (
                "Varias opciones · Obligatorio (de 1 a N)",
                "Debe elegir entre 1 y un máximo. Ej: «Elige 1 o 2 complementos» en tu torta.",
            ),
            (
                "Varias opciones · Obligatorio (mínimo)",
                "Debe elegir al menos 1. Ej: «Elige al menos un topping» en tu pizza.",
            ),
            (
                "Varias opciones · Opcional (con tope)",
                "Puede omitir o elegir hasta un máximo. Ej: «Hasta 3 extras» en tu hamburguesa.",
            ),
            (
                "Varias opciones · Opcional (sin tope)",
                "Puede omitir o elegir varios sin límite. Ej: «Agrega los extras que quieras».",
            ),
            ("Copiar opciones", "Reutiliza grupos de complementos de otro producto."),
            ("Búsqueda y filtros", "Busca por nombre, categoría o estado."),
        ],
    },
    {
        "title": "Promociones (Marketing)",
        "items": [
            ("Ofertas N×M", "Configura 2×1, 3×2 y similares."),
            ("Alcance flexible", "Aplica a productos, categorías o al pedido completo."),
            ("Días y horarios", "Limita la promo a ciertos días o franjas."),
            ("Vigencia", "Define fecha de inicio y fin de cada campaña."),
            ("Banner promocional", "Imagen destacada que aparece en el menú público."),
            ("Estado en tiempo real", "Ve si está vigente, programada o expirada."),
            ("Borradores", "Guarda promociones a medias y retómalas después."),
        ],
    },
    {
        "title": "Configuración",
        "items": [
            ("Identidad del restaurante", "Nombre, subdominio, logo y descripción."),
            ("WhatsApp de pedidos", "Número donde recibirás los pedidos."),
            ("Tipos de entrega", "Activa recoger en local y/o entrega a domicilio."),
            ("Métodos de pago", "Efectivo, transferencia y terminal por separado."),
            ("Ubicación", "Marca tu dirección exacta en el mapa."),
            ("Horarios", "Define cuándo aceptas pedidos para llevar."),
            ("Equipo", "Invita administradores por correo (solo propietario)."),
            ("Mexy Reparto", "Consulta el estado de tu servicio de entrega."),
        ],
    },
    {
        "title": "Registro inicial (Onboarding)",
        "items": [
            ("Asistente paso a paso", "Guía de bienvenida con barra de progreso."),
            ("Datos básicos", "Nombre, URL del menú, descripción y contacto."),
            ("Imágenes", "Sube logo y foto de portada."),
            ("Ubicación y horario", "Configura desde el primer día."),
            ("Pedidos y pagos", "Elige envío, recoger y formas de pago."),
            ("Guardado automático", "Retoma donde lo dejaste si sales a mitad."),
        ],
    },
]


def register_font():
    try:
        pdfmetrics.registerFont(TTFont("Body", "/System/Library/Fonts/Supplemental/Arial.ttf"))
        pdfmetrics.registerFont(TTFont("Body-Bold", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"))
        return "Body", "Body-Bold"
    except Exception:
        return "Helvetica", "Helvetica-Bold"


def wrap_text(c, text, x, y, max_w, font, size, leading, color=DARK):
    c.setFont(font, size)
    c.setFillColor(color)
    words = text.split()
    lines, current = [], ""
    for word in words:
        trial = f"{current} {word}".strip()
        if c.stringWidth(trial, font, size) <= max_w:
            current = trial
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    for line in lines:
        c.drawString(x, y, line)
        y -= leading
    return y


def draw_header(c, font, bold, page_num):
    c.setFillColor(RED)
    c.rect(0, PAGE_H - 8 * mm, PAGE_W, 8 * mm, fill=1, stroke=0)
    c.setFont(bold, 9)
    c.setFillColor(WHITE)
    c.drawString(MARGIN_L, PAGE_H - 6 * mm, "Mexy AI · Funciones del panel")
    c.drawRightString(PAGE_W - MARGIN_R, PAGE_H - 6 * mm, f"Página {page_num}")


def draw_cover(c, font, bold):
    c.setFillColor(CREAM)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    c.setFillColor(RED)
    c.rect(0, PAGE_H - 10 * mm, PAGE_W, 10 * mm, fill=1, stroke=0)

    c.setFont(bold, 32)
    c.setFillColor(RED)
    c.drawString(MARGIN_L, PAGE_H - 50 * mm, "Funciones del panel")
    c.setFont(bold, 28)
    c.drawString(MARGIN_L, PAGE_H - 62 * mm, "Mexy AI")

    y = PAGE_H - 80 * mm
    y = wrap_text(
        c,
        "Listado de funciones disponibles para dueños de restaurante.",
        MARGIN_L,
        y,
        CONTENT_W,
        font,
        13,
        19,
        MUTED,
    )

    # AI highlight box
    box_y = y - 20 * mm
    box_h = 32 * mm
    c.setFillColor(AI_BG)
    c.roundRect(MARGIN_L, box_y - box_h, CONTENT_W, box_h, 4 * mm, fill=1, stroke=0)
    c.setFont(bold, 14)
    c.setFillColor(INDIGO)
    c.drawString(MARGIN_L + 6 * mm, box_y - 10 * mm, "Destacado: Mexy AI")
    wrap_text(
        c,
        "La inteligencia artificial es la función principal del sistema. "
        "Digitaliza tu menú, gestiona productos y promociones, y responde tus dudas por chat.",
        MARGIN_L + 6 * mm,
        box_y - 18 * mm,
        CONTENT_W - 12 * mm,
        font,
        11,
        16,
        DARK,
    )

    c.setFont(font, 10)
    c.setFillColor(MUTED)
    c.drawString(MARGIN_L, 20 * mm, "Documento para dueños de restaurante · Panel web Mexy AI")


def section_content_units(section):
    units = []
    for name, desc in section["items"]:
        units.append(("item", name, desc))
    block = section.get("examples_block")
    if block:
        units.append(("examples_header", block["title"], block.get("note", "")))
        for example in block["items"]:
            units.append(("example", example))
    return units


def unit_height(c, font, bold, unit):
    kind = unit[0]
    if kind == "item":
        _, name, desc = unit
        c.setFont(font, 9.5)
        line, lines_count = "", 0
        for word in desc.split():
            trial = f"{line} {word}".strip()
            if c.stringWidth(trial, font, 9.5) <= CONTENT_W - 6 * mm:
                line = trial
            else:
                lines_count += 1
                line = word
        lines_count += 1
        return 12 + lines_count * 13 + 3 * mm
    if kind == "examples_header":
        _, title, note = unit
        h = 18 + 14
        if note:
            c.setFont(font, 9)
            line, lines = "", 0
            for word in note.split():
                trial = f"{line} {word}".strip()
                if c.stringWidth(trial, font, 9) <= CONTENT_W - 6 * mm:
                    line = trial
                else:
                    lines += 1
                    line = word
            lines += 1
            h += lines * 12 + 4 * mm
        return h
    if kind == "example":
        c.setFont(font, 9.5)
        _, text = unit
        line, lines_count = "", 0
        for word in text.split():
            trial = f"{line} {word}".strip()
            if c.stringWidth(trial, font, 9.5) <= CONTENT_W - 10 * mm:
                line = trial
            else:
                lines_count += 1
                line = word
        lines_count += 1
        return lines_count * 13 + 2 * mm
    return 10 * mm


def draw_unit(c, font, bold, unit, x, y):
    kind = unit[0]
    if kind == "item":
        _, name, desc = unit
        c.setFont(bold, 10)
        c.setFillColor(DARK)
        c.drawString(x + 2 * mm, y, f"• {name}")
        y -= 12
        return wrap_text(c, desc, x + 6 * mm, y, CONTENT_W - 6 * mm, font, 9.5, 13, MUTED) - 3 * mm
    if kind == "examples_header":
        _, title, note = unit
        c.setFillColor(AI_BG)
        c.roundRect(x, y - 6 * mm, CONTENT_W, 6 * mm, 1.5 * mm, fill=1, stroke=0)
        c.setFont(bold, 10)
        c.setFillColor(INDIGO)
        c.drawString(x + 3 * mm, y - 4 * mm, title)
        y -= 14 * mm
        if note:
            y = wrap_text(c, note, x + 2 * mm, y, CONTENT_W - 4 * mm, font, 9, 12, MUTED)
            y -= 3 * mm
        return y
    if kind == "example":
        _, text = unit
        c.setFont(font, 9.5)
        c.setFillColor(DARK)
        return wrap_text(c, f"→ {text}", x + 4 * mm, y, CONTENT_W - 8 * mm, font, 9.5, 13, DARK) - 2 * mm
    return y


def draw_section_pages(c, font, bold, section, page_num):
    """Draw section, splitting across pages if needed. Returns updated page_num."""
    units = section_content_units(section)
    is_first_chunk = True

    while units:
        c.showPage()
        page_num += 1
        draw_header(c, font, bold, page_num)

        y = PAGE_H - MARGIN_T - 14 * mm
        highlight = section.get("highlight", False)

        if highlight:
            c.setFillColor(AI_BG)
            c.roundRect(MARGIN_L, y - 8 * mm, CONTENT_W, 8 * mm, 2 * mm, fill=1, stroke=0)
            c.setFont(bold, 14)
            c.setFillColor(INDIGO)
        else:
            c.setFont(bold, 13)
            c.setFillColor(RED)

        title = section["title"] if is_first_chunk else f"{section['title']} (cont.)"
        c.drawString(MARGIN_L + (4 * mm if highlight else 0), y - 5 * mm, title)
        y -= 14 * mm

        if section.get("intro") and is_first_chunk:
            y = wrap_text(c, section["intro"], MARGIN_L, y, CONTENT_W, font, 10, 14, MUTED)
            y -= 4 * mm

        remaining = []
        for i, unit in enumerate(units):
            if y - unit_height(c, font, bold, unit) < MARGIN_B:
                remaining = units[i:]
                break
            y = draw_unit(c, font, bold, unit, MARGIN_L, y)

        units = remaining
        is_first_chunk = False

    return page_num


def build_pdf():
    font, bold = register_font()
    c = canvas.Canvas(str(OUTPUT), pagesize=A4)

    draw_cover(c, font, bold)
    page_num = 1

    for section in SECTIONS:
        page_num = draw_section_pages(c, font, bold, section, page_num)

    c.save()
    print(f"PDF generado: {OUTPUT}")


if __name__ == "__main__":
    build_pdf()
