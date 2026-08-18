import 'package:url_launcher/url_launcher.dart';

typedef MapsLaunch = Future<bool> Function(Uri uri);

List<Uri> externalMapsUris({
  required String label,
  double? latitude,
  double? longitude,
  String? address,
}) {
  final hasCoords = latitude != null && longitude != null;
  final destination = hasCoords
      ? '${latitude.toStringAsFixed(6)},${longitude.toStringAsFixed(6)}'
      : (address?.trim().isNotEmpty == true ? address!.trim() : label.trim());
  if (destination.isEmpty) {
    return const [];
  }
  final query = label.trim().isEmpty ? destination : '$label, $destination';
  return [
    if (hasCoords) Uri.parse('google.navigation:q=$latitude,$longitude&mode=d'),
    Uri.https('www.google.com', '/maps/dir/', {
      'api': '1',
      'destination': destination,
      'travelmode': 'driving',
    }),
    Uri.parse('geo:0,0?q=${Uri.encodeComponent(query)}'),
  ];
}

Future<void> openExternalMaps({
  required String label,
  double? latitude,
  double? longitude,
  String? address,
  MapsLaunch? launch,
}) async {
  final launcher = launch ?? _launchExternal;
  for (final uri in externalMapsUris(
    label: label,
    latitude: latitude,
    longitude: longitude,
    address: address,
  )) {
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
