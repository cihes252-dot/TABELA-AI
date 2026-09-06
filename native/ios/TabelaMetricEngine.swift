import Foundation
import ARKit
import simd

/// TABELA AI real-measurement bridge.
/// This layer never invents dimensions. A measurement is valid only when
/// real world-space geometry is supplied by ARKit / LiDAR session logic.
struct TabelaMetricResult: Codable {
    let width_m: Double
    let height_m: Double
    let area_m2: Double
    let distance_m: Double?
    let verified: Bool
    let source: String
    let quality_score: Double?
    let lidar: Bool
}

enum TabelaMetricEngine {
    static func distance(_ a: SIMD3<Float>, _ b: SIMD3<Float>) -> Double {
        Double(simd_distance(a, b))
    }

    static func measure(
        topLeft: SIMD3<Float>,
        topRight: SIMD3<Float>,
        bottomLeft: SIMD3<Float>,
        bottomRight: SIMD3<Float>,
        camera: SIMD3<Float>? = nil,
        source: String = "ARKit-3D",
        qualityScore: Double? = nil,
        lidar: Bool = false
    ) -> TabelaMetricResult {
        let top = distance(topLeft, topRight)
        let bottom = distance(bottomLeft, bottomRight)
        let left = distance(topLeft, bottomLeft)
        let right = distance(topRight, bottomRight)
        let width = (top + bottom) / 2.0
        let height = (left + right) / 2.0
        let center = (topLeft + topRight + bottomLeft + bottomRight) / 4.0
        let cameraDistance = camera.map { Double(simd_distance($0, center)) }

        // Reject physically invalid geometry instead of returning a fake measurement.
        let valid = width.isFinite && height.isFinite && width > 0.01 && height > 0.01 && width < 1000 && height < 1000

        return TabelaMetricResult(
            width_m: width,
            height_m: height,
            area_m2: width * height,
            distance_m: cameraDistance,
            verified: valid,
            source: source,
            quality_score: qualityScore,
            lidar: lidar
        )
    }
}
