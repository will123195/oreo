var oreo = require('..')
var ok = require('assert').ok
var fs = require('fs')

const SCHEMA = fs.readFileSync(__dirname + '/schema/pg.sql', 'utf8')


describe('oreo', function() {


  var db = oreo({
    driver: 'postgres',
    user: 'postgres',
    pass: 'postgres', //url encoded
    hosts: ['localhost'],
    name: 'oreo_test'
  })


  it('should create tables', function(done) {
    var sql = SCHEMA;
    db.execute(sql, function(err, rs) {
      ok(!err, err)
      done()
    })
  })


  it('should discover', function(done) {
    db.discover(function(err) {
      ok(!err, err)
      ok(!!db.authors, 'authors not discovered')
      done()
    })
  })


  it('should insert', function(done) {
    db.authors.insert({
      name: 'Jack Kerouac'
    }, function(err, author) {
      ok(!err, err)
      ok(author.id === 1, 'did not insert author')
      done()
    })
  })


  it('should get', function(done) {
    db.authors.get(1, function(err, author) {
      ok(!err, err)
      ok(author.id === 1, 'did not get author')
      done()
    })
  })


  it('should update', function(done) {
    db.authors.get(1, function(err, author) {
      ok(!err, err)
      var new_name = 'Jack'
      author.update({
        name: new_name
      }, function(err, author) {
        ok(author.id === 1, 'did not get correct author')
        ok(author.name === new_name, 'did not update author')
        done()
      })
    })
  })

})
