package com.portionspot.pos

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import woyou.aidlservice.jiuiv5.IWoyouService

class DiagnosticsActivity : AppCompatActivity() {

    private val app     get() = application as PosApplication
    private val printer: IWoyouService? get() = app.printerService
    private val bt      get() = app.bluetoothBridge

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        supportActionBar?.title = "Diagnostics"

        val scroll = ScrollView(this)
        val root   = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(16), dp(16), dp(32))
        }

        root.addView(sectionPrinter())
        root.addView(divider())
        root.addView(sectionPackageScan())
        root.addView(divider())
        root.addView(sectionBluetooth())
        root.addView(divider())
        root.addView(sectionNetwork())
        root.addView(divider())
        root.addView(sectionCache())
        root.addView(divider())
        root.addView(sectionAppInfo())

        scroll.addView(root)
        setContentView(scroll)
    }

    // ── Printer section ──────────────────────────────────────────────────────

    private fun sectionPrinter(): View {
        val bound = app.isPrinterBound

        return section("PRINTER") {
            addStatus("Service",   if (bound) "Connected" else "NOT CONNECTED", bound)
            if (bound) {
                addStatus("Bound to", app.boundComponent.ifEmpty { "unknown" }, true)
            }
            addStatus("Retries", "${app.retryCount}/${app.maxRetries}", app.retryCount < app.maxRetries)
            addView(label("Last: ${app.lastBindLog}").apply {
                textSize = 11f
                setPadding(0, dp(4), 0, dp(8))
            })
            addRow(
                button("Retry Bind") {
                    app.retryCount = 0
                    app.isPrinterBound = false
                    app.printerService = null
                    app.bindPrinter()
                    toast("Retrying all candidates…")
                },
                button("Test Print") { testPrint() },
            )
            addRow(
                button("Feed Paper") {
                    val svc = printer ?: run { toast("Not connected"); return@button }
                    try {
                        svc.printerInit(null)          // must init before feed
                        svc.lineWrap(8, null)
                    } catch (e: Exception) { toast("Feed error: ${e.message}") }
                },
                button("Cut Paper")  {
                    try { printer?.autoOutPaper(1, null) }
                    catch (_: Exception) { printer?.cutPaper(null) }
                },
            )
            addRow(
                button("Text Test") {
                    val svc = printer ?: run { toast("Not connected"); return@button }
                    try {
                        svc.printerInit(null)
                        svc.setAlignment(1, null)
                        svc.printText("** AIDL TEXT TEST OK **\n", null)
                        svc.setAlignment(0, null)
                        svc.lineWrap(6, null)
                        toast("Text sent — check paper")
                    } catch (e: Exception) { toast("Text test error: ${e.message}") }
                },
            )
        }
    }

    private fun testPrint() {
        val svc = printer ?: run { toast("Printer not connected"); return }
        try {
            val now = java.text.SimpleDateFormat("dd/MM/yy HH:mm", java.util.Locale.getDefault())
                .format(java.util.Date())
            svc.printerInit(null)
            svc.setAlignment(1, null)
            svc.setPrinterStyle(8, 1, null)
            svc.setFontSize(28f, null)
            svc.printText("PortionSpot POS\n", null)
            svc.setPrinterStyle(8, 0, null)
            svc.setFontSize(24f, null)
            svc.printText("*** PRINTER TEST ***\n", null)
            svc.setAlignment(0, null)
            svc.printText("------------------------\n", null)
            svc.printText("Status : OK\n", null)
            svc.printText("Bound  : ${app.boundComponent.ifEmpty { "unknown" }}\n", null)
            svc.printText("Date   : $now\n", null)
            svc.printText("Device : ${Build.MODEL}\n", null)
            svc.printText("------------------------\n", null)
            // Feed 8 lines so paper clears the slot (V1s-G has no auto-cutter)
            svc.lineWrap(8, null)
            try { svc.autoOutPaper(1, null) } catch (_: Exception) { /* no cutter — paper is ready to tear */ }
            toast("Test page sent — pull the paper out")
        } catch (e: Exception) {
            toast("Print error: ${e.message}")
        }
    }

    // ── Package scan section ─────────────────────────────────────────────────

    private fun sectionPackageScan(): View {
        return section("PRINTER PACKAGES ON DEVICE") {
            val keywords = listOf("sunmi", "woyou", "inner", "printer", "thermal")

            data class PkgInfo(val name: String, val services: List<String>)
            val found = mutableListOf<PkgInfo>()

            try {
                val flags = if (Build.VERSION.SDK_INT >= 33)
                    PackageManager.PackageInfoFlags.of(PackageManager.GET_SERVICES.toLong())
                else
                    @Suppress("DEPRECATION") PackageManager.GET_SERVICES

                val packages = if (Build.VERSION.SDK_INT >= 33)
                    packageManager.getInstalledPackages(flags as PackageManager.PackageInfoFlags)
                else
                    @Suppress("DEPRECATION") packageManager.getInstalledPackages(PackageManager.GET_SERVICES)

                for (pkg in packages) {
                    if (keywords.none { pkg.packageName.lowercase().contains(it) }) continue
                    val svcs = pkg.services?.map { it.name } ?: emptyList()
                    found.add(PkgInfo(pkg.packageName, svcs))
                }
            } catch (e: Exception) {
                addView(label("Scan error: ${e.message}"))
                return@section
            }

            if (found.isEmpty()) {
                addStatus("Result", "No printer packages found on this device", false)
                addView(label(
                    "The device has no package with 'sunmi', 'woyou', 'inner', 'printer', or 'thermal' in its name.\n" +
                    "This Sunmi model may use a completely different service name.\n" +
                    "Check Android logcat for 'PSPrinter' entries after tapping Retry Bind."
                ).apply { textSize = 11f; setPadding(0, dp(4), 0, 0) })
            } else {
                addStatus("Result", "${found.size} package(s) found", true)
                for (pkg in found) {
                    addView(label("📦 ${pkg.name}").apply {
                        textSize = 12f
                        typeface = Typeface.DEFAULT_BOLD
                        setPadding(0, dp(8), 0, dp(2))
                    })
                    if (pkg.services.isEmpty()) {
                        addView(label("  (no services)").apply { textSize = 11f; setTextColor(Color.parseColor("#6B7280")) })
                    } else {
                        for (svc in pkg.services) {
                            val shortName = if (svc.startsWith(pkg.name))
                                ".${svc.removePrefix(pkg.name)}" else svc
                            addView(label("  ↳ $shortName").apply {
                                textSize = 11f
                                setTextColor(Color.parseColor("#374151"))
                            })
                        }
                    }
                }
            }
        }
    }

    // ── Bluetooth section ────────────────────────────────────────────────────

    private fun sectionBluetooth(): View {
        return section("BLUETOOTH") {
            val listContainer = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }

            fun refresh() {
                listContainer.removeAllViews()
                val devices = try { org.json.JSONArray(bt.pairedDevicesJson()) }
                              catch (_: Exception) { org.json.JSONArray() }

                if (devices.length() == 0) {
                    listContainer.addView(
                        label("No paired devices found.\nPair printer in Android Settings → Bluetooth first.")
                    )
                } else {
                    for (i in 0 until devices.length()) {
                        val d    = devices.getJSONObject(i)
                        val name = d.optString("name", "Unknown")
                        val mac  = d.optString("address", "")
                        val row  = LinearLayout(context).apply {
                            orientation = LinearLayout.HORIZONTAL
                            setPadding(0, dp(4), 0, dp(4))
                        }
                        row.addView(label("$name\n$mac").apply {
                            layoutParams = LinearLayout.LayoutParams(
                                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f
                            )
                        })
                        val testBtn = button("Test") {}
                        testBtn.setOnClickListener {
                            testBtn.isEnabled = false
                            testBtn.text = "..."
                            bt.print(BT_TEST_HEX, mac) { ok ->
                                runOnUiThread {
                                    testBtn.isEnabled = true
                                    testBtn.text = "Test"
                                    toast(if (ok) "Sent to $name" else "Failed — is printer on?")
                                }
                            }
                        }
                        row.addView(testBtn)
                        listContainer.addView(row)
                    }
                }
            }

            refresh()
            addView(listContainer)
            addRow(button("Refresh Devices") { refresh() })
        }
    }

    // ── Network section ──────────────────────────────────────────────────────

    private fun sectionNetwork(): View {
        val cm     = getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager
        val caps   = cm.getNetworkCapabilities(cm.activeNetwork)
        val online = caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
        val type   = when {
            caps?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)     == true -> "Wi-Fi"
            caps?.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) == true -> "Cellular"
            caps?.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) == true -> "Ethernet"
            else -> "None"
        }
        return section("NETWORK") {
            addStatus("Internet", if (online) "Online ($type)" else "Offline", online)
            addStatus("App URL", "portionspot-v11-5.vercel.app", true)
            addRow(button("Reload App") { finishWith("reload") })
        }
    }

    // ── Cache section ────────────────────────────────────────────────────────

    private fun sectionCache(): View {
        return section("CACHE") {
            addView(label("Clear only if the app is stuck on a broken version."))
            addRow(button("Clear Cache & Reload", Color.parseColor("#DC2626")) {
                android.webkit.CookieManager.getInstance().removeAllCookies(null)
                finishWith("clear_cache_reload")
            })
        }
    }

    // ── App info section ─────────────────────────────────────────────────────

    private fun sectionAppInfo(): View {
        val wvPkg = try {
            packageManager.getPackageInfo("com.google.android.webview", 0).versionName ?: "unknown"
        } catch (_: Exception) { "unknown" }

        return section("APP INFO") {
            addView(label(
                "App version  : 1.0\n" +
                "Build type   : ${if (BuildConfig.DEBUG) "debug" else "release"}\n" +
                "Android      : ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})\n" +
                "Device       : ${Build.MANUFACTURER} ${Build.MODEL}\n" +
                "WebView      : $wvPkg"
            ))
        }
    }

    // ── UI helpers ───────────────────────────────────────────────────────────

    private fun section(title: String, build: LinearLayout.() -> Unit): LinearLayout {
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, dp(12), 0, dp(12))
        }
        col.addView(TextView(this).apply {
            text     = title
            textSize = 11f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#6B7280"))
            setPadding(0, 0, 0, dp(8))
        })
        col.build()
        return col
    }

    private fun LinearLayout.addStatus(label: String, value: String, ok: Boolean) {
        val row = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, dp(2), 0, dp(2))
        }
        val dot = View(context).apply {
            layoutParams = LinearLayout.LayoutParams(dp(10), dp(10)).apply {
                gravity   = Gravity.CENTER_VERTICAL
                marginEnd = dp(8)
            }
            post {
                background = android.graphics.drawable.ShapeDrawable(
                    android.graphics.drawable.shapes.OvalShape()
                ).also { it.paint.color = if (ok) Color.parseColor("#16A34A") else Color.parseColor("#DC2626") }
            }
        }
        row.addView(dot)
        row.addView(this@DiagnosticsActivity.label("$label: $value"))
        addView(row)
    }

    private fun LinearLayout.addRow(vararg views: View) {
        val row = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, dp(8), 0, 0)
        }
        views.forEach { v ->
            (v.layoutParams as? LinearLayout.LayoutParams)?.marginEnd = dp(8)
            row.addView(v)
        }
        addView(row)
    }

    private fun label(text: String) = TextView(this).apply {
        this.text = text
        textSize  = 14f
        setTextColor(Color.parseColor("#111827"))
    }

    private fun button(
        text: String,
        bgColor: Int = Color.parseColor("#1F2937"),
        action: () -> Unit
    ) = Button(this).apply {
        this.text = text
        textSize  = 13f
        setTextColor(Color.WHITE)
        setBackgroundColor(bgColor)
        setPadding(dp(12), dp(8), dp(12), dp(8))
        setOnClickListener { action() }
    }

    private fun divider() = View(this).apply {
        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 1).apply {
            topMargin    = dp(4)
            bottomMargin = dp(4)
        }
        setBackgroundColor(Color.parseColor("#E5E7EB"))
    }

    private fun dp(n: Int)    = (n * resources.displayMetrics.density + 0.5f).toInt()
    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()

    private fun finishWith(action: String) {
        setResult(Activity.RESULT_OK, Intent().putExtra("action", action))
        finish()
    }

    companion object {
        const val BT_TEST_HEX =
            "1B 40 " +
            "42 54 20 54 45 53 54 20 4F 4B 0A " +
            "1B 64 04 " +
            "1D 56 41 10"
    }
}
