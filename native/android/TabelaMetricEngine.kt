package com.tabelaai.measurement

data class Point3(val x: Float, val y: Float, val z: Float)
data class TabelaMetricResult(
    val width_m: Double,
    val height_m: Double,
    val area_m2: Double,
    val distance_m: Double?,
    val verified: Boolean,
    val source: String
)

object TabelaMetricEngine {
    private fun distance(a: Point3, b: Point3): Double {
        val dx = (a.x - b.x).toDouble()
        val dy = (a.y - b.y).toDouble()
        val dz = (a.z - b.z).toDouble()
        return kotlin.math.sqrt(dx * dx + dy * dy + dz * dz)
    }

    fun measure(
        topLeft: Point3,
        topRight: Point3,
        bottomLeft: Point3,
        bottomRight: Point3,
        camera: Point3? = null,
        source: String = "ARCore-3D"
    ): TabelaMetricResult {
        val width = (distance(topLeft, topRight) + distance(bottomLeft, bottomRight)) / 2.0
        val height = (distance(topLeft, bottomLeft) + distance(topRight, bottomRight)) / 2.0
        val center = Point3(
            (topLeft.x + topRight.x + bottomLeft.x + bottomRight.x) / 4f,
            (topLeft.y + topRight.y + bottomLeft.y + bottomRight.y) / 4f,
            (topLeft.z + topRight.z + bottomLeft.z + bottomRight.z) / 4f
        )
        return TabelaMetricResult(
            width_m = width,
            height_m = height,
            area_m2 = width * height,
            distance_m = camera?.let { distance(it, center) },
            verified = true,
            source = source
        )
    }
}
