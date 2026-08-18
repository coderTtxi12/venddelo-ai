import 'dart:io';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

const offerPushChannel = MethodChannel('com.mexy.mexy_rider/notifications');

const offerAlarmRepeatCount = 8;

({String title, String body}) foregroundOfferCopy({
  String? title,
  String? body,
}) {
  return (
    title: title ?? 'Nueva oferta',
    body: body ?? 'Tienes un nuevo pedido. Ábrelo para aceptar.',
  );
}

String? offerIdFromPushData(Map<dynamic, dynamic> data) {
  final offerId = data['offer_id'];
  if (offerId is! String || offerId.isEmpty) {
    return null;
  }
  return offerId;
}

bool shouldStartOfferAlarm({
  required String? nextOfferId,
  required String? alarmedOfferId,
}) {
  return nextOfferId != null && nextOfferId != alarmedOfferId;
}

bool shouldStopOfferAlarm({
  required String? nextOfferId,
  required String? alarmedOfferId,
}) {
  return alarmedOfferId != null && nextOfferId != alarmedOfferId;
}

Future<void> startOfferAlarm({
  String? title,
  String? body,
  String? offerId,
}) async {
  if (kIsWeb || !Platform.isAndroid) {
    return;
  }
  final copy = foregroundOfferCopy(title: title, body: body);
  try {
    await offerPushChannel.invokeMethod<void>('startOfferAlarm', {
      'title': copy.title,
      'body': copy.body,
      if (offerId != null && offerId.isNotEmpty) 'offerId': offerId,
    });
  } catch (error) {
    debugPrint('Offer alarm failed: $error');
  }
}

Future<void> stopOfferAlarm() async {
  if (kIsWeb || !Platform.isAndroid) {
    return;
  }
  try {
    await offerPushChannel.invokeMethod<void>('stopOfferAlarm');
  } catch (error) {
    debugPrint('Stop offer alarm failed: $error');
  }
}

Future<void> showForegroundOfferNotification(RemoteMessage message) async {
  await startOfferAlarm(
    title: message.notification?.title,
    body: message.notification?.body,
    offerId: offerIdFromPushData(message.data),
  );
}
