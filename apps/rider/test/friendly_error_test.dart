import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mexy_rider/config.dart';
import 'package:mexy_rider/friendly_error.dart';

void main() {
  test('maps SocketException to a rider-readable message', () {
    final message = friendlyErrorMessage(
      const SocketException('Connection refused'),
    );
    expect(message.contains('ClientException'), isFalse);
    expect(message.contains('SocketException'), isFalse);
    expect(message, isNot(equals('Connection refused')));
    expect(message, contains('Wi‑Fi'));
    expect(message.contains('adb reverse'), isFalse);
    expect(message.contains('API_BASE_URL'), isFalse);
    expect(message.contains('10.0.2.2'), isFalse);
  });

  test('local API candidates try localhost and emulator loopback', () {
    expect(
      localApiBaseCandidates('http://10.0.2.2:8080/api/v1'),
      ['http://10.0.2.2:8080/api/v1', 'http://localhost:8080/api/v1'],
    );
    expect(
      localApiBaseCandidates('http://localhost:8080/api/v1'),
      ['http://localhost:8080/api/v1', 'http://10.0.2.2:8080/api/v1'],
    );
    expect(
      localApiBaseCandidates('https://api.mexy.app/api/v1'),
      ['https://api.mexy.app/api/v1'],
    );
  });
}
