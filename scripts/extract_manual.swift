import Foundation
import PDFKit
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

struct TocItem: Codable {
    let title: String
    let page: Int
    let level: Int
}

struct ManualPage: Codable {
    let page: Int
    let text: String
    var images: [String]
}

struct CropArea: Codable {
    let top: Double
    let bottom: Double
}

struct Question: Codable {
    let id: String
    let no: Int
    let stem: String
    let options: [String: String]
    var correct: String?
    let page: Int
    let crop: CropArea?
    var image: String?
}

struct ManualData: Codable {
    let totalPages: Int
    let toc: [TocItem]
    let pages: [ManualPage]
    let questions: [Question]
    let generatedAt: String
}

struct TextRect {
    let xMin: Double
    let xMax: Double
    let yMin: Double
    let yMax: Double
}

struct LineItem {
    let page: Int
    let text: String
    let yMin: Double
    let yMax: Double
    let x: Double
    let pageHeight: Double
    let rect: TextRect
}

struct CropBuilder {
    var top: Double
    var bottom: Double?
    var lastY: Double
    var textRects: [TextRect]
}

struct CurrentQuestion {
    let no: Int
    let chapter: Int
    var stem: String
    var options: [String: String]
    var correct: String?
    let page: Int
    let pageHeight: Double
    var crop: CropBuilder?
}

struct Component {
    var minX: Int
    var minY: Int
    var maxX: Int
    var maxY: Int
    var area: Int

    var width: Int { maxX - minX + 1 }
    var height: Int { maxY - minY + 1 }
}

func normalize(_ text: String) -> String {
    let s = text.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
    return s.trimmingCharacters(in: .whitespacesAndNewlines)
}

func clamp(_ v: Double, _ minV: Double, _ maxV: Double) -> Double {
    return min(max(v, minV), maxV)
}

func regex(_ pattern: String) -> NSRegularExpression {
    return try! NSRegularExpression(pattern: pattern, options: [.caseInsensitive])
}

func firstMatch(_ re: NSRegularExpression, _ text: String) -> [String]? {
    let range = NSRange(text.startIndex..<text.endIndex, in: text)
    guard let m = re.firstMatch(in: text, options: [], range: range) else { return nil }
    var out: [String] = []
    for i in 0..<m.numberOfRanges {
        let r = m.range(at: i)
        if r.location == NSNotFound { out.append(""); continue }
        out.append(String(text[Range(r, in: text)!]))
    }
    return out
}

func allMatches(_ re: NSRegularExpression, _ text: String) -> [[String]] {
    let range = NSRange(text.startIndex..<text.endIndex, in: text)
    let matches = re.matches(in: text, options: [], range: range)
    return matches.map { m in
        (0..<m.numberOfRanges).map { i in
            let r = m.range(at: i)
            if r.location == NSNotFound { return "" }
            return String(text[Range(r, in: text)!])
        }
    }
}

func tocFromOutline(_ doc: PDFDocument) -> [TocItem] {
    var items: [TocItem] = []

    func walk(_ outline: PDFOutline, _ level: Int) {
        let count = outline.numberOfChildren
        for i in 0..<count {
            guard let child = outline.child(at: i) else { continue }
            let title = normalize(child.label ?? "未命名章节")
            var pageNo = 1
            if let page = child.destination?.page {
                pageNo = doc.index(for: page) + 1
            }
            items.append(TocItem(title: title.isEmpty ? "未命名章节" : title, page: pageNo, level: level))
            walk(child, level + 1)
        }
    }

    if let root = doc.outlineRoot {
        walk(root, 1)
    }

    if items.isEmpty {
        items = (1...doc.pageCount).map { TocItem(title: "第 \($0) 页", page: $0, level: 1) }
    }

    return items
}

func extractPageLines(_ page: PDFPage, pageNo: Int) -> [LineItem] {
    let bounds = page.bounds(for: .mediaBox)
    guard let all = page.selection(for: bounds) else { return [] }
    let lines = all.selectionsByLine()

    var out: [LineItem] = []
    for sel in lines {
        let txt = normalize(sel.string ?? "")
        if txt.isEmpty { continue }
        let b = sel.bounds(for: page)
        let rect = TextRect(
            xMin: Double(b.minX),
            xMax: Double(b.maxX),
            yMin: Double(b.minY),
            yMax: Double(b.maxY)
        )
        out.append(LineItem(
            page: pageNo,
            text: txt,
            yMin: Double(b.minY),
            yMax: Double(b.maxY),
            x: Double(b.minX),
            pageHeight: Double(bounds.height),
            rect: rect
        ))
    }

    out.sort {
        if abs($0.yMax - $1.yMax) > 2.0 { return $0.yMax > $1.yMax }
        return $0.x < $1.x
    }
    return out
}

func parseAnswerPool(_ lines: [String]) -> [Int: [String]] {
    let headingRe = regex("(answer\\s*key|answers?|答案|试题答案)")
    let pairRe = regex("(?<!\\d)(\\d{1,3})\\s*[\\.:：\\)-]?\\s*([A-DＡ-Ｄ])")

    var pool: [Int: [String]] = [:]
    var inAnswer = false
    var answerCount = 0

    func normalizeChoice(_ s: String) -> String {
        switch s.uppercased() {
        case "Ａ": return "A"
        case "Ｂ": return "B"
        case "Ｃ": return "C"
        case "Ｄ": return "D"
        default: return s.uppercased()
        }
    }

    for line in lines {
        if firstMatch(headingRe, line) != nil {
            inAnswer = true
            answerCount = 0
            continue
        }
        if !inAnswer { continue }

        answerCount += 1
        // Some manuals place answer keys much later; avoid truncating too early.
        if answerCount > 5000 {
            inAnswer = false
            continue
        }

        for m in allMatches(pairRe, line) {
            guard m.count >= 3, let n = Int(m[1]) else { continue }
            let a = normalizeChoice(m[2])
            pool[n, default: []].append(a)
        }
    }

    return pool
}

