import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

const targetDirs = ["src", "seed", "tests"];
let hasError = false;
let fileCount = 0;

function scanAndCheck(directory) {
  if (!fs.existsSync(directory)) return;

  const entries = fs.readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      scanAndCheck(fullPath);
    } else if (entry.isFile() && fullPath.endsWith(".js")) {
      fileCount++;
      try {
        execFileSync(process.execPath, ["--check", fullPath], { stdio: "pipe" });
      } catch (error) {
        console.error(`❌ Syntax error in file: ${fullPath}`);
        console.error(error.message);
        hasError = true;
      }
    }
  }
}

console.log("Checking JavaScript syntax across src, seed, and tests...");
for (const dir of targetDirs) {
  scanAndCheck(dir);
}

if (hasError) {
  console.error("Syntax check failed with errors.");
  process.exit(1);
} else {
  console.log(`✅ All ${fileCount} JavaScript files passed syntax check successfully.`);
}
