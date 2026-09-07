import UIKit
import ARKit
import CoreVideo
import simd

/// Runtime sensing capability and depth-quality layer for TABELA AI 11.1.
///
/// LiDAR-capable devices use Scene Depth and mesh reconstruction when available.
/// Non-LiDAR ARKit devices remain supported through detected-plane raycasts.
/// Unsupported devices never receive fabricated metre values.
enum TabelaLiDAREngine {
    struct Capabilities {
        let worldTracking: Bool
        let sceneDepth: Bool
        let smoothedSceneDepth: Bool
        let mesh: Bool
        let meshClassification: Bool

        var depthAvailable: Bool { sceneDepth || smoothedSceneDepth }
        var lidarAvailable: Bool { depthAvailable || mesh }
        var sourceLabel: String {
            if depthAvailable { return "LiDAR-ARKit-SceneDepth" }
            if mesh { return "LiDAR-ARKit-Mesh" }
            if worldTracking { return "ARKit-DetectedPlane-Raycast" }
            return "ARKit-Unavailable"
        }
    }

    struct DepthSample {
        let meters: Float
        /// ARKit confidence map values: 0 low, 1 medium, 2 high.
        let confidence: UInt8
        /// Normalized camera-image coordinate in [0, 1].
        let imagePoint: CGPoint
        let spreadMeters: Float
        let validSampleCount: Int

        var toleranceMeters: Float { max(0.04, meters * 0.025) }
        var acceptable: Bool {
            meters.isFinite && meters > 0.15 && meters < 25.0 &&
            confidence >= 1 && validSampleCount >= 9 && spreadMeters <= toleranceMeters
        }

        var qualityScore: Double {
            let confidenceScore: Double = confidence >= 2 ? 100 : (confidence == 1 ? 82 : 35)
            let spreadRatio = Double(spreadMeters / max(toleranceMeters, 0.001))
            return max(0, min(100, confidenceScore - min(42, spreadRatio * 24)))
        }
    }

