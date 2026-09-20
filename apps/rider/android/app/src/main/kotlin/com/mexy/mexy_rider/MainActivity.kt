package com.mexy.mexy_rider

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val notificationsChannel = "com.mexy.mexy_rider/notifications"
    private val overlayChannelName = "com.mexy.mexy_rider/overlay"

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

        val overlayChannel = MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            overlayChannelName,
        )
        JobOverlay.onDismissed = {
            runOnUiThread {
                overlayChannel.invokeMethod("overlayDismissed", null)
            }
        }
        overlayChannel.setMethodCallHandler { call, result ->
            when (call.method) {
                "hasPermission" -> result.success(JobOverlay.hasPermission(this))
                "requestPermission" -> {
                    val intent = Intent(
                        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:$packageName"),
                    )
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    startActivity(intent)
                    result.success(null)
                }
                "show" -> {
                    JobOverlay.show(this)
                    result.success(null)
                }
                "hide" -> {
                    JobOverlay.hide()
                    result.success(null)
                }
                else -> result.notImplemented()
            }
        }
    }
}
