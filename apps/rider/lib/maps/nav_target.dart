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
    'assigned' => 'Desliza: ya llegué al restaurante',
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

  List<RiderAssignment> get ordered {
    final currentJob = current;
    if (currentJob == null) {
      return queued;
    }
    return [currentJob, ...queued];
  }
}

class RiderItineraryStop {
  const RiderItineraryStop({
    required this.id,
    required this.kind,
    required this.action,
    required this.title,
    required this.position,
    required this.requestId,
    required this.sequence,
    required this.current,
    this.detail,
  });

  final String id;
  final String kind;
  final String action;
  final String title;
  final String? detail;
  final LatLng position;
  final String requestId;
  final int sequence;
  final bool current;
}

List<T> nearestNeighborOrder<T>(
  List<T> items, {
  required LatLng? Function(T item) pointOf,
  double? startLat,
  double? startLng,
}) {
  if (items.length <= 1) {
    return List<T>.from(items);
  }
  final remaining = List<T>.from(items);
  final ordered = <T>[];
  var lat = startLat;
  var lng = startLng;
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

/// Keep collecting remaining pickups before leaving the restaurant.
/// Case D inserts a pickup detour even during an in-transit delivery.
/// A/B/C assigned while in transit wait until the current dropoff (pre-free).
RiderJobSplit splitRiderJobs(
  List<RiderAssignment> assignments, {
  double? riderLat,
  double? riderLng,
  List<PersistedItineraryStop>? itinerary,
}) {
  if (itinerary != null && itinerary.isNotEmpty && pickupBeforeDropoff(itinerary)) {
    return splitJobsFromItinerary(assignments, itinerary);
  }
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
    return nearestNeighborOrder(
      items,
      pointOf: pointOf,
      startLat: riderLat,
      startLng: riderLng,
    );
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

RiderJobSplit splitJobsFromItinerary(
  List<RiderAssignment> assignments,
  List<PersistedItineraryStop> itinerary,
) {
  final byId = {for (final item in assignments) item.id: item};
  final ordered = <RiderAssignment>[];
  final seen = <String>{};
  for (final stop in itinerary) {
    final job = byId[stop.requestId];
    if (job == null || seen.contains(job.id)) {
      continue;
    }
    seen.add(job.id);
    ordered.add(job);
  }
  for (final job in assignments) {
    if (seen.add(job.id)) {
      ordered.add(job);
    }
  }
  if (ordered.isEmpty) {
    return const RiderJobSplit();
  }
  return RiderJobSplit(current: ordered.first, queued: ordered.skip(1).toList());
}

bool pickupBeforeDropoff(List<PersistedItineraryStop> stops) {
  final pickupAt = <String, int>{};
  final dropoffAt = <String, int>{};
  for (var index = 0; index < stops.length; index++) {
    final stop = stops[index];
    if (stop.kind == 'restaurant') {
      pickupAt[stop.requestId] = index;
    } else {
      dropoffAt[stop.requestId] = index;
    }
  }
  for (final entry in dropoffAt.entries) {
    final pickIndex = pickupAt[entry.key];
    if (pickIndex != null && pickIndex > entry.value) {
      return false;
    }
  }
  return true;
}

LatLng? persistedStopTarget(
  PersistedItineraryStop stop,
  RiderAssignment? job,
) {
  if (job == null) {
    return latLngOrNull(stop.lat, stop.lng);
  }
  if (stop.kind == 'restaurant') {
    return latLngOrNull(job.restaurantLat, job.restaurantLng) ??
        latLngOrNull(stop.lat, stop.lng);
  }
  return latLngOrNull(job.dropoffLat, job.dropoffLng) ??
      latLngOrNull(stop.lat, stop.lng);
}

LatLng? navigationTargetForJobs(
  RiderAssignment? job, {
  List<PersistedItineraryStop> itinerary = const [],
  List<RiderAssignment> assignments = const [],
}) {
  if (itinerary.isNotEmpty && pickupBeforeDropoff(itinerary)) {
    final first = itinerary.first;
    RiderAssignment? match;
    for (final item in assignments) {
      if (item.id == first.requestId) {
        match = item;
        break;
      }
    }
    return persistedStopTarget(first, match ?? job);
  }
  if (job == null) {
    return null;
  }
  return assignmentNavigationTarget(job);
}

/// Remaining pickup/dropoff stops. Prefer the persisted backend plan when present.
List<RiderItineraryStop> riderItineraryStops(
  RiderJobSplit jobs, {
  double? riderLat,
  double? riderLng,
  List<PersistedItineraryStop>? itinerary,
}) {
  if (itinerary != null && itinerary.isNotEmpty && pickupBeforeDropoff(itinerary)) {
    return stopsFromPersisted(jobs.ordered, itinerary);
  }
  final ordered = jobs.ordered;
  if (ordered.isEmpty) {
    return const [];
  }

  final stops = <({
    String id,
    String kind,
    String action,
    String title,
    String? detail,
    LatLng position,
    String requestId,
  })>[];
  var lat = riderLat;
  var lng = riderLng;
  final pendingDeliveries = <RiderAssignment>[];

  void addStop({
    required String id,
    required String kind,
    required String action,
    required String title,
    required LatLng position,
    required String requestId,
    String? detail,
  }) {
    stops.add((
      id: id,
      kind: kind,
      action: action,
      title: title,
      detail: detail,
      position: position,
      requestId: requestId,
    ));
    lat = position.latitude;
    lng = position.longitude;
  }

  for (final job in ordered) {
    if (job.status == 'assigned') {
      final restaurant = latLngOrNull(job.restaurantLat, job.restaurantLng);
      if (restaurant != null) {
        addStop(
          id: 'restaurant:${job.id}',
          kind: 'restaurant',
          action: 'Recoger',
          title: job.restaurantName,
          detail: job.restaurantAddress,
          position: restaurant,
          requestId: job.id,
        );
      }
      pendingDeliveries.add(job);
      continue;
    }
    final dropoff = latLngOrNull(job.dropoffLat, job.dropoffLng);
    if (dropoff != null) {
      addStop(
        id: 'dropoff:${job.id}',
        kind: 'dropoff',
        action: 'Entregar',
        title: (job.customerName?.trim().isNotEmpty ?? false)
            ? job.customerName!.trim()
            : job.dropoffAddress,
        detail: job.dropoffAddress,
        position: dropoff,
        requestId: job.id,
      );
    }
  }

  final laterDeliveries = nearestNeighborOrder(
    pendingDeliveries,
    pointOf: (job) => latLngOrNull(job.dropoffLat, job.dropoffLng),
    startLat: lat,
    startLng: lng,
  );
  for (final job in laterDeliveries) {
    final dropoff = latLngOrNull(job.dropoffLat, job.dropoffLng);
    if (dropoff == null) {
      continue;
    }
    addStop(
      id: 'dropoff:${job.id}',
      kind: 'dropoff',
      action: 'Entregar',
      title: (job.customerName?.trim().isNotEmpty ?? false)
          ? job.customerName!.trim()
          : job.dropoffAddress,
      detail: job.dropoffAddress,
      position: dropoff,
      requestId: job.id,
    );
  }

  return [
    for (var index = 0; index < stops.length; index++)
      RiderItineraryStop(
        id: stops[index].id,
        kind: stops[index].kind,
        action: stops[index].action,
        title: stops[index].title,
        detail: stops[index].detail,
        position: stops[index].position,
        requestId: stops[index].requestId,
        sequence: index + 1,
        current: index == 0,
      ),
  ];
}

List<RiderItineraryStop> stopsFromPersisted(
  List<RiderAssignment> assignments,
  List<PersistedItineraryStop> itinerary,
) {
  final byId = {for (final item in assignments) item.id: item};
  final stops = <RiderItineraryStop>[];
  for (var index = 0; index < itinerary.length; index++) {
    final stop = itinerary[index];
    final job = byId[stop.requestId];
    final position = persistedStopTarget(stop, job);
    if (position == null) {
      continue;
    }
    final restaurant = stop.kind == 'restaurant';
    final fallbackTitle = job == null
        ? ''
        : restaurant
            ? job.restaurantName
            : ((job.customerName?.trim().isNotEmpty ?? false)
                ? job.customerName!.trim()
                : job.dropoffAddress);
    stops.add(
      RiderItineraryStop(
        id: '${stop.kind}:${stop.requestId}',
        kind: stop.kind,
        action: stop.action ?? (restaurant ? 'Recoger' : 'Entregar'),
        title: (stop.title?.trim().isNotEmpty ?? false) ? stop.title!.trim() : fallbackTitle,
        detail: restaurant ? job?.restaurantAddress : job?.dropoffAddress,
        position: position,
        requestId: stop.requestId,
        sequence: stop.sequence > 0 ? stop.sequence : index + 1,
        current: index == 0 || stop.current,
      ),
    );
  }
  return [
    for (var index = 0; index < stops.length; index++)
      RiderItineraryStop(
        id: stops[index].id,
        kind: stops[index].kind,
        action: stops[index].action,
        title: stops[index].title,
        detail: stops[index].detail,
        position: stops[index].position,
        requestId: stops[index].requestId,
        sequence: index + 1,
        current: index == 0,
      ),
  ];
}

class StackedJobPin {
  const StackedJobPin({
    required this.position,
    required this.kind,
    required this.label,
    required this.current,
    this.sequence,
  });

  final LatLng position;
  final String kind;
  final String label;
  final bool current;
  final int? sequence;
}

List<StackedJobPin> stackedJobPins(
  RiderJobSplit jobs, {
  double? riderLat,
  double? riderLng,
  List<PersistedItineraryStop>? itinerary,
}) {
  return [
    for (final stop in riderItineraryStops(
      jobs,
      riderLat: riderLat,
      riderLng: riderLng,
      itinerary: itinerary,
    ))
      StackedJobPin(
        position: stop.position,
        kind: stop.kind,
        label: '${stop.sequence}. ${stop.action} · ${stop.title}',
        current: stop.current,
        sequence: stop.sequence,
      ),
  ];
}

String queuedJobLabel(RiderAssignment assignment) {
  return switch (assignment.status) {
    'assigned' => 'Luego: recoger en ${assignment.restaurantName}',
    'picked_up' || 'in_transit' => 'Luego: entregar',
    _ => 'Luego: ${assignment.restaurantName}',
  };
}
