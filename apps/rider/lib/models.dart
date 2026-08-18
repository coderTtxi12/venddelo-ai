class RiderAssignment {
  const RiderAssignment({
    required this.id,
    required this.status,
    required this.restaurantName,
    required this.dropoffAddress,
    this.shortId = '',
    this.restaurantLat,
    this.restaurantLng,
    this.dropoffLat,
    this.dropoffLng,
    this.restaurantAddress,
    this.paymentMethod = '',
    this.collectCents,
    this.cashDenominationCents,
    this.quotedFeeCents,
    this.packageCount = 1,
    this.packageSize = 'normal',
    this.notes,
    this.customerName,
    this.customerPhone,
    this.caseApplied,
  });

  final String id;
  final String status;
  final String restaurantName;
  final String dropoffAddress;
  final String shortId;
  final double? restaurantLat;
  final double? restaurantLng;
  final double? dropoffLat;
  final double? dropoffLng;
  final String? restaurantAddress;
  final String paymentMethod;
  final int? collectCents;
  final int? cashDenominationCents;
  final int? quotedFeeCents;
  final int packageCount;
  final String packageSize;
  final String? notes;
  final String? customerName;
  final String? customerPhone;
  final String? caseApplied;

  factory RiderAssignment.fromJson(Map<String, dynamic> json) {
    return RiderAssignment(
      id: json['id'] as String,
      status: json['status'] as String,
      restaurantName: json['restaurant_name'] as String,
      dropoffAddress: json['dropoff_address'] as String,
      shortId: json['short_id'] as String? ?? '',
      restaurantLat: _asDouble(json['restaurant_lat']),
      restaurantLng: _asDouble(json['restaurant_lng']),
      dropoffLat: _asDouble(json['dropoff_lat']),
      dropoffLng: _asDouble(json['dropoff_lng']),
      restaurantAddress: json['restaurant_address'] as String?,
      paymentMethod: json['payment_method'] as String? ?? '',
      collectCents: _asInt(json['collect_cents']),
      cashDenominationCents: _asInt(json['cash_denomination_cents']),
      quotedFeeCents: _asInt(json['quoted_fee_cents']),
      packageCount: _asInt(json['package_count']) ?? 1,
      packageSize: json['package_size'] as String? ?? 'normal',
      notes: json['notes'] as String?,
      customerName: json['customer_name'] as String?,
      customerPhone: json['customer_phone'] as String?,
      caseApplied: json['case_applied'] as String?,
    );
  }
}

class RiderProfile {
  const RiderProfile({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.isOnline,
    required this.assignments,
    this.creditLimitCents = 0,
    this.creditHeldCents = 0,
  });

  final String id;
  final String firstName;
  final String lastName;
  final bool isOnline;
  final List<RiderAssignment> assignments;
  final int creditLimitCents;
  final int creditHeldCents;

  int get creditAvailableCents {
    final available = creditLimitCents - creditHeldCents;
    return available < 0 ? 0 : available;
  }

  factory RiderProfile.fromJson(Map<String, dynamic> json) {
    final raw = json['assignments'] as List<dynamic>? ?? const [];
    return RiderProfile(
      id: json['id'] as String,
      firstName: json['first_name'] as String,
      lastName: json['last_name'] as String,
      isOnline: json['is_online'] as bool,
      creditLimitCents: _asInt(json['credit_limit_cents']) ?? 0,
      creditHeldCents: _asInt(json['credit_held_cents']) ?? 0,
      assignments: raw
          .map((item) => RiderAssignment.fromJson(item as Map<String, dynamic>))
          .toList(),
    );
  }
}

class RiderOfferStop {
  const RiderOfferStop({
    required this.restaurantName,
    required this.dropoffAddress,
    this.shortId = '',
    this.restaurantLat,
    this.restaurantLng,
    this.dropoffLat,
    this.dropoffLng,
    this.distanceMeters,
  });

  final String restaurantName;
  final String dropoffAddress;
  final String shortId;
  final double? restaurantLat;
  final double? restaurantLng;
  final double? dropoffLat;
  final double? dropoffLng;
  final int? distanceMeters;

  factory RiderOfferStop.fromJson(Map<String, dynamic> json) {
    return RiderOfferStop(
      restaurantName: json['restaurant_name'] as String,
      dropoffAddress: json['dropoff_address'] as String,
      shortId: json['short_id'] as String? ?? '',
      restaurantLat: _asDouble(json['restaurant_lat']),
      restaurantLng: _asDouble(json['restaurant_lng']),
      dropoffLat: _asDouble(json['dropoff_lat']),
      dropoffLng: _asDouble(json['dropoff_lng']),
      distanceMeters: (json['distance_meters'] as num?)?.toInt(),
    );
  }
}

class RiderOffer {
  const RiderOffer({
    required this.id,
    required this.requestId,
    required this.status,
    this.shortId = '',
    required this.expiresAt,
    required this.restaurantName,
    required this.dropoffAddress,
    required this.collectCents,
    required this.paymentMethod,
    required this.packageCount,
    this.quotedFeeCents = 0,
    this.restaurantLat,
    this.restaurantLng,
    this.dropoffLat,
    this.dropoffLng,
    this.distanceMeters,
    this.stops = const [],
  });

  final String id;
  final String requestId;
  final String shortId;
  final String status;
  final DateTime expiresAt;
  final String restaurantName;
  final String dropoffAddress;
  final int collectCents;
  final int quotedFeeCents;
  final String paymentMethod;
  final int packageCount;
  final double? restaurantLat;
  final double? restaurantLng;
  final double? dropoffLat;
  final double? dropoffLng;
  final int? distanceMeters;
  final List<RiderOfferStop> stops;

  factory RiderOffer.fromJson(Map<String, dynamic> json) {
    final rawStops = json['stops'] as List<dynamic>? ?? const [];
    return RiderOffer(
      id: json['id'] as String,
      requestId: json['request_id'] as String,
      shortId: json['short_id'] as String? ?? '',
      status: json['status'] as String,
      expiresAt: DateTime.parse(json['expires_at'] as String),
      restaurantName: json['restaurant_name'] as String,
      dropoffAddress: json['dropoff_address'] as String,
      collectCents: json['collect_cents'] as int,
      quotedFeeCents: (json['quoted_fee_cents'] as num?)?.toInt() ?? 0,
      paymentMethod: json['payment_method'] as String,
      packageCount: json['package_count'] as int,
      restaurantLat: _asDouble(json['restaurant_lat']),
      restaurantLng: _asDouble(json['restaurant_lng']),
      dropoffLat: _asDouble(json['dropoff_lat']),
      dropoffLng: _asDouble(json['dropoff_lng']),
      distanceMeters: (json['distance_meters'] as num?)?.toInt(),
      stops: rawStops
          .map((item) => RiderOfferStop.fromJson(item as Map<String, dynamic>))
          .toList(),
    );
  }
}

double? _asDouble(dynamic value) {
  if (value is num) {
    return value.toDouble();
  }
  return null;
}

int? _asInt(dynamic value) {
  if (value is num) {
    return value.toInt();
  }
  return null;
}

String formatShortId(String shortId) {
  final value = shortId.trim().toUpperCase();
  if (value.isEmpty) {
    return '';
  }
  return value.startsWith('#') ? value : '#$value';
}

class ApiException implements Exception {
  const ApiException(this.statusCode, this.message);

  final int statusCode;
  final String message;

  @override
  String toString() => message;
}
