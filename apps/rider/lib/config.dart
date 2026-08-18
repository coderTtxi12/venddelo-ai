class AppConfig {
  static const String supabaseUrl = String.fromEnvironment('SUPABASE_URL');
  static const String supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY');
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:8080/api/v1',
  );
  static const String googleWebClientId = String.fromEnvironment(
    'GOOGLE_WEB_CLIENT_ID',
  );
  static const String googleIosClientId = String.fromEnvironment(
    'GOOGLE_IOS_CLIENT_ID',
  );
  static const String googleMapsApiKey = String.fromEnvironment(
    'GOOGLE_MAPS_API_KEY',
  );

  static bool get isConfigured =>
      supabaseUrl.isNotEmpty && supabaseAnonKey.isNotEmpty;

  static bool get usesLocalDevApi {
    final host = Uri.tryParse(apiBaseUrl)?.host ?? '';
    return host == 'localhost' || host == '127.0.0.1' || host == '10.0.2.2';
  }
}

/// Emulators use 10.0.2.2. Physical phones should use the Mac LAN IP.
/// If the URL is a loopback host, try both so emulators still work.
List<String> localApiBaseCandidates(String configured) {
  final uri = Uri.tryParse(configured);
  if (uri == null || uri.host.isEmpty) {
    return [configured];
  }
  const loopbacks = {'localhost', '127.0.0.1', '10.0.2.2'};
  if (!loopbacks.contains(uri.host)) {
    return [configured];
  }
  final seen = <String>{};
  final result = <String>[];
  for (final host in [uri.host, 'localhost', '10.0.2.2']) {
    final candidate = uri.replace(host: host).toString();
    if (seen.add(candidate)) {
      result.add(candidate);
    }
  }
  return result;
}
