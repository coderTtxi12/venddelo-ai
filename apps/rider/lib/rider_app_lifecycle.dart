import 'package:flutter/widgets.dart';

/// Rider websocket is only needed in the foreground. GPS keeps running via the
/// foreground location service / iOS background location APIs.
bool shouldKeepRiderWebSocket(AppLifecycleState state) {
  return state == AppLifecycleState.resumed;
}
