import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:mexy_rider/location_permission.dart';

void main() {
  test('only Always permission allows going online', () {
    expect(canGoOnlineWithPermission(LocationPermission.always), isTrue);
    expect(canGoOnlineWithPermission(LocationPermission.whileInUse), isFalse);
    expect(canGoOnlineWithPermission(LocationPermission.denied), isFalse);
    expect(canGoOnlineWithPermission(LocationPermission.deniedForever), isFalse);
    expect(canGoOnlineWithPermission(LocationPermission.unableToDetermine), isFalse);
  });

  test('Always required copy is the Spanish settings prompt', () {
    expect(
      alwaysLocationRequiredMessage,
      'Activa la ubicación “Siempre” para recibir envíos.',
    );
  });

  test('denied Always after request should offer app settings', () {
    expect(shouldOfferLocationSettings(LocationPermission.always), isFalse);
    expect(shouldOfferLocationSettings(LocationPermission.whileInUse), isTrue);
    expect(shouldOfferLocationSettings(LocationPermission.denied), isTrue);
    expect(shouldOfferLocationSettings(LocationPermission.deniedForever), isTrue);
  });
}
