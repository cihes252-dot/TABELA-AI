package ai.tabela.mobile

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.opengl.GLES11Ext
import android.opengl.GLES20
import android.opengl.GLSurfaceView
import android.os.Bundle
import android.view.Gravity
import android.view.MotionEvent
import android.view.Surface
import android.view.View
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.google.ar.core.ArCoreApk
import com.google.ar.core.Config
import com.google.ar.core.Coordinates2d
import com.google.ar.core.DepthPoint
import com.google.ar.core.Frame
import com.google.ar.core.HitResult
import com.google.ar.core.Plane
import com.google.ar.core.Pose
import com.google.ar.core.Session
import com.google.ar.core.TrackingState
import com.google.ar.core.exceptions.CameraNotAvailableException
import com.google.ar.core.exceptions.UnavailableApkTooOldException
import com.google.ar.core.exceptions.UnavailableArcoreNotInstalledException
import com.google.ar.core.exceptions.UnavailableDeviceNotCompatibleException
import com.google.ar.core.exceptions.UnavailableSdkTooOldException
import com.google.ar.core.exceptions.UnavailableUserDeclinedInstallationException
import org.json.JSONArray
import org.json.JSONObject
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10
import kotlin.math.roundToInt

/**
 * Universal real-world ARCore measurement screen for TABELA AI 11.1.
 *
 * Device tiers:
 *  - ARCore + Depth API: depth hit points are preferred and reported truthfully.
 *  - ARCore without Depth API: detected planes are used.
 *  - Unsupported / missing ARCore: no metric value is fabricated; an explicit error is returned.
 *
 * Shape point protocols:
 *  - rectangle/square: TL, TR, BL, BR
 *  - circle/oval: left, right, top, bottom
 *  - triangle: 3 vertices
 *  - polygon/freeform: perimeter points in order, then Finish (3..24 points)
 */
class UniversalARMeasurementActivity : AppCompatActivity() {
    companion object {
        const val EXTRA_REQUEST = "tabela_request"
        const val EXTRA_RESULT = "tabela_result"
        const val EXTRA_ERROR = "tabela_error"
        const val EXTRA_ERROR_CODE = "tabela_error_code"
    }

    private lateinit var surfaceView: GLSurfaceView
    private lateinit var info: TextView
    private lateinit var finishButton: Button
    private lateinit var undoButton: Button
    private lateinit var renderer: UniversalARRenderer
    private var session: Session? = null
    private var installRequested = false
    private var depthSupported = false
    private val requestJson: String by lazy { intent.getStringExtra(EXTRA_REQUEST) ?: "{}" }
    private val shapeType: String by lazy {
        runCatching { JSONObject(requestJson).optString("shapeType", "horizontal-rectangle") }
            .getOrDefault("horizontal-rectangle")
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val root = FrameLayout(this)
        surfaceView = GLSurfaceView(this).apply {
            setEGLContextClientVersion(2)
            preserveEGLContextOnPause = true
        }
        root.addView(
            surfaceView,
            FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
        )

        info = TextView(this).apply {
            setTextColor(Color.WHITE)
            setBackgroundColor(0xC0000000.toInt())
            textSize = 15f
            gravity = Gravity.CENTER
            setPadding(20, 14, 20, 14)
            text = "AR hazırlanıyor…"
        }
        root.addView(info, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT).apply {
            gravity = Gravity.BOTTOM
            setMargins(18, 18, 18, 34)
        })

