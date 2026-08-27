import 'dart:convert';

import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;

import 'app_build.dart';
import 'location_auth.dart';

const _apiBaseUrlKey = 'apiBaseUrl';
const _accessTokenKey = 'accessToken';
const _refreshTokenKey = 'refreshToken';
const _supabaseUrlKey = 'supabaseUrl';
const _supabaseAnonKey = 'supabaseAnonKey';

@pragma('vm:entry-point')
void startLocationCallback() {
  FlutterForegroundTask.setTaskHandler(LocationTaskHandler());
}

class LocationTaskHandler extends TaskHandler {
  @override
  Future<void> onStart(DateTime timestamp, TaskStarter starter) async {
    await _pingLocation();
  }

  @override
  void onRepeatEvent(DateTime timestamp) {
    _pingLocation();
  }

  @override
  Future<void> onDestroy(DateTime timestamp, bool isTimeout) async {}

  Future<void> _pingLocation() async {
    final credentials = await loadLocationTaskCredentials();
    if (credentials == null) {
      return;
    }
    try {
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 10),
        ),
      );
      final result = await postLocationWithAuthRetry(
        credentials: credentials,
        postLocation: (creds) {
          return http.post(
            Uri.parse('${creds.apiBaseUrl}/rider/me/location'),
            headers: {
              'Authorization': 'Bearer ${creds.accessToken}',
              'Content-Type': 'application/json',
            },
            body: jsonEncode(
              riderLocationBody(
                latitude: position.latitude,
                longitude: position.longitude,
              ),
            ),
          );
        },
        refreshTokens: refreshSupabaseTokens,
        persistCredentials: (creds) => saveLocationTaskCredentials(
          apiBaseUrl: creds.apiBaseUrl,
          accessToken: creds.accessToken,
          refreshToken: creds.refreshToken,
          supabaseUrl: creds.supabaseUrl,
          supabaseAnonKey: creds.supabaseAnonKey,
        ),
      );
      if (result == LocationPingResult.authFailed) {
        FlutterForegroundTask.sendDataToMain(locationAuthFailedEvent);
      }
    } catch (_) {}
  }
}

Future<LocationTaskCredentials?> refreshSupabaseTokens(
  LocationTaskCredentials creds,
) async {
  if (creds.refreshToken.isEmpty ||
      creds.supabaseUrl.isEmpty ||
      creds.supabaseAnonKey.isEmpty) {
    return null;
  }
  try {
    final response = await http.post(
      Uri.parse('${creds.supabaseUrl}/auth/v1/token?grant_type=refresh_token'),
      headers: {
        'apikey': creds.supabaseAnonKey,
        'Authorization': 'Bearer ${creds.supabaseAnonKey}',
        'Content-Type': 'application/json',
      },
      body: jsonEncode({'refresh_token': creds.refreshToken}),
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      return null;
    }
    final decoded = jsonDecode(response.body);
    if (decoded is! Map<String, dynamic>) {
      return null;
    }
    return credentialsFromRefreshResponse(current: creds, body: decoded);
  } catch (_) {
    return null;
  }
}

Future<LocationTaskCredentials?> loadLocationTaskCredentials() async {
  final apiBase = await FlutterForegroundTask.getData<String>(key: _apiBaseUrlKey);
  final token = await FlutterForegroundTask.getData<String>(
    key: _accessTokenKey,
  );
  if (apiBase == null || apiBase.isEmpty || token == null || token.isEmpty) {
    return null;
  }
  return LocationTaskCredentials(
    apiBaseUrl: apiBase,
    accessToken: token,
    refreshToken:
        await FlutterForegroundTask.getData<String>(key: _refreshTokenKey) ??
        '',
    supabaseUrl:
        await FlutterForegroundTask.getData<String>(key: _supabaseUrlKey) ?? '',
    supabaseAnonKey:
        await FlutterForegroundTask.getData<String>(key: _supabaseAnonKey) ??
        '',
  );
}

Future<void> saveLocationTaskCredentials({
  required String apiBaseUrl,
  required String accessToken,
  required String refreshToken,
  required String supabaseUrl,
  required String supabaseAnonKey,
}) async {
  await FlutterForegroundTask.saveData(key: _apiBaseUrlKey, value: apiBaseUrl);
  await FlutterForegroundTask.saveData(key: _accessTokenKey, value: accessToken);
  await FlutterForegroundTask.saveData(
    key: _refreshTokenKey,
    value: refreshToken,
  );
  await FlutterForegroundTask.saveData(key: _supabaseUrlKey, value: supabaseUrl);
  await FlutterForegroundTask.saveData(
    key: _supabaseAnonKey,
    value: supabaseAnonKey,
  );
}

void initLocationForegroundTask() {
  FlutterForegroundTask.init(
    androidNotificationOptions: AndroidNotificationOptions(
      channelId: 'mexy_location',
      channelName: 'Ubicación',
      channelDescription: 'Mexy usa tu ubicación',
      onlyAlertOnce: true,
    ),
    iosNotificationOptions: const IOSNotificationOptions(
      showNotification: false,
      playSound: false,
    ),
    foregroundTaskOptions: ForegroundTaskOptions(
      eventAction: ForegroundTaskEventAction.repeat(15000),
      autoRunOnBoot: false,
      autoRunOnMyPackageReplaced: false,
      allowWakeLock: true,
      allowWifiLock: true,
    ),
  );
}

Future<void> startLocationForegroundTask() async {
  if (await FlutterForegroundTask.isRunningService) {
    await FlutterForegroundTask.restartService();
    return;
  }
  await FlutterForegroundTask.startService(
    serviceTypes: [ForegroundServiceTypes.location],
    notificationTitle: 'Mexy usa tu ubicación',
    notificationText: 'En línea',
    callback: startLocationCallback,
  );
}

Future<void> stopLocationForegroundTask() async {
  if (await FlutterForegroundTask.isRunningService) {
    await FlutterForegroundTask.stopService();
  }
}
