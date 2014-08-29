var oreo = require('..')
var ok = require('assert').ok
var fs = require('fs')

const SCHEMA = fs.readFileSync(__dirname + '/schema/pg.sql', 'utf8')


describe('oreo', function() {

  var db

  it('should connect and discover', function(done) {
    db = oreo({
      driver: 'postgres',
      user: 'postgres',
      pass: 'postgres', //url encoded
      hosts: ['localhost:5432'], //, 'localhost:5433', 'localhost:5430'],
      name: 'oreo_test',
      debug: true
    }, done)
  })


  it('should create tables', function(done) {
    var sql = SCHEMA;
    db.execute(sql, null, {write: true}, function(err, rs) {
      ok(!err, err)
      done()
    })
  })


  it('should rediscover', function(done) {
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

        db.ratings.insert({
          author_id: 1,
          book_id: 1,
          rating: 10
        }, function(err, rating) {
          ok(!err, err)
          ok(rating.rating === 10, 'did not insert rating')
          done()
        })

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


  it('should get (composite primary key)', function(done) {
    db.ratings.get([1, 1], function(err, rating) {
      ok(!err, err)
      ok(rating.rating === 10, 'did not get rating')
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


  it('should find (composite primary key)', function(done) {
    db.ratings.find({
      where: {
        rating: 10
      }
    }, function(err, ratings) {
      ok(!err, err)
      ok(ratings[0].author_id === 1, 'did not find rating')
      done()
    })
  })


  it('should order by', function(done) {
    // TODO
    done()
  })


  it('should limit', function(done) {
    // TODO
    done()
  })


  it('should offset', function(done) {
    // TODO
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


  it('should hydrate composite foreign key', function(done) {
    db.samples.insert({
      author_id: 1,
      book_id: 1,
      description: 'this is an example'
    }, function(err, data) {
      ok(!err, err)
      db.samples.get(data.id, function(err, sample) {
        sample.hydrate(function(err, sample) {
          ok(sample.rating.rating === 10, 'did not hydrate sample')
          ok(sample.id === 1, 'wrong sample')
          done()
        })
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


  it('should prevent sql injection', function(done) {
    db.books.find({
      where: {
        id: "1' or '1'='1"
      }
    }, function(err, books) {
      ok(err, 'no sqli error')
      done()
    })
  })


})
