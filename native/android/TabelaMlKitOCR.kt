package com.tabelaai.nativeocr

import android.graphics.Bitmap
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions

data class TabelaOcrCandidate(val text: String, val confidence: Float? = null)

class TabelaMlKitOCR {
    private val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

    fun recognize(bitmap: Bitmap, onResult: (List<TabelaOcrCandidate>) -> Unit, onError: (Exception) -> Unit) {
        val image = InputImage.fromBitmap(bitmap, 0)
        recognizer.process(image)
            .addOnSuccessListener { result ->
                val out = mutableListOf<TabelaOcrCandidate>()
                result.textBlocks.forEach { block ->
                    block.lines.forEach { line ->
                        val t = line.text.trim()
                        if (t.isNotEmpty()) out += TabelaOcrCandidate(t)
                    }
                }
                onResult(out)
            }
            .addOnFailureListener(onError)
    }

    fun close() = recognizer.close()
}

// Gradle dependency:
// implementation("com.google.mlkit:text-recognition:16.0.1")
