package ai.tabela.metric

import android.os.Bundle
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import com.google.ar.core.Frame

/**
 * Minimal Android native host for the V11.2 FAST FIELD web UI.
 * Connect your ARCore renderer/Fragment to `onArFrameTap(frame,x,y)` when
 * `onMeasurementRequested` fires. Real metric values must still come from
 * ARCore/Depth world-space points; RGB pixels are never converted into metres.
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
            // V11.2 starts this request automatically after a stable sign boundary is detected.
            // Collect verified ARCore/Depth world-space points in the shape-specific order.
        }
        webView.loadUrl("https://cihes252-dot.github.io/TABELA-AI/app/v11_2/?native=android&build=11.2.2&fast=1")
    }

    fun onArFrameTap(frame: Frame, x: Float, y: Float): Boolean = metricBridge.addPoint(frame, x, y)
}
