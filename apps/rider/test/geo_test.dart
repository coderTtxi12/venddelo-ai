import 'package:flutter_test/flutter_test.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:mexy_rider/maps/geo.dart';

void main() {
  const origin = LatLng(19.4326, -99.1332);
  const north = LatLng(19.4426, -99.1332);
  const east = LatLng(19.4326, -99.1232);

  test('bearingDegrees points north and east', () {
    expect(bearingDegrees(origin, north), closeTo(0, 2));
    expect(bearingDegrees(origin, east), closeTo(90, 2));
  });

  test('lookAheadOnPath returns a point farther along the path', () {
    const path = [origin, north];
    final ahead = lookAheadOnPath(origin, path, aheadMeters: 50);
    expect(ahead, isNotNull);
    expect(ahead!.latitude, greaterThan(origin.latitude));
  });

  test('isOffRoute is false on the path and true far away', () {
    const path = [origin, north];
    expect(isOffRoute(origin, path), isFalse);
    expect(isOffRoute(const LatLng(19.4330, -99.1332), path), isFalse);
    expect(isOffRoute(east, path), isTrue);
  });
}
