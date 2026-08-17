import 'package:geolocator/geolocator.dart';

const alwaysLocationRequiredMessage =
    'Activa la ubicación “Siempre” para recibir envíos.';

bool canGoOnlineWithPermission(LocationPermission permission) {
  return permission == LocationPermission.always;
}

bool shouldOfferLocationSettings(LocationPermission permission) {
  return permission != LocationPermission.always;
}
