import Foundation
import UIKit
import WebKit

/// Exposes Apple Vision OCR to the V11 web UI.
/// Request format: { requestId: string, dataUrl: "data:image/jpeg;base64,..." }
/// Result is emitted as a `tabela:native-ocr` CustomEvent.
final class TabelaVisionOCRBridge: NSObject, WKScriptMessageHandler {
    private static let trustedHost = "cihes252-dot.github.io"
    private static let maxDecodedBytes = 20 * 1024 * 1024

    weak var webView: WKWebView?
    private let engine = TabelaVisionOCR()

    init(webView: WKWebView) {
        self.webView = webView
        super.init()
        webView.configuration.userContentController.add(self, name: "tabelaOCR")
    }

    deinit {
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "tabelaOCR")
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        let origin = message.frameInfo.securityOrigin
        let trustedRemote = origin.protocol.lowercased() == "https" && origin.host.lowercased() == Self.trustedHost
        let trustedBundle = origin.protocol.lowercased() == "file" && origin.host.isEmpty
        guard message.name == "tabelaOCR",
              message.frameInfo.isMainFrame,
              trustedRemote || trustedBundle,
              let payload = message.body as? [String: Any],
              let requestId = payload["requestId"] as? String,
              requestId.count <= 128,
              let dataURL = payload["dataUrl"] as? String else { return }

        guard dataURL.hasPrefix("data:image/"),
              let comma = dataURL.firstIndex(of: ",") else {
            emit(requestId: requestId, error: "invalid_image_data_url")
            return
        }

        let base64 = String(dataURL[dataURL.index(after: comma)...])
        guard !base64.isEmpty else {
            emit(requestId: requestId, error: "image_payload_empty")
            return
        }
        // Base64 expands raw bytes by roughly 4/3. Reject oversized payloads before decoding too.
        guard base64.utf8.count <= (Self.maxDecodedBytes * 4 / 3 + 16_384) else {
            emit(requestId: requestId, error: "image_payload_too_large")
            return
        }
        guard let data = Data(base64Encoded: base64, options: .ignoreUnknownCharacters),
              data.count <= Self.maxDecodedBytes,
              let image = UIImage(data: data) else {
            emit(requestId: requestId, error: "image_decode_failed")
            return
        }

        engine.recognize(image: image) { [weak self] result in
            switch result {
            case .success(let candidates):
                let lines: [[String: Any]] = candidates.prefix(12).map {
                    ["text": $0.text, "confidence": Double($0.confidence) * 100.0]
                }
                let best = candidates.first?.text ?? ""
                self?.emit(requestId: requestId, text: best, lines: lines)
            case .failure(let error):
                self?.emit(requestId: requestId, error: error.localizedDescription)
            }
        }
    }

    private func emit(requestId: String, text: String = "", lines: [[String: Any]] = [], error: String? = nil) {
        var payload: [String: Any] = [
            "requestId": requestId,
            "engine": "apple-vision",
            "text": text,
            "lines": lines
        ]
        if let error { payload["error"] = error }
        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('tabela:native-ocr',{detail:\(json)}));")
        }
    }
}
