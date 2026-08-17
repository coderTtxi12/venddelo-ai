import 'package:http/http.dart' as http;

const locationAuthFailedEvent = 'auth_failed';

const locationAuthFailedMessage =
    'No se pudo verificar tu sesión. Ponte en línea de nuevo.';

enum LocationPingAuthStep { success, ignore, refreshAndRetry, failOffline }

enum LocationPingResult { sent, ignored, authFailed }

class LocationTaskCredentials {
  const LocationTaskCredentials({
    required this.apiBaseUrl,
    required this.accessToken,
    required this.refreshToken,
    required this.supabaseUrl,
    required this.supabaseAnonKey,
  });

  final String apiBaseUrl;
  final String accessToken;
  final String refreshToken;
  final String supabaseUrl;
  final String supabaseAnonKey;

  LocationTaskCredentials copyWith({
    String? accessToken,
    String? refreshToken,
  }) {
    return LocationTaskCredentials(
      apiBaseUrl: apiBaseUrl,
      accessToken: accessToken ?? this.accessToken,
      refreshToken: refreshToken ?? this.refreshToken,
      supabaseUrl: supabaseUrl,
      supabaseAnonKey: supabaseAnonKey,
    );
  }
}

LocationPingAuthStep locationPingAuthStep({
  required int statusCode,
  required bool alreadyRefreshed,
}) {
  if (statusCode >= 200 && statusCode < 300) {
    return LocationPingAuthStep.success;
  }
  if (statusCode == 401) {
    return alreadyRefreshed
        ? LocationPingAuthStep.failOffline
        : LocationPingAuthStep.refreshAndRetry;
  }
  return LocationPingAuthStep.ignore;
}

LocationTaskCredentials? credentialsFromRefreshResponse({
  required LocationTaskCredentials current,
  required Map<String, dynamic> body,
}) {
  final access = body['access_token'];
  if (access is! String || access.isEmpty) {
    return null;
  }
  final refresh = body['refresh_token'];
  return current.copyWith(
    accessToken: access,
    refreshToken: refresh is String && refresh.isNotEmpty
        ? refresh
        : current.refreshToken,
  );
}

Future<LocationPingResult> postLocationWithAuthRetry({
  required LocationTaskCredentials credentials,
  required Future<http.Response> Function(LocationTaskCredentials creds)
  postLocation,
  required Future<LocationTaskCredentials?> Function(
    LocationTaskCredentials creds,
  )
  refreshTokens,
  required Future<void> Function(LocationTaskCredentials creds)
  persistCredentials,
}) async {
  var creds = credentials;
  var alreadyRefreshed = false;
  while (true) {
    final response = await postLocation(creds);
    final step = locationPingAuthStep(
      statusCode: response.statusCode,
      alreadyRefreshed: alreadyRefreshed,
    );
    switch (step) {
      case LocationPingAuthStep.success:
        return LocationPingResult.sent;
      case LocationPingAuthStep.ignore:
        return LocationPingResult.ignored;
      case LocationPingAuthStep.refreshAndRetry:
        final next = await refreshTokens(creds);
        if (next == null) {
          return LocationPingResult.authFailed;
        }
        creds = next;
        await persistCredentials(creds);
        alreadyRefreshed = true;
        continue;
      case LocationPingAuthStep.failOffline:
        return LocationPingResult.authFailed;
    }
  }
}
