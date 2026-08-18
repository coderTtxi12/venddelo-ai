import 'package:url_launcher/url_launcher.dart';

typedef ContactLaunch = Future<bool> Function(Uri uri);

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
  return [Uri.parse('tel:$digits')];
}

List<Uri> whatsappUris(String phone) {
  final digits = whatsappDigits(phone);
  if (digits.isEmpty) {
    return const [];
  }
  return [
    Uri.parse('whatsapp://send?phone=$digits'),
    Uri.https('wa.me', '/$digits'),
  ];
}

Future<void> openPhoneCall(String phone, {ContactLaunch? launch}) {
  return _openFirst(telUris(phone), launch: launch);
}

Future<void> openWhatsApp(String phone, {ContactLaunch? launch}) {
  return _openFirst(whatsappUris(phone), launch: launch);
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
