package com.mexy.mexy_rider

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.os.Build

object OemBackgroundPopup {
    fun isRequired(): Boolean {
        val name = "${Build.MANUFACTURER} ${Build.BRAND}".lowercase()
        return name.contains("xiaomi") || name.contains("redmi") || name.contains("poco")
    }

    fun open(context: Context): Boolean {
        if (!isRequired()) {
            return false
        }
        val pkg = context.packageName
        val screens = listOf(
            "com.miui.permcenter.permissions.PermissionsEditorActivity",
            "com.miui.permcenter.permissions.AppPermissionsEditorActivity",
        )
        for (screen in screens) {
            val intent = Intent("miui.intent.action.APP_PERM_EDITOR").apply {
                setClassName("com.miui.securitycenter", screen)
                putExtra("extra_pkgname", pkg)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            try {
                context.startActivity(intent)
                return true
            } catch (_: ActivityNotFoundException) {
            } catch (_: SecurityException) {
            }
        }
        return false
    }
}
