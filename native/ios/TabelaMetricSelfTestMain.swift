import Foundation
import simd

@main
struct TabelaMetricSelfTestMain {
    static func close(_ a: Double, _ b: Double, _ tolerance: Double = 1e-6) -> Bool {
        abs(a - b) <= tolerance
    }

    static func main() {
        let rectangle = TabelaMetricEngine.measure(
            points: [
                SIMD3<Float>(0, 1, 0), SIMD3<Float>(2, 1, 0),
                SIMD3<Float>(0, 0, 0), SIMD3<Float>(2, 0, 0)
            ],
            shapeType: "horizontal-rectangle",
            source: "ARKit-ExistingPlane-3D",
            hitQuality: 96
        )
        precondition(rectangle.verified)
        precondition(close(rectangle.width_m, 2))
        precondition(close(rectangle.height_m, 1))
        precondition(close(rectangle.area_m2 ?? 0, 2))

        let circle = TabelaMetricEngine.measure(
            points: [
                SIMD3<Float>(-1, 0, 0), SIMD3<Float>(1, 0, 0),
                SIMD3<Float>(0, 1, 0), SIMD3<Float>(0, -1, 0)
            ],
            shapeType: "circle",
            source: "LiDAR-ARKit-SceneDepth",
            sensorQuality: 98,
            hitQuality: 98,
            depthAssisted: true,
            lidar: true
        )
        precondition(circle.verified)
        precondition(close(circle.diameter_m ?? 0, 2))
        precondition(close(circle.area_m2 ?? 0, Double.pi))

        let triangle = TabelaMetricEngine.measure(
            points: [SIMD3<Float>(0, 0, 0), SIMD3<Float>(3, 0, 0), SIMD3<Float>(0, 2, 0)],
            shapeType: "triangle",
            source: "ARKit-ExistingPlane-3D",
            hitQuality: 96
        )
        precondition(triangle.verified)
        precondition(close(triangle.area_m2 ?? 0, 3))

        let polygon = TabelaMetricEngine.measure(
            points: [
                SIMD3<Float>(0, 0, 0), SIMD3<Float>(2, 0, 0), SIMD3<Float>(2, 2, 0),
                SIMD3<Float>(1, 1, 0), SIMD3<Float>(0, 2, 0)
            ],
            shapeType: "polygon",
            source: "ARKit-ExistingPlane-3D",
            hitQuality: 96
        )
        precondition(polygon.verified)
        precondition(close(polygon.polygon_area_m2 ?? 0, 3))

        let selfIntersecting = TabelaMetricEngine.measure(
            points: [
                SIMD3<Float>(0, 0, 0), SIMD3<Float>(2, 2, 0),
                SIMD3<Float>(0, 2, 0), SIMD3<Float>(2, 0, 0)
            ],
            shapeType: "polygon",
            source: "ARKit-ExistingPlane-3D",
            hitQuality: 96
        )
        precondition(!selfIntersecting.verified)
        precondition(selfIntersecting.failure_reasons.contains("self_intersecting_polygon"))

        print("TabelaMetricEngine self-test passed")
    }
}
