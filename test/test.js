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

      db.books.insert({
        title: 'On the Road',
        author_id: 1
      }, function(err, book) {
        ok(!err, err)
        ok(book.id === 1, 'did not insert book')
        done()
      })
    })
  })


  it('should get', function(done) {
    db.authors.get(1, function(err, author) {
      ok(!err, err)
      ok(author.id === 1, 'did not get author')
      done()
    })
  })


  it('should find (where string)', function(done) {
    db.authors.find({
      where: "name = 'Jack Kerouac'"
    }, function(err, authors) {
      ok(!err, err)
      ok(authors[0].id === 1, 'did not find author')
      done()
    })
  })


  it('should find (where array)', function(done) {
    db.authors.find({
      where: ["name = 'Jack Kerouac'"]
    }, function(err, authors) {
      ok(!err, err)
      ok(authors[0].id === 1, 'did not find author')
      done()
    })
  })


  it('should find (where object)', function(done) {
    db.authors.find({
      where: { 
        name: 'Jack Kerouac'
      }
    }, function(err, authors) {
      ok(!err, err)
      ok(authors[0].id === 1, 'did not find author')
      done()
    })
  })


  it('should order by', function(done) {
    done()
  })


  it('should limit', function(done) {
    done()
  })


  it('should offset', function(done) {
    done()
  })


  it('should findOne', function(done) {
    db.authors.findOne({
      where: "name = 'Jack Kerouac'"
    }, function(err, author) {
      ok(!err, err)
      ok(author.id === 1, 'did not findOne author')
      done()
    })
  })


  it('should update', function(done) {
    db.authors.get(1, function(err, author) {
      ok(!err, err)
      var new_name = 'Jack Kerouac'
      author.update({
        name: new_name
      }, function(err, author) {
        ok(author.id === 1, 'did not get correct author')
        ok(author.name === new_name, 'did not update author')
        done()
      })
    })
  })


  it('should hydrate', function(done) {
    db.books.get(1, function(err, book) {
      ok(!err, err)
      book.hydrate(function(err, book) {
        ok(book.author.id === 1, 'did not hydrate author')
        ok(book.id === 1, 'weird')
        done()
      })
    })
  })


  it('should set', function(done) {
    db.authors.get(1, function(err, author) {
      ok(!err, err)
      var old_name = author.name
      var new_name = 'Jack Kerouac'
      author.set({
        name: new_name
      })
      ok(author._data.name === old_name, 'did not set old name')
      ok(author.name === new_name, 'did not set new name')
      done()
    })
  })


  it('should save', function(done) {
    db.authors.get(1, function(err, author) {
      ok(!err, err)
      var new_name = 'Jack2'
      author.set({
        name: new_name
      })
      author.save(function(err, author) {
        ok(author.id === 1, 'did not get correct author')
        ok(author.name === new_name, 'did not save author')
        db.authors.get(1, function(err, author) {
          ok(!err, err)
          ok(author.name === new_name)
          done()
        })
      })
    })
  })


  it('should bind row methods', function(done) {
    db.books._methods.getTitle = function() {
      return this.title
    }

    db.books.get(1, function(err, book) {
      ok(!err, err)
      ok(book.getTitle() === book.title, 'did not get title')
      done()
    })
  })


})

