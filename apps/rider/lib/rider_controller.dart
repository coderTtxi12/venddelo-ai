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
import 'countdown.dart';
import 'friendly_error.dart';
import 'location_auth.dart';
import 'location_task.dart';
import 'models.dart';
import 'offer_push.dart';
import 'rider_permissions.dart';
import 'rider_socket.dart';

class RiderController extends ChangeNotifier {
  RiderController({RiderApi? api, Future<bool> Function()? openAppSettingsImpl})
    : _api =
          api ??
          RiderApi(
            tokenProvider: () =>
                Supabase.instance.client.auth.currentSession?.accessToken,
          ),
      _openAppSettings = openAppSettingsImpl ?? Geolocator.openAppSettings;

  final RiderApi _api;
  final Future<bool> Function() _openAppSettings;

  RiderProfile? profile;
  RiderOffer? offer;
  String? errorMessage;
  bool loading = true;
  bool notRegistered = false;
  bool onlineBusy = false;
  bool offerBusy = false;
  bool needsLocationSettings = false;
  Position? currentPosition;

  Timer? _offerPoll;
  Timer? _mePoll;
  RiderSocket? _socket;
  RiderSocketStatus _socketStatus = RiderSocketStatus.offline;
  final Set<String> _dismissedExpiredOfferIds = {};
  StreamSubscription<RemoteMessage>? _fcmForeground;
  StreamSubscription<RemoteMessage>? _fcmOpened;
  StreamSubscription<String>? _fcmTokenRefresh;
  StreamSubscription<AuthState>? _authSub;
  StreamSubscription<Position>? _positionSub;
  bool _listeningTaskData = false;
  String? _alarmedOfferId;

  Future<void> bootstrap() async {
    loading = true;
    errorMessage = null;
    notRegistered = false;
    notifyListeners();
    _listenTaskData();
    _listenAuth();
    try {
      await refreshMe();
      await _setupFcm();
      await startLiveLocation();
      await _ensureRiderSocket();
      if (profile?.isOnline == true) {
        await _startOnlineServices();
      }
    } on ApiException catch (error) {
      if (error.statusCode == 403) {
        notRegistered = true;
        profile = null;
      } else {
        errorMessage = error.message;
        await startLiveLocation();
      }
    } catch (error) {
      errorMessage = friendlyErrorMessage(error);
      await startLiveLocation();
    } finally {
      if (!notRegistered) {
        _startMePoll();
      }
      loading = false;
      notifyListeners();
    }
  }

  Future<void> refreshMe() async {
    profile = await _api.getMe();
    notifyListeners();
  }

  void _startMePoll() {
    _mePoll?.cancel();
    // Slow fallback only — primary updates come from the rider websocket.
    final interval = _socketStatus == RiderSocketStatus.live
        ? const Duration(seconds: 60)
        : const Duration(seconds: 8);
    _mePoll = Timer.periodic(interval, (_) {
      unawaited(_refreshMeQuietly());
    });
  }

  Future<void> _refreshMeQuietly() async {
    try {
      profile = await _api.getMe();
      final recovered = errorMessage != null;
      errorMessage = null;
      notifyListeners();
      if (recovered) {
        unawaited(_setupFcm());
        if (profile?.isOnline == true) {
          unawaited(_startOnlineServices());
        }
      }
    } catch (_) {}
  }

  Future<void> syncNotifications() async {
    await _setupFcm();
  }

