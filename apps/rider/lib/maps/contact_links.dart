import 'package:url_launcher/url_launcher.dart';

import '../models.dart';

typedef ContactLaunch = Future<bool> Function(Uri uri);

String riderWhatsAppMessage(String shortId) {
  final code = formatShortId(shortId);
  if (code.isEmpty) {
    return 'Hola, soy el repartidor de tu pedido.';
  }
  return 'Hola, soy el repartidor de tu pedido $code.';
}

String phoneDigits(String phone) => phone.replaceAll(RegExp(r'\D'), '');

String whatsappDigits(String phone) {
  var digits = phoneDigits(phone);
  if (digits.length == 10) {
    digits = '52$digits';
  }
  return digits;
}

List<Uri> telUris(String phone) {
  final digits = phoneDigits(phone);
  if (digits.isEmpty) {
    return const [];
  }
  return [Uri.parse('tel:+$digits')];
}

List<Uri> whatsappUris(String phone, {String shortId = ''}) {
  final digits = whatsappDigits(phone);
  if (digits.isEmpty) {
    return const [];
  }
  final text = riderWhatsAppMessage(shortId);
  return [
    Uri(
      scheme: 'whatsapp',
      host: 'send',
      queryParameters: {'phone': digits, 'text': text},
    ),
    Uri.https('wa.me', '/$digits', {'text': text}),
  ];
}

Future<void> openPhoneCall(String phone, {ContactLaunch? launch}) {
  return _openFirst(telUris(phone), launch: launch);
}

Future<void> openWhatsApp(
  String phone, {
  String shortId = '',
  ContactLaunch? launch,
}) {
  return _openFirst(whatsappUris(phone, shortId: shortId), launch: launch);
}

Future<void> _openFirst(List<Uri> uris, {ContactLaunch? launch}) async {
  final launcher = launch ?? _launchExternal;
  for (final uri in uris) {
    try {
      if (await launcher(uri)) {
        return;
      }
    } catch (_) {}
  }
}

Future<bool> _launchExternal(Uri uri) {
  return launchUrl(uri, mode: LaunchMode.externalApplication);
}
