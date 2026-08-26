import 'dart:convert';
import 'dart:math' as math;

import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:http/http.dart' as http;

import '../config.dart';
import 'decode_polyline.dart';
import 'geo.dart';

class RiderRouteOption {
  const RiderRouteOption({
    required this.id,
    required this.points,
    required this.distanceMeters,
    required this.duration,
    this.label,
  });

  final String id;
  final List<LatLng> points;
  final int distanceMeters;
  final Duration duration;
  final String? label;

  String get etaLabel {
    final minutes = math.max(1, duration.inMinutes);
    return '$minutes min';
  }

  String get distanceLabel {
    if (distanceMeters < 1000) {
      return '$distanceMeters m';
    }
    final km = distanceMeters / 1000;
    return '${km.toStringAsFixed(km >= 10 ? 0 : 1)} km';
  }
}

class RiderRouteResult {
  const RiderRouteResult({required this.routes});

  final List<RiderRouteOption> routes;
}

double _quantize(double value) => (value * 1000).round() / 1000;

final Map<String, Future<RiderRouteResult>> _cache = {};

String previewRouteQueryKey({
  required String jobKey,
  required LatLng destination,
}) {
  return [
    jobKey,
    _quantize(destination.latitude),
    _quantize(destination.longitude),
  ].join(',');
}

RiderRouteOption straightLinePreview({
  required LatLng origin,
  required LatLng destination,
}) {
  return RiderRouteOption(
    id: 'preview',
    points: [origin, destination],
    distanceMeters: haversineMeters(origin, destination).round(),
    duration: Duration.zero,
    label: 'Recomendada',
  );
}

RiderRouteResult previewRouteResult({
  required LatLng origin,
  required LatLng destination,
  RiderRouteResult? fetched,
}) {
  final routes = fetched?.routes ?? const <RiderRouteOption>[];
  final first = routes.isEmpty ? null : routes.first;
  if (first != null && first.points.length >= 2) {
    return RiderRouteResult(
      routes: [
        RiderRouteOption(
          id: 'preview',
          points: first.points,
          distanceMeters: first.distanceMeters,
          duration: first.duration,
          label: 'Recomendada',
        ),
      ],
    );
  }
  return RiderRouteResult(
    routes: [straightLinePreview(origin: origin, destination: destination)],
  );
}

String _cacheKey(LatLng origin, LatLng destination) {
  return [
    _quantize(origin.latitude),
    _quantize(origin.longitude),
    _quantize(destination.latitude),
    _quantize(destination.longitude),
  ].join(',');
}

void invalidateRiderRouteCache() {
  _cache.clear();
}

Future<RiderRouteResult> fetchRiderRoutes({
  required LatLng origin,
  required LatLng destination,
}) {
  final key = AppConfig.googleMapsApiKey;
  if (key.isEmpty) {
    return Future.value(
      previewRouteResult(origin: origin, destination: destination),
    );
  }
  final cacheKey = _cacheKey(origin, destination);
  return _cache.putIfAbsent(
    cacheKey,
    () => _fetchRiderRoutes(origin: origin, destination: destination, apiKey: key),
  );
}

/// Body for Compute Routes Essentials: DRIVE + TRAFFIC_UNAWARE.
/// TWO_WHEELER bills Enterprise; TRAFFIC_AWARE bills Pro.
Map<String, dynamic> computeRoutesRequestBody({
  required LatLng origin,
  required LatLng destination,
}) {
  return {
    'origin': {
      'location': {
        'latLng': {
          'latitude': origin.latitude,
          'longitude': origin.longitude,
        },
      },
    },
    'destination': {
      'location': {
        'latLng': {
          'latitude': destination.latitude,
          'longitude': destination.longitude,
        },
      },
    },
    'travelMode': 'DRIVE',
    'routingPreference': 'TRAFFIC_UNAWARE',
    'computeAlternativeRoutes': false,
    'languageCode': 'es-MX',
    'units': 'METRIC',
  };
}

