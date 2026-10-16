import axe from "axe-core"

const RULES_JSDOM_CANNOT_EVALUATE = {
	"color-contrast": { enabled: false },
}

export const accessibilityViolations = async (root: Element) => {
	const results = await axe.run(root, {
		rules: RULES_JSDOM_CANNOT_EVALUATE,
		resultTypes: ["violations"],
	})
	return results.violations.map((violation) => ({
		rule: violation.id,
		impact: violation.impact,
		nodes: violation.nodes.map((node) => node.html),
	}))
}
