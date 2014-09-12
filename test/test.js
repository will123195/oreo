var oreo = require('..')
var ok = require('assert').ok
var fs = require('fs')
var util = require('util')

const SCHEMA = fs.readFileSync(__dirname + '/schema/pg.sql', 'utf8')


describe('oreo', function() {

  var db
  var env = process.env


  it('should connect and discover', function(done) {
    db = oreo({
      driver: 'postgres',
      user: env.OREO_USER || 'postgres',
      pass: env.OREO_PASS || 'postgres', //url encoded
      hosts: ['localhost:5432', 'localhost:5433', 'localhost:5430'],
      name: env.OREO_NAME || 'oreo_test',
      debug: env.OREO_DEBUG || false,
      silent: env.OREO_SILENT || true,
      //memoize: 150,
      //cache: require('redis').createClient()
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


  it('should save', function(done) {
    var data = {
      id: 15,
      name: 'Jim Bob'
    }
    db.authors.save(data, function(err, author) {
      ok(!err, err)
      ok(author.id === 15, 'did not insert author')
      db.authors.save(data, function(err, author) {
        ok(!err, err)
        ok(author.id === 15, 'did not update author')
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


  it('should mget', function(done) {
    db.authors.mget([1], function(err, authors) {
      ok(!err, err)
      ok(authors[0].id === 1, 'did not get authors')
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
      var new_name = 'Jim Kerouac'
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
      book.hydrate('author', function(err, author) {
        ok(book.author_id === author.id, 'did not get author')
        ok(book.author.id === author.id, 'did not hydrate author')
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
        sample.hydrate('rating', function(err, rating) {
          ok(sample.rating.rating === 10, 'did not hydrate sample')
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


  it('should execute parameterized query', function(done) {
    db.execute([
      'select id',
      'from authors',
      'where name = :name'
    ], {
      name: 'Jack2',
    }, function(err, rs) {
      ok(!err, err)
      ok(rs[0].id === 1, 'wrong record')
      done()
    })
  })


  it('should prevent quote sqli', function(done) {
    db.books.find({
      where: {
        id: "1' or '1'='1"
      }
    }, function(err, books) {
      // we are expecting an error here
      ok(err, 'no sqli error')
      done()
    })
  })


  it('should prevent semicolon sqli', function(done) {
    db.books.find({
      where: {
        id: "1'; select now() where '1'='1"
      }
    }, function(err, books) {
      // we are expecting an error here
      ok(err, 'no sqli error')
      done()
    })
  })


  it('should cache', function(done) {
    var gotValueFromCache = false;
    // a simple mock-redis client object
    db.books.orm._opts.cache = function() {
      var cache = {}
      return {
        get: function(key, cb) {
          gotValueFromCache = true
          cb(null, cache[key])
        },
        set: function(key, val, cb) {
          cache[key] = val
          cb(null)
        }
      }
    }()
    db.books.get(1, function(err, book) {
      ok(!err, err)
      var new_title = 'New Title'
      book.update({
        title: new_title
      }, function(err) {
        ok(!err, err)
        db.books.get(1, function(err, book) {
          ok(!err, err)
          ok(book.title === new_title, 'did not save new title')
          ok(gotValueFromCache, 'did not get value from cache')
          done()
        })
      })
    })
  })
  
  
  it('should save 1-to-1 nested object', function(done) {
    db.books.get(1, function(err, book) {
      book.author = {
        name: 'Author #1'
      }
      book.persist(function(err, book) {
        ok(!err, err)
        console.log('book:', book)
      })
    })
  })


})
