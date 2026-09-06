import Foundation
import ARKit
import simd

/// TABELA AI real-measurement engine.
/// Metric values are produced only from ARKit world-space points; RGB pixels are never converted to metres.
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

    private static func clamp(_ value: Double, _ minValue: Double = 0, _ maxValue: Double = 100) -> Double {
        min(maxValue, max(minValue, value))
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

        let validDimensions = width.isFinite && height.isFinite && width > 0.01 && height > 0.01 && width < 1000 && height < 1000
        let widthMismatch = abs(top - bottom) / max(width, 0.001)
        let heightMismatch = abs(left - right) / max(height, 0.001)

        let e1 = topRight - topLeft
        let e2 = bottomLeft - topLeft
        let normal = simd_cross(e1, e2)
        let normalLength = Double(simd_length(normal))
        let scale = max(sqrt(width * width + height * height), 0.10)
        let planeDistance: Double
        if normalLength > 0.000001 {
            let unitNormal = normal / Float(normalLength)
            planeDistance = abs(Double(simd_dot(bottomRight - topLeft, unitNormal)))
        } else {
            planeDistance = .infinity
        }
        let planeRatio = planeDistance / scale

        let edgeConsistent = widthMismatch <= 0.06 && heightMismatch <= 0.06
        let coplanar = planeDistance.isFinite && planeDistance <= max(0.02, scale * 0.025)

        var geometryScore = 100.0
        geometryScore -= min(45.0, (widthMismatch + heightMismatch) * 260.0)
        geometryScore -= min(35.0, planeRatio * 900.0)
        geometryScore = clamp(geometryScore)

        let finalQuality: Double
        if lidar {
            let depthQuality = clamp(qualityScore ?? 0)
            finalQuality = clamp(geometryScore * 0.60 + depthQuality * 0.40)
        } else {
            // ARKit raycast is real 3D tracking, but without LiDAR it receives a conservative ceiling.
            finalQuality = min(85.0, geometryScore)
        }

        let threshold = lidar ? 88.0 : 80.0
        let verified = validDimensions && edgeConsistent && coplanar && finalQuality >= threshold

        return TabelaMetricResult(
            width_m: width,
            height_m: height,
            area_m2: width * height,
            distance_m: cameraDistance,
            verified: verified,
            source: source,
            quality_score: finalQuality,
            lidar: lidar
        )
    }
}
