package com.portionspot.pos

import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONArray
import java.lang.ref.WeakReference
import woyou.aidlservice.jiuiv5.IWoyouService

class SunmiPrinterBridge(
    private val getService:      () -> IWoyouService?,
    private val openDiagnostics: () -> Unit,
    private val getOnline:       () -> Boolean,
    private val btBridge:        BluetoothBridge,
    webView:                     WebView,
) {
    private val webViewRef = WeakReference(webView)

    // ── Sunmi inner printer ──────────────────────────────────────────────────

    @JavascriptInterface fun isPrinterReady(): Boolean        = getService() != null
    @JavascriptInterface fun printerInit()                   { getService()?.printerInit(null) }
    @JavascriptInterface fun setAlignment(n: Int)            { getService()?.setAlignment(n, null) }
    @JavascriptInterface fun setPrinterStyle(k: Int, v: Int) { getService()?.setPrinterStyle(k, v, null) }
    @JavascriptInterface fun setFontSize(n: Float)           { getService()?.setFontSize(n, null) }
    @JavascriptInterface fun printText(t: String)            { getService()?.printText(t, null) }

    @JavascriptInterface
    fun printColumnsText(textsJson: String, widthsJson: String, alignsJson: String) {
        val svc    = getService() ?: return
        val texts  = JSONArray(textsJson).let  { a -> Array(a.length())   { a.getString(it) } }
        val widths = JSONArray(widthsJson).let { a -> IntArray(a.length()) { a.getInt(it) }    }
        val aligns = JSONArray(alignsJson).let { a -> IntArray(a.length()) { a.getInt(it) }    }
        svc.printColumnsText(texts, widths, aligns, null)
    }

    @JavascriptInterface
    fun lineWrap(n: Int) { getService()?.lineWrap(n, null) }

    @JavascriptInterface
    fun cutPaper(mode: Int) {
        try { getService()?.autoOutPaper(mode, null) }
        catch (_: Exception) { getService()?.cutPaper(null) }
    }

    // ── Bluetooth bridge ─────────────────────────────────────────────────────

    @JavascriptInterface
    fun btScan(): String = btBridge.pairedDevicesJson()

    /**
     * Async: returns immediately and resolves the JS Promise via [callbackId].
     * The JS side calls window._NativeBT._resolve(id, ok) when done.
     */
    @JavascriptInterface
    fun btPrint(hexData: String, macAddress: String, callbackId: String) {
        val safeId = callbackId.replace("'", "\\'")
        btBridge.print(hexData, macAddress) { ok ->
            val js = "window._NativeBT._resolve('$safeId', $ok)"
            webViewRef.get()?.post { webViewRef.get()?.evaluateJavascript(js, null) }
        }
    }

    // ── Shell utilities ──────────────────────────────────────────────────────

    @JavascriptInterface
    fun openDiagnostics() = openDiagnostics.invoke()

    @JavascriptInterface
    fun isOnline(): Boolean = getOnline()
}
