class RiderAssignment {
  const RiderAssignment({
    required this.id,
    required this.status,
    required this.restaurantName,
    required this.dropoffAddress,
  });

  final String id;
  final String status;
  final String restaurantName;
  final String dropoffAddress;

  factory RiderAssignment.fromJson(Map<String, dynamic> json) {
    return RiderAssignment(
      id: json['id'] as String,
      status: json['status'] as String,
      restaurantName: json['restaurant_name'] as String,
      dropoffAddress: json['dropoff_address'] as String,
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
  });

  final String id;
  final String firstName;
  final String lastName;
  final bool isOnline;
  final List<RiderAssignment> assignments;

  factory RiderProfile.fromJson(Map<String, dynamic> json) {
    final raw = json['assignments'] as List<dynamic>? ?? const [];
    return RiderProfile(
      id: json['id'] as String,
      firstName: json['first_name'] as String,
      lastName: json['last_name'] as String,
      isOnline: json['is_online'] as bool,
      assignments: raw
          .map((item) => RiderAssignment.fromJson(item as Map<String, dynamic>))
          .toList(),
    );
  }
}

class RiderOffer {
  const RiderOffer({
    required this.id,
    required this.requestId,
    required this.status,
    required this.expiresAt,
    required this.restaurantName,
    required this.dropoffAddress,
    required this.collectCents,
    required this.paymentMethod,
    required this.packageCount,
  });

  final String id;
  final String requestId;
  final String status;
  final DateTime expiresAt;
  final String restaurantName;
  final String dropoffAddress;
  final int collectCents;
  final String paymentMethod;
  final int packageCount;

  factory RiderOffer.fromJson(Map<String, dynamic> json) {
    return RiderOffer(
      id: json['id'] as String,
      requestId: json['request_id'] as String,
      status: json['status'] as String,
      expiresAt: DateTime.parse(json['expires_at'] as String),
      restaurantName: json['restaurant_name'] as String,
      dropoffAddress: json['dropoff_address'] as String,
      collectCents: json['collect_cents'] as int,
      paymentMethod: json['payment_method'] as String,
      packageCount: json['package_count'] as int,
    );
  }
}

class ApiException implements Exception {
  const ApiException(this.statusCode, this.message);

  final int statusCode;
  final String message;

  @override
  String toString() => message;
}