func finalizeCrop(_ crop: CropBuilder?, pageHeight: Double) -> CropArea? {
    guard let crop else { return nil }
    let top = clamp(crop.top, 0, pageHeight)
    let rawBottom = crop.bottom ?? (crop.lastY - 8)
    let bottom = clamp(rawBottom, 0, pageHeight)
    if top - bottom < 20 { return nil }
    return CropArea(top: top, bottom: bottom)
}

func isLikelyQuestion(_ no: Int, stem: String, options: [String: String]) -> Bool {
    if options.count < 2 { return false }
    if no <= 0 || no > 200 { return false }
    let stemLen = stem.count
    if stemLen < 3 || stemLen > 420 { return false }
    let validKeys = Set(["A", "B", "C", "D"])
    let optionKeys = Set(options.keys.map { $0.uppercased() })
    if optionKeys.subtracting(validKeys).count > 0 { return false }
    return true
}

func cleanOptionText(_ raw: String) -> String {
    var s = normalize(raw)
    // Remove page footer tails injected into choices, e.g.:
    // "... - 23 - 第2章 - ... 宾夕法尼亚州驾驶手册"
    s = s.replacingOccurrences(
        of: "\\s*-\\s*\\d+\\s*-\\s*第\\s*\\d+章\\s*-.*$",
        with: "",
        options: .regularExpression
    )
    // Remove accidental appended chapter answer headings.
    s = s.replacingOccurrences(
        of: "\\s*第\\s*\\d+章\\s*答案\\s*$",
        with: "",
        options: .regularExpression
    )
    return normalize(s)
}

func extractQuestions(_ lines: [LineItem], answerPool: [Int: [String]]) -> [Question] {
    let qStart = regex("^(\\d{1,3})\\s*[\\.)、]\\s*(.+)$")
    let optStart = regex("^([A-D])\\s*[\\.)、．]\\s*(.+)$")
    let inlineAns = regex("(答案|answer)\\s*[:：]?\\s*([A-D])")
    let quizStart = regex("(复习问题|review\\s*question|练习题|试题)")
    let chapterQuizStart = regex("^第\\s*(\\d+)章\\s*复习问题$")
    let chapterAnswerStart = regex("^第\\s*(\\d+)章\\s*答案$")
    let pairRe = regex("(?<!\\d)(\\d{1,3})\\s*[\\.:：\\)-]?\\s*([A-DＡ-Ｄ])")

    var questions: [Question] = []
    var seenNo: [Int: Int] = [:]
    var current: CurrentQuestion?
    var optionKey: String?
    var inQuizSection = false
    var activeQuizChapter = 0
    var activeAnswerChapter = 0
    var answerByChapter: [Int: [Int: String]] = [:]

    func normalizeChoice(_ s: String) -> String {
        switch s.uppercased() {
        case "Ａ": return "A"
        case "Ｂ": return "B"
        case "Ｃ": return "C"
        case "Ｄ": return "D"
        default: return s.uppercased()
        }
    }

    func setBottomAtNextQuestion(_ y: Double) {
        guard var c = current else { return }
        guard c.crop != nil else { return }
        if c.crop!.bottom == nil {
            c.crop!.bottom = y + 10
        }
        current = c
    }

    func extendCrop(with line: LineItem) {
        guard var c = current else { return }
        guard c.page == line.page else { return }

        if c.crop == nil {
            c.crop = CropBuilder(top: line.yMax + 14, bottom: nil, lastY: line.yMin, textRects: [])
        } else {
            c.crop!.top = max(c.crop!.top, line.yMax + 14)
            c.crop!.lastY = min(c.crop!.lastY, line.yMin)
        }
        c.crop!.textRects.append(line.rect)
        current = c
    }

    func flush() {
        guard let c = current else { return }

        let stemNorm = normalize(c.stem)
        if !isLikelyQuestion(c.no, stem: stemNorm, options: c.options) {
            current = nil
            optionKey = nil
            return
        }

        var ans = c.correct
        if ans == nil {
            if c.chapter > 0, let mapped = answerByChapter[c.chapter]?[c.no] {
                ans = mapped
            } else {
                let idx = seenNo[c.no, default: 0]
                ans = answerPool[c.no]?[safe: idx]
                seenNo[c.no] = idx + 1
            }
        }

        let id = "q-\(questions.count + 1)"
        var cleanedOptions: [String: String] = [:]
        for (k, v) in c.options {
            cleanedOptions[k] = cleanOptionText(v)
        }
        let q = Question(
            id: id,
            no: c.no,
            stem: stemNorm,
            options: cleanedOptions,
            correct: ans,
            page: c.page,
            crop: finalizeCrop(c.crop, pageHeight: c.pageHeight),
            image: nil
        )
        questions.append(q)
        current = nil
        optionKey = nil
    }

    for line in lines {
        let text = line.text

        if let m = firstMatch(chapterAnswerStart, text), m.count >= 2, let ch = Int(m[1]) {
            activeAnswerChapter = ch
        }
        if let m = firstMatch(chapterQuizStart, text), m.count >= 2, let ch = Int(m[1]) {
            activeQuizChapter = ch
            activeAnswerChapter = 0
        }
        if activeAnswerChapter > 0 {
            for m in allMatches(pairRe, text) {
                guard m.count >= 3, let n = Int(m[1]) else { continue }
                let a = normalizeChoice(m[2])
                if answerByChapter[activeAnswerChapter] == nil {
                    answerByChapter[activeAnswerChapter] = [:]
                }
                if answerByChapter[activeAnswerChapter]?[n] == nil {
                    answerByChapter[activeAnswerChapter]?[n] = a
                }
            }
        }

        if firstMatch(quizStart, text) != nil {
            inQuizSection = true
            continue
        }
        let isShortAnswerHeading =
            text.count <= 24 &&
            (text.contains("答案键") ||
             text.contains("参考答案") ||
             text.lowercased().contains("answer key") ||
             text == "答案" ||
             text == "试题答案")
        if isShortAnswerHeading {
            inQuizSection = false
            setBottomAtNextQuestion(line.yMax)
            flush()
            continue
        }
        if !inQuizSection { continue }

        if let m = firstMatch(qStart, text), m.count >= 3, let no = Int(m[1]) {
            setBottomAtNextQuestion(line.yMax)
            flush()

            current = CurrentQuestion(
                no: no,
                chapter: activeQuizChapter,
                stem: m[2],
                options: [:],
                correct: nil,
                page: line.page,
                pageHeight: line.pageHeight,
                crop: nil
            )
            extendCrop(with: line)
            optionKey = nil

            if let ans = firstMatch(inlineAns, text), ans.count >= 3 {
                current?.correct = ans[2].uppercased()
            }
            continue
        }

        guard current != nil else { continue }
        extendCrop(with: line)

        if let m = firstMatch(optStart, text), m.count >= 3 {
            let key = m[1].uppercased()
            current?.options[key] = m[2]
            optionKey = key
            continue
        }

        if let ans = firstMatch(inlineAns, text), ans.count >= 3 {
            current?.correct = ans[2].uppercased()
            continue
        }

        if let k = optionKey, var v = current?.options[k] {
            v = normalize(v + " " + text)
            current?.options[k] = v
        } else if var c = current {
            c.stem = normalize(c.stem + " " + text)
            current = c
        }
    }

    flush()
    return questions
}

