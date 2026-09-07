package ai.tabela.mobile

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

class TabelaMetricMathTest {
    private fun q(result: ShapeMetricResult) = result.qualityScore

    @Test
    fun rectanglePassesWithRealPlanarGeometry() {
        val r = TabelaMetricMath.measure(
            points = listOf(
                Vec3(0.0, 1.0, 0.0),
                Vec3(2.0, 1.0, 0.0),
                Vec3(0.0, 0.0, 0.0),
                Vec3(2.0, 0.0, 0.0)
            ),
            shapeType = "horizontal-rectangle",
            camera = Vec3(1.0, 0.5, 3.0),
            source = "ARCore-Plane-HitTest-3D",
            hitQuality = 96.0
        )
        assertTrue(r.verified)
        assertTrue(abs(r.widthM - 2.0) < 1e-6)
        assertTrue(abs(r.heightM - 1.0) < 1e-6)
        assertTrue(abs((r.areaM2 ?: 0.0) - 2.0) < 1e-6)
        assertTrue(q(r) >= 80.0)
    }

    @Test
    fun nonPlanarRectangleIsRejected() {
        val r = TabelaMetricMath.measure(
            points = listOf(
                Vec3(0.0, 1.0, 0.0),
                Vec3(2.0, 1.0, 0.0),
                Vec3(0.0, 0.0, 0.0),
                Vec3(2.0, 0.0, 0.15)
            ),
            shapeType = "horizontal-rectangle",
            source = "ARCore-Plane-HitTest-3D",
            hitQuality = 96.0
        )
        assertFalse(r.verified)
        assertTrue(r.failureReasons.contains("non_coplanar") || r.failureReasons.contains("corner_closure"))
    }

    @Test
    fun circleUsesFourCardinalPoints() {
        val r = TabelaMetricMath.measure(
            points = listOf(
                Vec3(-1.0, 0.0, 0.0),
                Vec3(1.0, 0.0, 0.0),
                Vec3(0.0, 1.0, 0.0),
                Vec3(0.0, -1.0, 0.0)
            ),
            shapeType = "circle",
            source = "ARCore-Depth-HitTest-3D",
            sensorQuality = 98.0,
            hitQuality = 98.0,
            depthAssisted = true
        )
        assertTrue(r.verified)
        assertTrue(abs((r.diameterM ?: 0.0) - 2.0) < 1e-6)
        assertTrue(abs((r.areaM2 ?: 0.0) - Math.PI) < 1e-6)
    }

    @Test
    fun ovalAreaIsEllipseArea() {
        val r = TabelaMetricMath.measure(
            points = listOf(
                Vec3(-2.0, 0.0, 0.0),
                Vec3(2.0, 0.0, 0.0),
                Vec3(0.0, 1.0, 0.0),
                Vec3(0.0, -1.0, 0.0)
            ),
            shapeType = "oval",
            source = "ARCore-Depth-HitTest-3D",
            sensorQuality = 98.0,
            hitQuality = 98.0,
            depthAssisted = true
        )
        assertTrue(r.verified)
        assertTrue(abs((r.areaM2 ?: 0.0) - (2.0 * Math.PI)) < 1e-6)
    }

    @Test
    fun triangleUsesTrueThreePointArea() {
        val r = TabelaMetricMath.measure(
            points = listOf(
                Vec3(0.0, 0.0, 0.0),
                Vec3(3.0, 0.0, 0.0),
                Vec3(0.0, 2.0, 0.0)
            ),
            shapeType = "triangle",
            source = "ARCore-Plane-HitTest-3D",
            hitQuality = 96.0
        )
        assertTrue(r.verified)
        assertTrue(abs((r.areaM2 ?: 0.0) - 3.0) < 1e-6)
    }

    @Test
    fun concavePolygonUsesPlanarShoelaceArea() {
        val r = TabelaMetricMath.measure(
            points = listOf(
                Vec3(0.0, 0.0, 0.0),
                Vec3(2.0, 0.0, 0.0),
                Vec3(2.0, 2.0, 0.0),
                Vec3(1.0, 1.0, 0.0),
                Vec3(0.0, 2.0, 0.0)
            ),
            shapeType = "polygon",
            source = "ARCore-Plane-HitTest-3D",
            hitQuality = 96.0
        )
        assertTrue(r.verified)
        assertTrue(abs((r.polygonAreaM2 ?: 0.0) - 3.0) < 1e-6)
    }

    @Test
    fun selfIntersectingPolygonIsRejected() {
        val r = TabelaMetricMath.measure(
            points = listOf(
                Vec3(0.0, 0.0, 0.0),
                Vec3(2.0, 2.0, 0.0),
                Vec3(0.0, 2.0, 0.0),
                Vec3(2.0, 0.0, 0.0)
            ),
            shapeType = "polygon",
            source = "ARCore-Plane-HitTest-3D",
            hitQuality = 96.0
        )
        assertFalse(r.verified)
        assertTrue(r.failureReasons.contains("self_intersecting_polygon"))
    }
}
