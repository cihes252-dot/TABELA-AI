package ai.tabela.metric

import android.webkit.JavascriptInterface
import android.webkit.WebView
import com.google.ar.core.Frame
import com.google.ar.core.TrackingState
import com.google.ar.core.Pose
import org.json.JSONObject

/**
 * WebView ↔ ARCore bridge for TABELA AI V10.
 * Host Activity owns the ARCore Session/Frame and collects 4 real hit-test points.
 * No measurement is emitted unless all points are real AR poses and camera tracking is TRACKING.
 */
class TabelaARBridge(private val webView: WebView) {
    private val points = mutableListOf<Pose>()
    var onMeasurementRequested: ((String) -> Unit)? = null

    @JavascriptInterface
    fun requestMeasurement(payloadJson: String) {
        points.clear()
        onMeasurementRequested?.invoke(payloadJson)
    }

    fun addPoint(frame: Frame, screenX: Float, screenY: Float): Boolean {
        if (frame.camera.trackingState != TrackingState.TRACKING) return false
        val hit = frame.hitTest(screenX, screenY).firstOrNull { result ->
            val t = result.trackable
            t.trackingState == TrackingState.TRACKING
        } ?: return false
        points += hit.hitPose
        if (points.size == 4) finish(frame.camera.pose)
        return true
    }

    fun cancel() = points.clear()

    private fun dist(a: Pose, b: Pose): Double {
        val dx = a.tx() - b.tx(); val dy = a.ty() - b.ty(); val dz = a.tz() - b.tz()
        return kotlin.math.sqrt((dx*dx + dy*dy + dz*dz).toDouble())
    }

    private fun finish(camera: Pose) {
        if (points.size != 4) return
        val tl=points[0]; val tr=points[1]; val bl=points[2]; val br=points[3]
        val width=(dist(tl,tr)+dist(bl,br))/2.0
        val height=(dist(tl,bl)+dist(tr,br))/2.0
        val cx=(tl.tx()+tr.tx()+bl.tx()+br.tx())/4f
        val cy=(tl.ty()+tr.ty()+bl.ty()+br.ty())/4f
        val cz=(tl.tz()+tr.tz()+bl.tz()+br.tz())/4f
        val center=Pose.makeTranslation(cx,cy,cz)
        val payload=JSONObject().apply {
            put("verified", true)
            put("source", "ARCore-3D")
            put("widthM", width)
            put("heightM", height)
            put("areaM2", width*height)
            put("distanceM", dist(camera,center))
        }
        webView.post { webView.evaluateJavascript("window.TabelaMetric.submitVerified(${payload})", null) }
        points.clear()
    }
}