func makeContext(width: Int, height: Int) -> CGContext? {
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    return CGContext(
        data: nil,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: 0,
        space: colorSpace,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    )
}

func writeImage(_ image: CGImage, _ url: URL, type: CFString, quality: CGFloat? = nil) {
    guard let dest = CGImageDestinationCreateWithURL(url as CFURL, type, 1, nil) else { return }
    if let q = quality {
        let props = [kCGImageDestinationLossyCompressionQuality: q] as CFDictionary
        CGImageDestinationAddImage(dest, image, props)
    } else {
        CGImageDestinationAddImage(dest, image, nil)
    }
    CGImageDestinationFinalize(dest)
}

func isValidImageFile(_ url: URL, minBytes: Int = 1200) -> Bool {
    guard let attrs = try? FileManager.default.attributesOfItem(atPath: url.path),
          let size = attrs[.size] as? NSNumber else {
        return false
    }
    if size.intValue < minBytes { return false }
    guard let src = CGImageSourceCreateWithURL(url as CFURL, nil) else { return false }
    return CGImageSourceGetCount(src) > 0
}

func imageInkRatio(_ image: CGImage, threshold: UInt8 = 245) -> Double {
    guard let ctx = makeContext(width: image.width, height: image.height) else { return 0 }
    ctx.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
    guard let ptr = ctx.data else { return 0 }
    let data = ptr.bindMemory(to: UInt8.self, capacity: image.width * image.height * 4)
    var ink = 0
    let total = image.width * image.height
    if total <= 0 { return 0 }
    for i in stride(from: 0, to: total * 4, by: 4) {
        let r = data[i]
        let g = data[i + 1]
        let b = data[i + 2]
        if r < threshold || g < threshold || b < threshold {
            ink += 1
        }
    }
    return Double(ink) / Double(total)
}

func renderPageCGImage(doc: PDFDocument, pageNo: Int, scale: CGFloat) -> CGImage? {
    guard let page = doc.page(at: pageNo - 1) else { return nil }
    let bounds = page.bounds(for: .mediaBox)
    let width = Int(bounds.width * scale)
    let height = Int(bounds.height * scale)
    guard let ctx = makeContext(width: width, height: height) else { return nil }

    ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
    ctx.fill(CGRect(x: 0, y: 0, width: CGFloat(width), height: CGFloat(height)))
    ctx.saveGState()
    ctx.scaleBy(x: scale, y: scale)
    page.draw(with: .mediaBox, to: ctx)
    ctx.restoreGState()

    return ctx.makeImage()
}

func isNonWhite(_ data: UnsafeMutablePointer<UInt8>, _ idx: Int, threshold: UInt8 = 244) -> Bool {
    let r = data[idx]
    let g = data[idx + 1]
    let b = data[idx + 2]
    return r < threshold || g < threshold || b < threshold
}

