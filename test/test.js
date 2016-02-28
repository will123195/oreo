var oreo = require('..')
var ok = require('assert').ok
var fs = require('fs')
var util = require('util')

var db
var platforms = [
  {
    driver: 'pg',
    user: 'postgres',
    pass: 'postgres',
    hosts: ['localhost:5432', 'localhost:5433', 'localhost:5430'],
    name: 'oreo_test',
    debug: false,
    silent: true
    //memoize: 0,
    //cache: null
  },
  {
    driver: 'pg',
    user: 'postgres',
    pass: 'postgres',
    hosts: ['localhost:5432', 'localhost:5433', 'localhost:5430'],
    name: 'oreo_test',
    debug: false,
    silent: true,
    memoize: 150,
    Promise: bluebird
  },
  {
    driver: 'mysql',
    user: 'root',
    pass: '',
    hosts: ['localhost'],
    name: 'oreo_test',
    debug: false,
    silent: true
  }
]

var mockRedis = function() {
  var cache = {}
  return {
    get: function(key, cb) {
      var val = cache[key]
      if (val) {
        val = JSON.parse(val)
        val.fromCache = true
        val = JSON.stringify(val)
      }
      cb(null, val)
    },
    set: function(key, val, cb) {
      cache[key] = val
      cb(null)
    }
  }
}

it('should fail with unknown driver', function(done) {
  db = oreo({
    driver: 'mssql'
  }, function(err) {
    ok(!!err, 'did not fail')
    done()
  })
})

