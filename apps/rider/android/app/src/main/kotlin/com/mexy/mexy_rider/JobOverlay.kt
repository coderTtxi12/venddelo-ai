package com.mexy.mexy_rider

import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageView
import kotlin.math.hypot

object JobOverlay {
    var onDismissed: (() -> Unit)? = null

    private var windowManager: WindowManager? = null
    private var bubble: View? = null
    private var closeHint: View? = null
    private var params: WindowManager.LayoutParams? = null
    private var dragging = false
    private var wanted = false
    private var host: Context? = null
    private var detaching = false
    private var reattachAttempts = 0
    private val mainHandler = Handler(Looper.getMainLooper())

    fun hasPermission(context: Context): Boolean {
        return Settings.canDrawOverlays(context)
    }

    fun show(context: Context) {
        wanted = true
        host = context
        reattachAttempts = 0
        if (!hasPermission(context)) {
            return
        }
        val existing = bubble
        if (existing != null && existing.isAttachedToWindow) {
            return
        }
        attach(context)
    }

    fun hide() {
        wanted = false
        host = null
        reattachAttempts = 0
        detach()
    }

    private fun attach(context: Context) {
        if (!wanted) {
            return
        }
        detach()
        val wm = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        windowManager = wm
        val density = context.resources.displayMetrics
        val size = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 56f, density).toInt()
        val margin = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 12f, density).toInt()
        val screenW = density.widthPixels
        val screenH = density.heightPixels

        val layout = FrameLayout(context).apply {
            alpha = 0.82f
            elevation = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 8f, density)
        }
        val image = ImageView(context).apply {
            setImageResource(R.mipmap.ic_mexy_bubble)
            scaleType = ImageView.ScaleType.FIT_CENTER
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES
            contentDescription = "Volver a Mexy"
        }
        layout.addView(image, FrameLayout.LayoutParams(size, size))

        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }
        val bubbleParams = WindowManager.LayoutParams(
            size,
            size,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
                WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = screenW - size - margin
            y = (screenH * 0.38f).toInt()
        }
        params = bubbleParams

        var startX = 0
        var startY = 0
        var touchStartX = 0f
        var touchStartY = 0f
        layout.setOnTouchListener { _, event ->
            val current = params ?: return@setOnTouchListener false
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    dragging = false
                    startX = current.x
                    startY = current.y
                    touchStartX = event.rawX
                    touchStartY = event.rawY
                    showCloseHint(context, size)
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = event.rawX - touchStartX
                    val dy = event.rawY - touchStartY
                    if (hypot(dx.toDouble(), dy.toDouble()) > 12) {
                        dragging = true
                    }
                    current.x = startX + dx.toInt()
                    current.y = startY + dy.toInt()
                    runCatching { wm.updateViewLayout(layout, current) }
                    true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    hideCloseHint()
                    val dx = event.rawX - touchStartX
                    val dy = event.rawY - touchStartY
                    if (!dragging && hypot(dx.toDouble(), dy.toDouble()) < 12) {
                        openApp(context)
                    } else if (current.y + size > screenH - TypedValue.applyDimension(
                            TypedValue.COMPLEX_UNIT_DIP,
                            88f,
                            density,
                        )
                    ) {
                        hide()
                        onDismissed?.invoke()
                    } else {
                        current.x = if (current.x + size / 2 < screenW / 2) margin else screenW - size - margin
                        current.y = current.y.coerceIn(margin, screenH - size - margin)
                        runCatching { wm.updateViewLayout(layout, current) }
                    }
                    true
                }
                else -> false
            }
        }
        layout.addOnAttachStateChangeListener(object : View.OnAttachStateChangeListener {
            override fun onViewAttachedToWindow(v: View) {}

            override fun onViewDetachedFromWindow(v: View) {
                if (!wanted || detaching || v !== bubble) {
                    return
                }
                scheduleReattach()
            }
        })

        bubble = layout
        runCatching { wm.addView(layout, bubbleParams) }.onFailure {
            if (bubble === layout) {
                bubble = null
                params = null
                windowManager = null
            }
            scheduleReattach()
        }
    }

    private fun scheduleReattach() {
        if (!wanted || reattachAttempts >= 3) {
            return
        }
        reattachAttempts += 1
        val next = host ?: return
        mainHandler.post {
            if (!wanted || bubble?.isAttachedToWindow == true) {
                return@post
            }
            attach(next)
        }
    }

    private fun detach() {
        detaching = true
        try {
            val wm = windowManager
            bubble?.let { view ->
                runCatching { wm?.removeView(view) }
            }
            hideCloseHint()
        } finally {
            bubble = null
            params = null
            windowManager = null
            dragging = false
            detaching = false
        }
    }

    private fun showCloseHint(context: Context, bubbleSize: Int) {
        if (closeHint != null) return
        val wm = windowManager ?: return
        val density = context.resources.displayMetrics
        val height = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 56f, density).toInt()
        val hint = ImageView(context).apply {
            setImageResource(android.R.drawable.ic_menu_close_clear_cancel)
            setColorFilter(0xFFFFFFFF.toInt())
            setBackgroundColor(0x99000000.toInt())
            setPadding(bubbleSize / 3, bubbleSize / 4, bubbleSize / 3, bubbleSize / 4)
            alpha = 0.9f
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        }
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }
        val hintParams = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            height,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.BOTTOM
        }
        closeHint = hint
        runCatching { wm.addView(hint, hintParams) }
    }

    private fun hideCloseHint() {
        val wm = windowManager
        closeHint?.let { view ->
            runCatching { wm?.removeView(view) }
        }
        closeHint = null
    }

    private fun openApp(context: Context) {
        hide()
        val launch = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_SINGLE_TOP or
                Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
        }
        context.startActivity(launch)
        runCatching {
            context.startService(
                Intent(context, JobOverlayService::class.java).apply {
                    action = JobOverlayService.ACTION_HIDE
                },
            )
        }
    }
}