func findConnectedComponents(width: Int, height: Int, data: UnsafeMutablePointer<UInt8>) -> [Component] {
    var visited = [UInt8](repeating: 0, count: width * height)
    var components: [Component] = []
    var stackX = [Int]()
    var stackY = [Int]()
    stackX.reserveCapacity(4096)
    stackY.reserveCapacity(4096)

    let dirs = [(-1, 0), (1, 0), (0, -1), (0, 1)]

    for y in 0..<height {
        for x in 0..<width {
            let p = y * width + x
            if visited[p] == 1 { continue }
            visited[p] = 1
            let i = p * 4
            if !isNonWhite(data, i) { continue }

            var comp = Component(minX: x, minY: y, maxX: x, maxY: y, area: 0)
            stackX.removeAll(keepingCapacity: true)
            stackY.removeAll(keepingCapacity: true)
            stackX.append(x)
            stackY.append(y)

            while !stackX.isEmpty {
                let cx = stackX.removeLast()
                let cy = stackY.removeLast()
                let cp = cy * width + cx
                let ci = cp * 4
                if !isNonWhite(data, ci) { continue }

                comp.area += 1
                if cx < comp.minX { comp.minX = cx }
                if cy < comp.minY { comp.minY = cy }
                if cx > comp.maxX { comp.maxX = cx }
                if cy > comp.maxY { comp.maxY = cy }

                for (dx, dy) in dirs {
                    let nx = cx + dx
                    let ny = cy + dy
                    if nx < 0 || ny < 0 || nx >= width || ny >= height { continue }
                    let np = ny * width + nx
                    if visited[np] == 1 { continue }
                    visited[np] = 1
                    stackX.append(nx)
                    stackY.append(ny)
                }
            }

            components.append(comp)
        }
    }

    return components
}

func mergeComponents(_ components: [Component], gap: Int) -> [Component] {
    if components.isEmpty { return [] }
    var comps = components
    var changed = true

    while changed {
        changed = false
        var i = 0
        while i < comps.count {
            var j = i + 1
            while j < comps.count {
                let a = comps[i]
                let b = comps[j]
                let overlapX = !(a.maxX + gap < b.minX || b.maxX + gap < a.minX)
                let overlapY = !(a.maxY + gap < b.minY || b.maxY + gap < a.minY)
                if overlapX && overlapY {
                    comps[i] = Component(
                        minX: min(a.minX, b.minX),
                        minY: min(a.minY, b.minY),
                        maxX: max(a.maxX, b.maxX),
                        maxY: max(a.maxY, b.maxY),
                        area: a.area + b.area
                    )
                    comps.remove(at: j)
                    changed = true
                } else {
                    j += 1
                }
            }
            i += 1
        }
    }

    return comps
}

func maskTextRects(
    ctx: CGContext,
    pageHeight: Double,
    rects: [TextRect],
    scale: CGFloat,
    cropBottom: Double = 0,
    padX: Double = 10,
    padY: Double = 7
) {
    ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
    for r in rects {
        let x = CGFloat(r.xMin - padX)
        let w = CGFloat((r.xMax - r.xMin) + padX * 2)
        let y = CGFloat((r.yMin - cropBottom) - padY)
        let h = CGFloat((r.yMax - r.yMin) + padY * 2)
        ctx.fill(CGRect(x: x * scale, y: y * scale, width: w * scale, height: h * scale))
    }
}

func extractGraphicsFromPage(doc: PDFDocument, pageNo: Int, textRects: [TextRect], outDir: URL) -> [String] {
    guard let page = doc.page(at: pageNo - 1) else { return [] }
    let pageHeight = Double(page.bounds(for: .mediaBox).height)
    let scale: CGFloat = 1.5

    guard let cg = renderPageCGImage(doc: doc, pageNo: pageNo, scale: scale) else { return [] }
    let width = cg.width
    let height = cg.height
    guard let ctx = makeContext(width: width, height: height) else { return [] }

    ctx.draw(cg, in: CGRect(x: 0, y: 0, width: width, height: height))
    maskTextRects(ctx: ctx, pageHeight: pageHeight, rects: textRects, scale: scale, padX: 12, padY: 8)

    guard let ptr = ctx.data else { return [] }
    let data = ptr.bindMemory(to: UInt8.self, capacity: width * height * 4)
    var comps = findConnectedComponents(width: width, height: height, data: data)

    comps = comps.filter { c in
        if c.area < 1400 { return false }
        if c.width < 28 || c.height < 28 { return false }
        let aspect = Double(c.width) / Double(max(1, c.height))
        if aspect > 10.0 || aspect < 0.08 { return false }
        let density = Double(c.area) / Double(max(1, c.width * c.height))
        if density < 0.012 { return false }
        return true
    }
    comps = mergeComponents(comps, gap: 18)

    comps.sort { $0.area > $1.area }
    if comps.count > 8 { comps = Array(comps.prefix(8)) }

    guard let maskedImage = ctx.makeImage() else { return [] }
    var paths: [String] = []

    for (idx, c) in comps.enumerated() {
        let pad = 6
        let x = max(0, c.minX - pad)
        let y = max(0, c.minY - pad)
        let w = min(width - x, c.width + pad * 2)
        let h = min(height - y, c.height + pad * 2)
        if w < 20 || h < 20 { continue }

        let rect = CGRect(x: x, y: y, width: w, height: h)
        guard let crop = maskedImage.cropping(to: rect) else { continue }
        let file = String(format: "p-%03d-%02d.png", pageNo, idx + 1)
        let out = outDir.appendingPathComponent(file)
        writeImage(crop, out, type: UTType.png.identifier as CFString)
        if isValidImageFile(out, minBytes: 1400) {
            paths.append("/extracted/pages/\(file)")
        } else {
            try? FileManager.default.removeItem(at: out)
        }
    }

    return paths
}

struct QuestionImageTrim {
    let top: Int
    let right: Int
    let bottom: Int
    let expandBottom: Int
}

struct ManualMark: Codable {
    let x: Double
    let y: Double
    let w: Double
    let h: Double
}

