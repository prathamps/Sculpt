export async function loadPdfjs() {
	const pdfjs = await import("pdfjs-dist")
	pdfjs.GlobalWorkerOptions.workerSrc = new URL(
		"pdfjs-dist/build/pdf.worker.min.mjs",
		import.meta.url
	).toString()
	return pdfjs
}
