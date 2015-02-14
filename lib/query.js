var Query = module.exports = function Query(db, opts, cb) {

  var self = this
  if (!(self instanceof Query)) {
    return new Query(db, opts, cb)
  }

  self.opts = opts
  self.db = db

  // list of host connection settings that are writable/readOnly
  self.writable = []
  self.readOnly = []

  if (typeof cb !== 'function') cb = function() {}

  self.detectTopology(cb)
}


Query.prototype.getConn = function(options) {
  var self = this
  if (options.write) {
    return self.writable[randomInt(0, self.writable.length - 1)]
  }
  return self.readOnly[randomInt(0, self.readOnly.length - 1)]
}


Query.prototype.execute = function(sql, values, options, cb) {
  var self = this
  var conn
  var start

  if (typeof options === 'function') {
    cb = options
    options = undefined
  }

  if (typeof sql !== 'string' && !isArray(sql)) {
    return cb(new Error('sql must be string or array multiline string'))
  }

  if (typeof values === 'function') {
    cb = values
    values = undefined
  }

  if (isArray(sql)) {
    sql = sql.join('\n')
  }

  if (values) {
    sql = self.queryValues(sql, values)
  }

  options = options || {}
  conn = self.getConn(options)
  start = Date.now()

  self.db._platform.getClient(conn, function(err, client, release) {
    if (err) return cb(err)
    self.db._platform.execute(client, sql, function(err, rows) {
      if (err) {
        if (!self.opts.silent) {
          console.error('SQL ERROR:', err)
        }
        return cb(err)
      }

      // release the client back to the pool
      release()

      if (self.opts.debug) {
        self.opts.debug('\n' + sql + '\n' + (Date.now() - start) + 'ms')
      }
      cb(null, rows)
    })
  })
}


Query.prototype.detectTopology = function(cb) {
  var self = this
  self.db._platform.determineHosts(function(hosts) {
    if (hosts.readOnly.length === 0 && hosts.writable.length === 0) {
      return cb(new Error('Unable to connect to database.'))
    }
    if (hosts.readOnly.length === 0) {
      hosts.readOnly = hosts.writable
    }
    self.readOnly = hosts.readOnly
    self.writable = hosts.writable
    cb(null)
  })
}


// based on https://github.com/felixge/node-mysql#custom-format
Query.prototype.queryValues = function(query, values) {
  if (!values) return query;
  return query.replace(/\:(\w+)/g, function (txt, key) {
    if (values.hasOwnProperty(key)) {
      if (isObject(values[key])) {
        values[key] = JSON.stringify(values[key])
      }
      if (typeof values[key] !== 'string') {
        return values[key]
      }
      return "'" + values[key].replace(/'/g, "''") + "'"
    }
    return txt
  });
};


function isArray(value) {
  return (Object.prototype.toString.call(value) === '[object Array]')
}

function isObject(value) {
  return (Object.prototype.toString.call(value) === '[object Object]')
}

function randomInt(min, max) {
    return Math.floor(Math.random()*(max-min+1)+min);
}

