import { cp, mkdir, access } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const webRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const threeLibs = join(webRoot, "node_modules/three/examples/jsm/libs")
const publicThree = join(webRoot, "public/three")

const copies = [
	["draco/gltf", "draco"],
	["basis", "basis"],
]

const exists = async (path) =>
	access(path).then(
		() => true,
		() => false
	)

if (!(await exists(threeLibs))) {
	console.warn(
		"three is not installed yet; skipping decoder copy (run npm install first)"
	)
	process.exit(0)
}

for (const [from, to] of copies) {
	const source = join(threeLibs, from)
	const destination = join(publicThree, to)
	await mkdir(destination, { recursive: true })
	await cp(source, destination, { recursive: true })
	console.log(`copied ${from} -> public/three/${to}`)
}
