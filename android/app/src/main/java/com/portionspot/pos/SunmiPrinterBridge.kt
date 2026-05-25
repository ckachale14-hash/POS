package com.portionspot.pos

import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.content.FileProvider
import org.json.JSONArray
import java.io.File
import java.lang.ref.WeakReference
import woyou.aidlservice.jiuiv5.IWoyouService

class SunmiPrinterBridge(
    private val context:         Context,
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

    // ── RawBT intent bridge ──────────────────────────────────────────────────
    /**
     * Decodes a base64 ESC/POS byte string, writes it to a cache file, and
     * fires an intent to RawBT's PrintContentActivity via FileProvider.
     * RawBT handles driver selection and hardware communication internally —
     * this is the most reliable print path on Sunmi hardware.
     *
     * Called from JS as: window.SunmiPrinter.rawBtPrint(base64String)
     */
    @JavascriptInterface
    fun printViaRawBt(base64EscPos: String) {
        try {
            val bytes = Base64.decode(base64EscPos, Base64.DEFAULT)
            val file  = File(context.cacheDir, "receipt.prn")
            file.writeBytes(bytes)

            val uri = FileProvider.getUriForFile(
                context,
                "com.portionspot.pos.fileprovider",
                file
            )

            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/octet-stream")
                setPackage("ru.a402d.rawbtprinter")
                addFlags(
                    Intent.FLAG_GRANT_READ_URI_PERMISSION or
                    Intent.FLAG_ACTIVITY_NEW_TASK
                )
            }
            context.startActivity(intent)
            Log.d("PSPrinter", "RawBT intent sent — ${bytes.size} bytes → $uri")

            // Return to our app after a short delay so the user never sees
            // RawBT's UI — it processes the file in the background.
            Handler(Looper.getMainLooper()).postDelayed({
                try {
                    val back = context.packageManager
                        .getLaunchIntentForPackage(context.packageName)
                        ?.apply {
                            addFlags(
                                Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                                Intent.FLAG_ACTIVITY_NEW_TASK
                            )
                        }
                    if (back != null) context.startActivity(back)
                } catch (e: Exception) {
                    Log.w("PSPrinter", "Could not return to main app: ${e.message}")
                }
            }, 650) // 650 ms gives RawBT time to receive the URI before we take focus back
        } catch (e: Exception) {
            Log.e("PSPrinter", "RawBT print failed: ${e.message}", e)
            // Surface the error back to JS so the UI can show a toast
            val wv = webViewRef.get() ?: return
            val msg = e.message?.replace("'", "\\'") ?: "unknown error"
            wv.post {
                wv.evaluateJavascript(
                    "window.__rawBtError && window.__rawBtError('$msg')", null
                )
            }
        }
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