let QUESTION_IMAGE_TRIMS: [Int: QuestionImageTrim] = [
    2: QuestionImageTrim(top: 0, right: 30, bottom: 5, expandBottom: 0),
    5: QuestionImageTrim(top: 0, right: 55, bottom: 0, expandBottom: 0),
    6: QuestionImageTrim(top: 0, right: 15, bottom: 0, expandBottom: 0),
    13: QuestionImageTrim(top: 15, right: 0, bottom: 0, expandBottom: 0),
    14: QuestionImageTrim(top: 15, right: 0, bottom: 0, expandBottom: 0),
    16: QuestionImageTrim(top: 5, right: 0, bottom: 0, expandBottom: 0),
    20: QuestionImageTrim(top: 15, right: 0, bottom: 0, expandBottom: 0),
    21: QuestionImageTrim(top: 20, right: 0, bottom: 0, expandBottom: 20),
    22: QuestionImageTrim(top: 30, right: 0, bottom: 30, expandBottom: 0),
    24: QuestionImageTrim(top: 10, right: 0, bottom: 0, expandBottom: 0),
    42: QuestionImageTrim(top: 20, right: 0, bottom: 0, expandBottom: 0),
    43: QuestionImageTrim(top: 10, right: 0, bottom: 0, expandBottom: 0)
]
let FORCE_IMAGE_QUESTIONS: Set<Int> = [15, 19, 41, 44, 52, 53, 55, 56, 58, 123]

func loadManualMarks(_ url: URL) -> [Int: ManualMark] {
    guard let data = try? Data(contentsOf: url) else { return [:] }
    let decoder = JSONDecoder()
    guard let raw = try? decoder.decode([String: ManualMark].self, from: data) else { return [:] }
    var out: [Int: ManualMark] = [:]
    for (k, v) in raw {
        if let n = Int(k) { out[n] = v }
    }
    return out
}

func loadCGImage(_ url: URL) -> CGImage? {
    guard let src = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
    return CGImageSourceCreateImageAtIndex(src, 0, nil)
}

func cropByManualMark(_ image: CGImage, _ mark: ManualMark) -> CGImage? {
    let x = max(0.0, min(1.0, mark.x))
    let y = max(0.0, min(1.0, mark.y))
    let w = max(0.01, min(1.0, mark.w))
    let h = max(0.01, min(1.0, mark.h))

    let px = Int(Double(image.width) * x)
    let py = Int(Double(image.height) * y)
    let pw = Int(Double(image.width) * w)
    let ph = Int(Double(image.height) * h)

    let rect = CGRect(
        x: max(0, min(image.width - 20, px)),
        y: max(0, min(image.height - 20, py)),
        width: max(20, min(image.width - px, pw)),
        height: max(20, min(image.height - py, ph))
    )
    return image.cropping(to: rect)
}

func questionCropImage(doc: PDFDocument, pageNo: Int, crop: CropArea, scale: CGFloat = 2.0) -> (CGImage, CGRect)? {
    guard let page = doc.page(at: pageNo - 1) else { return nil }
    let bounds = page.bounds(for: .mediaBox)
    let cropRect = CGRect(
        x: 0,
        y: CGFloat(crop.bottom),
        width: bounds.width,
        height: CGFloat(crop.top - crop.bottom)
    ).intersection(bounds)
    if cropRect.width < 20 || cropRect.height < 20 { return nil }

    guard let full = renderPageCGImage(doc: doc, pageNo: pageNo, scale: scale) else { return nil }
    let yFromTop = bounds.height - cropRect.maxY
    let pxRect = CGRect(
        x: cropRect.minX * scale,
        y: yFromTop * scale,
        width: cropRect.width * scale,
        height: cropRect.height * scale
    ).integral
    guard let outImg = full.cropping(to: pxRect) else { return nil }
    return (outImg, cropRect)
}

func inkBounds(_ image: CGImage, threshold: UInt8 = 245) -> CGRect? {
    guard let ctx = makeContext(width: image.width, height: image.height) else { return nil }
    ctx.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
    guard let ptr = ctx.data else { return nil }
    let data = ptr.bindMemory(to: UInt8.self, capacity: image.width * image.height * 4)

    var rowInk = [Int](repeating: 0, count: image.height)
    var colInk = [Int](repeating: 0, count: image.width)
    var inkCount = 0

    for y in 0..<image.height {
        for x in 0..<image.width {
            let idx = (y * image.width + x) * 4
            let r = data[idx]
            let g = data[idx + 1]
            let b = data[idx + 2]
            if r < threshold || g < threshold || b < threshold {
                rowInk[y] += 1
                colInk[x] += 1
                inkCount += 1
            }
        }
    }
    if inkCount == 0 { return nil }

    let rowMin = max(2, Int(Double(image.width) * 0.008))
    let colMin = max(2, Int(Double(image.height) * 0.015))
    var minY = 0
    while minY < image.height && rowInk[minY] < rowMin { minY += 1 }
    var maxY = image.height - 1
    while maxY >= 0 && rowInk[maxY] < rowMin { maxY -= 1 }
    var minX = 0
    while minX < image.width && colInk[minX] < colMin { minX += 1 }
    var maxX = image.width - 1
    while maxX >= 0 && colInk[maxX] < colMin { maxX -= 1 }

    if maxX <= minX || maxY <= minY { return nil }
    return CGRect(x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1)
}

