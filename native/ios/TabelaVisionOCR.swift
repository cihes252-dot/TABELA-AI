import Foundation
import Vision
import UIKit

struct TabelaOCRCandidate: Codable {
    let text: String
    let confidence: Float
}

final class TabelaVisionOCR {
    func recognize(image: UIImage, completion: @escaping (Result<[TabelaOCRCandidate], Error>) -> Void) {
        guard let cg = image.cgImage else {
            completion(.failure(NSError(domain: "TabelaVisionOCR", code: 1, userInfo: [NSLocalizedDescriptionKey: "CGImage oluşturulamadı"])))
            return
        }
        let request = VNRecognizeTextRequest { req, err in
            if let err = err { completion(.failure(err)); return }
            let observations = (req.results as? [VNRecognizedTextObservation]) ?? []
            var out: [TabelaOCRCandidate] = []
            for o in observations {
                for c in o.topCandidates(3) {
                    let t = c.string.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !t.isEmpty { out.append(TabelaOCRCandidate(text: t, confidence: c.confidence)) }
                }
            }
            completion(.success(out.sorted { $0.confidence > $1.confidence }))
        }
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        request.recognitionLanguages = ["tr-TR", "en-US"]
        request.minimumTextHeight = 0.015
        request.revision = VNRecognizeTextRequestRevision3
        DispatchQueue.global(qos: .userInitiated).async {
            do { try VNImageRequestHandler(cgImage: cg, options: [:]).perform([request]) }
            catch { completion(.failure(error)) }
        }
    }
}
