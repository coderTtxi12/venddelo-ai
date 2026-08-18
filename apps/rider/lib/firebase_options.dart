import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      throw UnsupportedError('Firebase web is not configured for Mexy Rider.');
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      case TargetPlatform.iOS:
        throw UnsupportedError(
          'Add GoogleService-Info.plist before enabling iOS FCM.',
        );
      default:
        throw UnsupportedError(
          'Firebase is not configured for ${defaultTargetPlatform.name}.',
        );
    }
  }

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'AIzaSyC6FC2ywG-3IHJrZPS85q25n0G3Q9hHT18',
    appId: '1:628146720410:android:80fb43f722bc09ccbc1923',
    messagingSenderId: '628146720410',
    projectId: 'mexy-231b0',
    storageBucket: 'mexy-231b0.firebasestorage.app',
  );
}
