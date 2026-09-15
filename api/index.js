/* Vercel 서버리스 진입점. 같은 핸들러를 그대로 쓴다.
   로컬에서는 `npm run dev` 가 server/index.js 를 직접 띄운다. */
module.exports = require("../server/index.js");
