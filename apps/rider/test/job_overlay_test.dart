import 'package:flutter_test/flutter_test.dart';
import 'package:mexy_rider/job_overlay.dart';

void main() {
  test('active delivery jobs are assigned, picked up, or in transit', () {
    expect(isActiveDeliveryJob('assigned'), isTrue);
    expect(isActiveDeliveryJob('picked_up'), isTrue);
    expect(isActiveDeliveryJob('in_transit'), isTrue);
    expect(isActiveDeliveryJob('offered'), isFalse);
    expect(isActiveDeliveryJob('searching'), isFalse);
    expect(isActiveDeliveryJob('delivered'), isFalse);
  });

  test('overlay stays dismissed only while the same jobs are active', () {
    expect(
      isOverlayDismissed(
        dismissedSignature: 'a,b',
        currentSignature: jobOverlaySignature(['b', 'a']),
      ),
      isTrue,
    );
    expect(
      isOverlayDismissed(
        dismissedSignature: 'a',
        currentSignature: jobOverlaySignature(['a', 'b']),
      ),
      isFalse,
    );
    expect(
      isOverlayDismissed(dismissedSignature: null, currentSignature: 'a'),
      isFalse,
    );
  });

  test('shows the shortcut only with a live job, app in background, and permission', () {
    const allowed = JobOverlayDecision(
      enabledInSettings: true,
      hasActiveJob: true,
      appInBackground: true,
      overlayPermissionGranted: true,
      dismissedThisJob: false,
    );
    expect(shouldShowJobOverlay(allowed), isTrue);
    expect(
      shouldShowJobOverlay(allowed.copyWith(enabledInSettings: false)),
      isFalse,
    );
    expect(shouldShowJobOverlay(allowed.copyWith(hasActiveJob: false)), isFalse);
    expect(
      shouldShowJobOverlay(allowed.copyWith(appInBackground: false)),
      isFalse,
    );
    expect(
      shouldShowJobOverlay(allowed.copyWith(overlayPermissionGranted: false)),
      isFalse,
    );
    expect(
      shouldShowJobOverlay(allowed.copyWith(dismissedThisJob: true)),
      isFalse,
    );
  });

  test('settings default to showing the overlay', () {
    expect(jobOverlayEnabledFromStored(null), isTrue);
    expect(jobOverlayEnabledFromStored(true), isTrue);
    expect(jobOverlayEnabledFromStored(false), isFalse);
  });
}
