import Foundation
import PDFKit

guard CommandLine.arguments.count > 1 else {
    fputs("A PDF path is required.\n", stderr)
    exit(2)
}

let url = URL(fileURLWithPath: CommandLine.arguments[1])
guard let document = PDFDocument(url: url) else {
    fputs("The PDF could not be opened.\n", stderr)
    exit(3)
}

if document.isLocked && !document.unlock(withPassword: "") {
    fputs("The PDF requires a password.\n", stderr)
    exit(4)
}

for pageIndex in 0..<document.pageCount {
    if let text = document.page(at: pageIndex)?.string, !text.isEmpty {
        print(text)
    }
}
