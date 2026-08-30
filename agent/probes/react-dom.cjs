/**
 * Is `ReactDOM.render` still there?
 *
 * The mount call every React tutorial taught for a decade. React 19 removed it outright,
 * so this one fails loudly on the first run — the opposite of the express case.
 */
const ReactDOM = require("react-dom");

const present = typeof ReactDOM.render === "function";
console.log(JSON.stringify({
  observed: present ? "ReactDOM.render exists" : "ReactDOM.render is undefined",
  detail: present
    ? "the legacy mount API is callable"
    : `removed — react-dom now exports: ${Object.keys(ReactDOM).filter((k) => !k.startsWith("__")).join(", ")}`,
  healthy: present,
}));
