package com.portionspot.pos

import android.app.Application
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.content.pm.PackageManager
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import woyou.aidlservice.jiuiv5.IWoyouService

class PosApplication : Application() {

    var printerService: IWoyouService? = null
    var isPrinterBound = false
    var lastBindLog    = "Not attempted yet"

    /** Every printer-related package found on this device (populated on first bind attempt). */
    val discoveredPrinterPackages = mutableListOf<String>()

    /** The component that successfully bound, if any. */
    var boundComponent: String = ""

    val bluetoothBridge: BluetoothBridge by lazy { BluetoothBridge(applicationContext) }

    private val handler    = Handler(Looper.getMainLooper())
    var retryCount = 0
    val maxRetries = 10

    private val printerConn = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName, binder: IBinder) {
            printerService  = IWoyouService.Stub.asInterface(binder)
            isPrinterBound  = true
            retryCount      = 0
            boundComponent  = name.flattenToString()
            lastBindLog     = "Connected: $boundComponent"
            Log.d("PSPrinter", lastBindLog)
        }
        override fun onServiceDisconnected(name: ComponentName) {
            printerService = null
            isPrinterBound = false
            boundComponent = ""
            lastBindLog    = "Disconnected — rebinding"
            Log.d("PSPrinter", lastBindLog)
            bindPrinter()
        }
    }

    override fun onCreate() {
        super.onCreate()
        bindPrinter()
    }

    fun bindPrinter() {
        if (isPrinterBound) return

        val candidates = buildCandidates()

        var bound = false
        for (intent in candidates) {
            val label = intent.component?.flattenToString()
                ?: "${intent.`package`} / ${intent.action}"
            val ok = tryBind(intent, label)
            if (ok) { bound = true; break }
        }

        if (!bound && retryCount < maxRetries) {
            retryCount++
            lastBindLog = "All candidates failed — retry $retryCount/$maxRetries in 3 s"
            Log.d("PSPrinter", lastBindLog)
            handler.postDelayed({ bindPrinter() }, 3_000L)
        } else if (!bound) {
            lastBindLog = "All $maxRetries retries exhausted — printer unavailable"
            Log.d("PSPrinter", lastBindLog)
        }
    }

    /**
     * Builds the full candidate list: well-known static entries first,
     * then every service component found by scanning installed packages
     * whose name contains a printer-related keyword.
     *
     * Scanning covers Android 9 (VS1-G) where package visibility is unrestricted.
     * On Android 11+ only packages declared in <queries> are visible, so we also
     * include action-based intents that work without knowing the package name.
     */
    private fun buildCandidates(): List<Intent> {
        val static = listOf(

            // ── woyou.aidlservice.jiuiv5 (V1s-G confirmed — package IS the AIDL namespace) ──
            Intent().apply { component = ComponentName("woyou.aidlservice.jiuiv5", "woyou.aidlservice.jiuiv5.WoyouService") },
            Intent().apply { component = ComponentName("woyou.aidlservice.jiuiv5", "woyou.aidlservice.jiuiv5.SubscribeService") },
            Intent().apply { component = ComponentName("woyou.aidlservice.jiuiv5", "woyou.aidlservice.jiuiv5.AppendPrintingService") },
            Intent().apply { `package` = "woyou.aidlservice.jiuiv5"; action = "woyou.aidlservice.jiuiv5.IWoyouService" },

            // ── com.inner.service (some V1s variants) ────────────────────────
            Intent().apply { component = ComponentName("com.inner.service", "com.inner.service.InnerService") },
            Intent().apply { component = ComponentName("com.inner.service", "com.inner.service.InnerPrinterService") },
            Intent().apply { `package` = "com.inner.service"; action = "com.inner.service" },
            Intent().apply { `package` = "com.inner.service"; action = "woyou.aidlservice.jiuiv5.IWoyouService" },

            // ── com.sunmi.innerprinter (newer V-series) ──────────────────────
            Intent().apply { component = ComponentName("com.sunmi.innerprinter", "com.sunmi.innerprinter.InnerPrinterService") },
            Intent().apply { `package` = "com.sunmi.innerprinter"; action = "woyou.aidlservice.jiuiv5.IWoyouService" },
            Intent().apply { `package` = "com.sunmi.innerprinter"; action = "com.sunmi.innerprinter" },

            // ── com.sunmi.printerservice (T/P/S-series) ─────────────────────
            Intent().apply { component = ComponentName("com.sunmi.printerservice", "com.sunmi.printerservice.PrinterService") },
            Intent().apply { `package` = "com.sunmi.printerservice"; action = "woyou.aidlservice.jiuiv5.IWoyouService" },

            // ── woyou.jiuiv5 (older firmware variant) ────────────────────────
            Intent().apply { component = ComponentName("woyou.jiuiv5", "woyou.aidlservice.jiuiv5.WoyouService") },
            Intent().apply { component = ComponentName("woyou.jiuiv5", "woyou.jiuiv5.WoyouRemoteService") },
            Intent().apply { `package` = "woyou.jiuiv5"; action = "woyou.aidlservice.jiuiv5.IWoyouService" },

            // ── com.sunmi.extprinterservice (external/USB) ───────────────────
            Intent().apply { `package` = "com.sunmi.extprinterservice"; action = "com.sunmi.extprinterservice" },

            // ── Action-only (no package — Android resolves at runtime) ───────
            Intent("woyou.aidlservice.jiuiv5.IWoyouService"),
            Intent("com.sunmi.innerprinter.IInnerPrinterService"),
        )

        // ── Dynamic discovery: scan every installed package ──────────────────
        val dynamic = mutableListOf<Intent>()
        val keywords = listOf("sunmi", "woyou", "inner", "printer", "thermal")
        try {
            val flags = if (android.os.Build.VERSION.SDK_INT >= 33)
                PackageManager.PackageInfoFlags.of(PackageManager.GET_SERVICES.toLong())
            else
                @Suppress("DEPRECATION") PackageManager.GET_SERVICES
            val packages = if (android.os.Build.VERSION.SDK_INT >= 33)
                packageManager.getInstalledPackages(flags as PackageManager.PackageInfoFlags)
            else
                @Suppress("DEPRECATION") packageManager.getInstalledPackages(PackageManager.GET_SERVICES)

            for (pkg in packages) {
                val name = pkg.packageName.lowercase()
                if (keywords.none { name.contains(it) }) continue

                if (!discoveredPrinterPackages.contains(pkg.packageName)) {
                    discoveredPrinterPackages.add(pkg.packageName)
                }
                Log.d("PSPrinter", "Discovered package: ${pkg.packageName}")

                val services = pkg.services ?: continue
                for (svc in services) {
                    // Skip services we already have in the static list
                    val comp = ComponentName(pkg.packageName, svc.name)
                    val alreadyCovered = static.any { it.component == comp }
                    if (!alreadyCovered) {
                        dynamic.add(Intent().apply { component = comp })
                        Log.d("PSPrinter", "  + dynamic candidate: ${svc.name}")
                    }
                }
            }
        } catch (e: Exception) {
            Log.d("PSPrinter", "Package scan failed: ${e.message}")
        }

        return static + dynamic
    }

    private fun tryBind(intent: Intent, label: String): Boolean {
        return try {
            val ok = bindService(intent, printerConn, Context.BIND_AUTO_CREATE)
            Log.d("PSPrinter", "  tryBind($label) = $ok")
            if (ok) lastBindLog = "Binding: $label (waiting for onServiceConnected)"
            ok
        } catch (e: Exception) {
            Log.d("PSPrinter", "  tryBind($label) threw: ${e.message}")
            false
        }
    }
}