        val topBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setPadding(10, 10, 10, 10)
            setBackgroundColor(0x7A000000)
        }
        val cancelButton = Button(this).apply {
            text = "İptal"
            setOnClickListener {
                renderer.cancel()
                finishWithError("cancelled", "Ölçüm kullanıcı tarafından iptal edildi.")
            }
        }
        undoButton = Button(this).apply {
            text = "Geri al"
            isEnabled = false
            setOnClickListener { renderer.requestUndo() }
        }
        finishButton = Button(this).apply {
            text = "Bitir"
            visibility = if (TabelaMetricMath.requiredPointCount(shapeType) == null) View.VISIBLE else View.GONE
            isEnabled = false
            setOnClickListener { renderer.requestFinish() }
        }
        listOf(cancelButton, undoButton, finishButton).forEach { button ->
            topBar.addView(button, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                setMargins(5, 0, 5, 0)
            })
        }
        root.addView(topBar, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT).apply {
            gravity = Gravity.TOP
            setMargins(12, 30, 12, 0)
        })

        setContentView(root)

        renderer = UniversalARRenderer(
            activity = this,
            shapeType = shapeType,
            onStatus = { message -> runOnUiThread { info.text = message } },
            onPointCount = { count ->
                runOnUiThread {
                    undoButton.isEnabled = count > 0
                    finishButton.isEnabled = TabelaMetricMath.requiredPointCount(shapeType) == null && count >= 3
                }
            },
            onComplete = { result ->
                runOnUiThread {
                    val data = Intent().putExtra(EXTRA_RESULT, result.toString())
                    setResult(Activity.RESULT_OK, data)
                    finish()
                }
            },
            onRejected = { result ->
                runOnUiThread {
                    val q = result.optDouble("qualityScore", 0.0).roundToInt()
                    val reasons = result.optJSONArray("failureReasons")
                    val reasonText = buildString {
                        append("Ölçüm kalite kapısından geçmedi (%")
                        append(q)
                        append(").")
                        if (reasons != null && reasons.length() > 0) {
                            append(" ")
                            append((0 until reasons.length()).joinToString(", ") { reasons.optString(it) })
                        }
                        append(" Noktaları tekrar seçin.")
                    }
                    info.text = reasonText
                }
            }
        )
        surfaceView.setRenderer(renderer)
        surfaceView.renderMode = GLSurfaceView.RENDERMODE_CONTINUOUSLY
        surfaceView.setOnTouchListener { _, event ->
            if (event.action == MotionEvent.ACTION_UP) {
                renderer.queueTap(event.x, event.y)
                true
            } else true
        }
    }

    override fun onResume() {
        super.onResume()
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            finishWithError("camera_permission_denied", "Gerçek AR ölçümü için kamera izni gerekli.")
            return
        }

        try {
            val installStatus = ArCoreApk.getInstance().requestInstall(this, !installRequested)
            if (installStatus == ArCoreApk.InstallStatus.INSTALL_REQUESTED) {
                installRequested = true
                info.text = "Google Play Hizmetleri AR kurulumu bekleniyor…"
                return
            }

            if (session == null) session = Session(this)
            val currentSession = session ?: run {
                finishWithError("arcore_session_failed", "ARCore oturumu oluşturulamadı.")
                return
            }

            val config = Config(currentSession).apply {
                planeFindingMode = Config.PlaneFindingMode.HORIZONTAL_AND_VERTICAL
                focusMode = Config.FocusMode.AUTO
                instantPlacementMode = Config.InstantPlacementMode.DISABLED
            }
            depthSupported = currentSession.isDepthModeSupported(Config.DepthMode.AUTOMATIC)
            if (depthSupported) config.depthMode = Config.DepthMode.AUTOMATIC
            currentSession.configure(config)

            renderer.session = currentSession
            renderer.depthSupported = depthSupported
            currentSession.resume()
            surfaceView.onResume()
            info.text = renderer.initialInstruction(depthSupported)
        } catch (e: UnavailableArcoreNotInstalledException) {
            finishWithError("arcore_not_installed", "ARCore kurulamadı veya cihazda mevcut değil.")
        } catch (e: UnavailableUserDeclinedInstallationException) {
            finishWithError("arcore_install_declined", "ARCore kurulumu reddedildi.")
        } catch (e: UnavailableApkTooOldException) {
            finishWithError("arcore_too_old", "Google Play Hizmetleri AR güncellenmeli.")
        } catch (e: UnavailableSdkTooOldException) {
            finishWithError("app_arcore_sdk_too_old", "Uygulamanın ARCore bileşeni güncellenmeli.")
        } catch (e: UnavailableDeviceNotCompatibleException) {
            finishWithError("arcore_unsupported_device", "Bu cihaz ARCore world tracking desteklemiyor. Ölçüm üretilmedi.")
        } catch (e: CameraNotAvailableException) {
            finishWithError("camera_not_available", "Kamera başka bir uygulama tarafından kullanılıyor veya erişilemiyor.")
        } catch (e: Exception) {
            finishWithError("arcore_start_failed", "ARCore başlatılamadı: ${e.message ?: e.javaClass.simpleName}")
        }
    }

    override fun onPause() {
        runCatching { surfaceView.onPause() }
        runCatching { session?.pause() }
        super.onPause()
    }

    override fun onDestroy() {
        renderer.cancel()
        runCatching { session?.close() }
        session = null
        super.onDestroy()
    }

    private fun finishWithError(code: String, message: String) {
        if (isFinishing || isDestroyed) return
        val data = Intent()
            .putExtra(EXTRA_ERROR_CODE, code)
            .putExtra(EXTRA_ERROR, message)
        setResult(Activity.RESULT_CANCELED, data)
        finish()
    }
}

