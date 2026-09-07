import UIKit
import WebKit
import ARKit
import AVFoundation

/// Native iOS host for TABELA AI 11.1.
/// Supports three truthful device tiers:
/// - LiDAR / Scene Depth + ARKit
/// - ARKit world tracking without LiDAR
/// - non-ARKit devices: app UI works, real metric measurement is blocked
final class TabelaHostViewController: UIViewController, WKUIDelegate, WKNavigationDelegate {
    private static let trustedHost = "cihes252-dot.github.io"
    private static let trustedPathPrefix = "/TABELA-AI/"

    private let arView = ARSCNView(frame: .zero)
    private var webView: WKWebView!
    private var bridge: TabelaARBridge!
    private var ocrBridge: TabelaVisionOCRBridge!
    private let info = UILabel()
    private let undoButton = UIButton(type: .system)
    private let finishButton = UIButton(type: .system)
    private let cancelButton = UIButton(type: .system)

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        let caps = TabelaLiDAREngine.capabilities()
        let cameraStatus = AVCaptureDevice.authorizationStatus(for: .video)
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.websiteDataStore = .default()

        let capabilityJS = """
        window.TabelaNativeCapabilities = {
          platform: 'ios',
          app: true,
          appVersion: '11.1.0',
          nativeOCR: 'apple-vision',
          arkit: \(caps.worldTracking ? "true" : "false"),
          lidar: \(caps.lidarAvailable ? "true" : "false"),
          sceneDepth: \(caps.sceneDepth ? "true" : "false"),
          smoothedSceneDepth: \(caps.smoothedSceneDepth ? "true" : "false"),
          mesh: \(caps.mesh ? "true" : "false"),
          cameraPermission: \(cameraStatus == .authorized ? "true" : "false"),
          source: '\(caps.sourceLabel)'
        };
        """
        config.userContentController.addUserScript(
            WKUserScript(source: capabilityJS, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        )

        webView = WKWebView(frame: .zero, configuration: config)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.uiDelegate = self
        webView.navigationDelegate = self
        webView.scrollView.contentInsetAdjustmentBehavior = .never

        arView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(arView)
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            arView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            arView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            arView.topAnchor.constraint(equalTo: view.topAnchor),
            arView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])

        bridge = TabelaARBridge(webView: webView, arView: arView)
        ocrBridge = TabelaVisionOCRBridge(webView: webView)
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(beginMeasurement(_:)),
            name: .tabelaMeasurementRequested,
            object: bridge
        )

        configureAROverlay()
        arView.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(arTapped(_:))))
        arView.isHidden = true

        requestCameraThenLoad()
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    private func configureAROverlay() {
        info.translatesAutoresizingMaskIntoConstraints = false
        info.textColor = .white
        info.backgroundColor = UIColor.black.withAlphaComponent(0.78)
        info.textAlignment = .center
        info.numberOfLines = 4
        info.layer.cornerRadius = 12
        info.clipsToBounds = true
        arView.addSubview(info)

        let stack = UIStackView(arrangedSubviews: [cancelButton, undoButton, finishButton])
        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.axis = .horizontal
        stack.distribution = .fillEqually
        stack.spacing = 8
        arView.addSubview(stack)

        cancelButton.setTitle("İptal", for: .normal)
        undoButton.setTitle("Geri al", for: .normal)
        finishButton.setTitle("Bitir", for: .normal)
        [cancelButton, undoButton, finishButton].forEach { button in
            button.backgroundColor = UIColor.black.withAlphaComponent(0.72)
            button.setTitleColor(.white, for: .normal)
            button.layer.cornerRadius = 10
            button.heightAnchor.constraint(equalToConstant: 44).isActive = true
        }
        cancelButton.addTarget(self, action: #selector(cancelMeasurement), for: .touchUpInside)
        undoButton.addTarget(self, action: #selector(undoPoint), for: .touchUpInside)
        finishButton.addTarget(self, action: #selector(finishDynamicMeasurement), for: .touchUpInside)

        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: arView.leadingAnchor, constant: 16),
            stack.trailingAnchor.constraint(equalTo: arView.trailingAnchor, constant: -16),
            stack.topAnchor.constraint(equalTo: arView.safeAreaLayoutGuide.topAnchor, constant: 10),

            info.leadingAnchor.constraint(equalTo: arView.leadingAnchor, constant: 18),
            info.trailingAnchor.constraint(equalTo: arView.trailingAnchor, constant: -18),
            info.bottomAnchor.constraint(equalTo: arView.safeAreaLayoutGuide.bottomAnchor, constant: -18),
            info.heightAnchor.constraint(greaterThanOrEqualToConstant: 88)
        ])
    }

    private func requestCameraThenLoad() {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            loadV11()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] _ in
                DispatchQueue.main.async {
                    self?.loadV11()
                    self?.publishRuntimeCapabilities()
                }
            }
        default:
            loadV11()
        }
    }

    private func loadV11() {
        guard let url = URL(string: "https://cihes252-dot.github.io/TABELA-AI/app/v11/?native=ios&build=11.1.0") else { return }
        webView.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30))
    }

    private func publishRuntimeCapabilities() {
        let caps = TabelaLiDAREngine.capabilities()
        let cameraGranted = AVCaptureDevice.authorizationStatus(for: .video) == .authorized
        let script = """
        window.TabelaNativeCapabilities=Object.assign({},window.TabelaNativeCapabilities||{}, {
          platform:'ios',app:true,appVersion:'11.1.0',nativeOCR:'apple-vision',
          arkit:\(caps.worldTracking ? "true" : "false"),lidar:\(caps.lidarAvailable ? "true" : "false"),
          sceneDepth:\(caps.sceneDepth ? "true" : "false"),smoothedSceneDepth:\(caps.smoothedSceneDepth ? "true" : "false"),
          mesh:\(caps.mesh ? "true" : "false"),cameraPermission:\(cameraGranted ? "true" : "false"),source:'\(caps.sourceLabel)'
        });
        window.dispatchEvent(new CustomEvent('tabela:native-capabilities',{detail:window.TabelaNativeCapabilities}));
        """
        webView?.evaluateJavaScript(script)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        publishRuntimeCapabilities()
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        if isTrustedAppURL(url) {
            decisionHandler(.allow)
            return
        }
        if navigationAction.targetFrame?.isMainFrame != false,
           let scheme = url.scheme?.lowercased(),
           scheme == "https" || scheme == "http" {
            UIApplication.shared.open(url)
        }
        decisionHandler(.cancel)
    }

    @available(iOS 15.0, *)
    func webView(
        _ webView: WKWebView,
        requestMediaCapturePermissionFor origin: WKSecurityOrigin,
        initiatedByFrame frame: WKFrameInfo,
        type: WKMediaCaptureType,
        decisionHandler: @escaping (WKPermissionDecision) -> Void
    ) {
        let trusted = origin.host == Self.trustedHost
        let cameraAuthorized = AVCaptureDevice.authorizationStatus(for: .video) == .authorized
        if trusted && cameraAuthorized && (type == .camera || type == .cameraAndMicrophone) {
            decisionHandler(.grant)
        } else {
            decisionHandler(.deny)
        }
    }

    @objc private func beginMeasurement(_ notification: Notification) {
        let caps = TabelaLiDAREngine.capabilities()
        guard caps.worldTracking else {
            bridge.emitUnavailable(
                code: "arkit_unsupported_device",
                message: "Bu cihaz ARKit world tracking desteklemiyor. RGB görüntüden metre üretilmedi."
            )
            return
        }
        guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized else {
            bridge.emitUnavailable(code: "camera_permission_denied", message: "Gerçek AR ölçümü için kamera izni gerekli.")
            return
        }

        stopWebCameraForNativeAR { [weak self] in
            guard let self else { return }
            let configuration = ARWorldTrackingConfiguration()
            TabelaLiDAREngine.configure(configuration)
            self.arView.session.run(configuration, options: [.resetTracking, .removeExistingAnchors])
            self.arView.isHidden = false
            self.webView.isHidden = true
            self.updateControlsAndInfo()
        }
    }

    private func stopWebCameraForNativeAR(completion: @escaping () -> Void) {
        let script = """
        (()=>{try{document.querySelectorAll('video').forEach(v=>{const s=v.srcObject;if(s&&s.getTracks)s.getTracks().forEach(t=>t.stop());});window.dispatchEvent(new CustomEvent('tabela:native-ar-start'));}catch(e){}})();
        """
        webView.evaluateJavaScript(script) { _, _ in
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.12, execute: completion)
        }
    }

    @objc private func arTapped(_ gesture: UITapGestureRecognizer) {
        let point = gesture.location(in: arView)
        guard bridge.addPoint(screenPoint: point) else {
            info.text = bridge.lastErrorMessage.isEmpty ? "Bu noktada güvenilir 3B yüzey bulunamadı." : bridge.lastErrorMessage
            return
        }

        updateControlsAndInfo()
        if let required = bridge.requiredPointCount, bridge.pointCount == required {
            finishCurrentMeasurement()
        }
    }

    @objc private func undoPoint() {
        bridge.undoLastPoint()
        updateControlsAndInfo()
    }

    @objc private func finishDynamicMeasurement() {
        guard bridge.isDynamicShape, bridge.canFinish else {
            info.text = "Çokgen/serbest form için en az 3 çevre noktası gerekli."
            return
        }
        finishCurrentMeasurement()
    }

    @objc private func cancelMeasurement() {
        bridge.cancel()
        returnToWeb()
    }

    private func finishCurrentMeasurement() {
        if bridge.finishMeasurement() {
            returnToWeb()
        } else {
            info.text = bridge.lastErrorMessage.isEmpty ? "Ölçüm kalite kapısından geçmedi. Noktaları tekrar seçin." : bridge.lastErrorMessage
            updateControlsAndInfo(preserveMessage: true)
        }
    }

    private func returnToWeb() {
        arView.session.pause()
        arView.isHidden = true
        webView.isHidden = false
        webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent('tabela:native-ar-end'));", completionHandler: nil)
    }

    private func updateControlsAndInfo(preserveMessage: Bool = false) {
        undoButton.isEnabled = bridge.pointCount > 0
        finishButton.isHidden = !bridge.isDynamicShape
        finishButton.isEnabled = bridge.isDynamicShape && bridge.canFinish
        guard !preserveMessage else { return }

        let caps = TabelaLiDAREngine.capabilities()
        let mode: String
        if caps.depthAvailable { mode = "LiDAR + Scene Depth + ARKit" }
        else if caps.mesh { mode = "LiDAR mesh + ARKit" }
        else { mode = "ARKit algılanmış düzlem" }

        if bridge.isDynamicShape {
            info.text = "Gerçek ölçüm • \(mode)\n\(bridge.nextPrompt()) noktasına çevre sırasıyla dokunun\n\(bridge.pointCount)/24 • En az 3 noktadan sonra Bitir"
        } else if let required = bridge.requiredPointCount {
            info.text = "Gerçek ölçüm • \(mode)\n\(bridge.nextPrompt()) noktasına dokunun\n\(bridge.pointCount)/\(required) • Kalite düşükse nokta kabul edilmez"
        }
    }

    private func isTrustedAppURL(_ url: URL) -> Bool {
        url.scheme?.lowercased() == "https" &&
        url.host?.lowercased() == Self.trustedHost &&
        url.path.hasPrefix(Self.trustedPathPrefix)
    }
}
