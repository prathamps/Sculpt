import path from "path"

export const downloadFileName = (
	imageName: string,
	versionNumber: number,
	storedPath: string
): string => {
	const extension = path.extname(storedPath)
	const withoutExtension =
		extension && imageName.toLowerCase().endsWith(extension.toLowerCase())
			? imageName.slice(0, -extension.length)
			: imageName
	const safeName = withoutExtension
		.replace(/[^\w.\- ]+/g, "_")
		.replace(/^[_\s]+|[_\s]+$/g, "")
	return `${safeName || "asset"}-v${versionNumber}${extension}`
}
