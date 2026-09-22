import 'package:flutter_test/flutter_test.dart';
import 'package:mexy_rider/maps/contact_links.dart';

void main() {
  test('phoneDigits strips formatting', () {
    expect(phoneDigits('+52 55 1234 5678'), '525512345678');
  });

  test('whatsappDigits prefixes Mexico country code for 10-digit numbers', () {
    expect(whatsappDigits('5512345678'), '525512345678');
    expect(whatsappDigits('+52 55 1234 5678'), '525512345678');
  });

  test('tel and whatsapp uris are ready to launch', () {
    expect(telUris('+525512345678').first.scheme, 'tel');
    expect(telUris('+525512345678').single.toString(), 'tel:+525512345678');
    expect(telUris('525512345678').single.toString(), 'tel:+525512345678');
    expect(whatsappUris('5512345678').first.scheme, 'whatsapp');
    expect(whatsappUris('5512345678')[1].host, 'wa.me');
  });

  test('whatsapp message names the order code when present', () {
    expect(
      riderWhatsAppMessage('ab12cd'),
      'Hola, soy el repartidor de tu pedido #AB12CD.',
    );
    expect(
      riderWhatsAppMessage(''),
      'Hola, soy el repartidor de tu pedido.',
    );
    expect(
      whatsappUris('5512345678', shortId: 'ab12cd').first.queryParameters['text'],
      'Hola, soy el repartidor de tu pedido #AB12CD.',
    );
    expect(
      whatsappUris('5512345678', shortId: 'ab12cd')[1].queryParameters['text'],
      'Hola, soy el repartidor de tu pedido #AB12CD.',
    );
    expect(
      whatsappUris('5512345678').first.queryParameters['text'],
      'Hola, soy el repartidor de tu pedido.',
    );
  });

  test('openWhatsApp uses the first successful uri', () async {
    final launched = <Uri>[];
    await openWhatsApp(
      '5512345678',
      launch: (uri) async {
        launched.add(uri);
        return true;
      },
    );
    expect(launched, hasLength(1));
    expect(launched.first.scheme, 'whatsapp');
  });
}
