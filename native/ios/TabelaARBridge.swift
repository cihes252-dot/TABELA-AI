import UIKit
import WebKit
import ARKit
import simd

/// Native AR/LiDAR bridge for TABELA AI 11.2.
///
/// The bridge accepts only real ARKit world-space hits. LiDAR/Scene-Depth devices use calibrated
/// depth reprojection for the metric 3D point and cross-check it against an ARKit raycast. Non-LiDAR
/// devices must hit a detected ARKit plane. Estimated-only raycasts are never accepted without depth.
final class TabelaARBridge: NSObject, WKScriptMessageHandler {
    private static let trustedHost = "cihes252-dot.github.io"

    weak var webView: WKWebView?
    weak var arView: ARSCNView?

    private var points: [SIMD3<Float>] = []
    private var depthSamples: [TabelaLiDAREngine.DepthSample] = []
    private var depthRayErrors: [Double] = []
    private var pointKinds: [String] = []
    private var hitScores: [Double] = []
    private var autoMetricRequested = false
    private var requestedBBoxNormalized: CGRect?
    private(set) var requestedShapeType: String = "horizontal-rectangle"
    private(set) var lastErrorMessage: String = ""

    init(webView: WKWebView, arView: ARSCNView) {
        self.webView = webView
        self.arView = arView
        super.init()
        webView.configuration.userContentController.add(self, name: "tabelaMetric")
    }

    deinit {
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "tabelaMetric")
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        let origin = message.frameInfo.securityOrigin
        let trustedRemote = origin.protocol.lowercased() == "https" && origin.host.lowercased() == Self.trustedHost
        let trustedBundle = origin.protocol.lowercased() == "file" && origin.host.isEmpty
        guard message.name == "tabelaMetric",
              message.frameInfo.isMainFrame,
              trustedRemote || trustedBundle else { return }

