import 'package:url_launcher/url_launcher.dart';

typedef ContactLaunch = Future<bool> Function(Uri uri);

String riderWhatsAppMessage(String restaurantName) {
  final name = restaurantName.trim();
  if (name.isEmpty) {
    return 'Hola, traigo su pedido. Agradezco si sale a recibirlo.';
  }
  return 'Hola, traigo su pedido de $name. Agradezco si sale a recibirlo.';
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

List<Uri> whatsappUris(String phone, {String restaurantName = ''}) {
  final digits = whatsappDigits(phone);
  if (digits.isEmpty) {
    return const [];
  }
  final text = riderWhatsAppMessage(restaurantName);
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
  String restaurantName = '',
  ContactLaunch? launch,
}) {
  return _openFirst(
    whatsappUris(phone, restaurantName: restaurantName),
    launch: launch,
  );
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
