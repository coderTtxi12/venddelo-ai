import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';

typedef RiderSocketEventHandler = void Function(Map<String, dynamic> event);
typedef RiderSocketStatusHandler = void Function(RiderSocketStatus status);

enum RiderSocketStatus { connecting, live, reconnecting, offline }

String riderWebSocketUrl(String apiBaseUrl, String token) {
  final uri = Uri.parse(apiBaseUrl);
  final wsScheme = uri.scheme == 'https' ? 'wss' : 'ws';
  return uri
      .replace(
        scheme: wsScheme,
        path: '${uri.path}/ws/rider/me',
        queryParameters: {'token': token},
      )
      .toString();
}

/// Keeps a single rider websocket alive with exponential reconnect backoff.
/// DB sessions are only used during the server handshake (Approach A).
class RiderSocket {
  RiderSocket({
    required this.apiBaseUrlProvider,
    required this.tokenProvider,
    required this.onEvent,
    this.onStatusChange,
  });

  final String Function() apiBaseUrlProvider;
  final String? Function() tokenProvider;
  final RiderSocketEventHandler onEvent;
  final RiderSocketStatusHandler? onStatusChange;

  WebSocket? _socket;
  Timer? _retryTimer;
  StreamSubscription<dynamic>? _sub;
  bool _stopped = true;
  bool _hasConnectedOnce = false;
  int _retryMs = 1000;

  Future<void> start() async {
    _stopped = false;
    await _connect();
  }

  Future<void> stop() async {
    _stopped = true;
    _retryTimer?.cancel();
    _retryTimer = null;
    await _closeSocket();
    onStatusChange?.call(RiderSocketStatus.offline);
  }

  Future<void> _connect() async {
    if (_stopped) {
      return;
    }
    final token = tokenProvider();
    if (token == null || token.isEmpty) {
      onStatusChange?.call(RiderSocketStatus.offline);
      return;
    }

    onStatusChange?.call(
      _hasConnectedOnce
          ? RiderSocketStatus.reconnecting
          : RiderSocketStatus.connecting,
    );

    await _closeSocket();
    try {
      final url = riderWebSocketUrl(apiBaseUrlProvider(), token);
      final socket = await WebSocket.connect(url);
      if (_stopped) {
        await socket.close();
        return;
      }
      _socket = socket;
      _retryMs = 1000;
      _hasConnectedOnce = true;
      onStatusChange?.call(RiderSocketStatus.live);
      _sub = socket.listen(
        (message) {
          if (message is! String) {
            return;
          }
          try {
            final decoded = jsonDecode(message);
            if (decoded is Map<String, dynamic>) {
              onEvent(decoded);
            }
          } catch (error) {
            debugPrint('rider ws parse error: $error');
          }
        },
        onDone: _scheduleReconnect,
        onError: (_) => _scheduleReconnect(),
        cancelOnError: true,
      );
    } catch (error) {
      debugPrint('rider ws connect failed: $error');
      _scheduleReconnect();
    }
  }

  void _scheduleReconnect() {
    if (_stopped) {
      return;
    }
    onStatusChange?.call(RiderSocketStatus.reconnecting);
    _retryTimer?.cancel();
    _retryTimer = Timer(Duration(milliseconds: _retryMs), () {
      _retryMs = (_retryMs * 2).clamp(1000, 30000);
      unawaited(_connect());
    });
  }

  Future<void> _closeSocket() async {
    await _sub?.cancel();
    _sub = null;
    final socket = _socket;
    _socket = null;
    if (socket != null) {
      try {
        await socket.close();
      } catch (_) {}
    }
  }
}
