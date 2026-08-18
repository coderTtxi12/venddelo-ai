import 'dart:async';

import 'package:flutter/material.dart';

import 'package:mexy_rider/auth.dart';
import 'package:mexy_rider/friendly_error.dart';
import 'package:mexy_rider/location_task.dart';
import 'package:mexy_rider/rider_controller.dart';
import 'package:mexy_rider/screens/home_screen.dart';
import 'package:mexy_rider/screens/login_screen.dart';
import 'package:mexy_rider/screens/offer_screen.dart';
import 'package:mexy_rider/screens/permissions_screen.dart';
import 'package:mexy_rider/rider_permissions.dart';
import 'package:mexy_rider/theme/app_theme.dart';
import 'package:mexy_rider/widgets/rider_widgets.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class AuthGate extends StatefulWidget {
  const AuthGate({super.key});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> with WidgetsBindingObserver {
  RiderController? _controller;
  String? _loginError;
  bool _signingIn = false;
  bool _attaching = false;
  bool _permissionsGranted = false;
  bool _checkingPermissions = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    final session = Supabase.instance.client.auth.currentSession;
    if (session != null) {
      unawaited(_attachController());
    }
    Supabase.instance.client.auth.onAuthStateChange.listen((data) {
      if (!mounted) {
        return;
      }
      if (data.session == null) {
        _controller?.dispose();
        setState(() {
          _controller = null;
          _permissionsGranted = false;
        });
      } else if (_controller == null && !_attaching) {
        unawaited(_attachController());
      }
    });
  }

  Future<void> _attachController() async {
    if (_attaching) {
      return;
    }
    _attaching = true;
    final controller = RiderController();
    if (mounted) {
      setState(() => _controller = controller);
    }
    await controller.bootstrap();
    if (!mounted) {
      controller.dispose();
      _attaching = false;
      return;
    }
    if (controller.notRegistered) {
      controller.dispose();
      await _rejectUnregisteredLogin();
      _attaching = false;
      return;
    }
    await _refreshPermissionGate();
    _attaching = false;
    setState(() {});
  }

  Future<void> _refreshPermissionGate({bool silent = false}) async {
    if (!silent) {
      _checkingPermissions = true;
      if (mounted) {
        setState(() {});
      }
    }
    final snapshot = await checkRiderPermissions();
    if (!mounted) {
      return;
    }
    setState(() {
      _permissionsGranted = snapshot.allGranted;
      _checkingPermissions = false;
    });
  }

  Future<void> _rejectUnregisteredLogin() async {
    _controller = null;
    _permissionsGranted = false;
    await stopLocationForegroundTask();
    await signOut();
    if (!mounted) {
      return;
    }
    setState(() {
      _loginError = riderNotRegisteredMessage;
    });
  }

  Future<void> _onGoogleSignIn() async {
    setState(() {
      _signingIn = true;
      _loginError = null;
    });
    try {
      await signInWithGoogle();
    } on AuthException catch (error) {
      if (mounted) {
        setState(() => _loginError = error.message);
      }
    } catch (error) {
      if (mounted) {
        setState(() => _loginError = friendlyErrorMessage(error));
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
    WidgetsBinding.instance.removeObserver(this);
    _controller?.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed &&
        _controller != null &&
        _controller!.profile != null) {
      unawaited(_refreshPermissionGate(silent: true));
    }
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    if (controller == null) {
      return LoginScreen(
        onGoogleSignIn: _signingIn ? null : _onGoogleSignIn,
        error: _loginError,
        loading: _signingIn,
      );
    }
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        if (controller.loading || _checkingPermissions) {
          return Scaffold(
            body: Center(
              child: Padding(
                padding: const EdgeInsets.all(AppTheme.screenPadding),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const CircularProgressIndicator(),
                    const SizedBox(height: 16),
                    Text(
                      controller.loading
                          ? 'Verificando tu registro…'
                          : 'Revisando permisos…',
                      style: Theme.of(context).textTheme.bodyLarge,
                    ),
                  ],
                ),
              ),
            ),
          );
        }
        if (!_permissionsGranted) {
          return PermissionsScreen(
            onGranted: () {
              setState(() => _permissionsGranted = true);
              unawaited(_controller?.syncNotifications());
            },
          );
        }
        if (controller.notRegistered) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            unawaited(_rejectUnregisteredLogin());
          });
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }
        if (controller.profile == null) {
          return Scaffold(
            body: SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(AppTheme.screenPadding),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    RiderErrorBanner(
                      message:
                          controller.errorMessage ??
                          'No se pudo cargar tu perfil.',
                    ),
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: _attachController,
                      child: const Text('Reintentar'),
                    ),
                    const SizedBox(height: 8),
                    TextButton(
                      onPressed: _onSignOut,
                      child: const Text('Cerrar sesión'),
                    ),
                  ],
                ),
              ),
            ),
          );
        }
        if (controller.offer != null) {
          return OfferScreen(
            offer: controller.offer!,
            errorMessage: controller.errorMessage,
            busy: controller.offerBusy,
            onAccept: controller.acceptOffer,
          );
        }
        return HomeScreen(controller: controller, onSignOut: _onSignOut);
      },
    );
  }
}
