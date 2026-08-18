package com.mexy.mexy_rider

import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val notificationsChannel = "com.mexy.mexy_rider/notifications"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        OfferAlarm.ensureChannel(this)
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, notificationsChannel)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "startOfferAlarm", "showOffer" -> {
                        val title = call.argument<String>("title") ?: "Nueva oferta"
                        val body = call.argument<String>("body")
                            ?: "Tienes un nuevo pedido. Ábrelo para aceptar."
                        val offerId = call.argument<String>("offerId")
                        OfferAlarm.start(this, title, body, offerId)
                        result.success(null)
                    }
                    "stopOfferAlarm" -> {
                        OfferAlarm.stop(this)
                        result.success(null)
                    }
                    else -> result.notImplemented()
                }
            }
    }
}
