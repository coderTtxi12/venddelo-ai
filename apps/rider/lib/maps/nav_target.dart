import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../models.dart';
import 'geo.dart';

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

class RiderJobSplit {
  const RiderJobSplit({this.current, this.queued = const []});

  final RiderAssignment? current;
  final List<RiderAssignment> queued;
}

/// Keep collecting remaining pickups before leaving the restaurant.
/// Case D inserts a pickup detour even during an in-transit delivery.
/// A/B/C assigned while in transit wait until the current dropoff (pre-free).
RiderJobSplit splitRiderJobs(
  List<RiderAssignment> assignments, {
  double? riderLat,
  double? riderLng,
}) {
  if (assignments.isEmpty) {
    return const RiderJobSplit();
  }

  LatLng? restaurantPoint(RiderAssignment item) =>
      latLngOrNull(item.restaurantLat, item.restaurantLng);
  LatLng? dropoffPoint(RiderAssignment item) =>
      latLngOrNull(item.dropoffLat, item.dropoffLng);

  List<RiderAssignment> nearestOrder(
    List<RiderAssignment> items,
    LatLng? Function(RiderAssignment item) pointOf,
  ) {
    if (items.length <= 1) {
      return List<RiderAssignment>.from(items);
    }
    final remaining = List<RiderAssignment>.from(items);
    final ordered = <RiderAssignment>[];
    var lat = riderLat;
    var lng = riderLng;
    while (remaining.isNotEmpty) {
      var index = 0;
      var best = double.infinity;
      if (lat != null && lng != null) {
        final origin = LatLng(lat, lng);
        for (var i = 0; i < remaining.length; i++) {
          final point = pointOf(remaining[i]);
          if (point == null) {
            continue;
          }
          final distance = haversineMeters(origin, point);
          if (distance < best) {
            best = distance;
            index = i;
          }
        }
      }
      final chosen = remaining.removeAt(index);
      ordered.add(chosen);
      final next = pointOf(chosen);
      if (next != null) {
        lat = next.latitude;
        lng = next.longitude;
      }
    }
    return ordered;
  }

  final pickupNow = assignments
      .where((item) => item.status == 'assigned' && item.caseApplied == 'D')
      .toList();
  final inTransit = assignments
      .where((item) => item.status == 'in_transit')
      .toList();
  final assigned = assignments
      .where((item) => item.status == 'assigned')
      .toList();
  final pickedUp = assignments
      .where((item) => item.status == 'picked_up')
      .toList();

  late final RiderAssignment current;
  late final List<RiderAssignment> queued;

  if (pickupNow.isNotEmpty) {
    final orderedPickups = nearestOrder(pickupNow, restaurantPoint);
    current = orderedPickups.first;
    queued = [
      ...orderedPickups.skip(1),
      ...nearestOrder(inTransit, dropoffPoint),
      ...nearestOrder(
        assigned.where((item) => item.caseApplied != 'D').toList(),
        restaurantPoint,
      ),
      ...nearestOrder(pickedUp, dropoffPoint),
    ];
  } else if (inTransit.isNotEmpty) {
    final orderedDeliveries = nearestOrder(inTransit, dropoffPoint);
    current = orderedDeliveries.first;
    queued = [
      ...orderedDeliveries.skip(1),
      ...nearestOrder(assigned, restaurantPoint),
      ...nearestOrder(pickedUp, dropoffPoint),
    ];
  } else if (assigned.isNotEmpty) {
    final orderedPickups = nearestOrder(assigned, restaurantPoint);
    current = orderedPickups.first;
    queued = [
      ...orderedPickups.skip(1),
      ...nearestOrder(pickedUp, dropoffPoint),
    ];
  } else {
    final ordered = nearestOrder(assignments, dropoffPoint);
    current = ordered.first;
    queued = ordered.skip(1).toList();
  }

  return RiderJobSplit(current: current, queued: queued);
}

class StackedJobPin {
  const StackedJobPin({
    required this.position,
    required this.kind,
    required this.label,
    required this.current,
  });

  final LatLng position;
  final String kind;
  final String label;
  final bool current;
}

List<StackedJobPin> stackedJobPins(RiderJobSplit jobs) {
  final pins = <StackedJobPin>[];

  void add(RiderAssignment job, {required bool current}) {
    if (job.status == 'assigned') {
      final position = latLngOrNull(job.restaurantLat, job.restaurantLng);
      if (position == null) {
        return;
      }
      pins.add(
        StackedJobPin(
          position: position,
          kind: 'restaurant',
          label: job.restaurantName,
          current: current,
        ),
      );
      return;
    }
    final position = latLngOrNull(job.dropoffLat, job.dropoffLng);
    if (position == null) {
      return;
    }
    pins.add(
      StackedJobPin(
        position: position,
        kind: 'dropoff',
        label: job.dropoffAddress,
        current: current,
      ),
    );
  }

  final current = jobs.current;
  if (current != null) {
    add(current, current: true);
  }
  for (final queued in jobs.queued) {
    add(queued, current: false);
  }
  return pins;
}

String queuedJobLabel(RiderAssignment assignment) {
  return switch (assignment.status) {
    'assigned' => 'Luego: recoger en ${assignment.restaurantName}',
    'picked_up' || 'in_transit' => 'Luego: entregar',
    _ => 'Luego: ${assignment.restaurantName}',
  };
}
