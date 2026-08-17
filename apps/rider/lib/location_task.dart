import 'dart:convert';

import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;

const _apiBaseUrlKey = 'apiBaseUrl';
const _accessTokenKey = 'accessToken';

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
    final apiBase = await FlutterForegroundTask.getData<String>(
      key: _apiBaseUrlKey,
    );
    final token = await FlutterForegroundTask.getData<String>(
      key: _accessTokenKey,
    );
    if (apiBase == null || apiBase.isEmpty || token == null || token.isEmpty) {
      return;
    }
    try {
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 10),
        ),
      );
      await http.post(
        Uri.parse('$apiBase/rider/me/location'),
        headers: {
          'Authorization': 'Bearer $token',
          'Content-Type': 'application/json',
        },
        body: jsonEncode({
          'latitude': position.latitude,
          'longitude': position.longitude,
        }),
      );
    } catch (_) {}
  }
}

Future<void> saveLocationTaskCredentials({
  required String apiBaseUrl,
  required String accessToken,
}) async {
  await FlutterForegroundTask.saveData(key: _apiBaseUrlKey, value: apiBaseUrl);
  await FlutterForegroundTask.saveData(key: _accessTokenKey, value: accessToken);
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
