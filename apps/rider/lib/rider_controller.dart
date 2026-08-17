import 'dart:async';
import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:geolocator/geolocator.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'api.dart';
import 'config.dart';
import 'location_task.dart';
import 'models.dart';

class RiderController extends ChangeNotifier {
  RiderController({RiderApi? api})
    : _api =
          api ??
          RiderApi(
            tokenProvider: () =>
                Supabase.instance.client.auth.currentSession?.accessToken,
          );

  final RiderApi _api;

  RiderProfile? profile;
  RiderOffer? offer;
  String? errorMessage;
  bool loading = true;
  bool notRegistered = false;
  bool onlineBusy = false;

  Timer? _offerPoll;
  StreamSubscription<RemoteMessage>? _fcmForeground;

  Future<void> bootstrap() async {
    loading = true;
    errorMessage = null;
    notRegistered = false;
    notifyListeners();
    try {
      await refreshMe();
      await _setupFcm();
      if (profile?.isOnline == true) {
        await _startOnlineServices();
      }
    } on ApiException catch (error) {
      if (error.statusCode == 403) {
        notRegistered = true;
        profile = null;
      } else {
        errorMessage = error.message;
      }
    } catch (error) {
      errorMessage = error.toString();
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> refreshMe() async {
    profile = await _api.getMe();
    notifyListeners();
  }

  Future<void> refreshOffers() async {
    if (profile?.isOnline != true) {
      offer = null;
      notifyListeners();
      return;
    }
    try {
      final offers = await _api.listOffers();
      offer = offers.isEmpty ? null : offers.first;
      notifyListeners();
    } on ApiException catch (error) {
      errorMessage = error.message;
      notifyListeners();
    }
  }

  Future<void> setOnline(bool isOnline) async {
    if (onlineBusy) {
      return;
    }
    onlineBusy = true;
    errorMessage = null;
    notifyListeners();
    try {
      if (isOnline) {
        await _ensureLocationPermissions();
        await _requestNotificationPermission();
        profile = await _api.setOnline(true);
        await _startOnlineServices();
      } else {
        await _stopOnlineServices();
        profile = await _api.setOnline(false);
        offer = null;
      }
    } on ApiException catch (error) {
      errorMessage = error.message;
    } catch (error) {
      errorMessage = error.toString();
    } finally {
      onlineBusy = false;
      notifyListeners();
    }
  }

  Future<void> acceptOffer() async {
    final current = offer;
    if (current == null) {
      return;
    }
    try {
      await _api.acceptOffer(current.id);
      offer = null;
      await refreshMe();
    } on ApiException catch (error) {
      errorMessage = error.message;
      await refreshOffers();
    }
    notifyListeners();
  }

  Future<void> rejectOffer() async {
    final current = offer;
    if (current == null) {
      return;
    }
    try {
      await _api.rejectOffer(current.id);
      offer = null;
    } on ApiException catch (error) {
      errorMessage = error.message;
    }
    notifyListeners();
  }

  Future<void> transitionAssignment(String requestId, String action) async {
    try {
      await _api.transitionAssignment(requestId, action);
      await refreshMe();
    } on ApiException catch (error) {
      errorMessage = error.message;
      notifyListeners();
    }
  }

  Future<void> _startOnlineServices() async {
    final token = Supabase.instance.client.auth.currentSession?.accessToken;
    if (token != null) {
      await saveLocationTaskCredentials(
        apiBaseUrl: AppConfig.apiBaseUrl,
        accessToken: token,
      );
    }
    initLocationForegroundTask();
    await startLocationForegroundTask();
    _offerPoll?.cancel();
    _offerPoll = Timer.periodic(const Duration(seconds: 5), (_) {
      unawaited(refreshOffers());
    });
    await refreshOffers();
  }

  Future<void> _stopOnlineServices() async {
    _offerPoll?.cancel();
    _offerPoll = null;
    await stopLocationForegroundTask();
  }

  Future<void> _ensureLocationPermissions() async {
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      throw const ApiException(400, 'Activa el GPS para ponerte en línea.');
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      throw const ApiException(
        400,
        'Necesitamos tu ubicación para ofrecerte envíos.',
      );
    }
    if (permission == LocationPermission.whileInUse) {
      permission = await Geolocator.requestPermission();
    }
  }

  Future<void> _requestNotificationPermission() async {
    final status = await FlutterForegroundTask.checkNotificationPermission();
    if (status != NotificationPermission.granted) {
      await FlutterForegroundTask.requestNotificationPermission();
    }
  }

  Future<void> _setupFcm() async {
    if (Firebase.apps.isEmpty) {
      return;
    }
    try {
      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission();
      final token = await messaging.getToken();
      if (token != null) {
        await _api.putFcmToken(token);
      }
      await _fcmForeground?.cancel();
      _fcmForeground = FirebaseMessaging.onMessage.listen((_) {
        unawaited(refreshOffers());
      });
      FirebaseMessaging.onMessageOpenedApp.listen((_) {
        unawaited(refreshOffers());
      });
    } catch (_) {}
  }

  bool get showIosKillWarning => !kIsWeb && Platform.isIOS;

  @override
  void dispose() {
    _offerPoll?.cancel();
    unawaited(_fcmForeground?.cancel());
    super.dispose();
  }
}
