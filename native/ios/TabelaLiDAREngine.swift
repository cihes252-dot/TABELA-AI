import UIKit
import ARKit
import CoreVideo
import simd

/// LiDAR / Scene Depth capability and quality layer for TABELA AI.
///
/// Principles:
/// - A LiDAR-capable device uses Scene Depth + mesh reconstruction when available.
/// - Each selected sign corner must have usable depth with at least medium confidence.
/// - If LiDAR is not available (for example iPhone 11), the app falls back to ARKit raycast.
/// - No metric value is invented from RGB-only image data.
enum TabelaLiDAREngine {
    struct Capabilities {
        let sceneDepth: Bool
        let smoothedSceneDepth: Bool
        let mesh: Bool
        let meshClassification: Bool

        var lidarAvailable: Bool { sceneDepth || smoothedSceneDepth || mesh }
        var sourceLabel: String { lidarAvailable ? "LiDAR-ARKit-SceneDepth" : "ARKit-Raycast" }
    }

    struct DepthSample {
        let meters: Float
        /// ARKit confidence map values: 0 low, 1 medium, 2 high.
        let confidence: UInt8
        let imagePoint: CGPoint

        var acceptable: Bool {
            meters.isFinite && meters > 0.15 && meters < 25.0 && confidence >= 1
        }
    }

    static func capabilities() -> Capabilities {
        let scene = ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth)
        let smooth = ARWorldTrackingConfiguration.supportsFrameSemantics(.smoothedSceneDepth)
        let meshClass = ARWorldTrackingConfiguration.supportsSceneReconstruction(.meshWithClassification)
        let mesh = meshClass || ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh)
        return Capabilities(
            sceneDepth: scene,
            smoothedSceneDepth: smooth,
            mesh: mesh,
            meshClassification: meshClass
        )
    }

    /// Applies the best available real-world sensing configuration to the AR session.
    static func configure(_ configuration: ARWorldTrackingConfiguration) {
        let caps = capabilities()
        configuration.planeDetection = [.horizontal, .vertical]

        if caps.sceneDepth {
            configuration.frameSemantics.insert(.sceneDepth)
        }
        if caps.smoothedSceneDepth {
            configuration.frameSemantics.insert(.smoothedSceneDepth)
        }

        if caps.meshClassification {
            configuration.sceneReconstruction = .meshWithClassification
        } else if caps.mesh {
            configuration.sceneReconstruction = .mesh
        }

        configuration.environmentTexturing = .automatic
    }

    /// Reads depth aligned with the camera image for the selected screen point.
    /// The display transform maps normalized image coordinates to normalized view coordinates;
    /// therefore its inverse is used to map a touch point back to the depth/camera image.
    static func depthSample(
        at screenPoint: CGPoint,
        in view: ARSCNView,
        orientation: UIInterfaceOrientation
    ) -> DepthSample? {
        guard let frame = view.session.currentFrame else { return nil }
        let sceneDepth = frame.smoothedSceneDepth ?? frame.sceneDepth
        guard let depth = sceneDepth else { return nil }

        let viewport = view.bounds.size
        guard viewport.width > 0, viewport.height > 0 else { return nil }

        let viewNorm = CGPoint(
            x: screenPoint.x / viewport.width,
            y: screenPoint.y / viewport.height
        )
        let imageNorm = viewNorm.applying(
            frame.displayTransform(for: orientation, viewportSize: viewport).inverted()
        )

        guard imageNorm.x >= 0, imageNorm.x <= 1, imageNorm.y >= 0, imageNorm.y <= 1 else { return nil }

        let depthMap = depth.depthMap
        CVPixelBufferLockBaseAddress(depthMap, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(depthMap, .readOnly) }

        let w = CVPixelBufferGetWidth(depthMap)
        let h = CVPixelBufferGetHeight(depthMap)
        guard w > 0, h > 0, let base = CVPixelBufferGetBaseAddress(depthMap) else { return nil }

        let x = max(0, min(w - 1, Int((imageNorm.x * CGFloat(w - 1)).rounded())))
        let y = max(0, min(h - 1, Int((imageNorm.y * CGFloat(h - 1)).rounded())))
        let stride = CVPixelBufferGetBytesPerRow(depthMap) / MemoryLayout<Float32>.size
        let floats = base.assumingMemoryBound(to: Float32.self)

        // Median-like local sampling (3x3): sort valid depths and use the middle value.
        var samples: [Float32] = []
        for yy in max(0, y - 1)...min(h - 1, y + 1) {
            for xx in max(0, x - 1)...min(w - 1, x + 1) {
                let v = floats[yy * stride + xx]
                if v.isFinite && v > 0.05 && v < 50 { samples.append(v) }
            }
        }
        guard !samples.isEmpty else { return nil }
        samples.sort()
        let meters = samples[samples.count / 2]

        var confidence: UInt8 = 2
        if let confidenceMap = depth.confidenceMap {
            CVPixelBufferLockBaseAddress(confidenceMap, .readOnly)
            defer { CVPixelBufferUnlockBaseAddress(confidenceMap, .readOnly) }
            let cw = CVPixelBufferGetWidth(confidenceMap)
            let ch = CVPixelBufferGetHeight(confidenceMap)
            if let cbase = CVPixelBufferGetBaseAddress(confidenceMap), cw > 0, ch > 0 {
                let cx = max(0, min(cw - 1, Int((imageNorm.x * CGFloat(cw - 1)).rounded())))
                let cy = max(0, min(ch - 1, Int((imageNorm.y * CGFloat(ch - 1)).rounded())))
                let cstride = CVPixelBufferGetBytesPerRow(confidenceMap)
                let bytes = cbase.assumingMemoryBound(to: UInt8.self)
                confidence = bytes[cy * cstride + cx]
            }
        }

        return DepthSample(meters: meters, confidence: confidence, imagePoint: imageNorm)
    }

    /// A LiDAR-capable session requires an acceptable depth sample for every accepted corner.
    /// Non-LiDAR devices intentionally return true here so ARKit raycast remains available.
    static func depthQualityPasses(
        at screenPoint: CGPoint,
        in view: ARSCNView,
        orientation: UIInterfaceOrientation
    ) -> (passes: Bool, sample: DepthSample?) {
        let caps = capabilities()
        guard caps.lidarAvailable else { return (true, nil) }
        let sample = depthSample(at: screenPoint, in: view, orientation: orientation)
        return (sample?.acceptable == true, sample)
    }
}
