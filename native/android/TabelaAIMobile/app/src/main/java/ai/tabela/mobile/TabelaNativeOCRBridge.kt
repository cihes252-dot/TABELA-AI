package ai.tabela.mobile

import android.content.Context
import android.graphics.BitmapFactory
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebView
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import org.json.JSONArray
import org.json.JSONObject

class TabelaNativeOCRBridge(
    @Suppress("UNUSED_PARAMETER") context: Context,
    private val webView: WebView
) {
    private val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    @Volatile private var closed = false

    @JavascriptInterface
    fun recognize(dataUrl: String, requestId: String) {
        if (closed) return emitError(requestId, "ocr_engine_closed")
        try {
            if (!dataUrl.startsWith("data:image/")) return emitError(requestId, "invalid_image_data_url")
            val base64 = dataUrl.substringAfter(',', "")
            if (base64.isBlank()) return emitError(requestId, "image_payload_empty")
            val bytes = Base64.decode(base64, Base64.DEFAULT)
            if (bytes.size > 20 * 1024 * 1024) return emitError(requestId, "image_payload_too_large")
            val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                ?: return emitError(requestId, "image_decode_failed")
            val image = InputImage.fromBitmap(bitmap, 0)
            recognizer.process(image)
                .addOnSuccessListener { result ->
                    if (closed) return@addOnSuccessListener
                    val lines = JSONArray()
                    result.textBlocks.forEach { block ->
                        block.lines.forEach { line ->
                            val text = line.text.trim()
                            if (text.isNotEmpty()) lines.put(JSONObject().put("text", text))
                        }
                    }
                    val payload = JSONObject()
                        .put("requestId", requestId)
                        .put("engine", "mlkit")
                        .put("text", result.text.trim())
                        .put("lines", lines)
                    emit(payload)
                }
                .addOnFailureListener { if (!closed) emitError(requestId, it.message ?: "mlkit_error") }
        } catch (e: Exception) {
            emitError(requestId, e.message ?: "native_ocr_error")
        }
    }

    fun close() {
        if (closed) return
        closed = true
        recognizer.close()
    }

    private fun emitError(requestId: String, message: String) {
        emit(JSONObject().put("requestId", requestId).put("engine", "mlkit").put("error", message))
    }

    private fun emit(payload: JSONObject) {
        if (closed && !payload.has("error")) return
        val script = "window.dispatchEvent(new CustomEvent('tabela:native-ocr',{detail:${payload}}));"
        webView.post { if (!closed || payload.has("error")) webView.evaluateJavascript(script, null) }
    }
}
