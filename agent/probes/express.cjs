/**
 * Does `res.send(404)` still mean "reply 404"?
 *
 * Express 4 answered 404 and warned. Express 5 removed the overload, so the number is
 * treated as a body: the same line now replies 200 with the text "404". Nothing throws,
 * which is why this probe has to look at the response rather than catch an error.
 */
const express = require("express");

const app = express();
app.get("/thing", (_req, res) => res.send(404));

const server = app.listen(0, async () => {
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/thing`);
  const body = (await res.text()).slice(0, 40);

  console.log(JSON.stringify({
    observed: `HTTP ${res.status}`,
    detail: `res.send(404) replied ${res.status} with body ${JSON.stringify(body)}`,
    healthy: res.status === 404,
  }));
  server.close();
});