func majorGraphicBounds(_ image: CGImage) -> CGRect? {
    guard let ctx = makeContext(width: image.width, height: image.height) else { return nil }
    ctx.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
    guard let ptr = ctx.data else { return nil }
    let data = ptr.bindMemory(to: UInt8.self, capacity: image.width * image.height * 4)

    let w = image.width
    let h = image.height
    var comps = findConnectedComponents(width: w, height: h, data: data)
    comps = comps.filter { c in
        if c.area < 120 { return false }
        if c.width < 10 || c.height < 10 { return false }
        if c.width > Int(Double(w) * 0.55) && c.height < 26 { return false } // thin top/bottom lines
        if (c.minY < 2 || c.maxY > h - 3) && c.height < 28 { return false }
        let touchesEdge = c.minX <= 1 || c.minY <= 1 || c.maxX >= w - 2 || c.maxY >= h - 2
        if touchesEdge && (c.width > Int(Double(w) * 0.6) || c.height > Int(Double(h) * 0.6)) {
            return false // drop question box borders
        }
        let density = Double(c.area) / Double(max(1, c.width * c.height))
        if density < 0.06 { return false }
        let aspect = Double(c.width) / Double(max(1, c.height))
        if aspect > 8.5 || aspect < 0.08 { return false }
        return true
    }
    guard !comps.isEmpty else { return nil }

    let right = comps.filter { c in
        let cx = Double(c.minX + c.maxX) * 0.5
        return cx > Double(w) * 0.42
    }
    let pick = right.isEmpty ? comps : right
    let maxArea = pick.map(\.area).max() ?? 0
    let areaCut = max(120, Int(Double(maxArea) * 0.15))
    let keep = pick.filter { $0.area >= areaCut }
    guard !keep.isEmpty else { return nil }

    let minX = keep.map(\.minX).min() ?? 0
    let minY = keep.map(\.minY).min() ?? 0
    let maxX = keep.map(\.maxX).max() ?? (w - 1)
    let maxY = keep.map(\.maxY).max() ?? (h - 1)
    if maxX <= minX || maxY <= minY { return nil }
    return CGRect(x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1)
}

func extractQuestionGraphic(
    doc: PDFDocument,
    pageNo: Int,
    crop: CropArea,
    textRects: [TextRect],
    questionIndex: Int,
    outURL: URL
) -> Bool {
    guard let (outImg, cropRect) = questionCropImage(doc: doc, pageNo: pageNo, crop: crop) else { return false }
    guard let ctx = makeContext(width: outImg.width, height: outImg.height) else { return false }
    ctx.draw(outImg, in: CGRect(x: 0, y: 0, width: outImg.width, height: outImg.height))

    // Remove stem/options text, but only in the left zone to preserve right-side signs.
    let maskRightLimit = Double(outImg.width) * 0.64
    ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
    for r in textRects {
        if r.yMax < crop.bottom || r.yMin > crop.top { continue }
        if r.xMax < Double(cropRect.minX) || r.xMin > Double(cropRect.maxX) { continue }

        let lx0 = (max(r.xMin, Double(cropRect.minX)) - Double(cropRect.minX)) * 2.0 - 8
        let lx1Raw = (min(r.xMax, Double(cropRect.maxX)) - Double(cropRect.minX)) * 2.0 + 8
        if lx0 >= maskRightLimit { continue }
        let lx1 = min(maskRightLimit, lx1Raw)
        if lx1 <= lx0 { continue }

        let ly0 = (Double(cropRect.maxY) - min(r.yMax, Double(cropRect.maxY))) * 2.0 - 6
        let ly1 = (Double(cropRect.maxY) - max(r.yMin, Double(cropRect.minY))) * 2.0 + 6
        if ly1 <= ly0 { continue }

        ctx.fill(
            CGRect(
                x: max(0, lx0),
                y: max(0, ly0),
                width: min(Double(outImg.width), lx1) - max(0, lx0),
                height: min(Double(outImg.height), ly1) - max(0, ly0)
            )
        )
    }

    guard let masked = ctx.makeImage() else { return false }
    let b = majorGraphicBounds(masked) ?? inkBounds(masked)
    guard let bounds = b else { return false }

    let minXBase = max(0, Int(bounds.minX) - 6)
    let minX = max(minXBase, Int(Double(outImg.width) * 0.45))
    var minY = max(0, Int(bounds.minY) - 6)
    var maxX = min(outImg.width - 1, Int(bounds.maxX) + 6)
    var maxY = min(outImg.height - 1, Int(bounds.maxY) + 6)

    if let t = QUESTION_IMAGE_TRIMS[questionIndex] {
        minY = min(maxY - 1, minY + t.top)
        maxX = max(minX + 1, maxX - t.right)
        maxY = max(minY + 1, maxY - t.bottom)
        maxY = min(outImg.height - 1, maxY + t.expandBottom)
    }

    let finalRect = CGRect(
        x: minX,
        y: minY,
        width: max(20, maxX - minX + 1),
        height: max(20, maxY - minY + 1)
    )
    guard let first = masked.cropping(to: finalRect) else { return false }
    var finalImg = first
    if let tight = majorGraphicBounds(first) ?? inkBounds(first, threshold: 248) {
        let tx = max(0, Int(tight.minX) - 2)
        let ty = max(0, Int(tight.minY) - 2)
        let tw = max(20, Int(tight.width) + 4)
        let th = max(20, Int(tight.height) + 4)
        let r = CGRect(
            x: min(tx, first.width - 20),
            y: min(ty, first.height - 20),
            width: min(first.width - tx, tw),
            height: min(first.height - ty, th)
        )
        if let tighter = first.cropping(to: r) {
            finalImg = tighter
        }
    }
    if finalImg.width < 60 || finalImg.height < 36 { return false }
    if imageInkRatio(finalImg) < 0.006 { return false }
    writeImage(finalImg, outURL, type: UTType.jpeg.identifier as CFString, quality: 0.9)
    let ok = isValidImageFile(outURL, minBytes: 1100)
    if !ok { try? FileManager.default.removeItem(at: outURL) }
    return ok
}

