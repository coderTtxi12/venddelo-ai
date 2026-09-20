package com.mexy.mexy_rider

import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
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

    fun hasPermission(context: Context): Boolean {
        return Settings.canDrawOverlays(context)
    }

    fun show(context: Context) {
        val app = context.applicationContext
        if (!hasPermission(app) || bubble != null) {
            return
        }
        val wm = app.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        windowManager = wm
        val density = app.resources.displayMetrics
        val size = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 56f, density).toInt()
        val margin = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 12f, density).toInt()
        val screenW = density.widthPixels
        val screenH = density.heightPixels

        val layout = FrameLayout(app).apply {
            alpha = 0.82f
            elevation = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, 8f, density)
        }
        val image = ImageView(app).apply {
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
                    showCloseHint(app, size)
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
                        openApp(app)
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

        bubble = layout
        runCatching { wm.addView(layout, bubbleParams) }.onFailure {
            bubble = null
            params = null
            windowManager = null
        }
    }

    fun hide() {
        val wm = windowManager
        bubble?.let { view ->
            runCatching { wm?.removeView(view) }
        }
        hideCloseHint()
        bubble = null
        params = null
        windowManager = null
        dragging = false
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
    }
}