platforms.forEach(function(config) {

  describe('oreo', function() {

    it('should connect and discover - cb', function(done) {
      console.log('\n', config.driver)
      db = oreo(config, function(err) {
        ok(!err, err)
        done()
      })
    })

    it('should connect and discover - promise', function(done) {
      oreo(config).then(function() {
        done()
      })
    })

    it('should create tables', function(done) {
      var sql = fs.readFileSync(__dirname + '/schema/' + config.driver + '.sql', 'utf8')
      db.executeWrite(sql, function(err, rs) {
        ok(!err, err)
        done()
      })
    })

    it('should rediscover - cb', function(done) {
      db.discover(function(err) {
        ok(!err, err)
        ok(!!db.authors, 'authors not discovered')
        done()
      })
    })

    it('should rediscover - promise', function(done) {
      db.discover().then(function() {
        ok(!!db.authors, 'authors not discovered')
        done()
      })
    })

    it('should insert - cb', function(done) {
      db.authors.insert({
        name: 'Jack Kerouac'
      }, function(err, author) {
        ok(!err, err)
        ok(author.id === 1, 'did not insert author - should insert')
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

    it('should insert - promise', function(done) {
      db.authors.insert({
        name: 'Tom Wolfe'
      }).then(function(author) {
        ok(author.id === 2, 'did not insert author - should insert')
        db.books.insert({
          title: 'The Electric Kool-Aid Acid Test',
          author_id: 2
        }).then(function(book) {
          ok(book.id === 2, 'did not insert book')
          db.ratings.insert({
            author_id: 2,
            book_id: 2,
            rating: 9
          }).then(function(rating) {
            ok(rating.rating === 9, 'did not insert rating')
            done()
          })
        })
      })
    })

    it('should static save - cb', function(done) {
      var data = {
        id: 1408,
        name: 'Stephen King'
      }
      db.authors.save(data, function(err, author) {
        ok(!err, err)
        ok(author.id === 1408, 'did not insert author')
        db.authors.save(data, function(err, author) {
          ok(!err, err)
          ok(author.id === 1408, 'did not update author')
          done()
        })
      })
    })

    it('should static save - promise', function(done) {
      var data = {
        id: 1984,
        name: 'George Orwell'
      }
      db.authors.save(data).then(function(author) {
        ok(author.id === 1984, 'did not insert author')
        db.authors.save(data).then(function(author) {
          ok(author.id === 1984, 'did not update author')
          done()
        })
      })
    })

    it('should get - cb', function(done) {
      db.authors.get(1, function(err, author) {
        ok(!err, err)
        ok(author.id === 1, 'did not get author')
        done()
      })
    })

    it('should get - promise', function(done) {
      db.authors.get(1).then(function(author) {
        ok(author.id === 1, 'did not get author')
        done()
      })
    })

    it('should mget - cb', function(done) {
      db.authors.mget([1], function(err, authors) {
        ok(!err, err)
        ok(authors[0].id === 1, 'did not get authors')
        done()
      })
    })

    it('should mget - promise', function(done) {
      db.authors.mget([1, 1984]).then(function(authors) {
        ok(authors[0].id === 1, 'did not get first author')
        ok(authors[1].id === 1984, 'did not get second author')
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

    it('should find all - cb', function(done) {
      db.authors.find(function(err, authors) {
        ok(!err, err)
        ok(authors.length === 4, 'authors.length')
        done()
      })
    })

    it('should find all - promise', function(done) {
      db.authors.find().then(function(authors) {
        ok(authors.length === 4, 'authors.length')
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
      db.authors.find({
        order: 'id desc'
      }).then(function(authors) {
        ok(authors[0].id === 1984, 'order first')
        ok(authors[1].id === 1408, 'order second')
        done()
      })
    })

    it('should limit', function(done) {
      db.authors.find({
        limit: 2
      }).then(function(authors) {
        ok(authors.length === 2, 'limit')
        done()
      })
    })

    it('should offset', function(done) {
      db.authors.find({
        order: 'id desc',
        limit: 1,
        offset: 1
      }).then(function(authors) {
        ok(authors[0].id === 1408, 'offset')
        done()
      })
    })

    it('should findOne - cb', function(done) {
      db.authors.findOne({
        where: "name = 'Jack Kerouac'"
      }, function(err, author) {
        ok(!err, err)
        ok(author.id === 1, 'did not findOne author')
        done()
      })
    })

    it('should findOne - promise', function(done) {
      db.authors.findOne({
        where: "name = 'Jack Kerouac'"
      }).then(function(author) {
        ok(author.id === 1, 'did not findOne author')
        done()
      })
    })

    it('should update - cb', function(done) {
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

    it('should update - promise', function(done) {
      db.authors.get(1).then(function(author) {
        var new_name = 'Jeff Kerouac'
        author.update({
          name: new_name
        }).then(function(author) {
          ok(author.id === 1, 'did not get correct author')
          ok(author.name === new_name, 'did not update author')
          done()
        })
      })
    })

    it('should hydrate - cb', function(done) {
      db.books.get(1, function(err, book) {
        ok(!err, err)
        book.hydrate('author', function(err) {
          ok(book.author.id === book.author_id, 'did not hydrate author')
          ok(book.id === 1, 'weird')
          done()
        })
      })
    })

    it('should hydrate - promise', function(done) {
      db.books.get(1).then(function(book) {
        book.hydrate('author').then(function() {
          ok(book.author.id === book.author_id, 'did not hydrate author')
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
          sample.hydrate('rating', function(err) {
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

    it('should save a row instance - cb', function(done) {
      db.authors.get(1, function(err, author) {
        ok(!err, err)
        var new_name = 'Jack2'
        author.set({
          name: new_name
        })
        author.save(function(err, author) {
          ok(!err, err)
          ok(author.id === 1, 'did not get correct author')
          ok(author.name === new_name, 'did not save author')
          db.authors.get(1, function(err, author) {
            ok(!err, err)
            ok(author.name === new_name, 'did not save new name')
            done()
          })
        })
      })
    })

    it('should save a row instance - promise', function(done) {
      db.authors.get(1).then(function(author) {
        var new_name = 'Jack3'
        author.set({
          name: new_name
        })
        author.save().then(function(author) {
          ok(author.id === 1, 'did not get correct author')
          ok(author.name === new_name, 'did not save author')
          db.authors.get(1).then(function(author) {
            ok(author.name === new_name, 'did not save new name')
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

    it('should execute parameterized query - cb', function(done) {
      db.execute([
        'select id',
        'from authors',
        'where name = :name'
      ], {
        name: 'Jack3',
      }, function(err, rs) {
        ok(!err, err)
        ok(rs[0].id === 1, 'wrong record')
        done()
      })
    })

    it('should execute parameterized query - promise', function(done) {
      db.execute([
        'select id',
        'from authors',
        'where name = :name'
      ], {
        name: 'Jack3',
      }).then(function(rs) {
        ok(rs[0].id === 1, 'wrong record')
        done()
      })
    })

    it('should prevent semicolon sqli', function(done) {
      db.books.find({
        where: {
          id: "1; update books set title = 'sqli' where id = '1"
        }
      }, function(err, books) {
        if (err) return done() // postgres errors and that is cool
        // mysql doesn't error, so let's make sure the injected sql didn't run
        db.books.get(1, function(err, book) {
          ok(book.title !== 'sqli', 'injected update ran')
          done()
        })
      })
    })

    it('should cache - cb', function(done) {
      db.books.db._opts.cache = mockRedis()
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
            ok(book.fromCache, 'did not get value from cache')
            done()
          })
        })
      })
    })

    it('should cache - promise', function(done) {
      db.books.get(1).then(function(book) {
        var new_title = 'New Title2'
        book.update({
          title: new_title
        }).then(function() {
          db.books.get(1).then(function(book) {
            ok(book.title === new_title, 'did not save new title')
            ok(book.fromCache, 'did not get value from cache')
            db.books.db._opts.cache = null
            done()
          })
        })
      })
    })

    it('should save 1-to-1 nested object (insert + insert)', function(done) {
      var newBook = {
        id: 11,
        title: 'Book #1',
        author: {
          name: 'Author #1'
        }
      }
      db.books.save(newBook, function(err, book) {
        ok(!err, err)
        ok(book.id === 11, 'did not insert book')
        book.hydrate('author', function(err) {
          ok(!err, err)
          ok(book.author_id === book.author.id, 'did not insert author')
          done()
        })
      })
    })

    it('should save 1-to-1 nested object (update + insert) - promise', function(done) {
      db.books.get(2).then(function(book) {
        // replace the book's author with a newly inserted author
        book.author = {
          name: 'Author #2'
        }
        book.save().then(function(book) {
          ok(book.id === 2, 'did not get book')
          book.hydrate('author').then(function() {
            ok(book.author_id === book.author.id, 'did not insert author')
            done()
          })
        })
      })
    })

    it('should save 1-to-1-to-1 nested objects (insert + insert + insert)', function(done) {
      var newBookData = {
        title: 'my title',
        author: {
          name: 'Author #3',
          country: {
            code: 'US',
            name: 'United States'
          }
        }
      }
      db.books.save(newBookData, function(err, book) {
        ok(!err, err)
        book.hydrate('author', function(err) {
          ok(!err, err)
          book.author.hydrate('country', function(err) {
            ok(!err, err)
            ok(book.author.country.name === 'United States', 'did not save')
            done()
          })
        })
      })
    })

    // TODO:
    // more nested save tests
    // composite primary key insert / update
    // primary key id is specified for insert
    // table has no primary key
    // update table with javascript Date value
    // test sql-injection during save - not just select
    // onReady

    it('should kill the connection pool', function (done) {
      db.end()
      done()
    })

  })
})