private class UniversalARRenderer(
    private val activity: Activity,
    private val shapeType: String,
    private val onStatus: (String) -> Unit,
    private val onPointCount: (Int) -> Unit,
    private val onComplete: (JSONObject) -> Unit,
    private val onRejected: (JSONObject) -> Unit
) : GLSurfaceView.Renderer {
    @Volatile var session: Session? = null
    @Volatile var depthSupported: Boolean = false
    @Volatile private var pendingTap: Pair<Float, Float>? = null
    @Volatile private var undoRequested = false
    @Volatile private var finishRequested = false

    private val points = mutableListOf<Pose>()
    private val pointKinds = mutableListOf<String>()
    private val hitScores = mutableListOf<Double>()
    private val background = UniversalCameraBackgroundRenderer()
    private var textureAttached = false
    private var width = 0
    private var height = 0
    private var geometryApplied = false
    private var stableTrackingFrames = 0

    fun queueTap(x: Float, y: Float) { pendingTap = x to y }
    fun requestUndo() { undoRequested = true }
    fun requestFinish() { finishRequested = true }
    fun cancel() {
        pendingTap = null
        undoRequested = false
        finishRequested = false
        points.clear()
        pointKinds.clear()
        hitScores.clear()
    }

    fun initialInstruction(depth: Boolean): String {
        val mode = if (depth) "ARCore Depth + düzlem" else "ARCore düzlem"
        return "$mode hazır • ${nextPrompt()}\nÖlçümden önce kamerayı yüzey üzerinde yavaşça gezdirin."
    }

    override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
        GLES20.glClearColor(0f, 0f, 0f, 1f)
        background.createOnGlThread()
        textureAttached = false
    }

    override fun onSurfaceChanged(gl: GL10?, width: Int, height: Int) {
        this.width = width
        this.height = height
        GLES20.glViewport(0, 0, width, height)
        geometryApplied = false
    }

    override fun onDrawFrame(gl: GL10?) {
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT or GLES20.GL_DEPTH_BUFFER_BIT)
        val currentSession = session ?: return
        if (!textureAttached) {
            currentSession.setCameraTextureName(background.textureId)
            textureAttached = true
        }
        if (!geometryApplied && width > 0 && height > 0) {
            val rotation = activity.window.decorView.display?.rotation ?: Surface.ROTATION_0
            currentSession.setDisplayGeometry(rotation, width, height)
            geometryApplied = true
        }

        val frame = try { currentSession.update() } catch (_: CameraNotAvailableException) { return } catch (_: Exception) { return }
        background.draw(frame)

        if (frame.camera.trackingState == TrackingState.TRACKING) {
            stableTrackingFrames = (stableTrackingFrames + 1).coerceAtMost(120)
        } else {
            stableTrackingFrames = 0
        }

        if (undoRequested) {
            undoRequested = false
            if (points.isNotEmpty()) {
                points.removeAt(points.lastIndex)
                pointKinds.removeAt(pointKinds.lastIndex)
                hitScores.removeAt(hitScores.lastIndex)
                onPointCount(points.size)
                onStatus("Son nokta geri alındı • ${nextPrompt()}")
            }
        }

        val tap = pendingTap
        if (tap != null) {
            pendingTap = null
            processTap(frame, tap.first, tap.second)
        }

        if (finishRequested) {
            finishRequested = false
            if (TabelaMetricMath.requiredPointCount(shapeType) == null) {
                if (points.size >= 3) finishMeasurement(frame)
                else onStatus("Çokgen/serbest form için en az 3 çevre noktası gerekli.")
            }
        }
    }

    private fun processTap(frame: Frame, x: Float, y: Float) {
        if (frame.camera.trackingState != TrackingState.TRACKING) {
            onStatus("AR takip kararlı değil. Kamerayı yavaşça hareket ettirin.")
            return
        }
        if (stableTrackingFrames < 15) {
            onStatus("AR haritası henüz kararlı değil. Yüzeyi 1–2 saniye yavaşça tarayın.")
            return
        }

        val required = TabelaMetricMath.requiredPointCount(shapeType)
        if (required != null && points.size >= required) return
        if (required == null && points.size >= 24) {
            onStatus("En fazla 24 çevre noktası kabul edilir. Bitir düğmesine basın.")
            return
        }

        val hit = chooseTrustedHit(frame, x, y)
        if (hit == null) {
            onStatus(
                if (depthSupported) "Bu noktada güvenilir Depth/düzlem bulunamadı. Yüzeyi tarayıp tekrar dokunun."
                else "Bu noktada doğrulanmış AR düzlemi bulunamadı. Yüzeyi tarayıp tekrar dokunun."
            )
            return
        }

        val kind = when (hit.trackable) {
            is DepthPoint -> "DepthPoint"
            is Plane -> "Plane"
            else -> "Rejected"
        }
        val score = when (kind) {
            "DepthPoint" -> 100.0
            "Plane" -> 94.0
            else -> 0.0
        }

        points += hit.hitPose
        pointKinds += kind
        hitScores += score
        onPointCount(points.size)

        if (required != null && points.size == required) {
            finishMeasurement(frame)
        } else {
            val suffix = if (required == null) " (${points.size}/24 • bitirmek için Bitir)" else " (${points.size}/$required)"
            onStatus("${if (depthSupported) "ARCore Depth" else "ARCore"} • ${nextPrompt()}$suffix")
        }
    }

    private fun chooseTrustedHit(frame: Frame, x: Float, y: Float): HitResult? {
        val hits = frame.hitTest(x, y)
        val depth = hits.firstOrNull { result ->
            val trackable = result.trackable
            trackable is DepthPoint && trackable.trackingState == TrackingState.TRACKING
        }
        if (depth != null) return depth
        return hits.firstOrNull { result ->
            val trackable = result.trackable
            trackable is Plane && trackable.trackingState == TrackingState.TRACKING && trackable.isPoseInPolygon(result.hitPose)
        }
    }

    private fun finishMeasurement(frame: Frame) {
        val required = TabelaMetricMath.requiredPointCount(shapeType)
        if (required != null && points.size != required) return
        if (required == null && points.size !in 3..24) return

        val worldPoints = points.map { pose -> Vec3(pose.tx().toDouble(), pose.ty().toDouble(), pose.tz().toDouble()) }
        val cameraPose = frame.camera.pose
        val camera = Vec3(cameraPose.tx().toDouble(), cameraPose.ty().toDouble(), cameraPose.tz().toDouble())
        val depthUsed = pointKinds.any { it == "DepthPoint" }
        val source = if (depthUsed) "ARCore-Depth-HitTest-3D" else "ARCore-Plane-HitTest-3D"
        val avgHit = if (hitScores.isEmpty()) 0.0 else hitScores.average()
        val trackingQuality = (70.0 + stableTrackingFrames.coerceAtMost(15) * 2.0).coerceAtMost(100.0)
        val sensorQuality = if (depthUsed) (avgHit * 0.7 + trackingQuality * 0.3) else null

        val metric = TabelaMetricMath.measure(
            points = worldPoints,
            shapeType = shapeType,
            camera = camera,
            source = source,
            sensorQuality = sensorQuality,
            hitQuality = avgHit,
            depthAssisted = depthUsed,
            lidar = false
        )
        val result = metric.toJson(
            depthAvailable = depthSupported,
            depthUsed = depthUsed,
            pointKinds = pointKinds
        )

        points.clear()
        pointKinds.clear()
        hitScores.clear()
        onPointCount(0)

        if (metric.verified) onComplete(result) else onRejected(result)
    }

    private fun nextPrompt(): String {
        val labels = TabelaMetricMath.promptLabels(shapeType)
        return if (TabelaMetricMath.requiredPointCount(shapeType) == null) {
            "ÇEVRE NOKTASI ${points.size + 1}'e dokunun"
        } else {
            val index = points.size.coerceIn(0, labels.lastIndex)
            "${labels[index]} noktasına dokunun"
        }
    }

    private fun ShapeMetricResult.toJson(
        depthAvailable: Boolean,
        depthUsed: Boolean,
        pointKinds: List<String>
    ): JSONObject {
        val result = JSONObject()
            .put("verified", verified)
            .put("source", source)
            .put("shapeType", shapeType)
            .put("lidar", false)
            .put("arcoreDepthAvailable", depthAvailable)
            .put("arcoreDepth", depthUsed)
            .put("depthAssisted", depthUsed)
            .put("qualityScore", qualityScore)
            .put("widthM", widthM)
            .put("heightM", heightM)
            .put("planeDeviationM", planeDeviationM)
            .put("pointCount", pointCount)
            .put("pointKinds", JSONArray(pointKinds))
            .put("failureReasons", JSONArray(failureReasons))
        areaM2?.let { result.put("areaM2", it) }
        diameterM?.let { result.put("diameterM", it) }
        polygonAreaM2?.let { result.put("polygonAreaM2", it) }
        distanceM?.let { result.put("distanceM", it) }
        val diag = JSONObject()
        diagnostics.forEach { (key, value) -> if (value.isFinite()) diag.put(key, value) }
        result.put("diagnostics", diag)
        return result
    }
}

