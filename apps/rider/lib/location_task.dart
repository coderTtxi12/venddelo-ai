import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:ui';

import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;

import 'app_build.dart';
import 'location_auth.dart';
import 'location_ping.dart';

const _apiBaseUrlKey = 'apiBaseUrl';
const _accessTokenKey = 'accessToken';
const _refreshTokenKey = 'refreshToken';
const _supabaseUrlKey = 'supabaseUrl';
const _supabaseAnonKey = 'supabaseAnonKey';
const _locationNotificationIcon = NotificationIcon(
  metaDataName: 'com.mexy.mexy_rider.notification.ICON',
  backgroundColor: Color(0xFF2563EB),
);

@pragma('vm:entry-point')
void startLocationCallback() {
  FlutterForegroundTask.setTaskHandler(LocationTaskHandler());
}

class LocationTaskHandler extends TaskHandler {
  StreamSubscription<Position>? _positionSub;
  Position? _lastPosition;
  DateTime? _lastSentAt;
  bool _pingInFlight = false;

  @override
  Future<void> onStart(DateTime timestamp, TaskStarter starter) async {
    _listenPositionStream();
    await _pingLocation();
  }

  @override
  void onRepeatEvent(DateTime timestamp) {
    unawaited(_pingLocation());
  }

  @override
  Future<void> onDestroy(DateTime timestamp, bool isTimeout) async {
    await _positionSub?.cancel();
    _positionSub = null;
  }

  void _listenPositionStream() {
    if (Platform.isIOS || _positionSub != null) {
      return;
    }
    _positionSub = Geolocator.getPositionStream(
      locationSettings: riderBackgroundLocationSettings(),
    ).listen(
      (position) {
        _lastPosition = position;
        unawaited(_pingLocation(position: position));
      },
      onError: (_) {},
    );
  }

  Future<void> _pingLocation({Position? position}) async {
    if (Platform.isIOS) {
      // iOS keeps GPS alive on the UI isolate; this timer is not reliable
      // when the phone is locked. Android posts from this foreground service.
      return;
    }
    if (_pingInFlight) {
      return;
    }
    final now = DateTime.now();
    if (!shouldSendLocationPing(now: now, lastSentAt: _lastSentAt)) {
      return;
    }
    final credentials = await loadLocationTaskCredentials();
    if (credentials == null) {
      return;
    }
    _pingInFlight = true;
    try {
      final next =
          position ??
          _lastPosition ??
          await Geolocator.getLastKnownPosition() ??
          await Geolocator.getCurrentPosition(
            locationSettings: riderBackgroundLocationSettings(
              timeLimit: const Duration(seconds: 4),
            ),
          );
      _lastPosition = next;
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
                latitude: next.latitude,
                longitude: next.longitude,
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
      _lastSentAt = DateTime.now();
      if (result == LocationPingResult.authFailed) {
        FlutterForegroundTask.sendDataToMain(locationAuthFailedEvent);
      }
    } catch (_) {
    } finally {
      _pingInFlight = false;
    }
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
      eventAction: ForegroundTaskEventAction.repeat(
        locationPingInterval.inMilliseconds,
      ),
      autoRunOnBoot: false,
      autoRunOnMyPackageReplaced: false,
      allowWakeLock: true,
      allowWifiLock: true,
      stopWithTask: false,
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
    notificationIcon: _locationNotificationIcon,
    callback: startLocationCallback,
  );
}

Future<void> stopLocationForegroundTask() async {
  if (await FlutterForegroundTask.isRunningService) {
    await FlutterForegroundTask.stopService();
  }
}
