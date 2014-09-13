var PG = require('pg')
var async = require('async')

var pg = module.exports


pg.identifierQuoteChar = '"'


pg.getTables = function(cb) {
  var tables = []
  var sql = [
    'SELECT table_name',
    'FROM information_schema.tables',
    "WHERE table_schema = 'public'"
  ]
  this.db.execute(sql, function(err, rs) {
    if (err) return cb(err)
    rs.forEach(function(r) {
      tables.push(r.table_name)
    })
    cb(null, tables)
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
    var regExp = /\(([^)]+)\)/
    var matches = regExp.exec(rs[0].def)
    var pk = matches[1].split(', ')
    cb(null, pk)
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
        columns: matches[1].split(', '),
        foreignTable: matches[2],
        foreignColumns: matches[3].split(', ')
      }
    })
    cb(null, fk)
  })
}


pg.execute = function(conn, sql, cb) {
  var self = this
  PG.connect(conn, function(err, client, done) {
    if (err) {
      if (!self.db._opts.silent) {
        console.error('pg.connect(' + conn + ')', err)
      }
      return cb(err)
    }
    client.query({
      text: sql
      //values: values
    }, function(err, result) {
      if (err) return cb(err)
      //call `done()` to release the client back to the pool
      done()
      cb(null, result.rows)
    })
  })
}


pg.getReadWriteHosts = function(cb) {
  var self = this
  var opts = self.db._opts
  var hosts = {
    readOnly: [],
    writable: []
  }
  // Connect to all seed hosts and determine read/write servers
  async.eachSeries(opts.hosts, function(host, callback) {
    var sql
    var conn = 'postgres://' + opts.user + ':' + opts.pass + '@' + host + '/' + opts.name

    sql = 'select pg_is_in_recovery() as is_slave'
    self.execute(conn, sql, function(err, rs) {
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

  }, function() {
    cb(hosts)
  })
}


//
// Transactions
//
pg.nestedTransactionCount = 0

pg.beginTransaction = function(cb) {
  this.nestedTransactionCount++
  if (this.nestedTransactionCount === 1) {
    return this.db.execute('BEGIN', cb)
  }
  cb(null)
}

pg.commitTransaction = function(cb) {
  this.nestedTransactionCount--
  if (this.nestedTransactionCount === 0) {
    return this.db.execute('COMMIT', cb)
  }
  cb(null)
}

pg.rollbackTransaction = function(cb) {
  this.nestedTransactionCount = 0
  this.db.execute('ROLLBACK', cb)
}