private class UniversalCameraBackgroundRenderer {
    var textureId: Int = -1
        private set
    private var program = 0
    private var positionLoc = 0
    private var texCoordLoc = 0
    private var samplerLoc = 0
    private val quadCoords: FloatBuffer = bufferOf(floatArrayOf(-1f, -1f, 1f, -1f, -1f, 1f, 1f, 1f))
    private val texCoords: FloatBuffer = bufferOf(FloatArray(8))

    fun createOnGlThread() {
        val textures = IntArray(1)
        GLES20.glGenTextures(1, textures, 0)
        textureId = textures[0]
        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textureId)
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)

        val vertex = compile(GLES20.GL_VERTEX_SHADER, """
            attribute vec4 a_Position;
            attribute vec2 a_TexCoord;
            varying vec2 v_TexCoord;
            void main(){ gl_Position=a_Position; v_TexCoord=a_TexCoord; }
        """.trimIndent())
        val fragment = compile(GLES20.GL_FRAGMENT_SHADER, """
            #extension GL_OES_EGL_image_external : require
            precision mediump float;
            uniform samplerExternalOES sTexture;
            varying vec2 v_TexCoord;
            void main(){ gl_FragColor=texture2D(sTexture,v_TexCoord); }
        """.trimIndent())
        program = GLES20.glCreateProgram()
        GLES20.glAttachShader(program, vertex)
        GLES20.glAttachShader(program, fragment)
        GLES20.glLinkProgram(program)
        val linkStatus = IntArray(1)
        GLES20.glGetProgramiv(program, GLES20.GL_LINK_STATUS, linkStatus, 0)
        if (linkStatus[0] == 0) throw IllegalStateException("OpenGL program link failed: ${GLES20.glGetProgramInfoLog(program)}")
        positionLoc = GLES20.glGetAttribLocation(program, "a_Position")
        texCoordLoc = GLES20.glGetAttribLocation(program, "a_TexCoord")
        samplerLoc = GLES20.glGetUniformLocation(program, "sTexture")
    }

    fun draw(frame: Frame) {
        if (program == 0 || textureId < 0) return
        quadCoords.position(0)
        texCoords.position(0)
        frame.transformCoordinates2d(
            Coordinates2d.OPENGL_NORMALIZED_DEVICE_COORDINATES,
            quadCoords,
            Coordinates2d.TEXTURE_NORMALIZED,
            texCoords
        )
        quadCoords.position(0)
        texCoords.position(0)
        GLES20.glDisable(GLES20.GL_DEPTH_TEST)
        GLES20.glDepthMask(false)
        GLES20.glUseProgram(program)
        GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textureId)
        GLES20.glUniform1i(samplerLoc, 0)
        GLES20.glEnableVertexAttribArray(positionLoc)
        GLES20.glVertexAttribPointer(positionLoc, 2, GLES20.GL_FLOAT, false, 0, quadCoords)
        GLES20.glEnableVertexAttribArray(texCoordLoc)
        GLES20.glVertexAttribPointer(texCoordLoc, 2, GLES20.GL_FLOAT, false, 0, texCoords)
        GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
        GLES20.glDisableVertexAttribArray(positionLoc)
        GLES20.glDisableVertexAttribArray(texCoordLoc)
        GLES20.glDepthMask(true)
        GLES20.glEnable(GLES20.GL_DEPTH_TEST)
    }

    private fun compile(type: Int, source: String): Int {
        val shader = GLES20.glCreateShader(type)
        GLES20.glShaderSource(shader, source)
        GLES20.glCompileShader(shader)
        val status = IntArray(1)
        GLES20.glGetShaderiv(shader, GLES20.GL_COMPILE_STATUS, status, 0)
        if (status[0] == 0) throw IllegalStateException("OpenGL shader compile failed: ${GLES20.glGetShaderInfoLog(shader)}")
        return shader
    }

    companion object {
        private fun bufferOf(data: FloatArray): FloatBuffer = ByteBuffer
            .allocateDirect(data.size * 4)
            .order(ByteOrder.nativeOrder())
            .asFloatBuffer()
            .apply { put(data); position(0) }
    }
}
