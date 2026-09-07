package ai.tabela.mobile

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

data class Vec3(val x: Double, val y: Double, val z: Double) {
    operator fun minus(other: Vec3) = Vec3(x - other.x, y - other.y, z - other.z)
    operator fun plus(other: Vec3) = Vec3(x + other.x, y + other.y, z + other.z)
    operator fun div(value: Double) = Vec3(x / value, y / value, z / value)
    operator fun times(value: Double) = Vec3(x * value, y * value, z * value)
    fun isFinite() = x.isFinite() && y.isFinite() && z.isFinite()
}

data class ShapeMetricResult(
    val verified: Boolean,
    val shapeType: String,
    val source: String,
    val widthM: Double,
    val heightM: Double,
    val areaM2: Double?,
    val diameterM: Double?,
    val polygonAreaM2: Double?,
    val distanceM: Double?,
    val qualityScore: Double,
    val planeDeviationM: Double,
    val pointCount: Int,
    val failureReasons: List<String>,
    val diagnostics: Map<String, Double>
)

object TabelaMetricMath {
    private const val EPS = 1e-9
    private val rectangleShapes = setOf("horizontal-rectangle", "vertical-rectangle", "rectangle", "square")

    fun requiredPointCount(shapeType: String): Int? = when (shapeType) {
        "triangle" -> 3
        "polygon", "freeform" -> null
        "circle", "oval" -> 4
        else -> 4
    }

    fun promptLabels(shapeType: String): List<String> = when (shapeType) {
        "triangle" -> listOf("1. KÖŞE", "2. KÖŞE", "3. KÖŞE")
        "circle", "oval" -> listOf("SOL UÇ", "SAĞ UÇ", "ÜST UÇ", "ALT UÇ")
        "polygon", "freeform" -> listOf("ÇEVRE NOKTASI")
        else -> listOf("SOL ÜST", "SAĞ ÜST", "SOL ALT", "SAĞ ALT")
    }