func isLikelyImageStem(_ stem: String) -> Bool {
    let s = stem.lowercased()
    let keys = ["此标志", "该标志", "这个标志", "图示", "下图", "如下图", "如图", "路标", "标牌", "形状和颜色"]
    for k in keys {
        if s.contains(k) { return true }
    }
    return false
}

func extractQuestionGraphicFallback(
    doc: PDFDocument,
    pageNo: Int,
    crop: CropArea,
    questionIndex: Int,
    outURL: URL
) -> Bool {
    guard let (outImg, _) = questionCropImage(doc: doc, pageNo: pageNo, crop: crop) else { return false }

    let w = outImg.width
    let h = outImg.height
    let minX = Int(Double(w) * 0.55)
    var minY = Int(Double(h) * 0.05)
    var maxX = w - 1
    var maxY = Int(Double(h) * 0.95)
    if let t = QUESTION_IMAGE_TRIMS[questionIndex] {
        minY = min(maxY - 1, minY + t.top)
        maxX = max(minX + 1, maxX - t.right)
        maxY = max(minY + 1, maxY - t.bottom)
        maxY = min(h - 1, maxY + t.expandBottom)
    }
    let rect = CGRect(
        x: max(0, minX),
        y: max(0, minY),
        width: max(20, maxX - minX + 1),
        height: max(20, maxY - minY + 1)
    )
    guard let finalImg = outImg.cropping(to: rect) else { return false }
    if imageInkRatio(finalImg) < 0.006 { return false }
    writeImage(finalImg, outURL, type: UTType.jpeg.identifier as CFString, quality: 0.9)
    let ok = isValidImageFile(outURL, minBytes: 1100)
    if !ok { try? FileManager.default.removeItem(at: outURL) }
    return ok
}

func extractQuestionGraphicFullCrop(
    doc: PDFDocument,
    pageNo: Int,
    crop: CropArea,
    outURL: URL
) -> Bool {
    guard let (outImg, _) = questionCropImage(doc: doc, pageNo: pageNo, crop: crop) else { return false }
    if imageInkRatio(outImg) < 0.01 { return false }
    writeImage(outImg, outURL, type: UTType.jpeg.identifier as CFString, quality: 0.9)
    let ok = isValidImageFile(outURL, minBytes: 1100)
    if !ok { try? FileManager.default.removeItem(at: outURL) }
    return ok
}

func extractQuestionSourceImage(
    doc: PDFDocument,
    pageNo: Int,
    crop: CropArea?,
    outURL: URL
) -> Bool {
    if let c = crop {
        return extractQuestionGraphicFullCrop(doc: doc, pageNo: pageNo, crop: c, outURL: outURL)
    }
    guard let page = doc.page(at: pageNo - 1) else { return false }
    let bounds = page.bounds(for: .mediaBox)
    let scale: CGFloat = 1.6
    guard let full = renderPageCGImage(doc: doc, pageNo: pageNo, scale: scale) else { return false }
    let padTop = Int(bounds.height * scale * 0.05)
    let padBottom = Int(bounds.height * scale * 0.05)
    let h = max(200, full.height - padTop - padBottom)
    let rect = CGRect(x: 0, y: padTop, width: full.width, height: h)
    guard let out = full.cropping(to: rect) else { return false }
    writeImage(out, outURL, type: UTType.jpeg.identifier as CFString, quality: 0.9)
    return isValidImageFile(outURL, minBytes: 1100)
}

func parseAnswersFromPageText(_ text: String) -> [Int: String] {
    let pairRe = try! NSRegularExpression(pattern: "(?<!\\d)(\\d{1,3})\\s*[\\.:：\\)-]?\\s*([A-DＡ-Ｄ])", options: [])
    var result: [Int: String] = [:]

    func normalizeChoice(_ s: String) -> String {
        switch s.uppercased() {
        case "Ａ": return "A"
        case "Ｂ": return "B"
        case "Ｃ": return "C"
        case "Ｄ": return "D"
        default: return s.uppercased()
        }
    }

    let lines = text.split(separator: "\n").map { String($0) }
    for line in lines {
        let range = NSRange(line.startIndex..<line.endIndex, in: line)
        let matches = pairRe.matches(in: line, options: [], range: range)
        for m in matches {
            guard m.numberOfRanges >= 3,
                  let nr = Range(m.range(at: 1), in: line),
                  let ar = Range(m.range(at: 2), in: line),
                  let n = Int(line[nr]) else { continue }
            if result[n] == nil {
                result[n] = normalizeChoice(String(line[ar]))
            }
        }
    }
    return result
}

extension Array {
    subscript(safe index: Int) -> Element? {
        guard index >= 0 && index < count else { return nil }
        return self[index]
    }
}

let cwd = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let pdfURL = cwd.appendingPathComponent("public/manual.pdf")
let outputJSON = cwd.appendingPathComponent("public/data/manual-static.json")
let manualMarkURL = cwd.appendingPathComponent("public/data/question-image-marks.json")
let pageImageDir = cwd.appendingPathComponent("public/extracted/pages", isDirectory: true)
let questionImageDir = cwd.appendingPathComponent("public/extracted/questions", isDirectory: true)
let questionSourceDir = cwd.appendingPathComponent("public/extracted/questions-source", isDirectory: true)

guard let doc = PDFDocument(url: pdfURL) else {
    fputs("Failed to open PDF at \(pdfURL.path)\n", stderr)
    exit(1)
}

try? FileManager.default.removeItem(at: pageImageDir)
try? FileManager.default.removeItem(at: questionImageDir)
try? FileManager.default.removeItem(at: questionSourceDir)
try? FileManager.default.createDirectory(at: pageImageDir, withIntermediateDirectories: true)
try? FileManager.default.createDirectory(at: questionImageDir, withIntermediateDirectories: true)
try? FileManager.default.createDirectory(at: questionSourceDir, withIntermediateDirectories: true)

