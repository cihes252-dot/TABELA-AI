import Foundation
import UIKit
import WebKit

/// Exposes Apple Vision OCR to the V11 web UI.
/// Request format: { requestId: string, dataUrl: "data:image/jpeg;base64,..." }
/// Result is emitted as a `tabela:native-ocr` CustomEvent.
final class TabelaVisionOCRBridge: NSObject, WKScriptMessageHandler {
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
        guard message.name == "tabelaOCR",
              let payload = message.body as? [String: Any],
              let requestId = payload["requestId"] as? String,
              let dataURL = payload["dataUrl"] as? String else { return }

        guard let comma = dataURL.firstIndex(of: ","),
              let data = Data(base64Encoded: String(dataURL[dataURL.index(after: comma)...]), options: .ignoreUnknownCharacters),
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