    fun measure(
        points: List<Vec3>,
        shapeType: String,
        camera: Vec3? = null,
        source: String,
        sensorQuality: Double? = null,
        hitQuality: Double = 100.0,
        depthAssisted: Boolean = false,
        lidar: Boolean = false
    ): ShapeMetricResult {
        val shape = canonicalShape(shapeType)
        val failures = mutableListOf<String>()
        val diagnostics = linkedMapOf<String, Double>()
        val required = requiredPointCount(shape)

        if (required != null && points.size != required) failures += "point_count"
        if (required == null && points.size !in 3..24) failures += "point_count"
        if (points.any { !it.isFinite() }) failures += "non_finite_point"

        if (points.size < 2) {
            return failed(shape, source, points.size, failures.ifEmpty { listOf("insufficient_points") })
        }

        val center = centroid(points)
        val cameraDistance = camera?.takeIf { it.isFinite() }?.let { distance(it, center) }
        val pairScale = maxPairDistance(points)
        if (!pairScale.isFinite() || pairScale < 0.01 || pairScale > 1000.0) failures += "invalid_scale"

        val basis = if (points.size >= 3) planeBasis(points) else null
        val planeDeviation = basis?.maxDeviation ?: 0.0
        diagnostics["planeDeviationM"] = planeDeviation
        val planeTolerance = max(0.015, pairScale * 0.02)
        if (points.size >= 4 && (basis == null || planeDeviation > planeTolerance)) failures += "non_coplanar"

        var width = 0.0
        var height = 0.0
        var area: Double? = null
        var diameter: Double? = null
        var polygonArea: Double? = null
        var geometryScore = 100.0

        when {
            shape in rectangleShapes -> {
                if (points.size == 4) {
                    val tl = points[0]; val tr = points[1]; val bl = points[2]; val br = points[3]
                    val top = distance(tl, tr)
                    val bottom = distance(bl, br)
                    val left = distance(tl, bl)
                    val right = distance(tr, br)
                    width = (top + bottom) / 2.0
                    height = (left + right) / 2.0
                    area = width * height

                    val widthMismatch = abs(top - bottom) / max(width, 0.001)
                    val heightMismatch = abs(left - right) / max(height, 0.001)
                    val d1 = distance(tl, br)
                    val d2 = distance(tr, bl)
                    val diagonalMismatch = abs(d1 - d2) / max((d1 + d2) / 2.0, 0.001)
                    val topVector = tr - tl
                    val leftVector = bl - tl
                    val orthogonality = abs(dot(normalize(topVector), normalize(leftVector)))
                    val predictedBr = tr + (bl - tl)
                    val closureError = distance(predictedBr, br) / max(pairScale, 0.001)
                    val squareMismatch = if (shape == "square") abs(width - height) / max((width + height) / 2.0, 0.001) else 0.0

                    diagnostics["widthMismatch"] = widthMismatch
                    diagnostics["heightMismatch"] = heightMismatch
                    diagnostics["diagonalMismatch"] = diagonalMismatch
                    diagnostics["orthogonality"] = orthogonality
                    diagnostics["closureError"] = closureError
                    if (shape == "square") diagnostics["squareMismatch"] = squareMismatch

                    geometryScore -= min(35.0, (widthMismatch + heightMismatch) * 220.0)
                    geometryScore -= min(18.0, diagonalMismatch * 180.0)
                    geometryScore -= min(18.0, orthogonality * 120.0)
                    geometryScore -= min(18.0, closureError * 260.0)
                    if (shape == "square") geometryScore -= min(25.0, squareMismatch * 220.0)

                    if (widthMismatch > 0.08 || heightMismatch > 0.08) failures += "opposite_edge_mismatch"
                    if (diagonalMismatch > 0.10) failures += "diagonal_mismatch"
                    if (orthogonality > 0.18) failures += "not_orthogonal"
                    if (closureError > 0.06) failures += "corner_closure"
                    if (shape == "square" && squareMismatch > 0.10) failures += "not_square"
                }
            }

            shape == "circle" || shape == "oval" -> {
                if (points.size == 4) {
                    val left = points[0]; val right = points[1]; val top = points[2]; val bottom = points[3]
                    width = distance(left, right)
                    height = distance(top, bottom)
                    val centerHorizontal = midpoint(left, right)
                    val centerVertical = midpoint(top, bottom)
                    val centerMismatch = distance(centerHorizontal, centerVertical) / max(pairScale, 0.001)
                    val axisOrthogonality = abs(dot(normalize(right - left), normalize(bottom - top)))
                    val ratioMismatch = abs(width - height) / max((width + height) / 2.0, 0.001)

                    diagnostics["centerMismatch"] = centerMismatch
                    diagnostics["axisOrthogonality"] = axisOrthogonality
                    diagnostics["diameterMismatch"] = ratioMismatch

                    geometryScore -= min(35.0, centerMismatch * 420.0)
                    geometryScore -= min(25.0, axisOrthogonality * 150.0)
                    if (shape == "circle") geometryScore -= min(35.0, ratioMismatch * 260.0)

                    if (centerMismatch > 0.06) failures += "axis_center_mismatch"
                    if (axisOrthogonality > 0.20) failures += "axes_not_orthogonal"
                    if (shape == "circle" && ratioMismatch > 0.12) failures += "circle_diameter_mismatch"

                    if (shape == "circle") {
                        diameter = (width + height) / 2.0
                        area = PI * (diameter / 2.0) * (diameter / 2.0)
                    } else {
                        area = PI * (width / 2.0) * (height / 2.0)
                    }
                }
            }

            shape == "triangle" -> {
                if (points.size == 3) {
                    val a = distance(points[0], points[1])
                    val b = distance(points[1], points[2])
                    val c = distance(points[2], points[0])
                    val longest = max(a, max(b, c))
                    val crossLen = norm(cross(points[1] - points[0], points[2] - points[0]))
                    area = crossLen / 2.0
                    width = longest
                    height = if (longest > EPS) 2.0 * area / longest else 0.0
                    val thinness = if (longest > EPS) area / (longest * longest) else 0.0
                    diagnostics["triangleThinness"] = thinness
                    geometryScore -= min(55.0, max(0.0, 0.08 - thinness) * 650.0)
                    if (area <= 0.0001 || thinness < 0.015) failures += "degenerate_triangle"
                }
            }

            shape == "polygon" || shape == "freeform" -> {
                if (points.size >= 3 && basis != null) {
                    val projected = basis.projected
                    val selfIntersecting = polygonSelfIntersects(projected)
                    val signedArea = shoelaceSigned(projected)
                    polygonArea = abs(signedArea)
                    area = polygonArea
                    width = projected.maxOf { it.first } - projected.minOf { it.first }
                    height = projected.maxOf { it.second } - projected.minOf { it.second }
                    val minEdge = projected.indices.minOf { i ->
                        val j = (i + 1) % projected.size
                        distance2(projected[i], projected[j])
                    }
                    diagnostics["minBoundaryEdgeM"] = minEdge
                    if (selfIntersecting) failures += "self_intersecting_polygon"
                    if (polygonArea <= 0.0001) failures += "degenerate_polygon"
                    if (minEdge < 0.005) failures += "duplicate_boundary_points"
                    if (selfIntersecting) geometryScore -= 60.0
                    if (minEdge < 0.005) geometryScore -= 30.0
                }
            }
        }

        if (!width.isFinite() || !height.isFinite() || width <= 0.01 || height <= 0.01 || width > 1000 || height > 1000) {
            failures += "invalid_dimensions"
        }
        if (area != null && (!area.isFinite() || area <= 0.0001 || area > 1_000_000.0)) failures += "invalid_area"

        if (points.size >= 4 && pairScale > EPS) {
            val planeRatio = planeDeviation / pairScale
            diagnostics["planeRatio"] = planeRatio
            geometryScore -= min(35.0, planeRatio * 900.0)
        }
        geometryScore = clamp(geometryScore)

        val hitQ = clamp(hitQuality)
        val sensorQ = clamp(sensorQuality ?: hitQ)
        var finalQuality = if (lidar || depthAssisted) {
            clamp(geometryScore * 0.60 + sensorQ * 0.25 + hitQ * 0.15)
        } else {
            min(88.0, clamp(geometryScore * 0.75 + hitQ * 0.25))
        }
        if (failures.contains("non_coplanar")) finalQuality = min(finalQuality, 70.0)
        if (failures.contains("self_intersecting_polygon")) finalQuality = min(finalQuality, 55.0)

        diagnostics["geometryScore"] = geometryScore
        diagnostics["sensorQuality"] = sensorQ
        diagnostics["hitQuality"] = hitQ
        val threshold = if (lidar || depthAssisted) 88.0 else 80.0
        val verified = failures.isEmpty() && finalQuality >= threshold
        if (!verified && finalQuality < threshold) failures += "quality_below_threshold"

        return ShapeMetricResult(
            verified = verified,
            shapeType = shape,
            source = source,
            widthM = width,
            heightM = height,
            areaM2 = area,
            diameterM = diameter,
            polygonAreaM2 = polygonArea,
            distanceM = cameraDistance,
            qualityScore = finalQuality,
            planeDeviationM = planeDeviation,
            pointCount = points.size,
            failureReasons = failures.distinct(),
            diagnostics = diagnostics
        )
    }

