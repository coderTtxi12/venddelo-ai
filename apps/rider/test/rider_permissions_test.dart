import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:mexy_rider/rider_permissions.dart';

void main() {
  test('allGranted requires GPS, always location, and notifications', () {
    const complete = RiderPermissionSnapshot(
      locationServiceEnabled: true,
      locationPermission: LocationPermission.always,
      notificationsGranted: true,
      pushNotificationsGranted: true,
      firebaseAvailable: true,
    );
    expect(complete.allGranted, isTrue);

    const missingAlways = RiderPermissionSnapshot(
      locationServiceEnabled: true,
      locationPermission: LocationPermission.whileInUse,
      notificationsGranted: true,
      pushNotificationsGranted: true,
      firebaseAvailable: false,
    );
    expect(missingAlways.allGranted, isFalse);

    const missingNotifications = RiderPermissionSnapshot(
      locationServiceEnabled: true,
      locationPermission: LocationPermission.always,
      notificationsGranted: false,
      pushNotificationsGranted: true,
      firebaseAvailable: false,
    );
    expect(missingNotifications.allGranted, isFalse);

    const missingPush = RiderPermissionSnapshot(
      locationServiceEnabled: true,
      locationPermission: LocationPermission.always,
      notificationsGranted: true,
      pushNotificationsGranted: false,
      firebaseAvailable: true,
    );
    expect(missingPush.allGranted, isFalse);
  });
}