  Future<void> refreshOffers() async {
    if (profile?.isOnline != true) {
      _applyOffer(null);
      notifyListeners();
      return;
    }
    await _persistSessionToLocationTask();
    try {
      final offers = await _api.listOffers();
      _applyOffer(offers.isEmpty ? null : offers.first);
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
        try {
          await ensureLocationPermissionsForOnline();
          await ensureNotificationPermissionsForOnline();
        } on LocationPermissionException catch (error) {
          needsLocationSettings = true;
          throw ApiException(400, error.message);
        }
        profile = await _api.setOnline(true);
        await startLiveLocation();
        await _setupFcm();
        await _startOnlineServices();
      } else {
        await _stopOnlineServices();
        profile = await _api.setOnline(false);
        _applyOffer(null);
        needsLocationSettings = false;
      }
    } on ApiException catch (error) {
      errorMessage = error.message;
    } catch (error) {
      errorMessage = friendlyErrorMessage(error);
    } finally {
      onlineBusy = false;
      notifyListeners();
    }
  }

  Future<void> startLiveLocation() async {
    if (_positionSub != null) {
      return;
    }
    final permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      return;
    }
    try {
      currentPosition = await Geolocator.getLastKnownPosition();
      currentPosition ??= await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 8),
        ),
      );
      notifyListeners();
    } catch (_) {}

    _positionSub =
        Geolocator.getPositionStream(
          locationSettings: const LocationSettings(
            accuracy: LocationAccuracy.high,
            distanceFilter: 6,
          ),
        ).listen((position) {
          currentPosition = position;
          notifyListeners();
        });
  }

  Future<void> openLocationSettings() async {
    await _openAppSettings();
  }

  Future<void> acceptOffer() async {
    final current = offer;
    if (current == null || offerBusy) {
      return;
    }
    offerBusy = true;
    errorMessage = null;
    notifyListeners();
    try {
      await _api.acceptOffer(current.id);
      _applyOffer(null);
      await refreshMe();
    } on ApiException catch (error) {
      errorMessage = error.message;
      await refreshOffers();
    } finally {
      offerBusy = false;
      notifyListeners();
    }
  }

  Future<void> rejectOffer() async {
    final current = offer;
    if (current == null || offerBusy) {
      return;
    }
    offerBusy = true;
    errorMessage = null;
    notifyListeners();
    try {
      await _api.rejectOffer(current.id);
      _applyOffer(null);
    } on ApiException catch (error) {
      errorMessage = error.message;
    } finally {
      offerBusy = false;
      notifyListeners();
    }
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
    await _persistSessionToLocationTask();
    initLocationForegroundTask();
    await startLocationForegroundTask();
    await _ensureRiderSocket();
    _syncOfferPollWithSocket();
    await refreshOffers();
  }

  Future<void> _ensureRiderSocket() async {
    if (_socket != null) {
      return;
    }
    _socket = RiderSocket(
      apiBaseUrlProvider: () => _api.resolvedApiBaseUrl,
      tokenProvider: () =>
          Supabase.instance.client.auth.currentSession?.accessToken,
      onEvent: (event) {
        if (event['type'] != 'rider.updated') {
          return;
        }
        _applyCreditFromSocket(event);
        unawaited(_onRiderSocketUpdated());
      },
      onStatusChange: (status) {
        _socketStatus = status;
        _syncOfferPollWithSocket();
        _startMePoll();
        if (status == RiderSocketStatus.live) {
          unawaited(_onRiderSocketUpdated());
        }
      },
    );
    await _socket!.start();
  }

  void _applyCreditFromSocket(Map<String, dynamic> event) {
    final current = profile;
    if (current == null) {
      return;
    }
    final next = applyRiderCreditFromEvent(current, event);
    if (identical(next, current)) {
      return;
    }
    profile = next;
    notifyListeners();
  }

  Future<void> _onRiderSocketUpdated() async {
    await _refreshMeQuietly();
    if (profile?.isOnline == true) {
      await refreshOffers();
    }
  }

  void _syncOfferPollWithSocket() {
    _offerPoll?.cancel();
    _offerPoll = null;
    if (profile?.isOnline != true) {
      return;
    }
    // Poll only as fallback when the websocket is not live.
    if (_socketStatus == RiderSocketStatus.live) {
      return;
    }
    _offerPoll = Timer.periodic(const Duration(seconds: 5), (_) {
      unawaited(refreshOffers());
    });
  }

  void _applyOffer(RiderOffer? next) {
    offer = next;
    _syncOfferAlarm(next?.id);
  }

  void _syncOfferAlarm(String? nextOfferId) {
    if (shouldStopOfferAlarm(
      nextOfferId: nextOfferId,
      alarmedOfferId: _alarmedOfferId,
    )) {
      unawaited(stopOfferAlarm());
      _alarmedOfferId = null;
    }
    if (shouldStartOfferAlarm(
      nextOfferId: nextOfferId,
      alarmedOfferId: _alarmedOfferId,
    )) {
      _alarmedOfferId = nextOfferId;
      unawaited(startOfferAlarm(offerId: nextOfferId));
    }
  }

  Future<void> _stopOnlineServices() async {
    _offerPoll?.cancel();
    _offerPoll = null;
    await _socket?.stop();
    _socket = null;
    _socketStatus = RiderSocketStatus.offline;
    await stopLocationForegroundTask();
  }

  Future<void> _setupFcm() async {
    if (Firebase.apps.isEmpty) {
      debugPrint('FCM skipped: Firebase not initialized');
      return;
    }
    try {
      final messaging = FirebaseMessaging.instance;
      final settings = await messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
      final authorized =
          settings.authorizationStatus == AuthorizationStatus.authorized ||
          settings.authorizationStatus == AuthorizationStatus.provisional;
      if (!authorized) {
        debugPrint('FCM skipped: permission ${settings.authorizationStatus}');
        return;
      }
      final token = await messaging.getToken();
      if (token == null) {
        debugPrint('FCM skipped: getToken returned null');
        return;
      }
      await _api.putFcmToken(token);
      debugPrint('FCM token saved (${token.length} chars)');
      await _fcmForeground?.cancel();
      _fcmForeground = FirebaseMessaging.onMessage.listen((message) {
        final offerId = offerIdFromPushData(message.data);
        if (offerId != null) {
          _syncOfferAlarm(offerId);
        }
        unawaited(refreshOffers());
      });
      await _fcmTokenRefresh?.cancel();
      _fcmTokenRefresh = messaging.onTokenRefresh.listen((refreshToken) {
        unawaited(_api.putFcmToken(refreshToken));
      });
      await _fcmOpened?.cancel();
      _fcmOpened = FirebaseMessaging.onMessageOpenedApp.listen((_) {
        unawaited(refreshOffers());
      });
      final initial = await messaging.getInitialMessage();
      if (initial != null) {
        unawaited(refreshOffers());
      }
    } catch (error, stackTrace) {
      debugPrint('FCM setup failed: $error\n$stackTrace');
    }
  }

  void _listenTaskData() {
    if (_listeningTaskData) {
      return;
    }
    FlutterForegroundTask.addTaskDataCallback(_onTaskData);
    _listeningTaskData = true;
  }

  void _listenAuth() {
    _authSub ??= Supabase.instance.client.auth.onAuthStateChange.listen((data) {
      final session = data.session;
      if (session != null) {
        unawaited(_persistSessionToLocationTask(session));
      }
    });
  }

  void _onTaskData(Object data) {
    if (data == locationAuthFailedEvent) {
      unawaited(_forceOfflineAfterAuthFailure());
    }
  }

  Future<void> _persistSessionToLocationTask([Session? session]) async {
    final current = session ?? Supabase.instance.client.auth.currentSession;
    if (current == null) {
      return;
    }
    await saveLocationTaskCredentials(
      apiBaseUrl: _api.resolvedApiBaseUrl,
      accessToken: current.accessToken,
      refreshToken: current.refreshToken ?? '',
      supabaseUrl: AppConfig.supabaseUrl,
      supabaseAnonKey: AppConfig.supabaseAnonKey,
    );
  }

  Future<RiderHistoryPage> getHistory({
    required String start,
    required String end,
    String? status,
    int limit = 50,
    int offset = 0,
  }) {
    return _api.getHistory(
      start: start,
      end: end,
      status: status,
      limit: limit,
      offset: offset,
    );
  }

  Future<void> _forceOfflineAfterAuthFailure() async {
    errorMessage = locationAuthFailedMessage;
    _applyOffer(null);
    await _stopOnlineServices();
    try {
      profile = await _api.setOnline(false);
    } catch (_) {}
    notifyListeners();
  }

  bool get showIosKillWarning => !kIsWeb && Platform.isIOS;

  @override
  void dispose() {
    _offerPoll?.cancel();
    _mePoll?.cancel();
    unawaited(_socket?.stop());
    _socket = null;
    unawaited(stopOfferAlarm());
    unawaited(_fcmForeground?.cancel());
    unawaited(_fcmOpened?.cancel());
    unawaited(_fcmTokenRefresh?.cancel());
    unawaited(_authSub?.cancel());
    unawaited(_positionSub?.cancel());
    if (_listeningTaskData) {
      FlutterForegroundTask.removeTaskDataCallback(_onTaskData);
      _listeningTaskData = false;
    }
    super.dispose();
  }
}