Future<RiderRouteResult> _fetchRiderRoutes({
  required LatLng origin,
  required LatLng destination,
  required String apiKey,
}) async {
  final fetched = await _computeRoutes(
    origin: origin,
    destination: destination,
    apiKey: apiKey,
  );
  return previewRouteResult(
    origin: origin,
    destination: destination,
    fetched: fetched,
  );
}

List<RiderRouteOption> mergeRouteOptions(
  List<List<RiderRouteOption>> batches, {
  int maxRoutes = 4,
}) {
  final merged = <RiderRouteOption>[];
  for (final batch in batches) {
    for (final route in batch) {
      if (merged.any((existing) => isSimilarRoute(existing, route))) {
        continue;
      }
      merged.add(route);
      if (merged.length >= maxRoutes) {
        break;
      }
    }
    if (merged.length >= maxRoutes) {
      break;
    }
  }
  return [
    for (var i = 0; i < merged.length; i++)
      RiderRouteOption(
        id: 'route-$i',
        points: merged[i].points,
        distanceMeters: merged[i].distanceMeters,
        duration: merged[i].duration,
        label: i == 0 ? 'Recomendada' : 'Opción ${i + 1}',
      ),
  ];
}

bool isSimilarRoute(RiderRouteOption left, RiderRouteOption right) {
  if (left.points.length < 2 || right.points.length < 2) {
    return true;
  }
  final maxDistance = math.max(left.distanceMeters, right.distanceMeters);
  if (maxDistance > 0) {
    final distRatio =
        (left.distanceMeters - right.distanceMeters).abs() / maxDistance;
    if (distRatio > 0.12) {
      return false;
    }
  }
  final leftMid = left.points[left.points.length ~/ 2];
  final rightMid = right.points[right.points.length ~/ 2];
  final leftQuarter = left.points[left.points.length ~/ 4];
  final rightQuarter = right.points[right.points.length ~/ 4];
  return haversineMeters(leftMid, rightMid) < 180 &&
      haversineMeters(leftQuarter, rightQuarter) < 220;
}

Future<RiderRouteResult?> _computeRoutes({
  required LatLng origin,
  required LatLng destination,
  required String apiKey,
}) async {
  final uri = Uri.parse('https://routes.googleapis.com/directions/v2:computeRoutes');
  try {
    final response = await http
        .post(
          uri,
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask':
                'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.routeLabels',
          },
          body: jsonEncode(
            computeRoutesRequestBody(origin: origin, destination: destination),
          ),
        )
        .timeout(const Duration(seconds: 6));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      return null;
    }
    final body = jsonDecode(response.body);
    if (body is! Map<String, dynamic>) {
      return null;
    }
    final rawRoutes = body['routes'];
    if (rawRoutes is! List || rawRoutes.isEmpty) {
      return null;
    }
    final routes = <RiderRouteOption>[];
    for (var i = 0; i < rawRoutes.length; i++) {
      final item = rawRoutes[i];
      if (item is! Map<String, dynamic>) continue;
      final polyline = item['polyline'];
      final encoded = polyline is Map<String, dynamic>
          ? polyline['encodedPolyline'] as String?
          : null;
      if (encoded == null || encoded.isEmpty) continue;
      final points = decodePolyline(encoded);
      if (points.length < 2) continue;
      routes.add(
        RiderRouteOption(
          id: 'route-$i',
          points: points,
          distanceMeters: (item['distanceMeters'] as num?)?.toInt() ?? 0,
          duration: _parseDuration(item['duration']),
          label: i == 0 ? 'Recomendada' : 'Opción ${i + 1}',
        ),
      );
    }
    if (routes.isEmpty) return null;
    return RiderRouteResult(routes: routes);
  } catch (_) {
    return null;
  }
}

Duration _parseDuration(Object? raw) {
  if (raw is String && raw.endsWith('s')) {
    final seconds = int.tryParse(raw.substring(0, raw.length - 1));
    if (seconds != null) {
      return Duration(seconds: seconds);
    }
  }
  return Duration.zero;
}
