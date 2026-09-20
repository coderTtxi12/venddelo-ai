import 'dart:async';
import 'dart:io';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'api.dart';
import 'config.dart';
import 'countdown.dart';
import 'friendly_error.dart';
import 'job_overlay.dart';
import 'job_overlay_platform.dart';
import 'location_auth.dart';
import 'location_ping.dart';
import 'location_task.dart';
import 'models.dart';
import 'offer_push.dart';
import 'rider_permissions.dart';
import 'rider_socket.dart';

class RiderController extends ChangeNotifier {
  RiderController({
    RiderApi? api,
    Future<bool> Function()? openAppSettingsImpl,
    JobOverlayPlatform? overlayPlatform,
  }) : _api =
           api ??
           RiderApi(
             tokenProvider: () =>
                 Supabase.instance.client.auth.currentSession?.accessToken,
           ),
       _openAppSettings = openAppSettingsImpl ?? Geolocator.openAppSettings,
       _overlay = overlayPlatform ?? JobOverlayPlatform();

  final RiderApi _api;
  final Future<bool> Function() _openAppSettings;
  final JobOverlayPlatform _overlay;

  RiderProfile? profile;
  RiderOffer? offer;
  String? errorMessage;
  bool loading = true;
  bool notRegistered = false;
  bool onlineBusy = false;
  bool offerBusy = false;
  bool needsLocationSettings = false;
  bool overlayEnabled = true;
  Position? currentPosition;
  AppLifecycleState lifecycleState = AppLifecycleState.resumed;

  Timer? _offerPoll;
  Timer? _mePoll;
  Timer? _locationPing;
  DateTime? _lastLocationPingAt;
  bool _locationPingInFlight = false;
  RiderSocket? _socket;
  RiderSocketStatus _socketStatus = RiderSocketStatus.offline;
  final Set<String> _dismissedExpiredOfferIds = {};
  StreamSubscription<RemoteMessage>? _fcmForeground;
  StreamSubscription<RemoteMessage>? _fcmOpened;
  StreamSubscription<String>? _fcmTokenRefresh;
  StreamSubscription<AuthState>? _authSub;
  StreamSubscription<Position>? _positionSub;
  StreamSubscription<Position>? _onlineLocationSub;
  bool _listeningTaskData = false;
  String? _alarmedOfferId;
  String? _dismissedOverlaySignature;
  bool _askedOverlayPermission = false;

