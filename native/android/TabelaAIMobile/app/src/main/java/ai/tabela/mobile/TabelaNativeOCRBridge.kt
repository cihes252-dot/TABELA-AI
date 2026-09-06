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
    private val context: Context,
    private val webView: WebView
) {
    private val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

    @JavascriptInterface
    fun recognize(dataUrl: String, requestId: String) {
        try {
            val base64 = dataUrl.substringAfter(',', dataUrl)
            val bytes = Base64.decode(base64, Base64.DEFAULT)
            val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                ?: return emitError(requestId, "image_decode_failed")
            val image = InputImage.fromBitmap(bitmap, 0)
            recognizer.process(image)
                .addOnSuccessListener { result ->
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
                .addOnFailureListener { emitError(requestId, it.message ?: "mlkit_error") }
        } catch (e: Exception) {
            emitError(requestId, e.message ?: "native_ocr_error")
        }
    }

    private fun emitError(requestId: String, message: String) {
        emit(JSONObject().put("requestId", requestId).put("engine", "mlkit").put("error", message))
    }

    private fun emit(payload: JSONObject) {
        val script = "window.dispatchEvent(new CustomEvent('tabela:native-ocr',{detail:${payload}}));"
        webView.post { webView.evaluateJavascript(script, null) }
    }
}
