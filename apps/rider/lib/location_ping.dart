import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';

const locationPingInterval = Duration(seconds: 5);

bool shouldSendLocationPing({
  required DateTime now,
  DateTime? lastSentAt,
  Duration interval = locationPingInterval,
}) {
  if (lastSentAt == null) {
    return true;
  }
  return now.difference(lastSentAt) >= interval;
}

LocationSettings riderBackgroundLocationSettings({
  TargetPlatform? platform,
  int distanceFilter = 0,
  Duration? timeLimit,
}) {
  final target = platform ?? defaultTargetPlatform;
  if (target == TargetPlatform.android) {
    return AndroidSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: distanceFilter,
      intervalDuration: locationPingInterval,
      timeLimit: timeLimit,
    );
  }
  if (target == TargetPlatform.iOS) {
    return AppleSettings(
      accuracy: LocationAccuracy.bestForNavigation,
      activityType: ActivityType.otherNavigation,
      distanceFilter: distanceFilter,
      timeLimit: timeLimit,
      pauseLocationUpdatesAutomatically: false,
      allowBackgroundLocationUpdates: true,
      showBackgroundLocationIndicator: true,
    );
  }
  return LocationSettings(
    accuracy: LocationAccuracy.high,
    distanceFilter: distanceFilter,
    timeLimit: timeLimit,
  );
}
