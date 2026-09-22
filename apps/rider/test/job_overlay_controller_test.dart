import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mexy_rider/job_overlay_platform.dart';
import 'package:mexy_rider/models.dart';
import 'package:mexy_rider/rider_controller.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _FakeOverlay extends JobOverlayPlatform {
  bool permission = true;
  int showCount = 0;
  int hideCount = 0;
  int requestCount = 0;
  int oemPopupCount = 0;
  bool oemPopupRequired = false;

  @override
  bool get isSupported => true;

  @override
  void listen() {}

  @override
  Future<bool> hasPermission() async => permission;

  @override
  Future<void> requestPermission() async {
    requestCount += 1;
  }

  @override
  Future<void> show() async {
    showCount += 1;
  }

  @override
  Future<void> hide() async {
    hideCount += 1;
  }

  @override
  Future<bool> needsBackgroundPopup() async => oemPopupRequired;

  @override
  Future<void> requestBackgroundPopup() async {
    oemPopupCount += 1;
  }
}

class _GateOverlay extends _FakeOverlay {
  _GateOverlay(this.gate);

  final Completer<void> gate;
  final calls = <String>[];
  final enteredShow = Completer<void>();

  @override
  Future<void> show() async {
    calls.add('show');
    if (!enteredShow.isCompleted) {
      enteredShow.complete();
    }
    await gate.future;
    showCount += 1;
  }

  @override
  Future<void> hide() async {
    calls.add('hide');
    hideCount += 1;
  }
}

RiderProfile _profileWithJob({String status = 'assigned'}) {
  return RiderProfile(
    id: 'rider-1',
    firstName: 'Ana',
    lastName: 'López',
    isOnline: true,
    assignments: [
      RiderAssignment(
        id: 'job-1',
        status: status,
        restaurantName: 'Taquería',
        dropoffAddress: 'Calle 1',
      ),
    ],
  );
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('shows the overlay when a live job goes to the background', () async {
    final overlay = _FakeOverlay();
    final controller = RiderController(overlayPlatform: overlay)
      ..profile = _profileWithJob()
      ..lifecycleState = AppLifecycleState.paused;

    await controller.syncJobOverlay();

    expect(overlay.showCount, 1);
    expect(overlay.requestCount, 0);
    controller.dispose();
  });

  test('does not show the overlay on a brief inactive focus loss', () async {
    final overlay = _FakeOverlay();
    final controller = RiderController(overlayPlatform: overlay)
      ..profile = _profileWithJob()
      ..lifecycleState = AppLifecycleState.inactive;

    await controller.syncJobOverlay();

    expect(overlay.showCount, 0);
    expect(overlay.hideCount, 1);
    controller.dispose();
  });

  test('shows the overlay when the app is hidden', () async {
    final overlay = _FakeOverlay();
    final controller = RiderController(overlayPlatform: overlay)
      ..profile = _profileWithJob()
      ..lifecycleState = AppLifecycleState.hidden;

    await controller.syncJobOverlay();

    expect(overlay.showCount, 1);
    controller.dispose();
  });

  test('a later lifecycle wins when two syncs overlap', () async {
    final gate = Completer<void>();
    final overlay = _GateOverlay(gate);
    final controller = RiderController(overlayPlatform: overlay)
      ..profile = _profileWithJob()
      ..lifecycleState = AppLifecycleState.paused;

    final first = controller.syncJobOverlay();
    await overlay.enteredShow.future;
    controller.lifecycleState = AppLifecycleState.resumed;
    final second = controller.syncJobOverlay();
    gate.complete();
    await first;
    await second;

    expect(overlay.calls, ['show', 'hide']);
    controller.dispose();
  });

  test('hides the overlay when the rider returns to the app', () async {
    final overlay = _FakeOverlay();
    final controller = RiderController(overlayPlatform: overlay)
      ..profile = _profileWithJob()
      ..lifecycleState = AppLifecycleState.paused;
    await controller.syncJobOverlay();

    controller.lifecycleState = AppLifecycleState.resumed;
    await controller.syncJobOverlay();

    expect(overlay.hideCount, 1);
    controller.dispose();
  });

  test('does not ask overlay permission when a new job starts', () async {
    final overlay = _FakeOverlay()..permission = false;
    final controller = RiderController(overlayPlatform: overlay)
      ..profile = _profileWithJob()
      ..lifecycleState = AppLifecycleState.resumed;

    await controller.syncJobOverlay();
    await controller.syncJobOverlay();

    expect(overlay.requestCount, 0);
    expect(overlay.showCount, 0);
    controller.dispose();
  });

  test('asks overlay permission once at login, even without a job', () async {
    final overlay = _FakeOverlay()..permission = false;
    final controller = RiderController(overlayPlatform: overlay);

    await controller.promptOverlayPermissionOnce();
    await controller.promptOverlayPermissionOnce();
    controller.profile = _profileWithJob();
    await controller.syncJobOverlay();

    expect(overlay.requestCount, 1);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getBool('job_overlay_permission_asked'), isTrue);
    controller.dispose();
  });

  test('does not ask overlay permission again after a later login', () async {
    SharedPreferences.setMockInitialValues({
      'job_overlay_permission_asked': true,
    });
    final overlay = _FakeOverlay()..permission = false;
    final controller = RiderController(overlayPlatform: overlay);
    await controller.promptOverlayPermissionOnce();

    expect(overlay.requestCount, 0);
    controller.dispose();
  });

  test('does not show the overlay when the setting is off', () async {
    final overlay = _FakeOverlay();
    final controller = RiderController(overlayPlatform: overlay)
      ..overlayEnabled = false
      ..profile = _profileWithJob()
      ..lifecycleState = AppLifecycleState.paused;

    await controller.syncJobOverlay();

    expect(overlay.showCount, 0);
    expect(overlay.hideCount, 1);
    controller.dispose();
  });

  test('opens the Xiaomi background popup once after overlay permission', () async {
    final overlay = _FakeOverlay()
      ..permission = true
      ..oemPopupRequired = true;
    final controller = RiderController(overlayPlatform: overlay)
      ..profile = _profileWithJob();

    await controller.promptOemBackgroundPopupOnce();
    await controller.promptOemBackgroundPopupOnce();

    expect(overlay.oemPopupCount, 1);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getBool('job_overlay_oem_popup_asked'), isTrue);
    controller.dispose();
  });

  test('turning the setting on persists it and requests permission', () async {
    final overlay = _FakeOverlay()..permission = false;
    final controller = RiderController(overlayPlatform: overlay)
      ..profile = _profileWithJob();

    await controller.setOverlayEnabled(true);

    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getBool('job_overlay_enabled'), isTrue);
    expect(overlay.requestCount, greaterThanOrEqualTo(1));
    controller.dispose();
  });
}
