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
import android.widget.Button
import android.widget.FrameLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.google.ar.core.Config
import com.google.ar.core.Coordinates2d
import com.google.ar.core.DepthPoint
import com.google.ar.core.Frame
import com.google.ar.core.Plane
import com.google.ar.core.Point
import com.google.ar.core.Pose
import com.google.ar.core.Session
import com.google.ar.core.TrackingState
import org.json.JSONArray
import org.json.JSONObject
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

class ARMeasurementActivity : AppCompatActivity() {
    companion object {
        const val EXTRA_REQUEST = "tabela_request"
        const val EXTRA_RESULT = "tabela_result"
    }

    private lateinit var surfaceView: GLSurfaceView
    private lateinit var info: TextView
    private lateinit var renderer: ARRenderer
    private var session: Session? = null
    private var depthEnabled = false
    private val requestJson: String by lazy { intent.getStringExtra(EXTRA_REQUEST) ?: "{}" }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = FrameLayout(this)
        surfaceView = GLSurfaceView(this).apply {
            setEGLContextClientVersion(2)
            preserveEGLContextOnPause = true
        }
        root.addView(surfaceView, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))

        info = TextView(this).apply {
            setTextColor(Color.WHITE)
            setBackgroundColor(0xB8000000.toInt())
            textSize = 15f
            gravity = Gravity.CENTER
            setPadding(20, 12, 20, 12)
            text = "AR hazırlanıyor…"
        }
        val infoParams = FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT).apply {
            gravity = Gravity.BOTTOM
            setMargins(20, 20, 20, 36)
        }
        root.addView(info, infoParams)

        val cancel = Button(this).apply {
            text = "İptal"
            setOnClickListener { setResult(Activity.RESULT_CANCELED); finish() }
        }
        val cancelParams = FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT).apply {
            gravity = Gravity.TOP or Gravity.END
            setMargins(18, 42, 18, 18)
        }
        root.addView(cancel, cancelParams)
        setContentView(root)

        renderer = ARRenderer(
            activity = this,
            shapeType = runCatching { JSONObject(requestJson).optString("shapeType", "horizontal-rectangle") }.getOrDefault("horizontal-rectangle"),
            onStatus = { message -> runOnUiThread { info.text = message } },
            onComplete = { result ->
                runOnUiThread {
                    val resultIntent = Intent().putExtra(EXTRA_RESULT, result.toString())
                    setResult(Activity.RESULT_OK, resultIntent)
                    finish()
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
            info.text = "Kamera izni gerekli."
            setResult(Activity.RESULT_CANCELED)
            finish()
            return
        }
        try {
            if (session == null) session = Session(this)
            val s = session ?: return
            val config = Config(s).apply {
                planeFindingMode = Config.PlaneFindingMode.HORIZONTAL_AND_VERTICAL
                focusMode = Config.FocusMode.AUTO
            }
            depthEnabled = s.isDepthModeSupported(Config.DepthMode.AUTOMATIC)
            if (depthEnabled) config.depthMode = Config.DepthMode.AUTOMATIC
            s.configure(config)
            renderer.session = s
            renderer.depthEnabled = depthEnabled
            s.resume()
            surfaceView.onResume()
            info.text = if (depthEnabled) "ARCore Depth hazır • SOL ÜST köşeye dokunun" else "ARCore hazır • SOL ÜST köşeye dokunun"
        } catch (e: Exception) {
            info.text = "ARCore başlatılamadı: ${e.message ?: "uyumsuz cihaz"}"
        }
    }

    override fun onPause() {
        surfaceView.onPause()
        session?.pause()
        super.onPause()
    }

    override fun onDestroy() {
        session?.close()
        session = null
        super.onDestroy()
    }
}

