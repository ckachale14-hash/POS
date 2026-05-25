package com.portionspot.pos

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.graphics.Color
import android.hardware.SensorManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.http.SslError
import android.os.Build
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.webkit.*
import android.widget.FrameLayout
import android.widget.ProgressBar
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.RequiresApi
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var loadingBar: ProgressBar
    private lateinit var webViewContainer: FrameLayout
    private lateinit var shakeDetector: ShakeDetector
    private lateinit var sensorManager: SensorManager
    private var isOnline = true
    private var isDiagnosticsOpen = false

    // Volume-Up ×5 within 3 seconds → open diagnostics
    private var volumeUpCount     = 0
    private var volumeUpFirstPress = 0L

    // ── Activity result launcher ──────────────────────────────────────────────

    private val diagLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        isDiagnosticsOpen = false
        if (result.resultCode == RESULT_OK) {
            when (result.data?.getStringExtra("action")) {
                "reload"             -> webView.reload()
                "clear_cache_reload" -> { webView.clearCache(true); webView.reload() }
            }
        }
    }

    companion object {
        const val APP_URL     = "https://portionspot-v11-5.vercel.app"
        const val REQ_BT_PERM = 1002

        val BRIDGE_JS = """
(function () {
  if (typeof _SunmiNative === 'undefined') return;

  /* ── Sunmi inner printer ─────────────────────────────────── */
  window.SunmiPrinter = {
    isReady:          function ()      { return _SunmiNative.isPrinterReady(); },
    printerInit:      function ()      { return Promise.resolve(_SunmiNative.printerInit()); },
    setAlignment:     function (n)     { return Promise.resolve(_SunmiNative.setAlignment(n)); },
    setPrinterStyle:  function (k, v)  { return Promise.resolve(_SunmiNative.setPrinterStyle(k, v)); },
    setFontSize:      function (n)     { return Promise.resolve(_SunmiNative.setFontSize(n)); },
    printText:        function (t)     { return Promise.resolve(_SunmiNative.printText(t)); },
    printColumnsText: function (tx,w,a) {
      return Promise.resolve(_SunmiNative.printColumnsText(
        JSON.stringify(tx), JSON.stringify(w), JSON.stringify(a)));
    },
    lineWrap:  function (n) { return Promise.resolve(_SunmiNative.lineWrap(n)); },
    cutPaper:  function (m) { return Promise.resolve(_SunmiNative.cutPaper(m||1)); },
    // RawBT intent bridge — writes ESC/POS bytes to a cache file and fires
    // an Android Intent to RawBT's PrintContentActivity. This is the most
    // reliable print path on Sunmi hardware. Pass base64-encoded ESC/POS bytes.
    rawBtPrint: function (b64) { _SunmiNative.printViaRawBt(b64); },
  };

  /* ── Classic Bluetooth — async to avoid freezing JS ──────── */
  window._NativeBT = {
    _cbs: {},
    scan: function () { return JSON.parse(_SunmiNative.btScan()); },
    print: function (bytes, mac) {
      var hex = Array.from(bytes)
        .map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); })
        .join(' ');
      return new Promise(function (resolve) {
        var id = 'bt_' + Date.now() + '_' + Math.random().toString(36).slice(2);
        window._NativeBT._cbs[id] = resolve;
        _SunmiNative.btPrint(hex, mac, id);
      });
    },
    _resolve: function (id, ok) {
      var cb = window._NativeBT._cbs[id];
      if (cb) { delete window._NativeBT._cbs[id]; cb(ok === true || ok === 'true'); }
    },
  };

  /* ── Shell utilities ─────────────────────────────────────── */
  window._PSNative = {
    openDiagnostics: function () { _SunmiNative.openDiagnostics(); },
    isOnline:        function () { return _SunmiNative.isOnline(); },
  };

  console.log('[PortionSpot] Native bridge ready');
})();
""".trimIndent()

        val OFFLINE_BANNER_JS = """
(function(){
  var ID = '__ps_offline__';
  if (document.getElementById(ID)) return;
  var b = document.createElement('div');
  b.id = ID;
  b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;'
    + 'background:#d97706;color:#fff;text-align:center;padding:5px 0;'
    + 'font:600 13px/1 system-ui,sans-serif;letter-spacing:.5px;';
  b.textContent = '⚠️  OFFLINE — using cached data';
  document.body.prepend(b);
})();
""".trimIndent()

        val REMOVE_OFFLINE_BANNER_JS = """
(function(){ var el=document.getElementById('__ps_offline__'); if(el)el.remove(); })();
""".trimIndent()
    }

    // ── Lifecycle ────────────────────────────────────────────────────────────

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestBluetoothPermissions()

        webView          = buildWebView()
        loadingBar       = buildLoadingBar()
        webViewContainer = FrameLayout(this).apply {
            addView(webView)
            addView(loadingBar)
        }
        setContentView(webViewContainer)

        registerConnectivityCallback()
        setupShakeDetector()
    }

    override fun onResume() {
        super.onResume()
        val accel = sensorManager.getDefaultSensor(android.hardware.Sensor.TYPE_ACCELEROMETER)
        if (accel != null) {
            sensorManager.registerListener(shakeDetector, accel, SensorManager.SENSOR_DELAY_UI)
        }
    }

    override fun onPause() {
        super.onPause()
        sensorManager.unregisterListener(shakeDetector)
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {

        // ── Volume Up ×5 within 3 s → open diagnostics ───────────────────────
        if (keyCode == KeyEvent.KEYCODE_VOLUME_UP) {
            val now = System.currentTimeMillis()
            if (volumeUpCount == 0 || now - volumeUpFirstPress > 3_000L) {
                volumeUpCount      = 1
                volumeUpFirstPress = now
            } else {
                volumeUpCount++
                if (volumeUpCount >= 5) {
                    volumeUpCount = 0
                    openDiagnostics()
                }
            }
            return true // consume — prevents volume changing
        }

        // ── Back button ───────────────────────────────────────────────────────
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            val url = webView.url ?: ""
            if (url.startsWith("file:///android_asset")) {
                // On the offline page — show hint, never close
                Toast.makeText(this, "No internet connection", Toast.LENGTH_SHORT).show()
                return true
            }
            // Delegate to the JS navigation stack. window.__ps_back() pops the
            // in-app page history. If no history (root page or login screen) it
            // does nothing — the Activity is never finished by a back press.
            // We ALWAYS return true here so Android never closes the Activity.
            webView.evaluateJavascript(
                "(function(){if(typeof window.__ps_back==='function'){window.__ps_back();}})();",
                null
            )
            return true // consume — never let the system finish this Activity
        }

        return super.onKeyDown(keyCode, event)
    }

    // ── WebView ──────────────────────────────────────────────────────────────

    private fun buildWebView(): WebView {
        val app = application as PosApplication
        val wv  = WebView(this)

        wv.settings.apply {
            javaScriptEnabled   = true
            domStorageEnabled   = true
            databaseEnabled     = true
            allowFileAccess     = true
            mixedContentMode    = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            cacheMode           = WebSettings.LOAD_DEFAULT
            userAgentString     = "$userAgentString Sunmi/PortionSpot"
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            saveFormData        = false
            setGeolocationEnabled(false)
        }

        val bridge = SunmiPrinterBridge(
            context         = applicationContext,
            getService      = { app.printerService },
            openDiagnostics = { openDiagnostics() },
            getOnline       = { isOnline },
            btBridge        = app.bluetoothBridge,
            webView         = wv,
        )
        wv.addJavascriptInterface(bridge, "_SunmiNative")

        wv.webViewClient = object : WebViewClient() {

            override fun onPageFinished(view: WebView, url: String) {
                view.evaluateJavascript(BRIDGE_JS, null)
                if (!isOnline) view.evaluateJavascript(OFFLINE_BANNER_JS, null)
            }

            override fun onReceivedError(
                view: WebView, request: WebResourceRequest, error: WebResourceError
            ) {
                if (!request.isForMainFrame) return
                view.loadUrl("file:///android_asset/offline.html")
                // Clear history so the offline page never appears in the back stack
                view.post { view.clearHistory() }
            }

            override fun onReceivedSslError(
                view: WebView, handler: SslErrorHandler, error: SslError
            ) {
                handler.cancel()
            }

            @RequiresApi(Build.VERSION_CODES.O)
            override fun onRenderProcessGone(
                view: WebView, detail: RenderProcessGoneDetail
            ): Boolean {
                webViewContainer.removeView(view)
                view.destroy()
                webView = buildWebView()
                webViewContainer.addView(webView, 0)
                webView.loadUrl(APP_URL)
                return true
            }

            override fun shouldOverrideUrlLoading(
                view: WebView, request: WebResourceRequest
            ): Boolean {
                val url = request.url.toString()
                if (url.startsWith("https://portionspot-v11-5.vercel.app") ||
                    url.startsWith("file:///android_asset")) {
                    view.loadUrl(url)
                    return true
                }
                startActivity(Intent(Intent.ACTION_VIEW, request.url))
                return true
            }
        }

        wv.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, newProgress: Int) {
                loadingBar.progress   = newProgress
                loadingBar.visibility = if (newProgress < 100) View.VISIBLE else View.GONE
            }
            override fun onConsoleMessage(msg: ConsoleMessage): Boolean {
                android.util.Log.d("PSWebView",
                    "[${msg.messageLevel()}] ${msg.message()} (${msg.sourceId()}:${msg.lineNumber()})")
                return true
            }
        }

        wv.loadUrl(APP_URL)
        return wv
    }

    private fun buildLoadingBar(): ProgressBar =
        ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, dp(3)
            )
            max              = 100
            isIndeterminate  = false
            progressTintList = ColorStateList.valueOf(Color.parseColor("#DC2626"))
            visibility       = View.GONE
        }

    // ── Network ──────────────────────────────────────────────────────────────

    private fun registerConnectivityCallback() {
        val cm  = getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager
        val req = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()

        cm.registerNetworkCallback(req, object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                isOnline = true
                runOnUiThread {
                    webView.settings.cacheMode = WebSettings.LOAD_DEFAULT
                    webView.evaluateJavascript(REMOVE_OFFLINE_BANNER_JS, null)
                }
            }
            override fun onLost(network: Network) {
                isOnline = false
                runOnUiThread {
                    webView.settings.cacheMode = WebSettings.LOAD_CACHE_ELSE_NETWORK
                    webView.evaluateJavascript(OFFLINE_BANNER_JS, null)
                }
            }
        })

        val caps = cm.getNetworkCapabilities(cm.activeNetwork)
        isOnline = caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
        if (!isOnline) webView.settings.cacheMode = WebSettings.LOAD_CACHE_ELSE_NETWORK
    }

    // ── Diagnostics ──────────────────────────────────────────────────────────

    fun openDiagnostics() {
        runOnUiThread {
            if (isDiagnosticsOpen) return@runOnUiThread
            isDiagnosticsOpen = true
            diagLauncher.launch(Intent(this, DiagnosticsActivity::class.java))
        }
    }

    // ── Shake detector (backup — lower threshold for POS hardware) ────────────

    private fun setupShakeDetector() {
        sensorManager = getSystemService(SENSOR_SERVICE) as SensorManager
        shakeDetector = ShakeDetector(threshold = 8f) { openDiagnostics() }
    }

    // ── Permissions ──────────────────────────────────────────────────────────

    private fun requestBluetoothPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val perms = arrayOf(
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.BLUETOOTH_SCAN,
            )
            val missing = perms.filter {
                ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
            }
            if (missing.isNotEmpty()) {
                ActivityCompat.requestPermissions(this, missing.toTypedArray(), REQ_BT_PERM)
            }
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private fun dp(n: Int) = (n * resources.displayMetrics.density + 0.5f).toInt()
}
