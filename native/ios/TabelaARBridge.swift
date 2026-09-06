import UIKit
import WebKit
import ARKit
import simd

/// Native AR/LiDAR bridge for TABELA AI V11.
/// The web app requests a real measurement through `window.webkit.messageHandlers.tabelaMetric`.
/// Native UI collects four real AR points in order: top-left, top-right, bottom-left, bottom-right.
/// LiDAR devices additionally require Scene Depth confidence; non-LiDAR devices use ARKit raycast.
final class TabelaARBridge: NSObject, WKScriptMessageHandler {
    weak var webView: WKWebView?
    weak var arView: ARSCNView?
    private var points: [SIMD3<Float>] = []
    private var depthConfidences: [UInt8] = []
    private var depthMeters: [Float] = []
    private var requestedShapeType: String = "horizontal-rectangle"

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
        guard message.name == "tabelaMetric" else { return }
        reset()
        if let payload = message.body as? [String: Any],
           let shapeType = payload["shapeType"] as? String,
           !shapeType.isEmpty {
            requestedShapeType = shapeType
        }
        NotificationCenter.default.post(
            name: .tabelaMeasurementRequested,
            object: self,
            userInfo: ["payload": message.body]
        )
    }

    private var interfaceOrientation: UIInterfaceOrientation {
        arView?.window?.windowScene?.interfaceOrientation ?? .portrait
    }

    @discardableResult
    func addPoint(screenPoint: CGPoint) -> Bool {
        guard let view = arView,
              let frame = view.session.currentFrame,
              case .normal = frame.camera.trackingState else { return false }

        let caps = TabelaLiDAREngine.capabilities()
        if caps.lidarAvailable {
            let quality = TabelaLiDAREngine.depthQualityPasses(
                at: screenPoint,
                in: view,
                orientation: interfaceOrientation
            )
            guard quality.passes, let sample = quality.sample else { return false }
            depthConfidences.append(sample.confidence)
            depthMeters.append(sample.meters)
        }

        let existing = view.raycastQuery(
            from: screenPoint,
            allowing: .existingPlaneGeometry,
            alignment: .any
        ).flatMap { view.session.raycast($0).first }

        let estimated = view.raycastQuery(
            from: screenPoint,
            allowing: .estimatedPlane,
            alignment: .any
        ).flatMap { view.session.raycast($0).first }

        guard let hit = existing ?? estimated else {
            if caps.lidarAvailable {
                _ = depthConfidences.popLast()
                _ = depthMeters.popLast()
            }
            return false
        }

        let t = hit.worldTransform.columns.3
        points.append(SIMD3<Float>(t.x, t.y, t.z))
        if points.count == 4 { finishMeasurement() }
        return true
    }

    func cancel() { reset() }

    private func reset() {
        points.removeAll()
        depthConfidences.removeAll()
        depthMeters.removeAll()
    }

    private func finishMeasurement() {
        guard points.count == 4, let frame = arView?.session.currentFrame else { return }
        let caps = TabelaLiDAREngine.capabilities()

        if caps.lidarAvailable && depthConfidences.count != 4 {
            reset()
            return
        }

        let cameraColumn = frame.camera.transform.columns.3
        let camera = SIMD3<Float>(cameraColumn.x, cameraColumn.y, cameraColumn.z)
        let qualityScore: Double? = caps.lidarAvailable
            ? (depthConfidences.map { Double($0) / 2.0 }.reduce(0, +) / 4.0) * 100.0
            : nil
        let source = caps.lidarAvailable ? "LiDAR-ARKit-SceneDepth" : "ARKit-Raycast"

        let result = TabelaMetricEngine.measure(
            topLeft: points[0],
            topRight: points[1],
            bottomLeft: points[2],
            bottomRight: points[3],
            camera: camera,
            source: source,
            qualityScore: qualityScore,
            lidar: caps.lidarAvailable
        )

        guard result.verified else {
            reset()
            return
        }

        var payload: [String: Any] = [
            "verified": true,
            "source": result.source,
            "shapeType": requestedShapeType,
            "lidar": result.lidar,
            "widthM": result.width_m,
            "heightM": result.height_m,
            "areaM2": result.area_m2,
            "depthSamplesM": depthMeters.map { Double($0) },
            "depthConfidence": depthConfidences.map { Int($0) }
        ]
        if let quality = result.quality_score { payload["qualityScore"] = quality }
        if let distance = result.distance_m { payload["distanceM"] = distance }

        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else {
            reset()
            return
        }

        webView?.evaluateJavaScript("window.TabelaMetric.submitVerified(\(json))")
        reset()
    }
}

extension Notification.Name {
    static let tabelaMeasurementRequested = Notification.Name("TabelaMeasurementRequested")
}