    static func capabilities() -> Capabilities {
        let world = ARWorldTrackingConfiguration.isSupported
        guard world else {
            return Capabilities(worldTracking: false, sceneDepth: false, smoothedSceneDepth: false, mesh: false, meshClassification: false)
        }
        let scene = ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth)
        let smooth = ARWorldTrackingConfiguration.supportsFrameSemantics(.smoothedSceneDepth)
        let meshClass = ARWorldTrackingConfiguration.supportsSceneReconstruction(.meshWithClassification)
        let mesh = meshClass || ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh)
        return Capabilities(
            worldTracking: true,
            sceneDepth: scene,
            smoothedSceneDepth: smooth,
            mesh: mesh,
            meshClassification: meshClass
        )
    }

    /// Applies the strongest real-world sensing mode supported by the current device.
    /// Smoothed Scene Depth is preferred for a stable stationary sign surface; sceneDepth is the fallback.
    /// The two frame semantics are not enabled simultaneously.
    static func configure(_ configuration: ARWorldTrackingConfiguration) {
        let caps = capabilities()
        configuration.planeDetection = [.horizontal, .vertical]

        if caps.smoothedSceneDepth {
            configuration.frameSemantics.insert(.smoothedSceneDepth)
        } else if caps.sceneDepth {
            configuration.frameSemantics.insert(.sceneDepth)
        }

        if caps.meshClassification {
            configuration.sceneReconstruction = .meshWithClassification
        } else if caps.mesh {
            configuration.sceneReconstruction = .mesh
        }

        configuration.environmentTexturing = .automatic
        configuration.worldAlignment = .gravity
    }

    /// Reads a robust local depth sample aligned with the camera image for a selected screen point.
    /// A 5x5 neighbourhood is used; the median depth and local spread reject edge/noise samples.
    static func depthSample(
        at screenPoint: CGPoint,
        in view: ARSCNView,
        orientation: UIInterfaceOrientation
    ) -> DepthSample? {
        guard let frame = view.session.currentFrame else { return nil }
        let depthData = frame.smoothedSceneDepth ?? frame.sceneDepth
        guard let depthData else { return nil }

        let viewport = view.bounds.size
        guard viewport.width > 0, viewport.height > 0 else { return nil }

        let viewNorm = CGPoint(x: screenPoint.x / viewport.width, y: screenPoint.y / viewport.height)
        let imageNorm = viewNorm.applying(frame.displayTransform(for: orientation, viewportSize: viewport).inverted())
        guard imageNorm.x >= 0, imageNorm.x <= 1, imageNorm.y >= 0, imageNorm.y <= 1 else { return nil }

        let depthMap = depthData.depthMap
        CVPixelBufferLockBaseAddress(depthMap, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(depthMap, .readOnly) }

        let width = CVPixelBufferGetWidth(depthMap)
        let height = CVPixelBufferGetHeight(depthMap)
        guard width > 0, height > 0, let base = CVPixelBufferGetBaseAddress(depthMap) else { return nil }

        let x = max(0, min(width - 1, Int((imageNorm.x * CGFloat(width - 1)).rounded())))
        let y = max(0, min(height - 1, Int((imageNorm.y * CGFloat(height - 1)).rounded())))
        let stride = CVPixelBufferGetBytesPerRow(depthMap) / MemoryLayout<Float32>.size
        let floats = base.assumingMemoryBound(to: Float32.self)

        var samples: [Float32] = []
        let radius = 2
        for yy in max(0, y - radius)...min(height - 1, y + radius) {
            for xx in max(0, x - radius)...min(width - 1, x + radius) {
                let value = floats[yy * stride + xx]
                if value.isFinite && value > 0.10 && value < 40 { samples.append(value) }
            }
        }
        guard samples.count >= 9 else { return nil }
        samples.sort()
        let meters = samples[samples.count / 2]
        let lowIndex = max(0, Int(Double(samples.count - 1) * 0.10))
        let highIndex = min(samples.count - 1, Int(Double(samples.count - 1) * 0.90))
        let spread = max(0, samples[highIndex] - samples[lowIndex])

        var confidence: UInt8 = 0
        if let confidenceMap = depthData.confidenceMap {
            CVPixelBufferLockBaseAddress(confidenceMap, .readOnly)
            defer { CVPixelBufferUnlockBaseAddress(confidenceMap, .readOnly) }
            let cw = CVPixelBufferGetWidth(confidenceMap)
            let ch = CVPixelBufferGetHeight(confidenceMap)
            if let cbase = CVPixelBufferGetBaseAddress(confidenceMap), cw > 0, ch > 0 {
                let cx = max(0, min(cw - 1, Int((imageNorm.x * CGFloat(cw - 1)).rounded())))
                let cy = max(0, min(ch - 1, Int((imageNorm.y * CGFloat(ch - 1)).rounded())))
                let cstride = CVPixelBufferGetBytesPerRow(confidenceMap)
                let bytes = cbase.assumingMemoryBound(to: UInt8.self)
                var confidenceSamples: [UInt8] = []
                for yy in max(0, cy - 1)...min(ch - 1, cy + 1) {
                    for xx in max(0, cx - 1)...min(cw - 1, cx + 1) {
                        confidenceSamples.append(bytes[yy * cstride + xx])
                    }
                }
                confidenceSamples.sort()
                confidence = confidenceSamples[confidenceSamples.count / 2]
            }
        }

        return DepthSample(
            meters: meters,
            confidence: confidence,
            imagePoint: imageNorm,
            spreadMeters: spread,
            validSampleCount: samples.count
        )
    }

    /// Reprojects a trusted Scene Depth sample through the calibrated ARCamera intrinsics into
    /// ARKit world coordinates. This is the metric point used on LiDAR devices; it avoids deriving
    /// metres from RGB pixels or from an estimated 2-D scale.
    static func worldPoint(from sample: DepthSample, frame: ARFrame) -> SIMD3<Float>? {
        guard sample.acceptable else { return nil }
        let resolution = frame.camera.imageResolution
        guard resolution.width > 1, resolution.height > 1 else { return nil }

        let u = Float(sample.imagePoint.x * resolution.width)
        let v = Float(sample.imagePoint.y * resolution.height)
        let k = frame.camera.intrinsics
        let fx = k.columns.0.x
        let fy = k.columns.1.y
        let cx = k.columns.2.x
        let cy = k.columns.2.y
        guard fx.isFinite, fy.isFinite, cx.isFinite, cy.isFinite,
              abs(fx) > 1e-5, abs(fy) > 1e-5 else { return nil }

        // ARKit camera coordinates: +X right, +Y up, camera looks toward -Z.
        let z = sample.meters
        let xCamera = (u - cx) / fx * z
        let yCamera = -(v - cy) / fy * z
        let cameraPoint = SIMD4<Float>(xCamera, yCamera, -z, 1)
        let world = frame.camera.transform * cameraPoint
        guard world.x.isFinite, world.y.isFinite, world.z.isFinite else { return nil }
        return SIMD3<Float>(world.x, world.y, world.z)
    }

    /// LiDAR/Scene-Depth devices require a valid local depth sample for every accepted point.
    /// Mesh-only LiDAR or non-LiDAR devices continue with ARKit detected-plane quality gates.
    static func depthQualityPasses(
        at screenPoint: CGPoint,
        in view: ARSCNView,
        orientation: UIInterfaceOrientation
    ) -> (passes: Bool, sample: DepthSample?) {
        let caps = capabilities()
        guard caps.depthAvailable else { return (true, nil) }
        let sample = depthSample(at: screenPoint, in: view, orientation: orientation)
        return (sample?.acceptable == true, sample)
    }
}
