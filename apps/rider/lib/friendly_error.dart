import 'dart:io';

import 'package:http/http.dart' as http;

const String networkUnavailableMessage =
    'No se pudo conectar con el servidor. Revisa tu Wi‑Fi e inténtalo de nuevo.';

bool isNetworkError(Object error) {
  final text = error.toString().toLowerCase();
  return error is SocketException ||
      error is http.ClientException ||
      error is HandshakeException ||
      error is HttpException ||
      error is TlsException ||
      text.contains('socketexception') ||
      text.contains('clientexception') ||
      text.contains('failed host lookup') ||
      text.contains('connection refused') ||
      text.contains('connection timed out') ||
      text.contains('network is unreachable');
}

String friendlyErrorMessage(Object error) {
  if (!isNetworkError(error)) {
    return error.toString();
  }
  return networkUnavailableMessage;
}