        reset()
        autoMetricRequested = false
        requestedBBoxNormalized = nil
        if let payload = message.body as? [String: Any] {
            if let shapeType = payload["shapeType"] as? String, !shapeType.isEmpty {
                requestedShapeType = shapeType
            } else {
                requestedShapeType = "horizontal-rectangle"
            }
            autoMetricRequested = (payload["autoMetric"] as? Bool) == true
            if let box = payload["bboxNormalized"] as? [String: Any],
               let x = numeric(box["x"]),
               let y = numeric(box["y"]),
               let w = numeric(box["w"]),
               let h = numeric(box["h"]),
               x.isFinite, y.isFinite, w.isFinite, h.isFinite,
               w > 0.01, h > 0.01 {
                requestedBBoxNormalized = CGRect(
                    x: max(0, min(1, x)),
                    y: max(0, min(1, y)),
                    width: max(0.01, min(1, w)),
                    height: max(0.01, min(1, h))
                )
            }
        } else {
            requestedShapeType = "horizontal-rectangle"
        }
        NotificationCenter.default.post(
            name: .tabelaMeasurementRequested,
            object: self,
            userInfo: ["payload": message.body]
        )
    }

    private func numeric(_ value: Any?) -> CGFloat? {
        if let n = value as? NSNumber { return CGFloat(truncating: n) }
        if let d = value as? Double { return CGFloat(d) }
        if let f = value as? Float { return CGFloat(f) }
        if let i = value as? Int { return CGFloat(i) }
        return nil
    }

    var requiredPointCount: Int? { TabelaMetricEngine.requiredPointCount(for: requestedShapeType) }
    var isDynamicShape: Bool { requiredPointCount == nil }
    var pointCount: Int { points.count }
    var canFinish: Bool {
        if let requiredPointCount { return points.count == requiredPointCount }
        return (3...24).contains(points.count)
    }
    var canAttemptAutomaticMeasurement: Bool {
        guard autoMetricRequested, requestedBBoxNormalized != nil else { return false }
        let shape = requestedShapeType.lowercased()
        return !["triangle", "polygon", "freeform"].contains(shape)
    }

    func nextPrompt() -> String {
        let labels = TabelaMetricEngine.promptLabels(for: requestedShapeType)
        if isDynamicShape { return "ÇEVRE NOKTASI \(points.count + 1)" }
        let index = min(points.count, max(0, labels.count - 1))
        return labels[index]
    }

    private var interfaceOrientation: UIInterfaceOrientation {
        arView?.window?.windowScene?.interfaceOrientation ?? .portrait
    }

    /// Attempts to map the detected 2-D sign boundary into ARKit display coordinates and collect
    /// real world-space points. The method never converts pixels directly into metres.
    /// It returns false whenever tracking, depth, raycast, or plane gates fail so the host can fall back
    /// to manual point confirmation without fabricating a measurement.
    func collectAutomaticBoundaryPoints() -> Bool {
        guard canAttemptAutomaticMeasurement,
              let view = arView,
              let frame = view.session.currentFrame,
              case .normal = frame.camera.trackingState,
              let normalizedPoints = automaticNormalizedPoints() else {
            lastErrorMessage = "Otomatik 3B sınır için ARKit takip durumu veya tabela sınırı hazır değil."
            return false
        }

        reset()
        let transform = frame.displayTransform(for: interfaceOrientation, viewportSize: view.bounds.size)
        for p in normalizedPoints {
            let viewport = p.applying(transform)
            let screen = CGPoint(x: viewport.x * view.bounds.width, y: viewport.y * view.bounds.height)
            guard screen.x.isFinite, screen.y.isFinite,
                  screen.x >= 0, screen.y >= 0,
                  screen.x <= view.bounds.width, screen.y <= view.bounds.height,
                  addPoint(screenPoint: screen) else {
                let message = lastErrorMessage.isEmpty
                    ? "Otomatik 3B sınır noktası güven kapısından geçmedi."
                    : lastErrorMessage
                reset()
                lastErrorMessage = message
                return false
            }
        }
        return canFinish
    }

    private func automaticNormalizedPoints() -> [CGPoint]? {
        guard let b = requestedBBoxNormalized else { return nil }
        let minX = b.minX, maxX = min(1, b.maxX), minY = b.minY, maxY = min(1, b.maxY)
        let midX = (minX + maxX) / 2, midY = (minY + maxY) / 2
        let shape = requestedShapeType.lowercased()
        if shape == "circle" || shape == "oval" {
            return [
                CGPoint(x: minX, y: midY),
                CGPoint(x: maxX, y: midY),
                CGPoint(x: midX, y: minY),
                CGPoint(x: midX, y: maxY)
            ]
        }
        return [
            CGPoint(x: minX, y: minY),
            CGPoint(x: maxX, y: minY),
            CGPoint(x: minX, y: maxY),
            CGPoint(x: maxX, y: maxY)
        ]
    }

    /// Adds one trusted world-space point. Returns false when the current tap fails a sensor/plane gate.
    @discardableResult
    func addPoint(screenPoint: CGPoint) -> Bool {
        guard let view = arView,
              let frame = view.session.currentFrame,
              case .normal = frame.camera.trackingState else {
            lastErrorMessage = "ARKit takip durumu kararlı değil. Kamerayı yavaşça hareket ettirin."
            return false
        }

        if let requiredPointCount, points.count >= requiredPointCount { return false }
        if isDynamicShape && points.count >= 24 {
            lastErrorMessage = "En fazla 24 çevre noktası kabul edilir."
            return false
        }

        let caps = TabelaLiDAREngine.capabilities()
        var acceptedDepthSample: TabelaLiDAREngine.DepthSample?
        if caps.depthAvailable {
            let quality = TabelaLiDAREngine.depthQualityPasses(
                at: screenPoint,
                in: view,
                orientation: interfaceOrientation
            )
            guard quality.passes, let sample = quality.sample else {
                lastErrorMessage = "LiDAR derinlik güveni yetersiz. Yüzeyi yavaşça tarayın ve kenardan uzak bir noktaya tekrar dokunun."
                return false
            }
            acceptedDepthSample = sample
        }

        let existingGeometry = raycast(view: view, point: screenPoint, target: .existingPlaneGeometry)
        let existingInfinite = raycast(view: view, point: screenPoint, target: .existingPlaneInfinite)
        let estimated = raycast(view: view, point: screenPoint, target: .estimatedPlane)

        let selected: (result: ARRaycastResult, kind: String, score: Double)?
        if let existingGeometry {
            selected = (existingGeometry, "ExistingPlaneGeometry", 100)
        } else if let existingInfinite {
            selected = (existingInfinite, "ExistingPlaneInfinite", 92)
        } else if let estimated, caps.depthAvailable {
            selected = (estimated, "EstimatedPlane+SceneDepth", 86)
        } else {
            selected = nil
        }

        guard let selected else {
            lastErrorMessage = caps.depthAvailable
                ? "LiDAR derinliği var ancak çapraz kontrol için güvenilir AR yüzeyi bulunamadı. Kamerayı yüzey üzerinde gezdirin."
                : "Algılanmış ARKit düzlemi bulunamadı. iPhone'u yüzey üzerinde yavaşça hareket ettirip tekrar dokunun."
            return false
        }

        let rayColumn = selected.result.worldTransform.columns.3
        let rayPoint = SIMD3<Float>(rayColumn.x, rayColumn.y, rayColumn.z)
        var finalPoint = rayPoint
        var finalKind = selected.kind
        var finalHitScore = selected.score
        var rayError: Double?

        if let sample = acceptedDepthSample {
            guard let depthPoint = TabelaLiDAREngine.worldPoint(from: sample, frame: frame) else {
                lastErrorMessage = "LiDAR derinlik noktası 3B dünya koordinatına dönüştürülemedi. Ölçüm reddedildi."
                return false
            }
            let error = Double(simd_distance(depthPoint, rayPoint))
            let tolerance = max(0.05, min(0.20, Double(sample.meters) * 0.03))
            guard error.isFinite, error <= tolerance else {
                let cm = Int((error * 100).rounded())
                let limitCm = Int((tolerance * 100).rounded())
                lastErrorMessage = "LiDAR ve ARKit yüzeyi uyuşmuyor (\(cm) cm; sınır \(limitCm) cm). Kamerayı yüzeyde gezdirip tekrar dokunun."
                return false
            }
            finalPoint = depthPoint
            finalKind = selected.kind + "+SceneDepth3D"
            let consistency = max(0, 1 - error / max(tolerance, 0.001))
            finalHitScore = max(70, min(selected.score, sample.qualityScore) * (0.90 + consistency * 0.10))
            rayError = error
        }

        points.append(finalPoint)
        pointKinds.append(finalKind)
        hitScores.append(finalHitScore)
        if let acceptedDepthSample { depthSamples.append(acceptedDepthSample) }
        if let rayError { depthRayErrors.append(rayError) }
        lastErrorMessage = ""
        return true
    }

    func undoLastPoint() {
        guard !points.isEmpty else { return }
        points.removeLast()
        if !pointKinds.isEmpty { pointKinds.removeLast() }
        if !hitScores.isEmpty { hitScores.removeLast() }
        if !depthSamples.isEmpty { depthSamples.removeLast() }
        if !depthRayErrors.isEmpty { depthRayErrors.removeLast() }
    }

    func cancel(notify: Bool = true) {
        reset()
        if notify { emitError(code: "cancelled", message: "Ölçüm kullanıcı tarafından iptal edildi.") }
    }

    func emitUnavailable(code: String, message: String) {
        lastErrorMessage = message
        emitError(code: code, message: message)
    }

    /// Finishes the current shape measurement. Returns true only if the strict metric engine verified it.
    @discardableResult
    func finishMeasurement() -> Bool {
        guard canFinish, let frame = arView?.session.currentFrame else {
            lastErrorMessage = "Şekil için yeterli 3B nokta yok."
            return false
        }

        let caps = TabelaLiDAREngine.capabilities()
        if caps.depthAvailable && (depthSamples.count != points.count || depthRayErrors.count != points.count) {
            lastErrorMessage = "LiDAR derinlik/AR çapraz kontrol örnekleri eksik. Ölçüm reddedildi."
            emitError(code: "depth_samples_incomplete", message: lastErrorMessage)
            reset()
            return false
        }

        let cameraColumn = frame.camera.transform.columns.3
        let camera = SIMD3<Float>(cameraColumn.x, cameraColumn.y, cameraColumn.z)
        let hitQuality = hitScores.isEmpty ? 0 : hitScores.reduce(0, +) / Double(hitScores.count)
        let sensorQuality: Double? = depthSamples.isEmpty
            ? nil
            : depthSamples.map(\.qualityScore).reduce(0, +) / Double(depthSamples.count)
        let depthAssisted = caps.depthAvailable && depthSamples.count == points.count && depthRayErrors.count == points.count
        let source: String
        if depthAssisted {
            source = "LiDAR-ARKit-SceneDepth-Reprojected+Raycast"
        } else if caps.mesh {
            source = "LiDAR-ARKit-Mesh-Raycast"
        } else {
            source = "ARKit-DetectedPlane-Raycast"
        }

        let result = TabelaMetricEngine.measure(
            points: points,
            shapeType: requestedShapeType,
            camera: camera,
            source: source,
            sensorQuality: sensorQuality,
            hitQuality: hitQuality,
            depthAssisted: depthAssisted,
            lidar: caps.lidarAvailable
        )

        let payload = makePayload(result: result)
        if result.verified {
            emitVerified(payload)
            reset()
            return true
        }

        let reason = result.failure_reasons.isEmpty ? "quality_below_threshold" : result.failure_reasons.joined(separator: ", ")
        lastErrorMessage = "Ölçüm kalite kapısından geçmedi: \(reason)"
        emitError(code: "measurement_rejected", message: lastErrorMessage, extra: payload)
        reset()
        return false
    }

    private func raycast(view: ARSCNView, point: CGPoint, target: ARRaycastQuery.Target) -> ARRaycastResult? {
        view.raycastQuery(from: point, allowing: target, alignment: .any)
            .flatMap { view.session.raycast($0).first }
    }

    private func reset() {
        points.removeAll()
        depthSamples.removeAll()
        depthRayErrors.removeAll()
        pointKinds.removeAll()
        hitScores.removeAll()
    }

    private func makePayload(result: TabelaMetricResult) -> [String: Any] {
        var payload: [String: Any] = [
            "verified": result.verified,
            "source": result.source,
            "shapeType": result.shape_type,
            "lidar": result.lidar,
            "depthAssisted": result.depth_assisted,
            "qualityScore": result.quality_score,
            "widthM": result.width_m,
            "heightM": result.height_m,
            "planeDeviationM": result.plane_deviation_m,
            "pointCount": result.point_count,
            "pointKinds": pointKinds,
            "failureReasons": result.failure_reasons,
            "diagnostics": result.diagnostics,
            "depthSamplesM": depthSamples.map { Double($0.meters) },
            "depthConfidence": depthSamples.map { Int($0.confidence) },
            "depthSpreadM": depthSamples.map { Double($0.spreadMeters) },
            "depthRaycastErrorM": depthRayErrors
        ]
        if !depthRayErrors.isEmpty {
            payload["maxDepthRaycastErrorM"] = depthRayErrors.max() ?? 0
            payload["avgDepthRaycastErrorM"] = depthRayErrors.reduce(0, +) / Double(depthRayErrors.count)
        }
        if let area = result.area_m2 { payload["areaM2"] = area }
        if let diameter = result.diameter_m { payload["diameterM"] = diameter }
        if let polygonArea = result.polygon_area_m2 { payload["polygonAreaM2"] = polygonArea }
        if let distance = result.distance_m { payload["distanceM"] = distance }
        return payload
    }

    private func emitVerified(_ payload: [String: Any]) {
        guard let json = jsonString(payload) else { return }
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript("window.TabelaMetric&&window.TabelaMetric.submitVerified(\(json));")
        }
    }

    private func emitError(code: String, message: String, extra: [String: Any] = [:]) {
        var detail = extra
        detail["code"] = code
        detail["message"] = message
        guard let json = jsonString(detail) else { return }
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('tabela:measurement-error',{detail:\(json)}));")
        }
    }

    private func jsonString(_ object: Any) -> String? {
        guard JSONSerialization.isValidJSONObject(object),
              let data = try? JSONSerialization.data(withJSONObject: object),
              let json = String(data: data, encoding: .utf8) else { return nil }
        return json
    }
}

extension Notification.Name {
    static let tabelaMeasurementRequested = Notification.Name("TabelaMeasurementRequested")
}