private class ARRenderer(
    private val activity: Activity,
    private val shapeType: String,
    private val onStatus: (String) -> Unit,
    private val onComplete: (JSONObject) -> Unit
) : GLSurfaceView.Renderer {
    @Volatile var session: Session? = null
    @Volatile var depthEnabled: Boolean = false
    @Volatile private var pendingTap: Pair<Float, Float>? = null
    private val points = mutableListOf<Pose>()
    private val pointKinds = mutableListOf<String>()
    private val background = CameraBackgroundRenderer()
    private var textureAttached = false
    private var width = 0
    private var height = 0
    private var geometryApplied = false

    fun queueTap(x: Float, y: Float) { pendingTap = x to y }

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
        val s = session ?: return
        if (!textureAttached) {
            s.setCameraTextureName(background.textureId)
            textureAttached = true
        }
        if (!geometryApplied && width > 0 && height > 0) {
            val rotation = activity.window.decorView.display?.rotation ?: Surface.ROTATION_0
            s.setDisplayGeometry(rotation, width, height)
            geometryApplied = true
        }

        val frame = try { s.update() } catch (_: Exception) { return }
        background.draw(frame)

        val tap = pendingTap ?: return
        pendingTap = null
        processTap(frame, tap.first, tap.second)
    }

    private fun processTap(frame: Frame, x: Float, y: Float) {
        if (frame.camera.trackingState != TrackingState.TRACKING) {
            onStatus("AR takip kararlı değil. Kamerayı yavaşça hareket ettirin.")
            return
        }
        val hit = frame.hitTest(x, y).firstOrNull { result ->
            val trackable = result.trackable
            trackable.trackingState == TrackingState.TRACKING && when (trackable) {
                is Plane -> trackable.isPoseInPolygon(result.hitPose)
                is DepthPoint -> true
                is Point -> true
                else -> false
            }
        }
        if (hit == null) {
            onStatus("Bu noktada güvenilir AR yüzeyi bulunamadı. Tekrar deneyin.")
            return
        }

        val kind = when (hit.trackable) {
            is DepthPoint -> "DepthPoint"
            is Plane -> "Plane"
            is Point -> "Point"
            else -> "Unknown"
        }
        points += hit.hitPose
        pointKinds += kind

        val names = arrayOf("SAĞ ÜST", "SOL ALT", "SAĞ ALT")
        if (points.size < 4) {
            onStatus("${if (depthEnabled) "ARCore Depth" else "ARCore"} • ${names[points.size - 1]} köşeye dokunun (${points.size}/4)")
            return
        }

        val result = buildResult(frame.camera.pose)
        val verified = result.optBoolean("verified", false)
        val q = result.optDouble("qualityScore", 0.0).toInt()
        points.clear()
        pointKinds.clear()
        if (verified) {
            onComplete(result)
        } else {
            onStatus("Ölçüm kalite kapısından geçmedi (%$q). Kamerayı sabitleyin ve 4 köşeyi tekrar seçin.")
        }
    }

    private fun distance(a: Pose, b: Pose): Double {
        val dx = a.tx() - b.tx()
        val dy = a.ty() - b.ty()
        val dz = a.tz() - b.tz()
        return sqrt((dx * dx + dy * dy + dz * dz).toDouble())
    }

    private fun v(p: Pose) = doubleArrayOf(p.tx().toDouble(), p.ty().toDouble(), p.tz().toDouble())
    private fun sub(a: DoubleArray, b: DoubleArray) = doubleArrayOf(a[0]-b[0], a[1]-b[1], a[2]-b[2])
    private fun cross(a: DoubleArray, b: DoubleArray) = doubleArrayOf(a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])
    private fun dot(a: DoubleArray, b: DoubleArray) = a[0]*b[0] + a[1]*b[1] + a[2]*b[2]
    private fun norm(a: DoubleArray) = sqrt(dot(a, a))

    private fun buildResult(camera: Pose): JSONObject {
        val tl = points[0]; val tr = points[1]; val bl = points[2]; val br = points[3]
        val top = distance(tl, tr)
        val bottom = distance(bl, br)
        val left = distance(tl, bl)
        val right = distance(tr, br)
        val widthM = (top + bottom) / 2.0
        val heightM = (left + right) / 2.0

        val widthMismatch = abs(top - bottom) / max(widthM, 0.001)
        val heightMismatch = abs(left - right) / max(heightM, 0.001)
        val e1 = sub(v(tr), v(tl))
        val e2 = sub(v(bl), v(tl))
        val n = cross(e1, e2)
        val nLen = norm(n)
        val planeDistance = if (nLen > 0.000001) abs(dot(sub(v(br), v(tl)), n)) / nLen else Double.POSITIVE_INFINITY
        val scale = max(sqrt(widthM * widthM + heightM * heightM), 0.10)
        val planeRatio = planeDistance / scale
        val edgeConsistent = widthMismatch <= 0.06 && heightMismatch <= 0.06
        val coplanar = planeDistance.isFinite() && planeDistance <= max(0.02, scale * 0.025)

        var geometryScore = 100.0
        geometryScore -= min(45.0, (widthMismatch + heightMismatch) * 260.0)
        geometryScore -= min(35.0, planeRatio * 900.0)
        geometryScore = max(0.0, min(100.0, geometryScore))

        val depthUsed = depthEnabled && pointKinds.any { it == "DepthPoint" }
        val unstableFeaturePoint = pointKinds.any { it == "Point" || it == "Unknown" }
        var qualityScore = if (depthUsed) geometryScore else min(85.0, geometryScore)
        if (unstableFeaturePoint) qualityScore = min(72.0, qualityScore)

        val validDimensions = widthM.isFinite() && heightM.isFinite() && widthM > 0.01 && heightM > 0.01 && widthM < 1000 && heightM < 1000
        val threshold = if (depthUsed) 88.0 else 80.0
        val verified = validDimensions && edgeConsistent && coplanar && !unstableFeaturePoint && qualityScore >= threshold

        val cx = (tl.tx() + tr.tx() + bl.tx() + br.tx()) / 4f
        val cy = (tl.ty() + tr.ty() + bl.ty() + br.ty()) / 4f
        val cz = (tl.tz() + tr.tz() + bl.tz() + br.tz()) / 4f
        val center = Pose.makeTranslation(cx, cy, cz)
        val diameter = (widthM + heightM) / 2.0
        val area: Double? = when (shapeType) {
            "circle" -> PI * (diameter / 2.0) * (diameter / 2.0)
            "oval" -> PI * (widthM / 2.0) * (heightM / 2.0)
            "triangle" -> 0.5 * widthM * heightM
            "polygon", "freeform" -> null
            else -> widthM * heightM
        }
        val source = if (depthUsed) "ARCore-Depth-3D" else "ARCore-Plane-Raycast-3D"
        val result = JSONObject()
            .put("verified", verified)
            .put("source", source)
            .put("shapeType", shapeType)
            .put("lidar", false)
            .put("arcoreDepth", depthUsed)
            .put("qualityScore", qualityScore)
            .put("widthM", widthM)
            .put("heightM", heightM)
            .put("distanceM", distance(camera, center))
            .put("edgeMismatch", JSONObject().put("width", widthMismatch).put("height", heightMismatch))
            .put("planeDeviationM", planeDistance)
            .put("pointKinds", JSONArray(pointKinds))
        if (shapeType == "circle") result.put("diameterM", diameter)
        if (area != null) result.put("areaM2", area)
        return result
    }
}

private class CameraBackgroundRenderer {
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
        positionLoc = GLES20.glGetAttribLocation(program, "a_Position")
        texCoordLoc = GLES20.glGetAttribLocation(program, "a_TexCoord")
        samplerLoc = GLES20.glGetUniformLocation(program, "sTexture")
    }

    fun draw(frame: Frame) {
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
