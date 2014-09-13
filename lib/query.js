var platform

var Query = module.exports = function Query(db, opts, cb) {

  var self = this
  if (!(self instanceof Query)) {
    return new Query(db, opts, cb)
  }

  self.opts = opts
  self.db = db
  platform = db._platform

  // list of host connection settings that are writable/readOnly
  self.writable = []
  self.readOnly = []

  if (typeof cb !== 'function') cb = function() {}

  self.detectTopology(cb)

  return function() {
    return self.execute.apply(self, arguments)
  }
}


Query.prototype.execute = function(sql, values, options, cb) {
  var self = this

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
    sql = queryValues(sql, values)
  }

  options = options || {}

  var conn = ''

  if (options.conn) {
    conn = options.conn
  } else if (options.write) {
    conn = self.writable[randomInt(0, self.writable.length - 1)]
  } else {
    conn = self.readOnly[randomInt(0, self.readOnly.length - 1)]
  }

  var start = Date.now()
  self.db._platform.execute(conn, sql, function(err, rows) {
    if (err) {
      if (!self.opts.silent) {
        console.error('\n' + sql + '\nSQL ERROR:', err)
      }
      return cb(err)
    }
    if (self.opts.debug) {
      console.log('\n' + sql + '\n' + (Date.now() - start) + 'ms')
    }
    cb(null, rows)
  })
}


Query.prototype.detectTopology = function(cb) {
  var self = this
  self.db._platform.getReadWriteHosts(function(hosts) {
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
// TODO: make sure you can't sqli with ';'
function queryValues(query, values) {
  if (!values) return query;
  return query.replace(/\:(\w+)/g, function (txt, key) {
    if (values.hasOwnProperty(key)) {
      if (typeof values[key] !== 'string') {
        return values[key];
      }
      return "'" + values[key].replace(/'/g, "''") + "'";
    }
    return txt;
  });
};


function isArray(value) {
  return (Object.prototype.toString.call(value) === '[object Array]')
}


function randomInt(min, max) {
    return Math.floor(Math.random()*(max-min+1)+min);
}

