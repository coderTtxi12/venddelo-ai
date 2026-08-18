import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../models.dart';

LatLng? latLngOrNull(double? lat, double? lng) {
  if (lat == null || lng == null) {
    return null;
  }
  if (lat.abs() < 0.0001 && lng.abs() < 0.0001) {
    return null;
  }
  return LatLng(lat, lng);
}

LatLng? assignmentNavigationTarget(RiderAssignment assignment) {
  if (assignment.status == 'assigned') {
    return latLngOrNull(assignment.restaurantLat, assignment.restaurantLng);
  }
  return latLngOrNull(assignment.dropoffLat, assignment.dropoffLng);
}

String jobStepLabel(String status) {
  return switch (status) {
    'assigned' => 'Recoge el pedido',
    'picked_up' => 'Ve a entregar',
    'in_transit' => 'Confirma la entrega',
    _ => 'Envío activo',
  };
}

String jobDestinationAddress(RiderAssignment assignment) {
  if (assignment.status == 'assigned') {
    final address = assignment.restaurantAddress?.trim() ?? '';
    if (address.isNotEmpty) {
      return address;
    }
    return assignment.restaurantName;
  }
  return assignment.dropoffAddress;
}

String jobSlideLabel(String status) {
  return switch (status) {
    'assigned' => 'Desliza: ya recogí el pedido',
    'picked_up' => 'Desliza: ya voy en camino',
    'in_transit' => 'Desliza: ya entregué',
    _ => 'Desliza para confirmar',
  };
}

String? jobAction(String status) {
  return switch (status) {
    'assigned' => 'picked-up',
    'picked_up' => 'in-transit',
    'in_transit' => 'delivered',
    _ => null,
  };
}
