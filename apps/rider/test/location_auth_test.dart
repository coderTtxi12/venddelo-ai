import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mexy_rider/location_auth.dart';

void main() {
  test('200 keeps the ping; first 401 retries after refresh', () {
    expect(
      locationPingAuthStep(statusCode: 200, alreadyRefreshed: false),
      LocationPingAuthStep.success,
    );
    expect(
      locationPingAuthStep(statusCode: 401, alreadyRefreshed: false),
      LocationPingAuthStep.refreshAndRetry,
    );
  });

  test('second 401 after refresh fails offline; other errors are ignored', () {
    expect(
      locationPingAuthStep(statusCode: 401, alreadyRefreshed: true),
      LocationPingAuthStep.failOffline,
    );
    expect(
      locationPingAuthStep(statusCode: 500, alreadyRefreshed: false),
      LocationPingAuthStep.ignore,
    );
  });

  test('postLocationWithAuthRetry refreshes once on 401 then succeeds', () async {
    var posts = 0;
    var refreshes = 0;
    LocationTaskCredentials? persisted;
    final initial = LocationTaskCredentials(
      apiBaseUrl: 'http://api',
      accessToken: 'old',
      refreshToken: 'r1',
      supabaseUrl: 'http://supabase',
      supabaseAnonKey: 'anon',
    );

    final result = await postLocationWithAuthRetry(
      credentials: initial,
      postLocation: (creds) async {
        posts += 1;
        if (creds.accessToken == 'old') {
          return http.Response('', 401);
        }
        expect(creds.accessToken, 'new');
        return http.Response('', 204);
      },
      refreshTokens: (creds) async {
        refreshes += 1;
        return creds.copyWith(accessToken: 'new', refreshToken: 'r2');
      },
      persistCredentials: (creds) async {
        persisted = creds;
      },
    );

    expect(result, LocationPingResult.sent);
    expect(posts, 2);
    expect(refreshes, 1);
    expect(persisted?.accessToken, 'new');
    expect(persisted?.refreshToken, 'r2');
  });

  test('postLocationWithAuthRetry goes offline when refresh fails', () async {
    final initial = LocationTaskCredentials(
      apiBaseUrl: 'http://api',
      accessToken: 'old',
      refreshToken: 'r1',
      supabaseUrl: 'http://supabase',
      supabaseAnonKey: 'anon',
    );

    final result = await postLocationWithAuthRetry(
      credentials: initial,
      postLocation: (_) async => http.Response('', 401),
      refreshTokens: (_) async => null,
      persistCredentials: (_) async {},
    );

    expect(result, LocationPingResult.authFailed);
  });

  test('postLocationWithAuthRetry goes offline when retry still 401', () async {
    final initial = LocationTaskCredentials(
      apiBaseUrl: 'http://api',
      accessToken: 'old',
      refreshToken: 'r1',
      supabaseUrl: 'http://supabase',
      supabaseAnonKey: 'anon',
    );

    final result = await postLocationWithAuthRetry(
      credentials: initial,
      postLocation: (_) async => http.Response('', 401),
      refreshTokens: (creds) async => creds.copyWith(accessToken: 'new'),
      persistCredentials: (_) async {},
    );

    expect(result, LocationPingResult.authFailed);
  });

  test('credentialsFromRefreshResponse reads tokens', () {
    final current = LocationTaskCredentials(
      apiBaseUrl: 'http://api',
      accessToken: 'old',
      refreshToken: 'r1',
      supabaseUrl: 'http://supabase',
      supabaseAnonKey: 'anon',
    );
    final next = credentialsFromRefreshResponse(
      current: current,
      body: {'access_token': 'new', 'refresh_token': 'r2'},
    );
    expect(next?.accessToken, 'new');
    expect(next?.refreshToken, 'r2');
    expect(credentialsFromRefreshResponse(current: current, body: {}), isNull);
  });
}
