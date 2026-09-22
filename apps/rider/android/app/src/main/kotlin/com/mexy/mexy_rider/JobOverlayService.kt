package com.mexy.mexy_rider

import android.app.Service
import android.content.Intent
import android.os.IBinder

class JobOverlayService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_SHOW -> JobOverlay.show(this)
            ACTION_HIDE -> {
                JobOverlay.hide()
                stopSelf(startId)
            }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        JobOverlay.hide()
        super.onDestroy()
    }

    companion object {
        const val ACTION_SHOW = "com.mexy.mexy_rider.overlay.SHOW"
        const val ACTION_HIDE = "com.mexy.mexy_rider.overlay.HIDE"
    }
}
