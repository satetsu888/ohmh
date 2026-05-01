// shared/ is a VS Code API-free zone. It is consumed by multiple clients
// (extension and CLI), so importing `vscode` and other VS Code-only modules
// is forbidden here.
import tsParser from "@typescript-eslint/parser";

export default [{
    files: ["**/*.ts"],
    languageOptions: {
        parser: tsParser,
        ecmaVersion: 2022,
        sourceType: "module",
    },
    rules: {
        "no-restricted-imports": ["error", {
            paths: [{
                name: "vscode",
                message: "shared/ must not depend on the vscode API.",
            }],
        }],
    },
}];
