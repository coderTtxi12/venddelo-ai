import 'package:google_sign_in/google_sign_in.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'config.dart';

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
}

Future<void> signOut() async {
  try {
    await GoogleSignIn().signOut();
  } catch (_) {}
  await Supabase.instance.client.auth.signOut();
}
