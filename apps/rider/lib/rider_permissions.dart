import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:geolocator/geolocator.dart';

import 'location_permission.dart';

class RiderPermissionSnapshot {
  const RiderPermissionSnapshot({
    required this.locationServiceEnabled,
    required this.locationPermission,
    required this.notificationsGranted,
    required this.pushNotificationsGranted,
    required this.firebaseAvailable,
  });

  final bool locationServiceEnabled;
  final LocationPermission locationPermission;
  final bool notificationsGranted;
  final bool pushNotificationsGranted;
  final bool firebaseAvailable;

  bool get locationAlwaysGranted =>
      canGoOnlineWithPermission(locationPermission);

  bool get allGranted {
    if (!locationServiceEnabled || !locationAlwaysGranted) {
      return false;
    }
    if (!notificationsGranted) {
      return false;
    }
    if (firebaseAvailable && !pushNotificationsGranted) {
      return false;
    }
    return true;
  }

  bool get needsSettings =>
      !locationServiceEnabled ||
      shouldOfferLocationSettings(locationPermission);
}

Future<RiderPermissionSnapshot> checkRiderPermissions() async {
  final firebaseAvailable = Firebase.apps.isNotEmpty;
  final locationServiceEnabled = await Geolocator.isLocationServiceEnabled();
  final locationPermission = await Geolocator.checkPermission();
  final notificationStatus = await FlutterForegroundTask.checkNotificationPermission();
  final notificationsGranted =
      notificationStatus == NotificationPermission.granted;

  var pushGranted = true;
  if (firebaseAvailable) {
    final settings = await FirebaseMessaging.instance.getNotificationSettings();
    pushGranted = settings.authorizationStatus == AuthorizationStatus.authorized ||
        settings.authorizationStatus == AuthorizationStatus.provisional;
  }

  return RiderPermissionSnapshot(
    locationServiceEnabled: locationServiceEnabled,
    locationPermission: locationPermission,
    notificationsGranted: notificationsGranted,
    pushNotificationsGranted: pushGranted,
    firebaseAvailable: firebaseAvailable,
  );
}

Future<RiderPermissionSnapshot> requestAllRiderPermissions() async {
  var locationServiceEnabled = await Geolocator.isLocationServiceEnabled();
  if (!locationServiceEnabled) {
    await Geolocator.openLocationSettings();
    locationServiceEnabled = await Geolocator.isLocationServiceEnabled();
  }

  var permission = await Geolocator.checkPermission();
  if (permission == LocationPermission.denied ||
      permission == LocationPermission.deniedForever) {
    permission = await Geolocator.requestPermission();
  }
  if (permission == LocationPermission.whileInUse) {
    permission = await Geolocator.requestPermission();
  }

  final notificationStatus = await FlutterForegroundTask.checkNotificationPermission();
  if (notificationStatus != NotificationPermission.granted) {
    await FlutterForegroundTask.requestNotificationPermission();
  }

  if (Firebase.apps.isNotEmpty) {
    await FirebaseMessaging.instance.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );
  }

  return checkRiderPermissions();
}

Future<bool> openRiderPermissionSettings() {
  return Geolocator.openAppSettings();
}

String permissionLabelFor(LocationPermission permission) {
  return switch (permission) {
    LocationPermission.always => 'Ubicación: Siempre',
    LocationPermission.whileInUse => 'Ubicación: Solo al usar la app',
    LocationPermission.denied => 'Ubicación: Denegada',
    LocationPermission.deniedForever => 'Ubicación: Denegada permanentemente',
    LocationPermission.unableToDetermine => 'Ubicación: Sin determinar',
  };
}

String riderPermissionsSummary(RiderPermissionSnapshot snapshot) {
  final lines = <String>[
    snapshot.locationServiceEnabled ? 'GPS activado' : 'GPS apagado',
    permissionLabelFor(snapshot.locationPermission),
    snapshot.notificationsGranted
        ? 'Notificaciones del sistema: activas'
        : 'Notificaciones del sistema: pendientes',
  ];
  if (snapshot.firebaseAvailable) {
    lines.add(
      snapshot.pushNotificationsGranted
          ? 'Alertas de ofertas: activas'
          : 'Alertas de ofertas: pendientes',
    );
  }
  return lines.join('\n');
}

Future<void> ensureLocationPermissionsForOnline() async {
  final serviceEnabled = await Geolocator.isLocationServiceEnabled();
  if (!serviceEnabled) {
    throw const LocationPermissionException('Activa el GPS para ponerte en línea.');
  }

  var permission = await Geolocator.checkPermission();
  if (permission == LocationPermission.denied) {
    permission = await Geolocator.requestPermission();
  }
  if (permission == LocationPermission.whileInUse) {
    permission = await Geolocator.requestPermission();
  }
  if (!canGoOnlineWithPermission(permission)) {
    throw const LocationPermissionException(alwaysLocationRequiredMessage);
  }
}

Future<void> ensureNotificationPermissionsForOnline() async {
  final status = await FlutterForegroundTask.checkNotificationPermission();
  if (status != NotificationPermission.granted) {
    await FlutterForegroundTask.requestNotificationPermission();
  }
}

class LocationPermissionException implements Exception {
  const LocationPermissionException(this.message);

  final String message;

  @override
  String toString() => message;
}

bool get isAndroid => !Platform.isIOS;
