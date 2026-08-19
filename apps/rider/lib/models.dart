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
    this.itinerary = const [],
    this.creditLimitCents = 0,
    this.creditHeldCents = 0,
    this.profilePhotoPath = '',
    this.plate = '',
    this.motorcycleBrand = '',
    this.motorcycleColor = '',
  });

  final String id;
  final String firstName;
  final String lastName;
  final bool isOnline;
  final List<RiderAssignment> assignments;
  final List<PersistedItineraryStop> itinerary;
  final int creditLimitCents;
  final int creditHeldCents;
  final String profilePhotoPath;
  final String plate;
  final String motorcycleBrand;
  final String motorcycleColor;

  int get creditAvailableCents {
    final available = creditLimitCents - creditHeldCents;
    return available < 0 ? 0 : available;
  }

  factory RiderProfile.fromJson(Map<String, dynamic> json) {
    final raw = json['assignments'] as List<dynamic>? ?? const [];
    final rawItinerary = json['itinerary'] as List<dynamic>? ?? const [];
    return RiderProfile(
      id: json['id'] as String,
      firstName: json['first_name'] as String,
      lastName: json['last_name'] as String,
      isOnline: json['is_online'] as bool,
      creditLimitCents: _asInt(json['credit_limit_cents']) ?? 0,
      creditHeldCents: _asInt(json['credit_held_cents']) ?? 0,
      profilePhotoPath: json['profile_photo_path'] as String? ?? '',
      plate: json['plate'] as String? ?? '',
      motorcycleBrand: json['motorcycle_brand'] as String? ?? '',
      motorcycleColor: json['motorcycle_color'] as String? ?? '',
      assignments: raw
          .map((item) => RiderAssignment.fromJson(item as Map<String, dynamic>))
          .toList(),
      itinerary: rawItinerary
          .map((item) => PersistedItineraryStop.fromJson(item as Map<String, dynamic>))
          .toList(),
    );
  }
}

class PersistedItineraryStop {
  const PersistedItineraryStop({
    required this.sequence,
    required this.kind,
    required this.requestId,
    this.current = false,
    this.title,
    this.action,
    this.lat,
    this.lng,
  });

  final int sequence;
  final String kind;
  final String requestId;
  final bool current;
  final String? title;
  final String? action;
  final double? lat;
  final double? lng;

  factory PersistedItineraryStop.fromJson(Map<String, dynamic> json) {
    return PersistedItineraryStop(
      sequence: _asInt(json['sequence']) ?? 0,
      kind: json['kind'] as String? ?? 'dropoff',
      requestId: json['request_id'] as String,
      current: json['current'] as bool? ?? false,
      title: json['title'] as String?,
      action: json['action'] as String?,
      lat: _asDouble(json['lat']),
      lng: _asDouble(json['lng']),
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

class RiderHistoryHold {
  const RiderHistoryHold({
    required this.requestId,
    required this.shortId,
    required this.restaurantName,
    required this.amountCents,
    required this.customerName,
  });

  final String requestId;
  final String shortId;
  final String restaurantName;
  final int amountCents;
  final String customerName;

  factory RiderHistoryHold.fromJson(Map<String, dynamic> json) {
    return RiderHistoryHold(
      requestId: json['request_id'] as String,
      shortId: json['short_id'] as String? ?? '',
      restaurantName: json['restaurant_name'] as String? ?? '',
      amountCents: _asInt(json['amount_cents']) ?? 0,
      customerName: json['customer_name'] as String? ?? '',
    );
  }
}

class RiderHistoryItem {
  const RiderHistoryItem({
    required this.id,
    required this.shortId,
    required this.status,
    required this.closedAt,
    required this.restaurantName,
    required this.dropoffAddress,
    required this.quotedFeeCents,
    required this.paymentMethod,
    required this.collectCents,
    required this.packageCount,
    required this.packageSize,
    this.restaurantAddress,
    this.cashDenominationCents,
    this.customerName,
    this.customerPhone,
    this.notes,
    this.creditHoldCents = 0,
  });

  final String id;
  final String shortId;
  final String status;
  final DateTime closedAt;
  final String restaurantName;
  final String? restaurantAddress;
  final String dropoffAddress;
  final int quotedFeeCents;
  final String paymentMethod;
  final int collectCents;
  final int? cashDenominationCents;
  final int packageCount;
  final String packageSize;
  final String? customerName;
  final String? customerPhone;
  final String? notes;
  final int creditHoldCents;

  factory RiderHistoryItem.fromJson(Map<String, dynamic> json) {
    return RiderHistoryItem(
      id: json['id'] as String,
      shortId: json['short_id'] as String? ?? '',
      status: json['status'] as String,
      closedAt: DateTime.parse(json['closed_at'] as String),
      restaurantName: json['restaurant_name'] as String? ?? '',
      restaurantAddress: json['restaurant_address'] as String?,
      dropoffAddress: json['dropoff_address'] as String? ?? '',
      quotedFeeCents: _asInt(json['quoted_fee_cents']) ?? 0,
      paymentMethod: json['payment_method'] as String? ?? '',
      collectCents: _asInt(json['collect_cents']) ?? 0,
      cashDenominationCents: _asInt(json['cash_denomination_cents']),
      packageCount: _asInt(json['package_count']) ?? 1,
      packageSize: json['package_size'] as String? ?? 'normal',
      customerName: json['customer_name'] as String?,
      customerPhone: json['customer_phone'] as String?,
      notes: json['notes'] as String?,
      creditHoldCents: _asInt(json['credit_hold_cents']) ?? 0,
    );
  }
}

class RiderHistoryPage {
  const RiderHistoryPage({
    required this.start,
    required this.end,
    required this.items,
    required this.total,
    required this.deliveredCount,
    required this.cancelledCount,
    required this.earningsCents,
    required this.hasMore,
    required this.creditLimitCents,
    required this.creditHeldCents,
    required this.creditAvailableCents,
    this.activeHolds = const [],
  });

  final String start;
  final String end;
  final List<RiderHistoryItem> items;
  final int total;
  final int deliveredCount;
  final int cancelledCount;
  final int earningsCents;
  final bool hasMore;
  final int creditLimitCents;
  final int creditHeldCents;
  final int creditAvailableCents;
  final List<RiderHistoryHold> activeHolds;

  factory RiderHistoryPage.fromJson(Map<String, dynamic> json) {
    final rawItems = json['items'] as List<dynamic>? ?? const [];
    final rawHolds = json['active_holds'] as List<dynamic>? ?? const [];
    return RiderHistoryPage(
      start: json['start'] as String,
      end: json['end'] as String,
      items: rawItems
          .map((item) => RiderHistoryItem.fromJson(item as Map<String, dynamic>))
          .toList(),
      total: _asInt(json['total']) ?? 0,
      deliveredCount: _asInt(json['delivered_count']) ?? 0,
      cancelledCount: _asInt(json['cancelled_count']) ?? 0,
      earningsCents: _asInt(json['earnings_cents']) ?? 0,
      hasMore: json['has_more'] as bool? ?? false,
      creditLimitCents: _asInt(json['credit_limit_cents']) ?? 0,
      creditHeldCents: _asInt(json['credit_held_cents']) ?? 0,
      creditAvailableCents: _asInt(json['credit_available_cents']) ?? 0,
      activeHolds: rawHolds
          .map((item) => RiderHistoryHold.fromJson(item as Map<String, dynamic>))
          .toList(),
    );
  }
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
