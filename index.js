const app = require('../server');

// One Vercel function owns every API route. Keeping this entrypoint explicit
// prevents /api/download from being treated as a separate static function.
module.exports = (req, res) => app(req, res);
