import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:geolocator/geolocator.dart';
import 'package:mexy_rider/location_ping.dart';

void main() {
  test('sends the first ping and then waits 5 seconds', () {
    final now = DateTime.utc(2026, 9, 20, 7, 20);
    expect(shouldSendLocationPing(now: now, lastSentAt: null), isTrue);
    expect(
      shouldSendLocationPing(
        now: now.add(const Duration(seconds: 4)),
        lastSentAt: now,
      ),
      isFalse,
    );
    expect(
      shouldSendLocationPing(
        now: now.add(const Duration(seconds: 5)),
        lastSentAt: now,
      ),
      isTrue,
    );
  });

  test('a fix older than 15 seconds is not sent again', () {
    final now = DateTime.utc(2026, 9, 20, 7, 20);
    expect(
      chooseLocationFix(
        incomingAt: now.subtract(const Duration(seconds: 16)),
        cachedAt: now.subtract(const Duration(seconds: 40)),
        now: now,
      ),
      LocationFixChoice.fetchLive,
    );
    expect(
      chooseLocationFix(
        incomingAt: null,
        cachedAt: now.subtract(const Duration(seconds: 10)),
        now: now,
      ),
      LocationFixChoice.cached,
    );
    expect(
      chooseLocationFix(
        incomingAt: now.subtract(const Duration(seconds: 15)),
        cachedAt: now.subtract(const Duration(seconds: 40)),
        now: now,
      ),
      LocationFixChoice.incoming,
    );
  });

  test('android settings request a 5s high-accuracy stream', () {
    final settings = riderBackgroundLocationSettings(
      platform: TargetPlatform.android,
    );
    expect(settings, isA<AndroidSettings>());
    final android = settings as AndroidSettings;
    expect(android.accuracy, LocationAccuracy.high);
    expect(android.distanceFilter, 0);
    expect(android.intervalDuration, locationPingInterval);
  });

  test('ios settings keep gps alive when locked or backgrounded', () {
    final settings = riderBackgroundLocationSettings(
      platform: TargetPlatform.iOS,
    );
    expect(settings, isA<AppleSettings>());
    final apple = settings as AppleSettings;
    expect(apple.allowBackgroundLocationUpdates, isTrue);
    expect(apple.pauseLocationUpdatesAutomatically, isFalse);
    expect(apple.showBackgroundLocationIndicator, isTrue);
    expect(apple.activityType, ActivityType.otherNavigation);
    expect(apple.accuracy, LocationAccuracy.bestForNavigation);
  });
}
