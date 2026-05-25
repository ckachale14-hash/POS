package com.portionspot.pos

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.Executors

private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

class BluetoothBridge(private val context: Context) {

    private val executor = Executors.newCachedThreadPool()

    private fun adapter(): BluetoothAdapter? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
            context.getSystemService(BluetoothManager::class.java)?.adapter
        else
            @Suppress("DEPRECATION") BluetoothAdapter.getDefaultAdapter()

    private fun hasBtPermission(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) ==
            PackageManager.PERMISSION_GRANTED

    fun pairedDevicesJson(): String {
        if (!hasBtPermission()) return JSONArray().toString()
        val arr = JSONArray()
        adapter()?.bondedDevices?.forEach { dev ->
            arr.put(JSONObject().apply {
                put("name", dev.name ?: "Unknown")
                put("address", dev.address)
            })
        }
        return arr.toString()
    }

    /**
     * Connects and prints on a background thread; calls [callback] with true on success.
     * Socket connect is capped at 5 seconds to avoid hanging the caller indefinitely.
     */
    fun print(hexData: String, macAddress: String, callback: (Boolean) -> Unit) {
        if (!hasBtPermission()) { callback(false); return }
        val ad = adapter() ?: run { callback(false); return }
        val device = try { ad.getRemoteDevice(macAddress) }
                     catch (_: Exception) { callback(false); return }
        val bytes = hexData.trim().split("\\s+".toRegex())
            .mapNotNull { it.toIntOrNull(16)?.toByte() }
            .toByteArray()

        executor.execute {
            var socket: BluetoothSocket? = null
            val ok = try {
                socket = device.createRfcommSocketToServiceRecord(SPP_UUID)
                ad.cancelDiscovery()

                val connectThread = Thread { socket.connect() }
                connectThread.start()
                connectThread.join(5_000L)
                if (connectThread.isAlive) {
                    connectThread.interrupt()
                    false
                } else {
                    socket.outputStream.write(bytes)
                    socket.outputStream.flush()
                    true
                }
            } catch (_: Exception) {
                false
            } finally {
                try { socket?.close() } catch (_: Exception) {}
            }
            callback(ok)
        }
    }
}
