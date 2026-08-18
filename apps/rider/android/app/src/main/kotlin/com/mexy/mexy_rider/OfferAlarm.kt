package com.mexy.mexy_rider

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

object OfferAlarm {
    const val CHANNEL_ID = "offers_alarm"
    private const val HEADS_CHANNEL_ID = "offers_heads"
    private const val NOTIFICATION_ID = 91001
    private const val WAKE_LOCK_MS = 30_000L

    private val vibratePattern = longArrayOf(
        0, 600, 140, 600, 140, 800, 140, 600,
        140, 600, 140, 900, 140, 600, 140, 600,
        140, 800, 140, 600, 140, 600, 140, 1000,
    )

    @Volatile
    private var playing = false
    private var activeOfferId: String? = null
    private var player: MediaPlayer? = null
    private var previousAlarmVolume: Int? = null
    private var wakeLock: PowerManager.WakeLock? = null

    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return
        }
        val sound = Uri.parse(
            "android.resource://${context.packageName}/${R.raw.bells}",
        )
        val attributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .setFlags(AudioAttributes.FLAG_AUDIBILITY_ENFORCED)
            .build()
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Ofertas de entrega",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "Alarma fuerte cuando llega un pedido nuevo"
            setSound(sound, attributes)
            enableVibration(true)
            vibrationPattern = vibratePattern
            enableLights(true)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        }
        context.getSystemService(NotificationManager::class.java)
            .createNotificationChannel(channel)

        val heads = NotificationChannel(
            HEADS_CHANNEL_ID,
            "Ofertas en la app",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "Aviso visual; el sonido lo reproduce la alarma"
            setSound(null, null)
            enableVibration(false)
            setShowBadge(true)
        }
        context.getSystemService(NotificationManager::class.java)
            .createNotificationChannel(heads)
    }

    @Synchronized
    fun start(context: Context, title: String, body: String, offerId: String? = null) {
        val app = context.applicationContext
        ensureChannel(app)
        if (playing && (offerId == null || offerId == activeOfferId)) {
            return
        }
        if (playing) {
            stop(app)
        }
        playing = true
        activeOfferId = offerId
        maxAlarmVolume(app)
        acquireWakeLock(app)
        showNotification(app, title, body)
        startVibration(app)
        playBells(app)
    }

    @Synchronized
    fun stop(context: Context) {
        val app = context.applicationContext
        playing = false
        activeOfferId = null
        player?.setOnCompletionListener(null)
        try {
            player?.stop()
        } catch (_: IllegalStateException) {
        }
        player?.release()
        player = null
        stopVibration(app)
        restoreAlarmVolume(app)
        releaseWakeLock()
    }

    private fun playBells(context: Context) {
        try {
            val mediaPlayer = MediaPlayer()
            player = mediaPlayer
            mediaPlayer.setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setFlags(AudioAttributes.FLAG_AUDIBILITY_ENFORCED)
                    .build(),
            )
            mediaPlayer.setVolume(1f, 1f)
            mediaPlayer.isLooping = false
            val asset = context.resources.openRawResourceFd(R.raw.bells)
            mediaPlayer.setDataSource(asset.fileDescriptor, asset.startOffset, asset.length)
            asset.close()
            mediaPlayer.setOnCompletionListener {
                stop(context)
            }
            mediaPlayer.setOnPreparedListener { prepared ->
                if (playing) {
                    prepared.start()
                }
            }
            mediaPlayer.prepareAsync()
        } catch (_: Exception) {
            // Vibration + heads-up still run if the wav cannot start.
        }
    }

    private fun showNotification(context: Context, title: String, body: String) {
        val launch = PendingIntent.getActivity(
            context,
            0,
            Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(context, HEADS_CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(body)
                .setContentIntent(launch)
                .setCategory(Notification.CATEGORY_ALARM)
                .setAutoCancel(true)
                .setOngoing(false)
                .setFullScreenIntent(launch, true)
                .build()
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(context)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(body)
                .setContentIntent(launch)
                .setPriority(Notification.PRIORITY_MAX)
                .setAutoCancel(true)
                .build()
        }
        context.getSystemService(NotificationManager::class.java)
            .notify(NOTIFICATION_ID, notification)
    }

    private fun startVibration(context: Context) {
        val vibrator = vibrator(context)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(
                VibrationEffect.createWaveform(vibratePattern, 0),
            )
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(vibratePattern, 0)
        }
    }

    private fun stopVibration(context: Context) {
        vibrator(context).cancel()
    }

    private fun vibrator(context: Context): Vibrator {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            context.getSystemService(VibratorManager::class.java).defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Vibrator::class.java)
        }
    }

    private fun maxAlarmVolume(context: Context) {
        val audio = context.getSystemService(AudioManager::class.java)
        previousAlarmVolume = audio.getStreamVolume(AudioManager.STREAM_ALARM)
        audio.setStreamVolume(
            AudioManager.STREAM_ALARM,
            audio.getStreamMaxVolume(AudioManager.STREAM_ALARM),
            0,
        )
    }

    private fun restoreAlarmVolume(context: Context) {
        val previous = previousAlarmVolume ?: return
        previousAlarmVolume = null
        context.getSystemService(AudioManager::class.java)
            .setStreamVolume(AudioManager.STREAM_ALARM, previous, 0)
    }

    private fun acquireWakeLock(context: Context) {
        releaseWakeLock()
        val lock = context.getSystemService(PowerManager::class.java)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "mexy:offerAlarm")
        lock.setReferenceCounted(false)
        lock.acquire(WAKE_LOCK_MS)
        wakeLock = lock
    }

    private fun releaseWakeLock() {
        if (wakeLock?.isHeld == true) {
            wakeLock?.release()
        }
        wakeLock = null
    }
}
