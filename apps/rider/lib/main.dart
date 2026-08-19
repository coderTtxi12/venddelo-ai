import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:google_maps_flutter_android/google_maps_flutter_android.dart';
import 'package:google_maps_flutter_platform_interface/google_maps_flutter_platform_interface.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'auth_gate.dart';
import 'config.dart';
import 'firebase_options.dart';
import 'theme/app_colors.dart';
import 'theme/app_theme.dart';

@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  _configureGoogleMapsAndroid();
  FlutterForegroundTask.initCommunicationPort();
  if (AppConfig.isConfigured) {
    await Supabase.initialize(
      url: AppConfig.supabaseUrl,
      publishableKey: AppConfig.supabaseAnonKey,
    );
    try {
      await Firebase.initializeApp(
        options: DefaultFirebaseOptions.currentPlatform,
      );
      FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
      debugPrint('Firebase initialized for FCM');
    } catch (error, stackTrace) {
      debugPrint('Firebase init skipped: $error\n$stackTrace');
    }
  }
  runApp(const MexyRiderApp());
}

void _configureGoogleMapsAndroid() {
  if (kIsWeb) {
    return;
  }
  final mapsImplementation = GoogleMapsFlutterPlatform.instance;
  if (mapsImplementation is GoogleMapsFlutterAndroid) {
    // Stack overlays (sheet, chips) need Hybrid Composition on Xiaomi/Impeller.
    mapsImplementation.useAndroidViewSurface = true;
  }
}

class MexyRiderApp extends StatelessWidget {
  const MexyRiderApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Mexy Rider',
      theme: AppTheme.light,
      home: AppConfig.isConfigured
          ? const AuthGate()
          : const _MissingConfigScreen(),
    );
  }
}

class _MissingConfigScreen extends StatelessWidget {
  const _MissingConfigScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(AppTheme.screenPadding),
          child: Center(
            child: Text(
              'Falta configuración. Copia .env.example a .env y corre la app con --dart-define-from-file=.env',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                    color: AppColors.textSecondary,
                  ),
            ),
          ),
        ),
      ),
    );
  }
}
