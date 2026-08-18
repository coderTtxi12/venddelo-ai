import 'package:google_sign_in/google_sign_in.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'api.dart';
import 'config.dart';
import 'friendly_error.dart';
import 'models.dart';

const String riderNotRegisteredMessage =
    'Tu correo no está dado de alta. Mexy debe registrarte en el panel de repartidores con el mismo correo de Google.';

Future<void> signInWithGoogle() async {
  final googleSignIn = GoogleSignIn(
    clientId: AppConfig.googleIosClientId.isEmpty
        ? null
        : AppConfig.googleIosClientId,
    serverClientId: AppConfig.googleWebClientId.isEmpty
        ? null
        : AppConfig.googleWebClientId,
  );
  final googleUser = await googleSignIn.signIn();
  if (googleUser == null) {
    throw AuthException('Inicio de sesión cancelado');
  }
  final googleAuth = await googleUser.authentication;
  final idToken = googleAuth.idToken;
  if (idToken == null) {
    throw AuthException('No se pudo obtener el token de Google');
  }
  await Supabase.instance.client.auth.signInWithIdToken(
    provider: OAuthProvider.google,
    idToken: idToken,
    accessToken: googleAuth.accessToken,
  );
  try {
    await ensureRegisteredRider();
  } on AuthException {
    await signOut();
    rethrow;
  }
}

/// Only drivers pre-registered in the delivery dashboard may use the app.
Future<void> ensureRegisteredRider() async {
  final api = RiderApi(
    tokenProvider: () => Supabase.instance.client.auth.currentSession?.accessToken,
  );
  try {
    await api.getMe();
  } on ApiException catch (error) {
    if (error.statusCode == 403) {
      throw AuthException(riderNotRegisteredMessage);
    }
    throw AuthException(error.message);
  } catch (error) {
    throw AuthException(friendlyErrorMessage(error));
  }
}

Future<void> signOut() async {
  try {
    await GoogleSignIn().signOut();
  } catch (_) {}
  await Supabase.instance.client.auth.signOut();
}
