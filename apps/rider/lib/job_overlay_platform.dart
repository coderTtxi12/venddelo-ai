import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

const jobOverlayChannelName = 'com.mexy.mexy_rider/overlay';

class JobOverlayPlatform {
  JobOverlayPlatform({MethodChannel? channel})
    : _channel = channel ?? const MethodChannel(jobOverlayChannelName);

  final MethodChannel _channel;
  VoidCallback? onDismissed;

  void listen() {
    _channel.setMethodCallHandler((call) async {
      if (call.method == 'overlayDismissed') {
        onDismissed?.call();
      }
    });
  }

  Future<bool> hasPermission() async {
    if (!_isAndroid) return false;
    final granted = await _channel.invokeMethod<bool>('hasPermission');
    return granted == true;
  }

  Future<void> requestPermission() async {
    if (!_isAndroid) return;
    await _channel.invokeMethod<void>('requestPermission');
  }

  Future<void> show() async {
    if (!_isAndroid) return;
    await _channel.invokeMethod<void>('show');
  }

  Future<void> hide() async {
    if (!_isAndroid) return;
    await _channel.invokeMethod<void>('hide');
  }

  bool get isSupported => _isAndroid;

  bool get _isAndroid => !kIsWeb && Platform.isAndroid;
}
