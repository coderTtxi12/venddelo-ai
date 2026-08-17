import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'auth.dart';
import 'config.dart';
import 'location_task.dart';
import 'rider_controller.dart';
import 'screens/home_screen.dart';
import 'screens/login_screen.dart';
import 'screens/not_registered_screen.dart';
import 'screens/offer_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  FlutterForegroundTask.initCommunicationPort();
  if (AppConfig.isConfigured) {
    await Supabase.initialize(
      url: AppConfig.supabaseUrl,
      publishableKey: AppConfig.supabaseAnonKey,
    );
    try {
      await Firebase.initializeApp();
    } catch (_) {}
  }
  runApp(const MexyRiderApp());
}

class MexyRiderApp extends StatelessWidget {
  const MexyRiderApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Mexy Rider',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF1B5E20)),
        useMaterial3: true,
      ),
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
    return const Scaffold(
      body: Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text(
            'Falta configuración. Copia .env.example a .env y corre la app con --dart-define-from-file=.env',
            textAlign: TextAlign.center,
          ),
        ),
      ),
    );
  }
}

class AuthGate extends StatefulWidget {
  const AuthGate({super.key});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  RiderController? _controller;
  String? _loginError;
  bool _signingIn = false;

  @override
  void initState() {
    super.initState();
    final session = Supabase.instance.client.auth.currentSession;
    if (session != null) {
      _attachController();
    }
    Supabase.instance.client.auth.onAuthStateChange.listen((data) {
      if (!mounted) {
        return;
      }
      if (data.session == null) {
        _controller?.dispose();
        setState(() => _controller = null);
      } else if (_controller == null) {
        _attachController();
      }
    });
  }

  void _attachController() {
    final controller = RiderController();
    _controller = controller;
    controller.bootstrap();
    setState(() {});
  }

  Future<void> _onGoogleSignIn() async {
    setState(() {
      _signingIn = true;
      _loginError = null;
    });
    try {
      await signInWithGoogle();
    } catch (error) {
      if (mounted) {
        setState(() => _loginError = error.toString());
      }
    } finally {
      if (mounted) {
        setState(() => _signingIn = false);
      }
    }
  }

  Future<void> _onSignOut() async {
    await stopLocationForegroundTask();
    await signOut();
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    if (controller == null) {
      return LoginScreen(
        onGoogleSignIn: _signingIn ? null : _onGoogleSignIn,
        error: _loginError,
      );
    }
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        if (controller.loading) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }
        if (controller.notRegistered) {
          return NotRegisteredScreen(onSignOut: _onSignOut);
        }
        if (controller.offer != null) {
          return OfferScreen(
            offer: controller.offer!,
            errorMessage: controller.errorMessage,
            busy: controller.offerBusy,
            onAccept: controller.acceptOffer,
            onReject: controller.rejectOffer,
          );
        }
        return HomeScreen(controller: controller, onSignOut: _onSignOut);
      },
    );
  }
}
