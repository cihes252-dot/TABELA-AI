import Foundation
import simd

/// Result of a real native 3D measurement.
/// Metric values are derived only from world-space AR points; RGB pixels are never converted to metres.
struct TabelaMetricResult: Codable {
    let width_m: Double
    let height_m: Double
    let area_m2: Double?
    let diameter_m: Double?
    let polygon_area_m2: Double?
    let distance_m: Double?
    let verified: Bool
    let source: String
    let shape_type: String
    let quality_score: Double
    let lidar: Bool
    let depth_assisted: Bool
    let plane_deviation_m: Double
    let point_count: Int
    let failure_reasons: [String]
    let diagnostics: [String: Double]
}

enum TabelaMetricEngine {
    private static let rectangleShapes: Set<String> = ["horizontal-rectangle", "vertical-rectangle", "rectangle", "square"]
    private static let eps = 1e-9

    static func requiredPointCount(for shapeType: String) -> Int? {
        switch canonicalShape(shapeType) {
        case "triangle": return 3
        case "polygon", "freeform": return nil
        case "circle", "oval": return 4
        default: return 4
        }
    }

    static func promptLabels(for shapeType: String) -> [String] {
        switch canonicalShape(shapeType) {
        case "triangle": return ["1. KÖŞE", "2. KÖŞE", "3. KÖŞE"]
        case "circle", "oval": return ["SOL UÇ", "SAĞ UÇ", "ÜST UÇ", "ALT UÇ"]
        case "polygon", "freeform": return ["ÇEVRE NOKTASI"]
        default: return ["SOL ÜST", "SAĞ ÜST", "SOL ALT", "SAĞ ALT"]
        }
    }

