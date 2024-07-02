import { readFileSync, writeFileSync } from "node:fs"

const fileName = "data-2023-10-10.txt"

export const saveLocalValue = (value: string[]) => {
	writeFileSync(fileName, JSON.stringify(value))
}

export const getLocalValue = (): string[] => {
	try {
		const file = readFileSync(fileName, "utf8")
		return JSON.parse(file)
	} catch (e) {
		return []
	}
}
