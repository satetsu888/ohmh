// shared/ は VS Code API 非依存ゾーン。extension / CLI など複数クライアントから利用するため
// vscode をはじめとする VS Code 依存モジュールの import を禁止する。
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
