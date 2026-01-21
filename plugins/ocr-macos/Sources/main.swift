import Foundation
import Vision

struct CliOptions {
  var langsRaw: String? = nil
  var json: Bool = false
  var strict: Bool = false
  var showHelp: Bool = false
  var showVersion: Bool = false
  var imagePaths: [String] = []
}

func printHelp() {
  let text = """
  webauto-ocr-macos (Vision OCR)

  Usage:
    webauto-ocr-macos --json --langs <chi_sim+eng|zh-Hans,en-US> <image1> [image2...]

  Options:
    --langs <...>   Language hints (tesseract-style "chi_sim+eng" or locale list "zh-Hans,en-US"; default: chi_sim+eng)
    --json          Output JSON array to stdout
    --strict        Exit non-zero if any image fails OCR
    --version       Print version
    -h, --help      Show help
  """
  print(text)
}

func parseArgs(_ argv: [String]) -> CliOptions {
  var opts = CliOptions()
  var i = 1
  while i < argv.count {
    let a = argv[i]
    if a == "--langs" {
      if i + 1 < argv.count {
        opts.langsRaw = argv[i + 1]
        i += 2
        continue
      }
    }
    if a == "--json" { opts.json = true; i += 1; continue }
    if a == "--strict" { opts.strict = true; i += 1; continue }
    if a == "--version" { opts.showVersion = true; i += 1; continue }
    if a == "-h" || a == "--help" { opts.showHelp = true; i += 1; continue }
    opts.imagePaths.append(a)
    i += 1
  }
  return opts
}

func normalizeLanguages(_ raw: String?) -> [String] {
  guard let raw, !raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
    // Default: Chinese (Simplified) + English
    return ["zh-Hans", "en-US"]
  }
  let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
  let parts: [String]
  if trimmed.contains("+") {
    parts = trimmed.split(separator: "+").map { String($0) }
  } else if trimmed.contains(",") {
    parts = trimmed.split(separator: ",").map { String($0) }
  } else {
    parts = [trimmed]
  }

  func mapOne(_ s: String) -> String {
    let v = s.trimmingCharacters(in: .whitespacesAndNewlines)
    switch v {
    case "chi_sim": return "zh-Hans"
    case "chi_tra": return "zh-Hant"
    case "eng": return "en-US"
    case "jpn": return "ja-JP"
    default: return v
    }
  }
  let mapped = parts.map(mapOne).filter { !$0.isEmpty }
  // Preserve order while de-duping
  var seen = Set<String>()
  var out: [String] = []
  for v in mapped {
    if seen.contains(v) { continue }
    seen.insert(v)
    out.append(v)
  }
  return out
}

func ocrImage(url: URL, recognitionLanguages: [String]) throws -> String {
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.usesLanguageCorrection = true
  if !recognitionLanguages.isEmpty {
    request.recognitionLanguages = recognitionLanguages
  }

  let handler = VNImageRequestHandler(url: url, options: [:])
  try handler.perform([request])

  let results = request.results ?? []
  let lines = results.compactMap { obs in
    obs.topCandidates(1).first?.string
  }
  return lines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
}

struct ImageOcrResult: Codable {
  var image: String
  var text: String?
  var error: String?
}

func main() -> Int32 {
  let opts = parseArgs(CommandLine.arguments)
  if opts.showHelp {
    printHelp()
    return 0
  }
  if opts.showVersion {
    print("webauto-ocr-macos 0.1")
    return 0
  }
  if opts.imagePaths.isEmpty {
    printHelp()
    return 2
  }

  let langs = normalizeLanguages(opts.langsRaw)
  var results: [ImageOcrResult] = []
  var hadError = false

  for p in opts.imagePaths {
    let url = URL(fileURLWithPath: p)
    do {
      let text = try ocrImage(url: url, recognitionLanguages: langs)
      results.append(ImageOcrResult(image: p, text: text.isEmpty ? nil : text, error: nil))
    } catch {
      hadError = true
      results.append(ImageOcrResult(image: p, text: nil, error: String(describing: error)))
    }
  }

  if opts.json {
    do {
      let encoder = JSONEncoder()
      encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
      let data = try encoder.encode(results)
      if let s = String(data: data, encoding: .utf8) {
        print(s)
      } else {
        print("[]")
      }
    } catch {
      print("[]")
      hadError = true
    }
  } else {
    // Plain: concat texts separated by blank line
    for (idx, r) in results.enumerated() {
      if idx > 0 { print("") }
      if let text = r.text, !text.isEmpty {
        print(text)
      } else if let err = r.error {
        print("[OCR_ERROR] \(err)")
      }
    }
  }

  if opts.strict && hadError {
    return 3
  }
  return 0
}

exit(main())
