import 'package:flutter_test/flutter_test.dart';
import 'package:mexy_rider/rider_socket.dart';

void main() {
  test('riderWebSocketUrl converts http api base to ws path', () {
    expect(
      riderWebSocketUrl('http://localhost:8080/api/v1', 'tok'),
      'ws://localhost:8080/api/v1/ws/rider/me?token=tok',
    );
  });

  test('riderWebSocketUrl converts https api base to wss path', () {
    expect(
      riderWebSocketUrl('https://api.example.com/api/v1', 'abc'),
      'wss://api.example.com/api/v1/ws/rider/me?token=abc',
    );
  });
}