    static func measure(
        points: [SIMD3<Float>],
        shapeType: String,
        camera: SIMD3<Float>? = nil,
        source: String = "ARKit-3D",
        sensorQuality: Double? = nil,
        hitQuality: Double = 100,
        depthAssisted: Bool = false,
        lidar: Bool = false
    ) -> TabelaMetricResult {
        let shape = canonicalShape(shapeType)
        var failures: [String] = []
        var diagnostics: [String: Double] = [:]
        let required = requiredPointCount(for: shape)

        if let required, points.count != required { failures.append("point_count") }
        if required == nil && !(3...24).contains(points.count) { failures.append("point_count") }
        if points.contains(where: { !isFinite($0) }) { failures.append("non_finite_point") }
        guard points.count >= 2 else {
            return failed(shape: shape, source: source, pointCount: points.count, reasons: failures.isEmpty ? ["insufficient_points"] : failures)
        }

        let center = centroid(points)
        let cameraDistance = camera.flatMap { isFinite($0) ? distance($0, center) : nil }
        let pairScale = maxPairDistance(points)
        if !pairScale.isFinite || pairScale < 0.01 || pairScale > 1000 { failures.append("invalid_scale") }

        let basis = points.count >= 3 ? planeBasis(points) : nil
        let planeDeviation = basis?.maxDeviation ?? 0
        diagnostics["planeDeviationM"] = planeDeviation
        let planeTolerance = max(0.015, pairScale * 0.02)
        if points.count >= 4 && (basis == nil || planeDeviation > planeTolerance) { failures.append("non_coplanar") }

        var width = 0.0
        var height = 0.0
        var area: Double?
        var diameter: Double?
        var polygonArea: Double?
        var geometryScore = 100.0

        if rectangleShapes.contains(shape), points.count == 4 {
            let tl = points[0], tr = points[1], bl = points[2], br = points[3]
            let top = distance(tl, tr)
            let bottom = distance(bl, br)
            let left = distance(tl, bl)
            let right = distance(tr, br)
            width = (top + bottom) / 2
            height = (left + right) / 2
            area = width * height

            let widthMismatch = abs(top - bottom) / max(width, 0.001)
            let heightMismatch = abs(left - right) / max(height, 0.001)
            let d1 = distance(tl, br)
            let d2 = distance(tr, bl)
            let diagonalMismatch = abs(d1 - d2) / max((d1 + d2) / 2, 0.001)
            let topVector = tr - tl
            let leftVector = bl - tl
            let orthogonality = abs(Double(simd_dot(normalize(topVector), normalize(leftVector))))
            let predictedBR = tr + (bl - tl)
            let closureError = distance(predictedBR, br) / max(pairScale, 0.001)
            let squareMismatch = shape == "square" ? abs(width - height) / max((width + height) / 2, 0.001) : 0

            diagnostics["widthMismatch"] = widthMismatch
            diagnostics["heightMismatch"] = heightMismatch
            diagnostics["diagonalMismatch"] = diagonalMismatch
            diagnostics["orthogonality"] = orthogonality
            diagnostics["closureError"] = closureError
            if shape == "square" { diagnostics["squareMismatch"] = squareMismatch }

            geometryScore -= min(35, (widthMismatch + heightMismatch) * 220)
            geometryScore -= min(18, diagonalMismatch * 180)
            geometryScore -= min(18, orthogonality * 120)
            geometryScore -= min(18, closureError * 260)
            if shape == "square" { geometryScore -= min(25, squareMismatch * 220) }

            if widthMismatch > 0.08 || heightMismatch > 0.08 { failures.append("opposite_edge_mismatch") }
            if diagonalMismatch > 0.10 { failures.append("diagonal_mismatch") }
            if orthogonality > 0.18 { failures.append("not_orthogonal") }
            if closureError > 0.06 { failures.append("corner_closure") }
            if shape == "square" && squareMismatch > 0.10 { failures.append("not_square") }
        } else if (shape == "circle" || shape == "oval"), points.count == 4 {
            let left = points[0], right = points[1], top = points[2], bottom = points[3]
            width = distance(left, right)
            height = distance(top, bottom)
            let centerHorizontal = midpoint(left, right)
            let centerVertical = midpoint(top, bottom)
            let centerMismatch = distance(centerHorizontal, centerVertical) / max(pairScale, 0.001)
            let axisOrthogonality = abs(Double(simd_dot(normalize(right - left), normalize(bottom - top))))
            let ratioMismatch = abs(width - height) / max((width + height) / 2, 0.001)

            diagnostics["centerMismatch"] = centerMismatch
            diagnostics["axisOrthogonality"] = axisOrthogonality
            diagnostics["diameterMismatch"] = ratioMismatch

            geometryScore -= min(35, centerMismatch * 420)
            geometryScore -= min(25, axisOrthogonality * 150)
            if shape == "circle" { geometryScore -= min(35, ratioMismatch * 260) }

            if centerMismatch > 0.06 { failures.append("axis_center_mismatch") }
            if axisOrthogonality > 0.20 { failures.append("axes_not_orthogonal") }
            if shape == "circle" && ratioMismatch > 0.12 { failures.append("circle_diameter_mismatch") }

            if shape == "circle" {
                diameter = (width + height) / 2
                if let diameter { area = .pi * pow(diameter / 2, 2) }
            } else {
                area = .pi * (width / 2) * (height / 2)
            }
        } else if shape == "triangle", points.count == 3 {
            let a = distance(points[0], points[1])
            let b = distance(points[1], points[2])
            let c = distance(points[2], points[0])
            let longest = max(a, max(b, c))
            let crossLength = Double(simd_length(simd_cross(points[1] - points[0], points[2] - points[0])))
            area = crossLength / 2
            width = longest
            height = longest > eps ? (2 * (area ?? 0) / longest) : 0
            let thinness = longest > eps ? (area ?? 0) / (longest * longest) : 0
            diagnostics["triangleThinness"] = thinness
            geometryScore -= min(55, max(0, 0.08 - thinness) * 650)
            if (area ?? 0) <= 0.0001 || thinness < 0.015 { failures.append("degenerate_triangle") }
        } else if (shape == "polygon" || shape == "freeform"), points.count >= 3, let basis {
            let projected = basis.projected
            let selfIntersecting = polygonSelfIntersects(projected)
            polygonArea = abs(shoelaceSigned(projected))
            area = polygonArea
            width = (projected.map(\.x).max() ?? 0) - (projected.map(\.x).min() ?? 0)
            height = (projected.map(\.y).max() ?? 0) - (projected.map(\.y).min() ?? 0)
            var minimumEdge = Double.infinity
            for index in projected.indices {
                let next = (index + 1) % projected.count
                minimumEdge = min(minimumEdge, simd_distance(projected[index], projected[next]))
            }
            diagnostics["minBoundaryEdgeM"] = minimumEdge
            if selfIntersecting { failures.append("self_intersecting_polygon"); geometryScore -= 60 }
            if (polygonArea ?? 0) <= 0.0001 { failures.append("degenerate_polygon") }
            if minimumEdge < 0.005 { failures.append("duplicate_boundary_points"); geometryScore -= 30 }
        }

        if !width.isFinite || !height.isFinite || width <= 0.01 || height <= 0.01 || width > 1000 || height > 1000 {
            failures.append("invalid_dimensions")
        }
        if let area, (!area.isFinite || area <= 0.0001 || area > 1_000_000) { failures.append("invalid_area") }

        if points.count >= 4 && pairScale > eps {
            let planeRatio = planeDeviation / pairScale
            diagnostics["planeRatio"] = planeRatio
            geometryScore -= min(35, planeRatio * 900)
        }
        geometryScore = clamp(geometryScore)

        let hitQ = clamp(hitQuality)
        let sensorQ = clamp(sensorQuality ?? hitQ)
        var finalQuality: Double
        if lidar || depthAssisted {
            finalQuality = clamp(geometryScore * 0.60 + sensorQ * 0.25 + hitQ * 0.15)
        } else {
            finalQuality = min(88, clamp(geometryScore * 0.75 + hitQ * 0.25))
        }
        if failures.contains("non_coplanar") { finalQuality = min(finalQuality, 70) }
        if failures.contains("self_intersecting_polygon") { finalQuality = min(finalQuality, 55) }

        diagnostics["geometryScore"] = geometryScore
        diagnostics["sensorQuality"] = sensorQ
        diagnostics["hitQuality"] = hitQ
        let threshold = (lidar || depthAssisted) ? 88.0 : 80.0
        let cleanFailures = unique(failures)
        let verified = cleanFailures.isEmpty && finalQuality >= threshold
        var finalFailures = cleanFailures
        if !verified && finalQuality < threshold { finalFailures = unique(finalFailures + ["quality_below_threshold"]) }

        return TabelaMetricResult(
            width_m: width,
            height_m: height,
            area_m2: area,
            diameter_m: diameter,
            polygon_area_m2: polygonArea,
            distance_m: cameraDistance,
            verified: verified,
            source: source,
            shape_type: shape,
            quality_score: finalQuality,
            lidar: lidar,
            depth_assisted: depthAssisted,
            plane_deviation_m: planeDeviation,
            point_count: points.count,
            failure_reasons: finalFailures,
            diagnostics: diagnostics.filter { $0.value.isFinite }
        )
    }

