import 'package:flutter_test/flutter_test.dart';
import 'package:mexy_rider/maps/open_external_maps.dart';

void main() {
  test('externalMapsUris prefers coordinates for restaurant navigation', () {
    final uris = externalMapsUris(
      label: 'Tacos El Güero',
      latitude: 19.4326,
      longitude: -99.1332,
      address: 'Av. Reforma 100',
    );

    expect(uris.first.scheme, 'google.navigation');
    expect(uris.first.toString(), contains('19.4326'));
    expect(uris.first.toString(), contains('-99.1332'));
    expect(
      uris[1].toString(),
      contains('https://www.google.com/maps/dir'),
    );
    expect(uris[1].queryParameters['destination'], '19.432600,-99.133200');
    expect(uris[1].queryParameters['travelmode'], 'driving');
  });

  test('externalMapsUris falls back to address without coordinates', () {
    final uris = externalMapsUris(
      label: 'Tacos El Güero',
      address: 'Av. Reforma 100',
    );

    expect(uris.first.scheme, 'https');
    expect(uris.first.queryParameters['destination'], 'Av. Reforma 100');
  });

  test('openExternalMaps stops after the first successful launch', () async {
    final launched = <Uri>[];
    await openExternalMaps(
      label: 'Tacos',
      latitude: 19.43,
      longitude: -99.13,
      launch: (uri) async {
        launched.add(uri);
        return true;
      },
    );
    expect(launched, hasLength(1));
    expect(launched.first.scheme, 'google.navigation');
  });
}
