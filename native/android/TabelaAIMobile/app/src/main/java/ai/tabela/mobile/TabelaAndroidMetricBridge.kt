package ai.tabela.mobile

import android.app.Activity
import android.webkit.JavascriptInterface

class TabelaAndroidMetricBridge(
    private val activity: Activity,
    private val onRequest: (String) -> Unit
) {
    @JavascriptInterface
    fun requestMeasurement(payloadJson: String) {
        activity.runOnUiThread { onRequest(payloadJson) }
    }
}
