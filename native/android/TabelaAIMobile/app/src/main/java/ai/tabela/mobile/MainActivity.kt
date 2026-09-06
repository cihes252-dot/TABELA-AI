package ai.tabela.mobile

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { }

    private val arLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode != Activity.RESULT_OK) return@registerForActivityResult
        val json = result.data?.getStringExtra(ARMeasurementActivity.EXTRA_RESULT) ?: return@registerForActivityResult
        webView.post {
            webView.evaluateJavascript("window.TabelaMetric && window.TabelaMetric.submitVerified($json)", null)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestRuntimePermissions()

        webView = WebView(this)
        setContentView(webView)

        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            setGeolocationEnabled(true)
            allowFileAccess = false
            allowContentAccess = false
            userAgentString = "$userAgentString TabelaAIAndroid/11.0.0"
        }

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                val js = """
                    window.TabelaNativeCapabilities = {
                      platform:'android', app:true, appVersion:'11.0.0',
                      nativeOCR:'mlkit', arcore:true, lidar:false,
                      source:'ARCore-Depth-or-Raycast'
                    };
                """.trimIndent()
                view.evaluateJavascript(js, null)
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
                    if (cameraAllowed && wantsVideo) {
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
                val allowed = ContextCompat.checkSelfPermission(
                    this@MainActivity,
                    Manifest.permission.ACCESS_FINE_LOCATION
                ) == PackageManager.PERMISSION_GRANTED
                callback.invoke(origin, allowed, false)
            }
        }

        val metricBridge = TabelaAndroidMetricBridge(this) { payload ->
            val intent = Intent(this, ARMeasurementActivity::class.java)
                .putExtra(ARMeasurementActivity.EXTRA_REQUEST, payload)
            arLauncher.launch(intent)
        }
        webView.addJavascriptInterface(metricBridge, "TabelaAndroidMetric")
        webView.addJavascriptInterface(TabelaNativeOCRBridge(this, webView), "TabelaAndroidOCR")

        webView.loadUrl("https://cihes252-dot.github.io/TABELA-AI/app/v11/?native=android&build=11.0.0")
    }

    private fun requestRuntimePermissions() {
        val needs = buildList {
            if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) add(Manifest.permission.CAMERA)
            if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) add(Manifest.permission.ACCESS_FINE_LOCATION)
        }
        if (needs.isNotEmpty()) permissionLauncher.launch(needs.toTypedArray())
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        if (::webView.isInitialized) {
            webView.loadUrl("about:blank")
            webView.removeAllViews()
            webView.destroy()
        }
        super.onDestroy()
    }
}
