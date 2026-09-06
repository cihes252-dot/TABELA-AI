import UIKit
import WebKit
import ARKit
import simd

/// Host controller contract for TABELA AI V10.
/// The web app requests a real measurement through `window.webkit.messageHandlers.tabelaMetric`.
/// Native UI must then collect four ARKit raycast points in order:
/// top-left, top-right, bottom-left, bottom-right.
final class TabelaARBridge: NSObject, WKScriptMessageHandler {
    weak var webView: WKWebView?
    weak var arView: ARSCNView?
    private var points: [SIMD3<Float>] = []

    init(webView: WKWebView, arView: ARSCNView) {
        self.webView = webView
        self.arView = arView
        super.init()
        webView.configuration.userContentController.add(self, name: "tabelaMetric")
    }

    deinit { webView?.configuration.userContentController.removeScriptMessageHandler(forName: "tabelaMetric") }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "tabelaMetric" else { return }
        points.removeAll()
        // Host app should now present the AR measurement overlay and call addPoint(screenPoint:)
        NotificationCenter.default.post(name: .tabelaMeasurementRequested, object: self, userInfo: ["payload": message.body])
    }

    /// Call after each user/vision-selected corner. Returns true when 4 verified AR points were collected.
    @discardableResult
    func addPoint(screenPoint: CGPoint) -> Bool {
        guard let view = arView,
              let frame = view.session.currentFrame,
              case .normal = frame.camera.trackingState,
              let query = view.raycastQuery(from: screenPoint, allowing: .estimatedPlane, alignment: .any),
              let hit = view.session.raycast(query).first else { return false }
        let t = hit.worldTransform.columns.3
        points.append(SIMD3<Float>(t.x, t.y, t.z))
        if points.count == 4 { finishMeasurement() }
        return true
    }

    func cancel() { points.removeAll() }

    private func finishMeasurement() {
        guard points.count == 4, let frame = arView?.session.currentFrame else { return }
        let c = frame.camera.transform.columns.3
        let camera = SIMD3<Float>(c.x, c.y, c.z)
        let r = TabelaMetricEngine.measure(topLeft: points[0], topRight: points[1], bottomLeft: points[2], bottomRight: points[3], camera: camera)
        let payload: [String: Any] = [
            "verified": r.verified,
            "source": "ARKit-3D-iPhone",
            "widthM": r.width_m,
            "heightM": r.height_m,
            "areaM2": r.area_m2,
            "distanceM": r.distance_m as Any
        ]
        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        webView?.evaluateJavaScript("window.TabelaMetric.submitVerified(\(json))")
        points.removeAll()
    }
}

extension Notification.Name {
    static let tabelaMeasurementRequested = Notification.Name("TabelaMeasurementRequested")
}
