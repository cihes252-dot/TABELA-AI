package ai.tabela.metric

import android.os.Bundle
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import com.google.ar.core.Frame

/**
 * Minimal host for the V10 web UI.
 * Connect your ARCore renderer/Fragment to `onArFrameTap(frame,x,y)` when
 * `onMeasurementRequested` fires.
 */
class TabelaHostActivity : AppCompatActivity() {
    lateinit var webView: WebView
    lateinit var metricBridge: TabelaARBridge

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this)
        setContentView(webView)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.mediaPlaybackRequiresUserGesture = false
        webView.webViewClient = WebViewClient()
        webView.webChromeClient = WebChromeClient()

        metricBridge = TabelaARBridge(webView)
        webView.addJavascriptInterface(metricBridge, "TabelaAndroidMetric")
        metricBridge.onMeasurementRequested = {
            // Open/show your ARCore measurement overlay here.
            // Collect points in order: top-left, top-right, bottom-left, bottom-right.
        }
        webView.loadUrl("https://cihes252-dot.github.io/TABELA-AI/app/v10/?native=android")
    }

    fun onArFrameTap(frame: Frame, x: Float, y: Float): Boolean = metricBridge.addPoint(frame, x, y)
}
