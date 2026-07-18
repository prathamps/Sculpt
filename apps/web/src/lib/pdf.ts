// pdf.js must only ever load in the browser (it touches DOM APIs at import
// time), so all consumers go through this dynamic loader.
export async function loadPdfjs() {
	const pdfjs = await import("pdfjs-dist")
	pdfjs.GlobalWorkerOptions.workerSrc = new URL(
		"pdfjs-dist/build/pdf.worker.min.mjs",
		import.meta.url
	).toString()
	return pdfjs
}