  Future<void> bootstrap() async {
    loading = true;
    errorMessage = null;
    notRegistered = false;
    notifyListeners();
    _listenTaskData();
    _listenAuth();
    _listenOverlay();
    await _loadOverlaySetting();
    try {
      await refreshMe();
      if (profile?.mustUpdate == true) {
        await _stopOnlineServices();
        return;
      }
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
    unawaited(syncJobOverlay());
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
      if (profile?.mustUpdate == true) {
        unawaited(_stopOnlineServices());
        return;
      }
      if (recovered) {
        unawaited(_setupFcm());
        if (profile?.isOnline == true) {
          unawaited(_startOnlineServices());
        }
      }
      unawaited(syncJobOverlay());
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
    if (isOnline && profile?.mustUpdate == true) {
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
    _startIosLocationPings();
    await _ensureRiderSocket();
    _syncOfferPollWithSocket();
    await refreshOffers();
  }

  void _startIosLocationPings() {
    _locationPing?.cancel();
    _locationPing = null;
    unawaited(_onlineLocationSub?.cancel());
    _onlineLocationSub = null;
    if (kIsWeb || !Platform.isIOS) {
      return;
    }
    _onlineLocationSub = Geolocator.getPositionStream(
      locationSettings: riderBackgroundLocationSettings(),
    ).listen(
      (position) {
        currentPosition = position;
        notifyListeners();
        unawaited(_postLiveLocation(position: position));
      },
      onError: (_) {},
    );
    _locationPing = Timer.periodic(locationPingInterval, (_) {
      unawaited(_postLiveLocation());
    });
    unawaited(_postLiveLocation());
  }

  Future<void> _postLiveLocation({Position? position}) async {
    if (profile?.isOnline != true || _locationPingInFlight) {
      return;
    }
    final now = DateTime.now();
    if (!shouldSendLocationPing(now: now, lastSentAt: _lastLocationPingAt)) {
      return;
    }
    _locationPingInFlight = true;
    try {
      var next = position ?? currentPosition;
      next ??= await Geolocator.getLastKnownPosition();
      next ??= await Geolocator.getCurrentPosition(
        locationSettings: riderBackgroundLocationSettings(
          timeLimit: const Duration(seconds: 4),
        ),
      );
      currentPosition = next;
      await _api.postLocation(next.latitude, next.longitude);
      _lastLocationPingAt = DateTime.now();
    } catch (_) {
    } finally {
      _locationPingInFlight = false;
    }
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

  void clearExpiredOffer() {
    final current = offer;
    if (current == null || !isOfferCountdownExpired(current.expiresAt)) {
      return;
    }
    _dismissedExpiredOfferIds.add(current.id);
    _applyOffer(null);
    notifyListeners();
    if (profile?.isOnline == true) {
      unawaited(refreshOffers());
    }
  }

  void _applyOffer(RiderOffer? next) {
    offer = visibleOfferIgnoringDismissedExpiry(
      offer: next,
      idOf: (item) => item.id,
      expiresAtOf: (item) => item.expiresAt,
      dismissedExpiredIds: _dismissedExpiredOfferIds,
    );
    _syncOfferAlarm(offer?.id);
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
    _locationPing?.cancel();
    _locationPing = null;
    await _onlineLocationSub?.cancel();
    _onlineLocationSub = null;
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

  void _listenOverlay() {
    _overlay.onDismissed = onOverlayDismissed;
    _overlay.listen();
  }

  Future<void> _loadOverlaySetting() async {
    final prefs = await SharedPreferences.getInstance();
    overlayEnabled = jobOverlayEnabledFromStored(
      prefs.getBool(jobOverlayPrefKey),
    );
  }

  Iterable<String> _activeJobIds() {
    return (profile?.assignments ?? const [])
        .where((item) => isActiveDeliveryJob(item.status))
        .map((item) => item.id);
  }

  void onAppLifecycle(AppLifecycleState state) {
    lifecycleState = state;
    unawaited(syncJobOverlay());
  }

  void onOverlayDismissed() {
    _dismissedOverlaySignature = jobOverlaySignature(_activeJobIds());
    unawaited(syncJobOverlay());
  }

  Future<void> setOverlayEnabled(bool value) async {
    overlayEnabled = value;
    if (value) {
      _dismissedOverlaySignature = null;
      _askedOverlayPermission = false;
    }
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(jobOverlayPrefKey, value);
    if (value) {
      final granted = await _overlay.hasPermission();
      if (!granted) {
        await _overlay.requestPermission();
      }
      _askedOverlayPermission = true;
    }
    await syncJobOverlay();
  }

  Future<void> syncJobOverlay() async {
    if (!_overlay.isSupported) {
      return;
    }
    final jobs = _activeJobIds();
    final signature = jobOverlaySignature(jobs);
    if (signature.isEmpty) {
      _dismissedOverlaySignature = null;
    }
    final dismissed = isOverlayDismissed(
      dismissedSignature: _dismissedOverlaySignature,
      currentSignature: signature,
    );
    if (overlayEnabled &&
        jobs.isNotEmpty &&
        lifecycleState == AppLifecycleState.resumed &&
        !_askedOverlayPermission) {
      final granted = await _overlay.hasPermission();
      if (!granted) {
        _askedOverlayPermission = true;
        await _overlay.requestPermission();
      }
    }
    final hasPermission = await _overlay.hasPermission();
    final show = shouldShowJobOverlay(
      JobOverlayDecision(
        enabledInSettings: overlayEnabled,
        hasActiveJob: jobs.isNotEmpty,
        appInBackground: lifecycleState != AppLifecycleState.resumed,
        overlayPermissionGranted: hasPermission,
        dismissedThisJob: dismissed,
      ),
    );
    if (show) {
      await _overlay.show();
    } else {
      await _overlay.hide();
    }
  }

  @override
  void dispose() {
    _offerPoll?.cancel();
    _mePoll?.cancel();
    _locationPing?.cancel();
    unawaited(_socket?.stop());
    _socket = null;
    unawaited(stopOfferAlarm());
    unawaited(_fcmForeground?.cancel());
    unawaited(_fcmOpened?.cancel());
    unawaited(_fcmTokenRefresh?.cancel());
    unawaited(_authSub?.cancel());
    unawaited(_positionSub?.cancel());
    unawaited(_onlineLocationSub?.cancel());
    unawaited(_overlay.hide());
    if (_listeningTaskData) {
      FlutterForegroundTask.removeTaskDataCallback(_onTaskData);
      _listeningTaskData = false;
    }
    super.dispose();
  }
}
