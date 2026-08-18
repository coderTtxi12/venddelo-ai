import 'dart:math' as math;

import 'package:google_maps_flutter/google_maps_flutter.dart';

const offRouteThresholdMeters = 80.0;

double _toRadians(double degrees) => degrees * math.pi / 180;

double haversineMeters(LatLng a, LatLng b) {
  const radius = 6371000.0;
  final dLat = _toRadians(b.latitude - a.latitude);
  final dLng = _toRadians(b.longitude - a.longitude);
  final sinLat = math.sin(dLat / 2);
  final sinLng = math.sin(dLng / 2);
  final h =
      sinLat * sinLat +
      math.cos(_toRadians(a.latitude)) *
          math.cos(_toRadians(b.latitude)) *
          sinLng *
          sinLng;
  return 2 * radius * math.asin(math.min(1, math.sqrt(h)));
}

double bearingDegrees(LatLng from, LatLng to) {
  final lat1 = _toRadians(from.latitude);
  final lat2 = _toRadians(to.latitude);
  final dLng = _toRadians(to.longitude - from.longitude);
  final y = math.sin(dLng) * math.cos(lat2);
  final x =
      math.cos(lat1) * math.sin(lat2) -
      math.sin(lat1) * math.cos(lat2) * math.cos(dLng);
  return (math.atan2(y, x) * 180 / math.pi + 360) % 360;
}

double distanceToSegmentMeters(LatLng point, LatLng start, LatLng end) {
  const metersPerDegreeLat = 111320.0;
  final metersPerDegreeLng =
      111320.0 * math.cos(_toRadians(start.latitude));
  final px = (point.longitude - start.longitude) * metersPerDegreeLng;
  final py = (point.latitude - start.latitude) * metersPerDegreeLat;
  final bx = (end.longitude - start.longitude) * metersPerDegreeLng;
  final by = (end.latitude - start.latitude) * metersPerDegreeLat;
  final lengthSquared = bx * bx + by * by;
  if (lengthSquared < 1) {
    return math.sqrt(px * px + py * py);
  }
  final t = ((px * bx + py * by) / lengthSquared).clamp(0.0, 1.0);
  final dx = px - t * bx;
  final dy = py - t * by;
  return math.sqrt(dx * dx + dy * dy);
}

double minDistanceToPathMeters(LatLng point, List<LatLng> path) {
  if (path.isEmpty) {
    return double.infinity;
  }
  var minDistance = haversineMeters(point, path.first);
  for (var i = 1; i < path.length; i++) {
    minDistance = math.min(
      minDistance,
      distanceToSegmentMeters(point, path[i - 1], path[i]),
    );
  }
  return minDistance;
}

bool isOffRoute(LatLng point, List<LatLng> path, {double thresholdMeters = offRouteThresholdMeters}) {
  return minDistanceToPathMeters(point, path) > thresholdMeters;
}

LatLng? lookAheadOnPath(
  LatLng origin,
  List<LatLng> path, {
  double aheadMeters = 70,
}) {
  if (path.isEmpty) {
    return null;
  }
  if (path.length == 1) {
    return path.first;
  }
  var closestIndex = 0;
  var closestDistance = double.infinity;
  for (var i = 0; i < path.length; i++) {
    final distance = haversineMeters(origin, path[i]);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = i;
    }
  }
  var travelled = 0.0;
  for (var i = closestIndex; i < path.length - 1; i++) {
    travelled += haversineMeters(path[i], path[i + 1]);
    if (travelled >= aheadMeters) {
      return path[i + 1];
    }
  }
  return path.last;
}
