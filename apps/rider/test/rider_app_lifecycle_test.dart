import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mexy_rider/rider_app_lifecycle.dart';

void main() {
  test('rider websocket stays in foreground only', () {
    expect(shouldKeepRiderWebSocket(AppLifecycleState.resumed), isTrue);
    expect(shouldKeepRiderWebSocket(AppLifecycleState.paused), isFalse);
    expect(shouldKeepRiderWebSocket(AppLifecycleState.hidden), isFalse);
    expect(shouldKeepRiderWebSocket(AppLifecycleState.detached), isFalse);
  });
}
