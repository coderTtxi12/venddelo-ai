import 'dart:convert';

import 'package:http/http.dart' as http;

import 'app_build.dart';
import 'config.dart';
import 'friendly_error.dart';
import 'models.dart';

class RiderApi {
  RiderApi({http.Client? client, this._tokenProvider})
    : _client = client ?? http.Client();

  final http.Client _client;
  final String? Function()? _tokenProvider;
  String? _resolvedBase;

  String get resolvedApiBaseUrl => _resolvedBase ?? AppConfig.apiBaseUrl;

  Uri _uri(String path) => Uri.parse('$resolvedApiBaseUrl$path');

  Map<String, String> _headers() {
    final token = _tokenProvider?.call();
    return {
      'Content-Type': 'application/json',
      if (token != null && token.isNotEmpty) 'Authorization': 'Bearer $token',
    };
  }

  Future<http.Response> _send(Future<http.Response> Function() request) async {
    final bases = _resolvedBase == null
        ? localApiBaseCandidates(AppConfig.apiBaseUrl)
        : [_resolvedBase!];
    Object? lastError;
    for (final base in bases) {
      _resolvedBase = base;
      try {
        return await request();
      } catch (error) {
        lastError = error;
        if (!isNetworkError(error)) {
          _resolvedBase = null;
          throw ApiException(0, friendlyErrorMessage(error));
        }
        _resolvedBase = null;
      }
    }
    throw ApiException(
      0,
      friendlyErrorMessage(lastError ?? 'No se pudo conectar'),
    );
  }

  Future<RiderProfile> getMe() async {
    final response = await _send(
      () => _client.get(
        _uri('/rider/me').replace(queryParameters: riderMeQuery()),
        headers: _headers(),
      ),
    );
    return RiderProfile.fromJson(_decode(response));
  }

  Future<RiderProfile> setOnline(bool isOnline) async {
    final response = await _send(
      () => _client.patch(
        _uri('/rider/me/online'),
        headers: _headers(),
        body: jsonEncode(riderOnlineBody(isOnline: isOnline)),
      ),
    );
    return RiderProfile.fromJson(_decode(response));
  }

  Future<void> postLocation(double latitude, double longitude) async {
    final response = await _send(
      () => _client.post(
        _uri('/rider/me/location'),
        headers: _headers(),
        body: jsonEncode(
          riderLocationBody(latitude: latitude, longitude: longitude),
        ),
      ),
    );
    _decode(response);
  }

  Future<void> putFcmToken(String fcmToken) async {
    final response = await _send(
      () => _client.put(
        _uri('/rider/me/fcm-token'),
        headers: _headers(),
        body: jsonEncode({'fcm_token': fcmToken}),
      ),
    );
    _decode(response);
  }

  Future<List<RiderOffer>> listOffers() async {
    final response = await _send(
      () => _client.get(
        _uri('/rider/me/offers'),
        headers: _headers(),
      ),
    );
    final body = _decode(response);
    final rows = body as List<dynamic>;
    return rows
        .map((item) => RiderOffer.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  Future<void> acceptOffer(String offerId) async {
    final response = await _send(
      () => _client.post(
        _uri('/rider/me/offers/$offerId/accept'),
        headers: _headers(),
      ),
    );
    _decode(response);
  }

  Future<void> rejectOffer(String offerId) async {
    final response = await _send(
      () => _client.post(
        _uri('/rider/me/offers/$offerId/reject'),
        headers: _headers(),
      ),
    );
    _decode(response);
  }

  Future<RiderHistoryPage> getHistory({
    required String start,
    required String end,
    String? status,
    int limit = 50,
    int offset = 0,
  }) async {
    final response = await _send(
      () => _client.get(
        _uri('/rider/me/history').replace(
          queryParameters: {
            'start': start,
            'end': end,
            'limit': '$limit',
            'offset': '$offset',
            'status': ?status,
          },
        ),
        headers: _headers(),
      ),
    );
    return RiderHistoryPage.fromJson(_decode(response) as Map<String, dynamic>);
  }

  Future<RiderAssignment> transitionAssignment(
    String requestId,
    String action,
  ) async {
    final response = await _send(
      () => _client.post(
        _uri('/rider/me/assignments/$requestId/$action'),
        headers: _headers(),
      ),
    );
    return RiderAssignment.fromJson(_decode(response) as Map<String, dynamic>);
  }

  dynamic _decode(http.Response response) {
    final decoded = response.body.isEmpty ? null : jsonDecode(response.body);
    if (response.statusCode >= 200 && response.statusCode < 300) {
      return decoded;
    }
    var message = 'Error ${response.statusCode}';
    if (decoded is Map<String, dynamic>) {
      final error = decoded['error'];
      if (error is Map<String, dynamic> && error['message'] is String) {
        message = error['message'] as String;
      }
    }
    throw ApiException(response.statusCode, message);
  }
}
