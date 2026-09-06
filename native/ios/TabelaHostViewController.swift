import UIKit
import WebKit
import ARKit

final class TabelaHostViewController: UIViewController {
    private let arView = ARSCNView(frame: .zero)
    private var webView: WKWebView!
    private var bridge: TabelaARBridge!
    private let info = UILabel()
    private var tapCount = 0

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        webView = WKWebView(frame: .zero, configuration: config)
        webView.translatesAutoresizingMaskIntoConstraints = false
        arView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(arView)
        view.addSubview(webView)

        NSLayoutConstraint.activate([
            arView.leadingAnchor.constraint(equalTo: view.leadingAnchor), arView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            arView.topAnchor.constraint(equalTo: view.topAnchor), arView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor), webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.topAnchor.constraint(equalTo: view.topAnchor), webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])

        bridge = TabelaARBridge(webView: webView, arView: arView)
        NotificationCenter.default.addObserver(self, selector: #selector(beginMeasurement), name: .tabelaMeasurementRequested, object: nil)

        info.translatesAutoresizingMaskIntoConstraints = false
        info.textColor = .white; info.backgroundColor = UIColor.black.withAlphaComponent(0.65)
        info.textAlignment = .center; info.numberOfLines = 2; info.layer.cornerRadius = 12; info.clipsToBounds = true
        arView.addSubview(info)
        NSLayoutConstraint.activate([info.leadingAnchor.constraint(equalTo: arView.leadingAnchor, constant: 18),info.trailingAnchor.constraint(equalTo: arView.trailingAnchor, constant: -18),info.bottomAnchor.constraint(equalTo: arView.safeAreaLayoutGuide.bottomAnchor, constant: -18),info.heightAnchor.constraint(equalToConstant: 64)])
        arView.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(arTapped(_:))))
        arView.isHidden = true

        if let url = URL(string: "https://cihes252-dot.github.io/TABELA-AI/app/v10/?native=ios") {
            webView.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData))
        }
    }

    @objc private func beginMeasurement() {
        tapCount = 0
        let config = ARWorldTrackingConfiguration()
        config.planeDetection = [.horizontal, .vertical]
        arView.session.run(config, options: [.resetTracking, .removeExistingAnchors])
        arView.isHidden = false; webView.isHidden = true
        updateInfo()
    }

    @objc private func arTapped(_ g: UITapGestureRecognizer) {
        let p = g.location(in: arView)
        guard bridge.addPoint(screenPoint: p) else {
            info.text = "Bu noktada güvenilir AR yüzeyi bulunamadı. Kamerayı yavaşça hareket ettirin ve tekrar dokunun."
            return
        }
        tapCount += 1
        if tapCount >= 4 {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { [weak self] in
                self?.arView.session.pause(); self?.arView.isHidden = true; self?.webView.isHidden = false
            }
        } else { updateInfo() }
    }

    private func updateInfo() {
        let names = ["SOL ÜST", "SAĞ ÜST", "SOL ALT", "SAĞ ALT"]
        info.text = "Gerçek ölçüm • \(names[min(tapCount,3)]) köşesine dokunun\nAR takip kararlı değilse nokta kabul edilmez."
    }
}
