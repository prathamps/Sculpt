const SPREADSHEET_FORMULA_PREFIX = /^[=+\-@\t\r]/

export const csvEscape = (value: unknown): string => {
	const raw = value === null || value === undefined ? "" : String(value)
	const neutralized = SPREADSHEET_FORMULA_PREFIX.test(raw) ? `'${raw}` : raw
	if (/[",\n\r\t]/.test(neutralized)) {
		return `"${neutralized.replace(/"/g, '""')}"`
	}
	return neutralized
}

export const csvRow = (values: unknown[]): string => values.map(csvEscape).join(",")
