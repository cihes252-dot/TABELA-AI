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
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.webkit.WebViewAssetLoader
import com.google.ar.core.ArCoreApk
import org.json.JSONObject

class MainActivity : AppCompatActivity() {
    companion object {
        private const val REMOTE_HOST = "cihes252-dot.github.io"
        private const val REMOTE_PATH_PREFIX = "/TABELA-AI/"
        private const val LOCAL_HOST = "appassets.androidplatform.net"
        private const val LOCAL_PATH_PREFIX = "/assets/"
        private const val LOCAL_APP_URL = "https://appassets.androidplatform.net/assets/v11_1/index.html?native=android&bundle=1&build=11.1.1"
        private const val REMOTE_APP_URL = "https://cihes252-dot.github.io/TABELA-AI/app/v11_1/?native=android&build=11.1.1"
    }

    private lateinit var webView: WebView
    private lateinit var ocrBridge: TabelaNativeOCRBridge
    private lateinit var assetLoader: WebViewAssetLoader
    private var pendingMetricPayload: String? = null
    private var remoteFallbackUsed = false

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

        assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

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
            userAgentString = "$userAgentString TabelaAIAndroid/11.1.1"
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                return assetLoader.shouldInterceptRequest(request.url) ?: super.shouldInterceptRequest(view, request)
            }

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

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                super.onReceivedError(view, request, error)
                if (request.isForMainFrame && request.url.host == LOCAL_HOST && !remoteFallbackUsed) {
                    remoteFallbackUsed = true
                    view.loadUrl(REMOTE_APP_URL)
                }
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
                    val trustedOrigin = isTrustedOrigin(request.origin)
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
                val trustedOrigin = uri != null && isTrustedOrigin(uri)
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

        webView.loadUrl(LOCAL_APP_URL)
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
        val localBundle = webView.url?.let { Uri.parse(it).host == LOCAL_HOST } == true
        val js = """
            window.TabelaNativeCapabilities = Object.assign({}, window.TabelaNativeCapabilities || {}, {
              platform:'android', app:true, appVersion:'11.1.1', nativeOCR:'mlkit',
              arcore:$arcoreJs, arcoreInstalled:${if (installed) "true" else "false"},
              arcoreStatus:$status, arcoreDepth:(window.TabelaNativeCapabilities&&window.TabelaNativeCapabilities.arcoreDepth)||null,
              lidar:false, cameraPermission:${if (cameraGranted) "true" else "false"},
              locationPermission:${if (fine || coarse) "true" else "false"},
              offlineBundle:${if (localBundle) "true" else "false"},
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

    private fun isTrustedOrigin(uri: Uri): Boolean =
        uri.scheme == "https" && (uri.host == REMOTE_HOST || uri.host == LOCAL_HOST)

    private fun isTrustedAppUrl(uri: Uri): Boolean {
        if (uri.scheme != "https") return false
        return (uri.host == REMOTE_HOST && uri.path.orEmpty().startsWith(REMOTE_PATH_PREFIX)) ||
            (uri.host == LOCAL_HOST && uri.path.orEmpty().startsWith(LOCAL_PATH_PREFIX))
    }

    private fun requestRuntimePermissions() {
        val needs = buildList {
            if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                add(Manifest.permission.CAMERA)
            }
            val fineMissing = ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED
            val coarseMissing = ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED
            if (fineMissing || coarseMissing) {
                // Android 12+ expects coarse + fine to be requested together; older Android safely accepts both too.
                add(Manifest.permission.ACCESS_COARSE_LOCATION)
                add(Manifest.permission.ACCESS_FINE_LOCATION)
            }
        }
        if (needs.isNotEmpty()) permissionLauncher.launch(needs.distinct().toTypedArray())
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
