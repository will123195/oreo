var PG = require('pg')
var async = require('../async')

var pg = module.exports

// bypass PG's conversion of YYYY-MM-DD strings into Date objects
PG.types.setTypeParser(1082, function (date) { return date })

pg.identifierQuoteChar = '"'


pg.getClient = function(conn, cb) {
  var self = this
  PG.connect(conn, function(err, client, release) {
    if (err) {
      if (!self.db._opts.silent) {
        console.error('pg.connect error:', err)
      }
      return cb(err)
    }
    cb(null, client, release)
  })
}


pg.end = function(cb) {
  PG.on('end', cb)
  PG.end()
}


//
// for internal use
// don't release the connection back to the pool because
// this function is used within transactions
//
pg.execute = function(client, sql, values, cb) {
  if (typeof values === 'function') {
    cb = values
    values = {}
  }
  var self = this
  client.query({
    text: sql,
    values: values
  }, function(err, result) {
    if (err) {
      //console.error(sql)
      return cb(err)
    }
    cb(null, result.rows)
  })
}


pg.determineHosts = function(cb) {
  var self = this
  var opts = self.db._opts
  var hosts = {
    readOnly: [],
    writable: []
  }
  // Connect to all seed hosts and determine read/write servers
  async.eachSeries(opts.hosts, function(host, callback) {
    var sql
    var params = opts.ssl ? '?ssl=true' : ''
    var conn = 'postgres://' + opts.user + ':' + opts.pass + '@' + host + '/' + opts.name + params

    sql = 'select pg_is_in_recovery() as is_slave'
    self.getClient(conn, function(err, client, release) {
      if (err) return callback(err)
      self.execute(client, sql, function(err, rs) {
        release()
        if (err) {
          // try next host
          return callback(null)
        }
        if (rs[0].is_slave) {
          hosts.readOnly.push(conn)
        } else {
          hosts.writable.push(conn)
        }
        callback(null)
      })
    })
  }, function() {
    cb(hosts)
  })
}


pg.getTables = function(cb) {
  var self = this
  self.db.execute('show search_path', function(err, result) {
    if (err) return cb(err)
    var searchPath = result[0].search_path || ''
    var schema = searchPath.split(',')
      .filter(function (path) {
        return path !== '"$user"'
      })[0]
      .trim()
    var tables = []
    this.get
    var sql = [
      'SELECT table_name',
      'FROM information_schema.tables',
      "WHERE table_schema = '" + schema + "'"
    ]
    self.db.execute(sql, function(err, rs) {
      if (err) return cb(err)
      rs.forEach(function(r) {
        tables.push(r.table_name)
      })
      cb(null, tables)
    })
  })
}


pg.getForeignKeys = function(tableName, cb) {
  var fk = {}
  var sql = [
    'SELECT conname,',
    '  pg_catalog.pg_get_constraintdef(r.oid, true) as condef',
    'FROM pg_catalog.pg_constraint r',
    "WHERE r.conrelid = (SELECT oid FROM pg_class WHERE relname = '" + tableName + "')",
    "AND r.contype = 'f' ORDER BY 1"
  ]
  this.db.execute(sql, function(err, rs) {
    if (err) return cb(err)
    rs.forEach(function(r) {
      // parse r.condef
      var regExp = /\(([^)]+)\) REFERENCES (.+)\(([^)]+)\)/;
      var matches = regExp.exec(r.condef);
      fk[r.conname] = {
        constraintName: r.conname,
        table: tableName,
        columns: matches[1].replace(/"/g,'').split(', '),
        foreignTable: matches[2].replace(/"/g,''),
        foreignColumns: matches[3].replace(/"/g,'').split(', ')
      }
    })
    cb(null, fk)
  })
}


pg.getColumns = function(tableName, cb) {
  var columns = []
  var sql = [
    'SELECT',
    '  column_name as name,',
    '  data_type as type',
    'FROM information_schema.columns',
    "WHERE table_name = '" + tableName + "'"
  ]
  this.db.execute(sql, function(err, columns) {
    if (err) return cb(err)
    cb(null, columns)
  })
}


pg.getPrimaryKeyDefinition = function(tableName, cb) {
  var sql = [
    'SELECT',
    '  c.relname,',
    '  pg_catalog.pg_get_constraintdef(con.oid, true) as def,',
    '  con.conname,',
    '  con.conkey',
    'FROM',
    '  pg_catalog.pg_class c,',
    '  pg_catalog.pg_index i',
    'LEFT JOIN pg_catalog.pg_constraint con ON (conrelid = i.indrelid AND conindid = i.indexrelid)',
    'WHERE c.oid = i.indrelid',
    "AND con.contype = 'p'",
    "AND c.relname = '" + tableName + "'",
    'ORDER BY i.indisprimary DESC, i.indisunique DESC'
  ]
  this.db.execute(sql, function(err, rs) {
    if (err) return cb(err)
    if (!rs[0]) return cb(null, null)
    var regExp = /\(([^)]+)\)/
    var matches = regExp.exec(rs[0].def)
    var pk = matches[1].replace(/"/g,'').split(', ')
    cb(null, pk)
  })
}


pg.upsert = function(client, opts, cb) {
  var self = this
  var update = [
    'UPDATE "' + opts.table + '"',
    'SET ' + opts.set.join(',\n'),
    'WHERE ' + opts.pkWhere,
    'RETURNING *'
  ].join('\n')

  var insert = [
    'INSERT INTO "' + opts.table + '"',
    '("' + opts.properties.join('", "') + '")',
    'SELECT',
    ':' + opts.properties.join(', :'),
    "WHERE NOT EXISTS (SELECT * FROM upd)",
    "RETURNING *"
  ].join('\n')

  var sql = [
    "WITH",
    "upd AS (" + update + "),",
    "ins AS (" + insert + ")",
    "SELECT * FROM upd UNION SELECT * FROM ins"
  ].join('\n')

  //sql = self.db._query.queryValues(sql, opts.data)
  var p = parameterize(sql, opts.data)
  // console.log('UPSERT:', opts.table)
  // console.log(opts.data)
  // console.log(p.sql)
  // console.log(p.params)
  this.execute(client, p.sql, p.params, function(err, rs) {
    if (err) return cb(err)
    cb(null, rs[0])
  })
}

//
// Transactions
//

pg.beginTransaction = function(client, cb) {
  this.execute(client, 'BEGIN', cb)
}

pg.commitTransaction = function(client, cb) {
  this.execute(client, 'COMMIT', cb)
}

pg.rollbackTransaction = function(client, cb) {
  this.execute(client, 'ROLLBACK', cb)
}

// converts object-style parameters -- ("where id = :id", {id:1})
// into array-style parameters -- ("where id = $1", [1])
function parameterize(sql, data) {
  var params = []
  var pattern = ':[\\w]+';
  var start = 0
  while (true) {
    var i = regexIndexOf(sql, pattern, start)
    if (i === -1) break
    var j = regexIndexOf(sql, '[\\W]', i + 1)
    var param = sql.substring(i + 1, j)
    params.push(data[param])
    sql = replaceAll(':' + param + '([\\W])', '☆' + params.length + '$1', sql)
    start = i + 1
  }
  sql = replaceAll('☆', '$', sql)
  var ret = {
    sql: sql,
    params: params
  }
  return ret
}

function regexIndexOf(str, regex, startpos) {
    var indexOf = str.substring(startpos || 0).search(regex);
    return (indexOf >= 0) ? (indexOf + (startpos || 0)) : indexOf;
}

function replaceAll(find, replace, str) {
  return str.replace(new RegExp(find, 'g'), replace);
}