    private fun canonicalShape(shapeType: String): String = when (shapeType) {
        "horizontal-rectangle", "vertical-rectangle", "rectangle", "square", "circle", "oval", "triangle", "polygon", "freeform" -> shapeType
        else -> "horizontal-rectangle"
    }

    private fun failed(shape: String, source: String, pointCount: Int, reasons: List<String>) = ShapeMetricResult(
        verified = false,
        shapeType = shape,
        source = source,
        widthM = 0.0,
        heightM = 0.0,
        areaM2 = null,
        diameterM = null,
        polygonAreaM2 = null,
        distanceM = null,
        qualityScore = 0.0,
        planeDeviationM = 0.0,
        pointCount = pointCount,
        failureReasons = reasons.distinct(),
        diagnostics = emptyMap()
    )

    private data class PlaneBasis(
        val origin: Vec3,
        val u: Vec3,
        val v: Vec3,
        val normal: Vec3,
        val projected: List<Pair<Double, Double>>,
        val maxDeviation: Double
    )

    private fun planeBasis(points: List<Vec3>): PlaneBasis? {
        if (points.size < 3) return null
        val origin = points[0]
        var uCandidate: Vec3? = null
        for (i in 1 until points.size) {
            val edge = points[i] - origin
            if (norm(edge) > 1e-5) { uCandidate = edge; break }
        }
        val uRaw = uCandidate ?: return null
        val u = normalize(uRaw)
        var n: Vec3? = null
        for (i in 1 until points.size) {
            for (j in i + 1 until points.size) {
                val c = cross(points[i] - origin, points[j] - origin)
                if (norm(c) > 1e-6) { n = normalize(c); break }
            }
            if (n != null) break
        }
        val normal = n ?: return null
        val v = normalize(cross(normal, u))
        if (norm(v) < 1e-6) return null
        val projected = points.map { p ->
            val d = p - origin
            dot(d, u) to dot(d, v)
        }
        val maxDeviation = points.maxOf { p -> abs(dot(p - origin, normal)) }
        return PlaneBasis(origin, u, v, normal, projected, maxDeviation)
    }

