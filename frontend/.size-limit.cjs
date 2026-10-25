const { readdirSync } = require('node:fs')
const { join } = require('node:path')

// A wildcard in one check sums every lazy chunk. Enforce the documented
// per-chunk budget individually as the number of migrated routes grows.
const chunks = readdirSync(join(__dirname, '../public/app/static'))
  .filter((file) => file.endsWith('.js') && !file.startsWith('index-'))
  .sort()

module.exports = [
  { name: 'shell (initial JS, gzip)', path: '../public/app/static/index-*.js', limit: '120 kB', gzip: true },
  ...chunks.map((file) => ({ name: file, path: `../public/app/static/${file}`, limit: '60 kB', gzip: true })),
]