let toc = tocFromOutline(doc)

var pages: [ManualPage] = []
var allLines: [LineItem] = []
var pageLinesMap: [Int: [LineItem]] = [:]

for i in 0..<doc.pageCount {
    guard let p = doc.page(at: i) else { continue }
    let pageNo = i + 1
    let lines = extractPageLines(p, pageNo: pageNo)
    pageLinesMap[pageNo] = lines
    allLines.append(contentsOf: lines)

    let text = lines.map { $0.text }.joined(separator: "\n")
    pages.append(ManualPage(page: pageNo, text: text, images: []))
}

allLines.sort {
    if $0.page != $1.page { return $0.page < $1.page }
    if abs($0.yMax - $1.yMax) > 2.0 { return $0.yMax > $1.yMax }
    return $0.x < $1.x
}

let merged = allLines.map { $0.text }
let answerPool = parseAnswerPool(merged)
var questions = extractQuestions(allLines, answerPool: answerPool)

// Force-align answers with official answer pages for this manual.
let chapter2AnswerPage = pages.first(where: { $0.page == 34 })?.text ?? ""
let chapter3AnswerPage = pages.first(where: { $0.page == 82 })?.text ?? ""
let chapter4AnswerPage = pages.first(where: { $0.page == 92 })?.text ?? ""
let ch2Map = parseAnswersFromPageText(chapter2AnswerPage)
let ch3Map = parseAnswersFromPageText(chapter3AnswerPage)
let ch4Map = parseAnswersFromPageText(chapter4AnswerPage)
let manualMarks = loadManualMarks(manualMarkURL)

for i in questions.indices {
    if i < 58 {
        if let a = ch2Map[questions[i].no] { questions[i].correct = a }
    } else if i < 58 + 110 {
        if let a = ch3Map[questions[i].no] { questions[i].correct = a }
    } else {
        if let a = ch4Map[questions[i].no] { questions[i].correct = a }
    }
}

for i in questions.indices {
    let crop = questions[i].crop
    let qNo = i + 1

    let textRects = crop == nil
        ? []
        : (pageLinesMap[questions[i].page] ?? [])
            .filter { line in
                line.yMax >= crop!.bottom - 2 &&
                line.yMin <= crop!.top + 2
            }
            .map(\.rect)

    let file = String(format: "q-%04d.jpg", i + 1)
    let out = questionImageDir.appendingPathComponent(file)
    let sourceOut = questionSourceDir.appendingPathComponent(file)

    // Always export full question crop as source image for manual marking.
    _ = extractQuestionSourceImage(
        doc: doc,
        pageNo: questions[i].page,
        crop: crop,
        outURL: sourceOut
    )

    let needsImage = isLikelyImageStem(questions[i].stem) || FORCE_IMAGE_QUESTIONS.contains(qNo)
    if !needsImage {
        questions[i].image = nil
        continue
    }

    if let mark = manualMarks[qNo], let src = loadCGImage(sourceOut), let marked = cropByManualMark(src, mark) {
        writeImage(marked, out, type: UTType.jpeg.identifier as CFString, quality: 0.9)
        questions[i].image = isValidImageFile(out, minBytes: 900) ? "/extracted/questions/\(file)" : nil
        if questions[i].image == nil { try? FileManager.default.removeItem(at: out) }
        continue
    }

    if crop == nil {
        // No extracted crop: use a deterministic right-side default from source image.
        if let src = loadCGImage(sourceOut),
           let marked = cropByManualMark(src, ManualMark(x: 0.52, y: 0.06, w: 0.42, h: 0.88)) {
            writeImage(marked, out, type: UTType.jpeg.identifier as CFString, quality: 0.9)
            questions[i].image = isValidImageFile(out, minBytes: 900) ? "/extracted/questions/\(file)" : nil
            if questions[i].image == nil { try? FileManager.default.removeItem(at: out) }
        } else {
            questions[i].image = nil
        }
        continue
    }

    let ok = extractQuestionGraphic(
        doc: doc,
        pageNo: questions[i].page,
        crop: crop!,
        textRects: textRects,
        questionIndex: i + 1,
        outURL: out
    )
    if ok {
        questions[i].image = "/extracted/questions/\(file)"
    } else if needsImage {
        let fb = extractQuestionGraphicFallback(
                doc: doc,
                pageNo: questions[i].page,
                crop: crop!,
                questionIndex: i + 1,
                outURL: out
            )
        if fb {
            questions[i].image = "/extracted/questions/\(file)"
        } else {
            let full = extractQuestionGraphicFullCrop(
                doc: doc,
                pageNo: questions[i].page,
                crop: crop!,
                outURL: out
            )
            questions[i].image = full ? "/extracted/questions/\(file)" : nil
        }
    } else {
        questions[i].image = nil
    }
}

let data = ManualData(
    totalPages: doc.pageCount,
    toc: toc,
    pages: pages,
    questions: questions,
    generatedAt: ISO8601DateFormatter().string(from: Date())
)

let encoder = JSONEncoder()
encoder.outputFormatting = [.prettyPrinted, .withoutEscapingSlashes]
let json = try encoder.encode(data)
try json.write(to: outputJSON)

print("done: pages=\(pages.count), questions=\(questions.count)")
print("json: \(outputJSON.path)")
print("page image files: \(pageImageDir.path)")
print("question image files: \(questionImageDir.path)")
print("question source files: \(questionSourceDir.path)")
