var MYSQL = require('mysql')
var async = require('async')

var mysql = module.exports

mysql.identifierQuoteChar = '`'


mysql.getClient = function(conn, cb) {
  var self = this
  conn.multipleStatements = true
  var pool = MYSQL.createPool(conn)
  pool.getConnection(function(err, connection) {
    if (err) {
      if (!self.db._opts.silent) {
        console.error('pool.getConnection(' + JSON.stringify(conn) + ')', err)
      }
      return cb(err)
    }
    cb(null, connection, connection.release)
  })
}


mysql.execute = function(connection, sql, cb) {
  var self = this
  // console.log()
  // console.log(sql)
  connection.query(sql, function(err, rows) {
    if (err) {
      console.log(sql)
      return cb(err)
    }
    cb(null, rows)
  })
}


mysql.determineHosts = function(cb) {
  var self = this
  var opts = self.db._opts
  var hosts = {
    readOnly: [],
    writable: []
  }
  // Connect to all seed hosts and determine read/write servers
  async.eachSeries(opts.hosts, function(host, callback) {
    var sql
    var conn = {
      host: host,
      user: opts.user,
      password: opts.pass,
      database: opts.name
    }

    sql = [
      'SELECT COUNT(1) SlaveThreadCount',
      'FROM information_schema.processlist',
      "WHERE user='system user'"
    ].join('\n')
    self.getClient(conn, function(err, client, done) {
      if (err) return callback(err)
      self.execute(client, sql, function(err, rs) {
        if (err) {
          // try next host
          return callback(null)
        }
        if (rs[0].SlaveThreadCount > 0) {
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


mysql.getTables = function(cb) {
  var tables = []
  var sql = "SHOW TABLES"
  this.db.execute(sql, function(err, rs) {
    if (err) return cb(err)
    rs.forEach(function(r) {
      tables.push(r[Object.keys(r)[0]])
    })
    cb(null, tables)
  })
}


mysql.getForeignKeys = function(tableName, cb) {
  var fk = {}
  var sql = [
    "SELECT *",
    "FROM information_schema.TABLE_CONSTRAINTS",
    "WHERE information_schema.TABLE_CONSTRAINTS.CONSTRAINT_TYPE = 'FOREIGN KEY'",
    "AND information_schema.TABLE_CONSTRAINTS.TABLE_SCHEMA = 'myschema'",
    "AND information_schema.TABLE_CONSTRAINTS.TABLE_NAME = '" + tableName + "'"
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


mysql.getColumns = function(tableName, cb) {
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


mysql.getPrimaryKeyDefinition = function(tableName, cb) {
  var sql = [
    "SHOW KEYS FROM `" + tableName + "` WHERE Key_name = 'PRIMARY'"
  ]
  this.db.execute(sql, function(err, rs) {
    if (err) return cb(err)
    if (!rs[0]) return cb()
    var pk = []
    rs.forEach(function(r) {
      pk.push(r.Column_name)
    })
    cb(null, pk)
  })
}


mysql.upsert = function(client, opts, cb) {
  var self = this

  var sql = [
    'UPDATE `' + opts.table + '`',
    'SET ' + opts.set.join(',\n'),
    'WHERE ' + opts.pkWhere
  ].join('\n')
  sql = self.db._query.queryValues(sql, opts.data)
  self.execute(client, sql, function(err, rs) {
    if (err) return cb(err)
    if (rs.affectedRows === 1) {
      var sql = [
        'SELECT *',
        'FROM `' + opts.table + '`',
        'WHERE ' + opts.pkWhere
      ].join('\n')
      self.execute(client, sql, function(err, rs) {
        if (err) return cb(err)
        cb(null, rs[0])
      })
    } else {
      var sql = [
        'INSERT INTO `' + opts.table + '`',
        '(' + opts.properties.join(', ') + ')',
        'VALUES',
        '(:' + opts.properties.join(', :') + ')'
      ].join('\n')
      sql = self.db._query.queryValues(sql, opts.data)
      self.execute(client, sql, function(err, rs) {
        if (err) return cb(err)

        // get the row that was just inserted
        var where = {}
        var pkField
        self.getPrimaryKeyDefinition(opts.table, function(err, pk) {
          if (err) return cb(err)
          // determine if we inserted null into the primary key
          // TODO: support more than 1 autoincrement field?
          pk.every(function(key) {
            if (!opts.data[key]) {
              pkField = key
              return false
            }
            where[key] = opts.data[key]
            return true
          })
          if (pkField) {
            var sql = 'SELECT LAST_INSERT_ID() as ' + pkField
            self.execute(client, sql, function(err, rs) {
              if (err) return cb(err)
              var pkWhere = '`' + opts.table + '`.`' + pkField + '` = ' + rs[0][pkField]
              getRow(pkWhere)
            })
            return
          }

          var pkWhere = self.db[opts.table].getPrimaryKeyWhereClause(where)
          getRow(pkWhere)

          function getRow(pkWhere) {
            var sql = [
              "SELECT *",
              "FROM `" + opts.table + "`",
              "WHERE " + pkWhere
            ].join('\n')
            self.execute(client, sql, function(err, rs) {
              if (err) return cb(err)
              cb(null, rs[0])
            })
          }
        })
      })
    }
  })
}

//
// Transactions
//

mysql.beginTransaction = function(client, cb) {
  this.execute(client, 'BEGIN', cb)
}

mysql.commitTransaction = function(client, cb) {
  this.execute(client, 'COMMIT', cb)
}

mysql.rollbackTransaction = function(client, cb) {
  this.execute(client, 'ROLLBACK', cb)
}