    /// Backward-compatible rectangle entry point used by older native callers.
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
        measure(
            points: [topLeft, topRight, bottomLeft, bottomRight],
            shapeType: "horizontal-rectangle",
            camera: camera,
            source: source,
            sensorQuality: qualityScore,
            hitQuality: qualityScore ?? 100,
            depthAssisted: lidar,
            lidar: lidar
        )
    }

    private struct PlaneBasis {
        let origin: SIMD3<Double>
        let u: SIMD3<Double>
        let v: SIMD3<Double>
        let normal: SIMD3<Double>
        let projected: [SIMD2<Double>]
        let maxDeviation: Double
    }

    private static func planeBasis(_ points: [SIMD3<Float>]) -> PlaneBasis? {
        let p = points.map { SIMD3<Double>(Double($0.x), Double($0.y), Double($0.z)) }
        guard p.count >= 3 else { return nil }
        let origin = p[0]
        guard let uRaw = p.dropFirst().map({ $0 - origin }).first(where: { simd_length($0) > 1e-5 }) else { return nil }
        let u = normalize(uRaw)
        var normal: SIMD3<Double>?
        for i in 1..<p.count {
            if normal != nil { break }
            for j in (i + 1)..<p.count {
                let candidate = simd_cross(p[i] - origin, p[j] - origin)
                if simd_length(candidate) > 1e-6 { normal = normalize(candidate); break }
            }
        }
        guard let n = normal else { return nil }
        let v = normalize(simd_cross(n, u))
        guard simd_length(v) > 1e-6 else { return nil }
        let projected = p.map { point -> SIMD2<Double> in
            let delta = point - origin
            return SIMD2<Double>(simd_dot(delta, u), simd_dot(delta, v))
        }
        let maxDeviation = p.map { abs(simd_dot($0 - origin, n)) }.max() ?? 0
        return PlaneBasis(origin: origin, u: u, v: v, normal: n, projected: projected, maxDeviation: maxDeviation)
    }

    private static func polygonSelfIntersects(_ points: [SIMD2<Double>]) -> Bool {
        guard points.count >= 4 else { return false }
        for i in points.indices {
            let i2 = (i + 1) % points.count
            for j in (i + 1)..<points.count {
                let j2 = (j + 1) % points.count
                if i == j || i2 == j || j2 == i { continue }
                if i == 0 && j2 == 0 { continue }
                if segmentsIntersect(points[i], points[i2], points[j], points[j2]) { return true }
            }
        }
        return false
    }

    private static func segmentsIntersect(_ a: SIMD2<Double>, _ b: SIMD2<Double>, _ c: SIMD2<Double>, _ d: SIMD2<Double>) -> Bool {
        func orient(_ p: SIMD2<Double>, _ q: SIMD2<Double>, _ r: SIMD2<Double>) -> Double {
            (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
        }
        let o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b)
        return ((o1 > eps && o2 < -eps) || (o1 < -eps && o2 > eps)) && ((o3 > eps && o4 < -eps) || (o3 < -eps && o4 > eps))
    }

    private static func shoelaceSigned(_ points: [SIMD2<Double>]) -> Double {
        var sum = 0.0
        for i in points.indices {
            let j = (i + 1) % points.count
            sum += points[i].x * points[j].y - points[j].x * points[i].y
        }
        return sum / 2
    }

    private static func canonicalShape(_ shapeType: String) -> String {
        let allowed: Set<String> = ["horizontal-rectangle", "vertical-rectangle", "rectangle", "square", "circle", "oval", "triangle", "polygon", "freeform"]
        return allowed.contains(shapeType) ? shapeType : "horizontal-rectangle"
    }

    private static func failed(shape: String, source: String, pointCount: Int, reasons: [String]) -> TabelaMetricResult {
        TabelaMetricResult(
            width_m: 0, height_m: 0, area_m2: nil, diameter_m: nil, polygon_area_m2: nil,
            distance_m: nil, verified: false, source: source, shape_type: shape, quality_score: 0,
            lidar: false, depth_assisted: false, plane_deviation_m: 0, point_count: pointCount,
            failure_reasons: unique(reasons), diagnostics: [:]
        )
    }

    private static func centroid(_ points: [SIMD3<Float>]) -> SIMD3<Float> {
        points.reduce(SIMD3<Float>(repeating: 0), +) / Float(max(points.count, 1))
    }

    private static func midpoint(_ a: SIMD3<Float>, _ b: SIMD3<Float>) -> SIMD3<Float> { (a + b) / 2 }
    private static func distance(_ a: SIMD3<Float>, _ b: SIMD3<Float>) -> Double { Double(simd_distance(a, b)) }
    private static func maxPairDistance(_ points: [SIMD3<Float>]) -> Double {
        var result = 0.0
        guard points.count > 1 else { return result }
        for i in 0..<(points.count - 1) {
            for j in (i + 1)..<points.count { result = max(result, distance(points[i], points[j])) }
        }
        return result
    }

    private static func normalize(_ v: SIMD3<Float>) -> SIMD3<Float> {
        let length = simd_length(v)
        return length > 1e-9 ? v / length : SIMD3<Float>(repeating: 0)
    }

    private static func normalize(_ v: SIMD3<Double>) -> SIMD3<Double> {
        let length = simd_length(v)
        return length > 1e-12 ? v / length : SIMD3<Double>(repeating: 0)
    }

    private static func isFinite(_ p: SIMD3<Float>) -> Bool { p.x.isFinite && p.y.isFinite && p.z.isFinite }
    private static func clamp(_ value: Double, _ minValue: Double = 0, _ maxValue: Double = 100) -> Double { min(maxValue, max(minValue, value)) }
    private static func unique(_ values: [String]) -> [String] {
        var seen = Set<String>()
        return values.filter { seen.insert($0).inserted }
    }
}
