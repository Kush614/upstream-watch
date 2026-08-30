/**
 * Is `.eslintrc.json` still read?
 *
 * ESLint 9 made flat config the only format. A repo with an .eslintrc and no
 * eslint.config.js does not lint with different rules — it does not lint at all.
 */
const { execFileSync } = require("node:child_process");
const { writeFileSync } = require("node:fs");

// parserOptions is not optional here. Without it ESLint 8 defaults to ES5 and answers
// "Parsing error: The keyword 'const' is reserved" — which is the config being READ and
// applied. A probe that only looks for the rule name reads that as "config ignored" and
// reports the old version as already broken.
writeFileSync(
  ".eslintrc.json",
  JSON.stringify({
    env: { node: true, es2022: true },
    parserOptions: { ecmaVersion: 2022, sourceType: "script" },
    rules: { "no-unused-vars": "error" },
  }),
);
writeFileSync("probe-target.js", "const unused = 1;\n");

let out = "";
let ok = false;
try {
  execFileSync("npx", ["eslint", "probe-target.js"], { encoding: "utf8", stdio: "pipe" });
} catch (error) {
  out = `${error.stdout ?? ""}${error.stderr ?? ""}`;
  // Reporting the unused variable IS the healthy outcome: it means the config was read.
  // Either outcome proves the config was read: the rule fired, or the parser it configured
  // rejected the file. What proves it was NOT read is eslint refusing to run at all.
  ok = out.includes("no-unused-vars") || out.includes("Parsing error");
}

console.log(JSON.stringify({
  observed: ok ? ".eslintrc.json was read" : ".eslintrc.json was ignored",
  detail: ok
    ? "linted the file and reported no-unused-vars, so the config applied"
    : (out.match(/ESLint couldn't find[^\n.]*/)?.[0] ?? out.trim().split("\n").slice(0, 2).join(" ")).slice(0, 160),
  healthy: ok,
}));
