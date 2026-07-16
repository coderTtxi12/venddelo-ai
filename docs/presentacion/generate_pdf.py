#!/usr/bin/env python3
"""Genera presentación PDF horizontal para dueños de restaurantes."""

from pathlib import Path

from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.pagesizes import landscape
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

PAGE_W, PAGE_H = landscape((192 * mm, 108 * mm))
ASSETS = Path(__file__).parent / "assets"
OUTPUT = Path(__file__).parent / "Mexy-AI-Presentacion-Restaurantes.pdf"

RED = colors.HexColor("#DC2626")
GOLD = colors.HexColor("#CA8A04")
INDIGO = colors.HexColor("#4f46e5")
CREAM = colors.HexColor("#FFF8F0")
DARK = colors.HexColor("#1F2937")
MUTED = colors.HexColor("#6B7280")
WHITE = colors.white

MARGIN_L = 18 * mm
MARGIN_T = 14 * mm
CONTENT_W = PAGE_W - 2 * MARGIN_L


def register_font():
    try:
        pdfmetrics.registerFont(TTFont("Body", "/System/Library/Fonts/Supplemental/Arial.ttf"))
        pdfmetrics.registerFont(TTFont("Body-Bold", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"))
        return "Body", "Body-Bold"
    except Exception:
        return "Helvetica", "Helvetica-Bold"


def draw_bg(c, color=CREAM, accent=True):
    c.setFillColor(color)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    if accent:
        c.setFillColor(RED)
        c.rect(0, PAGE_H - 5 * mm, PAGE_W, 5 * mm, fill=1, stroke=0)


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


def draw_bullets(c, bullets, x, y, max_w, font, bold_font, size=13, leading=18):
    for bullet in bullets:
        y = wrap_text(c, f"•  {bullet}", x + 4 * mm, y, max_w - 4 * mm, font, size, leading)
        y -= 2 * mm
    return y


def draw_image_fit(c, path, x, y, max_w, max_h):
    p = ASSETS / path
    if not p.exists():
        return
    with PILImage.open(p) as img:
        iw, ih = img.size
    ratio = min(max_w / iw, max_h / ih)
    dw, dh = iw * ratio, ih * ratio
    c.drawImage(str(p), x, y - dh, width=dw, height=dh, preserveAspectRatio=True, mask="auto")


def new_page(c, bg=CREAM, accent=True):
    c.showPage()
    draw_bg(c, bg, accent)


def slide_cover(c, font, bold):
    draw_bg(c, colors.HexColor("#FEF3E2"), accent=False)
    c.setFont(bold, 40)
    c.setFillColor(RED)
    c.drawString(MARGIN_L, PAGE_H - 28 * mm, "Mexy AI")
    y = PAGE_H - 40 * mm
    y = wrap_text(c, "Tu restaurante, digital y listo para vender", MARGIN_L, y, CONTENT_W * 0.42, font, 17, 22, MUTED)
    y -= 6 * mm
    wrap_text(
        c,
        "La plataforma que convierte tu menú en pedidos reales — sin complicaciones técnicas.",
        MARGIN_L,
        y,
        CONTENT_W * 0.42,
        font,
        13,
        18,
        DARK,
    )
    draw_image_fit(c, "slide-cover.jpg", PAGE_W * 0.44, PAGE_H - 8 * mm, PAGE_W * 0.52, PAGE_H - 12 * mm)


def slide_text(c, font, bold, title, bullets, subtitle=None, bg=CREAM):
    draw_bg(c, bg)
    y = PAGE_H - 22 * mm
    if subtitle:
        c.setFont(font, 12)
        c.setFillColor(MUTED)
        c.drawString(MARGIN_L, y, subtitle)
        y -= 10 * mm
    c.setFont(bold, 26)
    c.setFillColor(RED)
    y = wrap_text(c, title, MARGIN_L, y, CONTENT_W, bold, 26, 32, RED)
    y -= 6 * mm
    draw_bullets(c, bullets, MARGIN_L, y, CONTENT_W, font, bold)


def slide_split(c, font, bold, title, bullets, image, image_left=False, bg=CREAM):
    draw_bg(c, bg)
    text_x = MARGIN_L if not image_left else PAGE_W * 0.48
    img_x = PAGE_W * 0.52 if not image_left else MARGIN_L
    text_w = PAGE_W * 0.44

    y = PAGE_H - 22 * mm
    c.setFont(bold, 24)
    y = wrap_text(c, title, text_x, y, text_w, bold, 24, 30, RED)
    y -= 4 * mm
    draw_bullets(c, bullets, text_x, y, text_w, font, bold, 12, 17)
    draw_image_fit(c, image, img_x, PAGE_H - 10 * mm, PAGE_W * 0.42, PAGE_H - 18 * mm)


def slide_cta(c, font, bold):
    draw_bg(c, INDIGO, accent=False)
    c.setFont(bold, 30)
    c.setFillColor(WHITE)
    title = "¿Listo para digitalizar tu restaurante?"
    tw = c.stringWidth(title, bold, 30)
    c.drawString((PAGE_W - tw) / 2, PAGE_H - 38 * mm, title)

    body = (
        "Sube tu menú hoy. En minutos tendrás tu código QR, "
        "tu enlace personalizado y pedidos llegando a tu WhatsApp."
    )
    y = PAGE_H - 52 * mm
    y = wrap_text(c, body, MARGIN_L + 20 * mm, y, CONTENT_W - 40 * mm, font, 15, 22, WHITE)

    c.setFont(bold, 22)
    c.setFillColor(GOLD)
    url = "turestaurante.mxy.mx"
    c.drawString((PAGE_W - c.stringWidth(url, bold, 22)) / 2, y - 14 * mm, url)

    c.setFont(font, 13)
    c.setFillColor(colors.HexColor("#E0E7FF"))
    footer = "mexy.ai · Soporte personalizado en español"
    c.drawString((PAGE_W - c.stringWidth(footer, font, 13)) / 2, y - 28 * mm, footer)


def build_pdf():
    font, bold = register_font()
    c = canvas.Canvas(str(OUTPUT), pagesize=(PAGE_W, PAGE_H))

    slide_cover(c, font, bold)

    new_page(c)
    slide_text(
        c,
        font,
        bold,
        "¿Te suena familiar?",
        [
            "Tus comensales quieren ver el menú en su celular, pero armarlo platillo por platillo toma horas.",
            "Los pedidos por mensaje se pierden: sin total claro, sin dirección, sin método de pago.",
            "Quieres vender más con promociones, pero no tienes tiempo para diseñar ni actualizar.",
            "Contratar a alguien para hacer tu menú digital cuesta caro y tarda semanas.",
        ],
        subtitle="El día a día del restaurante",
    )

    new_page(c)
    slide_split(
        c,
        font,
        bold,
        "Sube tu menú. Nosotros hacemos el resto.",
        [
            "Tomas una foto de tu menú impreso o subes el PDF que ya tienes.",
            "Nuestra inteligencia artificial lee cada platillo, precio y complemento.",
            "En minutos tienes un menú digital completo, bonito y listo para compartir.",
            "Tú solo revisas, ajustas lo que quieras y publicas con un clic.",
        ],
        "slide-menu-digital.jpg",
    )

    new_page(c, colors.HexColor("#FFF5F5"))
    slide_text(
        c,
        font,
        bold,
        "Tu menú digital, profesional desde el primer día",
        [
            "Enlace propio para tu restaurante (ej. turestaurante.mxy.mx).",
            "Código QR listo para imprimir en mesas, ventanilla o redes sociales.",
            "Fotos y descripciones mejoradas que invitan a pedir.",
            "Colores y estilo que combinan con la personalidad de tu negocio.",
            "Actualiza precios y platillos cuando quieras, desde tu celular o computadora.",
        ],
        subtitle="Beneficio 1",
        bg=colors.HexColor("#FFF5F5"),
    )

    new_page(c)
    slide_split(
        c,
        font,
        bold,
        "Pedidos claros, directo a tu WhatsApp",
        [
            "El comensal arma su pedido en el menú digital: platillos, extras y cantidades.",
            "Al confirmar, se abre WhatsApp con el detalle completo del pedido.",
            "Incluye total, dirección de entrega y forma de pago — sin confusiones.",
            "Respondes como siempre, pero con toda la información ya organizada.",
        ],
        "slide-whatsapp.jpg",
        image_left=True,
    )

    new_page(c)
    slide_split(
        c,
        font,
        bold,
        "Todo tu negocio, en un solo lugar",
        [
            "Ve los pedidos entrantes en tiempo real desde cocina o mostrador.",
            "Marca cada orden: confirmado → preparando → listo → entregado.",
            "Activa recoger en tienda, delivery, o ambos con horarios independientes.",
            "Configura efectivo, transferencia y pago con terminal para cada modalidad.",
        ],
        "slide-gestion.jpg",
    )

    new_page(c, colors.HexColor("#FFFBEB"))
    slide_text(
        c,
        font,
        bold,
        "Promociones que sí venden",
        [
            "Crea ofertas 2×1, descuentos por porcentaje o combos especiales.",
            "Programa promociones por día y horario — ideal para horas valle o fines de semana.",
            "Tus clientes las ven destacadas en el menú, listas para aprovechar.",
            "Sin diseñador: tú defines la oferta y el sistema la muestra automáticamente.",
        ],
        subtitle="Beneficio 2",
        bg=colors.HexColor("#FFFBEB"),
    )

    new_page(c, colors.HexColor("#EEF2FF"))
    slide_text(
        c,
        font,
        bold,
        "Un asistente que habla tu idioma",
        [
            '"Agrega una promoción de tacos al 2×1 los martes" — y listo.',
            '"Cambia el precio de la quesadilla a $85" — hecho en segundos.',
            '"¿Cuántos pedidos tuve hoy?" — respuesta inmediata.',
            "No necesitas ser experto en tecnología. Solo dile lo que necesitas.",
        ],
        subtitle="Beneficio 3",
        bg=colors.HexColor("#EEF2FF"),
    )

    new_page(c)
    slide_text(
        c,
        font,
        bold,
        "Hecho para restaurantes como el tuyo",
        [
            "Taquerías, fondas, antojerías, marisquerías y food trucks.",
            "Restaurantes de comida casera, multigusto o especialidad.",
            "Negocios con una o varias sucursales.",
            "Dueños que quieren vender más sin contratar a un equipo técnico.",
        ],
        subtitle="¿Es para mí?",
    )

    new_page(c, colors.HexColor("#F0FDF4"))
    slide_text(
        c,
        font,
        bold,
        "¿Por qué Mexy AI y no otras opciones?",
        [
            "Otras plataformas te piden capturar cada platillo manualmente — aquí subes una foto y listo.",
            "Sin curva de aprendizaje: si usas WhatsApp, ya sabes usar Mexy AI.",
            "Diseño profesional incluido, sin pagar a un diseñador.",
            "Pedidos organizados desde el primer día, no mensajes sueltos.",
            "Tú siempre tienes el control: editas, deshaces y ajustas lo que quieras.",
        ],
        subtitle="La diferencia",
        bg=colors.HexColor("#F0FDF4"),
    )

    new_page(c, INDIGO)
    slide_cta(c, font, bold)

    c.save()
    print(f"PDF generado: {OUTPUT}")


if __name__ == "__main__":
    build_pdf()
