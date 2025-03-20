const fs = require("fs");
const path = require("path");

const generatedDir = path.resolve(__dirname, "generated-src");

// Ensure the generated-src directory exists
if (!fs.existsSync(generatedDir)) {
    fs.mkdirSync(generatedDir, { recursive: true });
}

const htmlContent = fs.readFileSync(path.resolve(__dirname, "index.html"), "utf-8");

// Write the content to a generated TypeScript file
fs.writeFileSync(
    path.resolve(generatedDir, "generated.ts"),
    `export const HTML_TEMPLATE = ${JSON.stringify(htmlContent)};`
);

console.log("✔️  index.html content embedded into generated.ts");