    private fun polygonSelfIntersects(points: List<Pair<Double, Double>>): Boolean {
        if (points.size < 4) return false
        for (i in points.indices) {
            val i2 = (i + 1) % points.size
            for (j in i + 1 until points.size) {
                val j2 = (j + 1) % points.size
                if (i == j || i2 == j || j2 == i) continue
                if (i == 0 && j2 == 0) continue
                if (segmentsIntersect(points[i], points[i2], points[j], points[j2])) return true
            }
        }
        return false
    }

    private fun segmentsIntersect(
        a: Pair<Double, Double>, b: Pair<Double, Double>,
        c: Pair<Double, Double>, d: Pair<Double, Double>
    ): Boolean {
        fun orient(p: Pair<Double, Double>, q: Pair<Double, Double>, r: Pair<Double, Double>): Double =
            (q.first - p.first) * (r.second - p.second) - (q.second - p.second) * (r.first - p.first)
        val o1 = orient(a, b, c)
        val o2 = orient(a, b, d)
        val o3 = orient(c, d, a)
        val o4 = orient(c, d, b)
        return ((o1 > EPS && o2 < -EPS) || (o1 < -EPS && o2 > EPS)) &&
            ((o3 > EPS && o4 < -EPS) || (o3 < -EPS && o4 > EPS))
    }

    private fun shoelaceSigned(points: List<Pair<Double, Double>>): Double {
        var sum = 0.0
        for (i in points.indices) {
            val j = (i + 1) % points.size
            sum += points[i].first * points[j].second - points[j].first * points[i].second
        }
        return sum / 2.0
    }

    private fun distance2(a: Pair<Double, Double>, b: Pair<Double, Double>): Double {
        val dx = a.first - b.first
        val dy = a.second - b.second
        return sqrt(dx * dx + dy * dy)
    }

    private fun centroid(points: List<Vec3>): Vec3 {
        var x = 0.0; var y = 0.0; var z = 0.0
        points.forEach { x += it.x; y += it.y; z += it.z }
        val n = max(1, points.size).toDouble()
        return Vec3(x / n, y / n, z / n)
    }

    private fun midpoint(a: Vec3, b: Vec3) = (a + b) / 2.0
    private fun maxPairDistance(points: List<Vec3>): Double {
        var result = 0.0
        for (i in points.indices) for (j in i + 1 until points.size) result = max(result, distance(points[i], points[j]))
        return result
    }

    private fun distance(a: Vec3, b: Vec3) = norm(a - b)
    private fun dot(a: Vec3, b: Vec3) = a.x * b.x + a.y * b.y + a.z * b.z
    private fun cross(a: Vec3, b: Vec3) = Vec3(
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x
    )
    private fun norm(a: Vec3) = sqrt(dot(a, a))
    private fun normalize(a: Vec3): Vec3 {
        val n = norm(a)
        return if (n > EPS) a * (1.0 / n) else Vec3(0.0, 0.0, 0.0)
    }
    private fun clamp(value: Double, minValue: Double = 0.0, maxValue: Double = 100.0) = min(maxValue, max(minValue, value))
}
