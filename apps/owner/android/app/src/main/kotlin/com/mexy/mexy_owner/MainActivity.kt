package com.mexy.mexy_owner

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothManager
import android.content.pm.PackageManager
import android.hardware.usb.UsbManager
import android.os.Build
import androidx.core.content.ContextCompat
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private var pendingBluetooth: MethodChannel.Result? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "capabilities" -> result.success(capabilities())
                    "requestBluetooth" -> requestBluetooth(result)
                    "bondedPrinters" -> result.success(bondedPrinters())
                    "usbPrinters" -> result.success(usbPrinters())
                    else -> result.notImplemented()
                }
            }
    }

    private fun capabilities(): Map<String, Any> {
        return mapOf(
            "platform" to "android",
            "bluetooth" to (getSystemService(BluetoothManager::class.java)?.adapter != null),
            "usb" to packageManager.hasSystemFeature(PackageManager.FEATURE_USB_HOST),
            "network" to true,
            "note" to "Bluetooth muestra impresoras ya vinculadas en los ajustes del teléfono. USB lista lo que está conectado.",
        )
    }

    private fun requestBluetooth(result: MethodChannel.Result) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            result.success(true)
            return
        }
        val granted = ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.BLUETOOTH_CONNECT,
        ) == PackageManager.PERMISSION_GRANTED
        if (granted) {
            result.success(true)
            return
        }
        pendingBluetooth = result
        requestPermissions(arrayOf(Manifest.permission.BLUETOOTH_CONNECT), BLUETOOTH_REQUEST)
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != BLUETOOTH_REQUEST) return
        val granted = grantResults.isNotEmpty() &&
            grantResults[0] == PackageManager.PERMISSION_GRANTED
        pendingBluetooth?.success(granted)
        pendingBluetooth = null
    }

    private fun bondedPrinters(): Map<String, Any?> {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
            ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.BLUETOOTH_CONNECT,
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            return mapOf(
                "printers" to emptyList<Map<String, String>>(),
                "needsPermission" to true,
                "message" to "Permite Bluetooth para ver impresoras vinculadas.",
            )
        }
        val adapter = getSystemService(BluetoothManager::class.java)?.adapter
        if (adapter == null) {
            return mapOf(
                "printers" to emptyList<Map<String, String>>(),
                "needsPermission" to false,
                "message" to "Este dispositivo no tiene Bluetooth.",
            )
        }
        val printers = readBonded(adapter)
        return mapOf(
            "printers" to printers,
            "needsPermission" to false,
            "message" to if (printers.isEmpty()) "No hay impresoras Bluetooth vinculadas." else null,
        )
    }

    @SuppressLint("MissingPermission")
    private fun readBonded(adapter: android.bluetooth.BluetoothAdapter): List<Map<String, String>> {
        return adapter.bondedDevices.map { device ->
            mapOf(
                "id" to device.address,
                "name" to (device.name ?: "Impresora Bluetooth"),
                "kind" to "bluetooth",
            )
        }
    }

    private fun usbPrinters(): Map<String, Any?> {
        val manager = getSystemService(UsbManager::class.java)
        if (manager == null) {
            return mapOf(
                "printers" to emptyList<Map<String, String>>(),
                "needsPermission" to false,
                "message" to "Este dispositivo no tiene puerto USB.",
            )
        }
        val printers = manager.deviceList.values.map { device ->
            val label = device.productName ?: "USB ${device.vendorId}:${device.productId}"
            mapOf(
                "id" to device.deviceName,
                "name" to label,
                "kind" to "usb",
            )
        }
        return mapOf(
            "printers" to printers,
            "needsPermission" to false,
            "message" to if (printers.isEmpty()) "No hay dispositivos USB conectados." else null,
        )
    }

    companion object {
        private const val CHANNEL = "com.mexy.owner/printer"
        private const val BLUETOOTH_REQUEST = 41
    }
}
