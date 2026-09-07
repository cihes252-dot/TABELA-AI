package ai.tabela.mobile

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.google.ar.core.ArCoreApk
import org.json.JSONObject

class MainActivity : AppCompatActivity() {
    companion object {
        private const val TRUSTED_HOST = "cihes252-dot.github.io"
        private const val TRUSTED_PATH_PREFIX = "/TABELA-AI/"
        private const val APP_URL = "https://cihes252-dot.github.io/TABELA-AI/app/v11_1/?native=android&build=11.1.0"
    }

    private lateinit var webView: WebView
    private lateinit var ocrBridge: TabelaNativeOCRBridge
    private var pendingMetricPayload: String? = null

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { result ->
        publishCapabilities()
        val pending = pendingMetricPayload ?: return@registerForActivityResult
        pendingMetricPayload = null
        val cameraGranted = result[Manifest.permission.CAMERA] == true ||
            ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        if (cameraGranted) launchMeasurementActivity(pending)
        else emitMetricError("camera_permission_denied", "Gerçek AR ölçümü için kamera izni gerekli.")
    }

    private val arLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            val json = result.data?.getStringExtra(UniversalARMeasurementActivity.EXTRA_RESULT)
            if (!json.isNullOrBlank()) {
                webView.post {
                    val depthUsed = runCatching { JSONObject(json).optBoolean("arcoreDepth", false) }.getOrDefault(false)
                    webView.evaluateJavascript(
                        "window.TabelaNativeCapabilities=Object.assign({},window.TabelaNativeCapabilities||{},{arcoreDepth:${if (depthUsed) "true" else "false"}});" +
                            "window.TabelaMetric&&window.TabelaMetric.submitVerified($json);",
                        null
                    )
                }
            }
            return@registerForActivityResult
        }

        val code = result.data?.getStringExtra(UniversalARMeasurementActivity.EXTRA_ERROR_CODE) ?: "measurement_cancelled"
        val message = result.data?.getStringExtra(UniversalARMeasurementActivity.EXTRA_ERROR) ?: "Ölçüm tamamlanmadı."
        emitMetricError(code, message)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestRuntimePermissions()

        webView = WebView(this)
        setContentView(webView)
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
            setGeolocationEnabled(true)
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            cacheMode = WebSettings.LOAD_DEFAULT
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) safeBrowsingEnabled = true
            userAgentString = "$userAgentString TabelaAIAndroid/11.1.0"
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                if (isTrustedAppUrl(url)) return false
                if (request.isForMainFrame && (url.scheme == "http" || url.scheme == "https")) {
                    runCatching { startActivity(Intent(Intent.ACTION_VIEW, url)) }
                }
                return true
            }

            @Deprecated("Deprecated in Java")
            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean {
                val uri = runCatching { Uri.parse(url) }.getOrNull() ?: return true
                if (isTrustedAppUrl(uri)) return false
                if (uri.scheme == "http" || uri.scheme == "https") {
                    runCatching { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
                }
                return true
            }

            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                if (isTrustedAppUrl(Uri.parse(url))) publishCapabilities()
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    val cameraAllowed = ContextCompat.checkSelfPermission(
                        this@MainActivity,
                        Manifest.permission.CAMERA
                    ) == PackageManager.PERMISSION_GRANTED
                    val wantsVideo = request.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)
                    val trustedOrigin = request.origin.scheme == "https" && request.origin.host == TRUSTED_HOST
                    if (cameraAllowed && wantsVideo && trustedOrigin) {
                        request.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
                    } else {
                        request.deny()
                    }
                }
            }

            override fun onGeolocationPermissionsShowPrompt(
                origin: String,
                callback: GeolocationPermissions.Callback
            ) {
                val uri = runCatching { Uri.parse(origin) }.getOrNull()
                val trustedOrigin = uri?.scheme == "https" && uri.host == TRUSTED_HOST
                val fine = ContextCompat.checkSelfPermission(
                    this@MainActivity,
                    Manifest.permission.ACCESS_FINE_LOCATION
                ) == PackageManager.PERMISSION_GRANTED
                val coarse = ContextCompat.checkSelfPermission(
                    this@MainActivity,
                    Manifest.permission.ACCESS_COARSE_LOCATION
                ) == PackageManager.PERMISSION_GRANTED
                callback.invoke(origin, trustedOrigin && (fine || coarse), false)
            }
        }

        val metricBridge = TabelaAndroidMetricBridge(this) { payload -> requestNativeMeasurement(payload) }
        webView.addJavascriptInterface(metricBridge, "TabelaAndroidMetric")
        ocrBridge = TabelaNativeOCRBridge(this, webView)
        webView.addJavascriptInterface(ocrBridge, "TabelaAndroidOCR")

        webView.loadUrl(APP_URL)
    }

    private fun requestNativeMeasurement(payload: String) {
        val availability = runCatching { ArCoreApk.getInstance().checkAvailability(this) }.getOrNull()
        if (availability != null && !availability.isTransient && !availability.isSupported) {
            emitMetricError("arcore_unsupported_device", "Bu cihaz ARCore world tracking desteklemiyor. RGB görüntüden metre üretilmez.")
            return
        }

        val cameraGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        if (!cameraGranted) {
            pendingMetricPayload = payload
            permissionLauncher.launch(arrayOf(Manifest.permission.CAMERA))
            return
        }
        launchMeasurementActivity(payload)
    }

    private fun launchMeasurementActivity(payload: String) {
        stopWebCameraForNativeAR {
            val intent = Intent(this, UniversalARMeasurementActivity::class.java)
                .putExtra(UniversalARMeasurementActivity.EXTRA_REQUEST, payload)
            arLauncher.launch(intent)
        }
    }

    private fun stopWebCameraForNativeAR(after: () -> Unit) {
        val script = """
            (()=>{try{document.querySelectorAll('video').forEach(v=>{const s=v.srcObject;if(s&&s.getTracks)s.getTracks().forEach(t=>t.stop());});window.dispatchEvent(new CustomEvent('tabela:native-ar-start'));}catch(e){}})();
        """.trimIndent()
        webView.evaluateJavascript(script) { webView.postDelayed(after, 120) }
    }

    private fun publishCapabilities() {
        if (!::webView.isInitialized) return
        val availability = runCatching { ArCoreApk.getInstance().checkAvailability(this) }.getOrNull()
        val arcoreJs = when {
            availability == null -> "null"
            availability.isTransient -> "null"
            availability.isSupported -> "true"
            else -> "false"
        }
        val installed = availability == ArCoreApk.Availability.SUPPORTED_INSTALLED
        val cameraGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        val fine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val coarse = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val status = JSONObject.quote(availability?.name ?: "UNKNOWN")
        val js = """
            window.TabelaNativeCapabilities = Object.assign({}, window.TabelaNativeCapabilities || {}, {
              platform:'android', app:true, appVersion:'11.1.0', nativeOCR:'mlkit',
              arcore:$arcoreJs, arcoreInstalled:${if (installed) "true" else "false"},
              arcoreStatus:$status, arcoreDepth:(window.TabelaNativeCapabilities&&window.TabelaNativeCapabilities.arcoreDepth)||null,
              lidar:false, cameraPermission:${if (cameraGranted) "true" else "false"},
              locationPermission:${if (fine || coarse) "true" else "false"},
              source:'ARCore-Depth-or-Plane-Raycast'
            });
            window.dispatchEvent(new CustomEvent('tabela:native-capabilities',{detail:window.TabelaNativeCapabilities}));
        """.trimIndent()
        webView.post { webView.evaluateJavascript(js, null) }
    }

    private fun emitMetricError(code: String, message: String) {
        if (!::webView.isInitialized) return
        val codeJson = JSONObject.quote(code)
        val messageJson = JSONObject.quote(message)
        val js = "window.dispatchEvent(new CustomEvent('tabela:measurement-error',{detail:{code:$codeJson,message:$messageJson}}));"
        webView.post { webView.evaluateJavascript(js, null) }
    }

    private fun isTrustedAppUrl(uri: Uri): Boolean =
        uri.scheme == "https" && uri.host == TRUSTED_HOST && uri.path.orEmpty().startsWith(TRUSTED_PATH_PREFIX)

    private fun requestRuntimePermissions() {
        val needs = buildList {
            if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) add(Manifest.permission.CAMERA)
            if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
                ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED
            ) add(Manifest.permission.ACCESS_FINE_LOCATION)
        }
        if (needs.isNotEmpty()) permissionLauncher.launch(needs.toTypedArray())
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        if (::ocrBridge.isInitialized) ocrBridge.close()
        if (::webView.isInitialized) {
            webView.removeJavascriptInterface("TabelaAndroidMetric")
            webView.removeJavascriptInterface("TabelaAndroidOCR")
            webView.loadUrl("about:blank")
            webView.removeAllViews()
            webView.destroy()
        }
        super.onDestroy()
    }
}
