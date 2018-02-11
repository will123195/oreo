var oreo = require('..')
var ok = require('assert').ok
var fs = require('fs')
var bluebird = require('bluebird')
var async = require('../lib/async')

var models = {
  books: require('./Book')
}

var db
var platforms = [
  {
    driver: 'pg',
    user: 'postgres',
    pass: '',
    hosts: ['localhost:5432', 'localhost:5433', 'localhost:5430'],
    name: 'oreo_test',
    debug: false,
    silent: true,
    Promise: global.Promise || bluebird,
    models: models
  },
  {
    driver: 'pg',
    user: 'postgres',
    pass: '',
    hosts: ['localhost:5432', 'localhost:5433', 'localhost:5430'],
    name: 'oreo_test',
    debug: false,
    silent: true,
    memoize: 150,
    Promise: global.Promise || bluebird,
    models: models
  },
  {
    driver: 'mysql',
    user: 'root',
    pass: '',
    hosts: ['localhost'],
    name: 'oreo_test',
    debug: false,
    silent: true,
    Promise: global.Promise || bluebird,
    models: models
  }
]

var showError = function (err) {
  console.log(err.stack)
}

var no = function (err) {
  ok(!err, err + '')
}

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

describe('oreo', function() {

  it('should fail with unknown driver', function(done) {
    db = oreo({
      driver: 'mssql'
    }, function(err) {
      ok(!!err, 'did not fail')
      done()
    })
  })

  platforms.forEach(function(config) {

    it('should connect and discover - cb', function(done) {
      console.log('\n', config.driver)
      db = oreo(config, function(err) {
        no(err)
        done()
      })
    })

    it('should create tables', function(done) {
      var sql = fs.readFileSync(__dirname + '/schema/' + config.driver + '.sql', 'utf8')
      db.executeWrite(sql, function(err, rs) {
        no(err)
        done()
      })
    })

    it('should rediscover and end - promise', function(done) {
      db.discover().then(function(db) {
        ok(!!db.authors, 'authors not discovered')
        config.schema = JSON.parse(JSON.stringify(db))
        db.authors.find().then(function () {
          var isDone = false
          db.end(function () {
            if (isDone) return
            isDone = true
            done()
          })
        })
      }).catch(showError)
    })

    it('should connect and discover - schema and onReady', function(done) {
      var count = 0
      var isDone = function () {
        count++
        if (count === 2) done()
      }
      db = oreo(config, function (err) {
        no(err)
      }).onReady(function() {
        isDone()
      })
      db.onReady(function () {
        ok(!!db.authors, 'authors not discovered')
        isDone()
      })
    })

    it('should rediscover - cb', function(done) {
      db.discover(function(err) {
        no(err)
        ok(!!db.authors, 'authors not discovered')
        done()
      })
    })

    it('should insert - cb', function(done) {
      db.authors.insert({
        name: 'Jack Kerouac',
        birthDate: '1922-03-12'
      }, function(err, author) {
        no(err)
        ok(author.id === 1, 'did not insert author - should insert')
        db.books.insert({
          title: 'On the Road',
          author_id: author.id
        }, function(err, book) {
          no(err)
          ok(book.id === 1, 'did not insert book')
          db.ratings.insert({
            author_id: author.id,
            book_id: book.id,
            stars: 10
          }, function(err, rating) {
            no(err)
            ok(rating.stars === 10, 'did not insert rating')
            done()
          })
        })
      })
    })

    it('should insert - promise', function(done) {
      db.authors.insert({
        name: 'Tom Wolfe',
        birthDate: '1931-03-02'
      }).then(function(author) {
        ok(author.id === 2, 'did not insert author - should insert')
        db.books.insert({
          title: 'The Electric Kool-Aid Acid Test',
          author_id: author.id
        }).then(function(book) {
          ok(book.id === 2, 'did not insert book')
          db.ratings.insert({
            author_id: author.id,
            book_id: book.id,
            stars: 9
          }).then(function(rating) {
            ok(rating.stars === 9, 'did not insert rating')
            done()
          })
        })
      }).catch(showError)
    })

    it('should save field with same name as 1-to-m fk - cb', function(done) {
      db.authors.save({
        id: 2,
        books: [2]
      }, function(err, author) {
        no(err)
        db.authors.get(2, function(err, author) {
          ok(author.books.toString() === '2', 'did not save books value')
          author.hydrate('books', function (err) {
            ok(!!err, 'books should not be hydratable')
            done()
          })
        })
      })
    })

    it('should not save 1-to-m row with same name as field - cb', function(done) {
      db.authors.save({
        id: 2,
        books: [
          {id: 2, author_id: 2, title: 'Working Title'}
        ]
      }, function(err, author) {
        ok(!!err, 'books should not save')
        done()
      })
    })

    it('should save field with same name as 1-to-1 fk - cb', function(done) {
      db.authors.save({
        id: 2,
        Country: {
          Code: 'US',
          name: 'United States'
        }
      }, function(err, author) {
        no(err)
        ok(author.Country === 'US', 'author.Country')
        db.authors.get(2, function(err, author) {
          no(err)
          ok(author.Country === 'US', 'did not save author.Country')
          author.hydrate('Country', function (err) {
            no(err)
            ok(author.Country.name === 'United States', 'author.Country.name')
            author.Country.update({
              name: 'USA'
            }, function (err, Country) {
              no(err)
              ok(Country.name === 'USA', 'Country.name not USA')
              author.update({
                Country: {
                  Code: 'CA',
                  name: 'Canada'
                }
              }, function (err, author) {
                no(err)
                ok(author.Country === 'CA', 'author.Country not CA')
                author.update({
                  Country: 'MX'
                }, function (err, author) {
                  ok(!!err, 'should violate fk constraint')
                  db.authors.get(2, function (err, author) {
                    no(err)
                    ok(author.Country === 'CA', 'author.Country should still be CA')
                    done()
                  })
                })
              })
            })
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
        no(err)
        ok(author.id === 1408, 'did not insert author')
        db.authors.save(data, function(err, author) {
          no(err)
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
      }).catch(showError)
    })

    it('should get - cb', function(done) {
      db.authors.get(1, function(err, author) {
        no(err)
        ok(author.birthDate === '1922-03-12', 'did not return correct date string')
        ok(author.id === 1, 'did not get author')
        done()
      })
    })

    it('should get - promise', function(done) {
      db.authors.get(1).then(function(author) {
        ok(author.id === 1, 'did not get author')
        done()
      }).catch(showError)
    })

    it('should parameterize array of numbers', function () {
      return db.execute(
        'select * from authors where id in (:ids)',
        { ids: [1, 2] }
      ).then(function (authors) {
        ok(authors.length === 2)
      })
    })

    it('should parameterize array of strings', function () {
      return db.execute(
        'select * from authors where name in (:names)',
        { names: ['Tom Wolfe', 'Jack Kerouac'] }
      ).then(function (authors) {
        ok(authors.length === 2)
      })
    })

    it('should get id=0 - promise', function (done) {
      if (config.driver === 'mysql') {
        return done()
      }
      db.authors.insert({
        id: 0,
        name: 'Nobody'
      })
      .then(function (author) {
        db.authors.get(0)
        .then(function (author) {
          ok(author.id === 0, 'did not get author')
          author.delete()
          .then(function () {
            done()
          })
        })
      })
    })

    it('should mget - cb', function(done) {
      db.authors.mget([1, 1984], function(err, authors) {
        no(err)
        ok(authors[0].id === 1, 'did not get authors')
        ok(authors[1].id === 1984, 'did not get second author')
        done()
      })
    })

    it('should mget with null value - promise', function(done) {
      db.authors.mget([1984, 999999, 1]).then(function(authors) {
        ok(authors[0].id === 1984, 'did not get first author')
        ok(authors[1] === null, 'second author is not null')
        ok(authors[2].id === 1, 'did not get third author')
        done()
      }).catch(showError)
    })

    it('should get (composite primary key object)', function(done) {
      db.ratings.get({
        author_id: 1,
        book_id: 1
      }, function(err, rating) {
        no(err)
        ok(rating.stars === 10, 'did not get rating')
        done()
      })
    })

    it('should get (composite primary key array)', function(done) {
      db.ratings.get([1, 1], function(err, rating) {
        no(err)
        ok(rating.stars === 10, 'did not get rating')
        done()
      })
    })

    it('should find all - cb', function(done) {
      db.authors.find(function(err, authors) {
        no(err)
        ok(authors.length === 4, 'authors.length')
        done()
      })
    })

    it('should find all - promise', function(done) {
      db.authors.find().then(function(authors) {
        ok(authors.length === 4, 'authors.length')
        done()
      }).catch(showError)
    })

    it('should count - promise', function(done) {
      db.authors.count().then(function(count) {
        ok(count === 4, 'count')
        done()
      }).catch(showError)
    })

    it('should find (where string)', function(done) {
      db.authors.find({
        where: "name = 'Jack Kerouac'"
      }, function(err, authors) {
        no(err)
        ok(authors[0].id === 1, 'did not find author')
        done()
      })
    })

    it('should find (case-sensitive)', function(done) {
      db.authors.find({
        where: {
          Country: 'CA'
        }
      }, function(err, authors) {
        no(err)
        ok(authors[0].id === 2, 'did not find author')
        done()
      })
    })

    it('should find (where array)', function(done) {
      db.authors.find({
        where: ["name = 'Jack Kerouac'"]
      }, function(err, authors) {
        no(err)
        ok(authors[0].id === 1, 'did not find author')
        done()
      })
    })

    it('should find (where parameterized array)', function(done) {
      var opts = {
        where: ['name = :name'],
        params: {
          name: 'Jack Kerouac'
        }
      }
      db.authors.find(opts, function(err, authors) {
        no(err)
        ok(authors[0].id === 1, 'did not find author')
        ok(authors[0].name === opts.params.name, 'did not find author name')
        done()
      })
    })

    it('should find (where object)', function(done) {
      db.authors.find({
        where: {
          name: 'Jack Kerouac'
        }
      }, function(err, authors) {
        no(err)
        ok(authors[0].id === 1, 'did not find author')
        done()
      })
    })

    it('should find (composite primary key)', function(done) {
      db.ratings.find({
        where: {
          stars: 10
        }
      }, function(err, ratings) {
        no(err)
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
      }).catch(showError)
    })

    it('should limit', function(done) {
      db.authors.find({
        limit: 2
      }).then(function(authors) {
        ok(authors.length === 2, 'limit')
        done()
      }).catch(showError)
    })

    it('should offset', function(done) {
      db.authors.find({
        order: 'id desc',
        limit: 1,
        offset: 1
      }).then(function(authors) {
        ok(authors[0].id === 1408, 'offset')
        done()
      }).catch(showError)
    })

    it('should findOne - cb', function(done) {
      db.authors.findOne({
        where: "name = 'Jack Kerouac'"
      }, function(err, author) {
        no(err)
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
      }).catch(showError)
    })

    it('should update - cb', function(done) {
      db.authors.get(1, function(err, author) {
        no(err)
        var new_name = 'Jim Kerouac'
        author.update({
          name: new_name
        }, function(err, author) {
          no(err)
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
      }).catch(showError)
    })

    it('should hydrate - cb', function(done) {
      db.books.get(1, function(err, book) {
        no(err)
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
      }).catch(showError)
    })

    it('should hydrate composite foreign key', function(done) {
      db.samples.insert({
        author_id: 1,
        book_id: 1,
        description: 'this is an example'
      }, function(err, data) {
        no(err)
        db.samples.get(data.id, function(err, sample) {
          sample.hydrate('rating', function(err) {
            ok(sample.rating.stars === 10, 'did not hydrate rating')
            done()
          })
        })
      })
    })

    it('should hydrate 1-to-m - promise', function(done) {
      db.authors.get(1).then(function(author) {
        author.hydrate('author:books').then(function() {
          ok(author['author:books'].length === 1, 'did not hydrate author:books')
          ok(!!author['author:books'][0].title, 'author:books[0].title')
          done()
        })
      }).catch(showError)
    })

    it('should hydrate 1-to-m shorthand - promise', function(done) {
      db.books.get(1).then(function(book) {
        return book.hydrate('samples').then(function() {
          ok(!!book.samples[0].description, 'book.samples[0].description')
          done()
        })
      }).catch(showError)
    })

    it('should not hydrate ambiguous 1-to-m - promise', function(done) {
      db.battles.insert({
        author1_id: 1,
        author2_id: 2
      }).then(function (battle) {
        return battle.hydrate('a1').then(function () {
          var author = battle.a1
          return author.hydrate('battles')
        })
      }).catch(function (err) {
        ok(!!err, 'should have ambiguous hydration error')
        done()
      }).catch(showError)
    })

    it('should hydrate non-ambiguous 1-to-m - promise', function(done) {
      db.battles.insert({
        author1_id: 2,
        author2_id: 1
      }).then(function (battle) {
        db.authors.get(1).then(function (author) {
          author.hydrate(['a1:battles', 'a2:battles']).then(function () {
            ok(!!author['a1:battles'][0].id, 'a1.battles.id')
            ok(!!author['a2:battles'][0].id, 'a2.battles.id')
            done()
          })
        })
      }).catch(showError)
    })

    it('should not hydrate wrong 1-to-m - promise', function(done) {
      db.books.get(1).then(function(book) {
        return book.hydrate('author:books')
      }).catch(function (err) {
        ok(!!err, 'should have error')
        done()
      }).catch(showError)
    })

    it('should not hydrate shorthand 1-to-m conflicting column name - promise', function(done) {
      db.authors.get(1).then(function(author) {
        return author.hydrate('books')
      }).catch(function (err) {
        ok(!!err, 'should have error')
        done()
      }).catch(showError)
    })

    it('should hydrate in parallel - cb', function(done) {
      db.samples.get(1, function(err, sample) {
        ok(!err, err)
        async.each([
          function(next) {
            sample.hydrate('book', next)
          },
          function(next) {
            sample.hydrate('rating', next)
          }
        ], function (fn, end) {
          fn(end)
        }, function (err) {
          no(err)
          ok(sample.book.id === sample.book_id, 'did not hydrate book')
          ok(sample.rating.author_id === sample.author_id, 'did not hydrate rating')
          done()
        })
      })
    })

    it('should hydrate multiple in parallel - promise', function(done) {
      db.samples.get(1).then(function(sample) {
        sample.hydrate(['book', 'rating']).then(function () {
          ok(sample.book.id === sample.book_id, 'did not hydrate book')
          ok(sample.rating.author_id === sample.author_id, 'did not hydrate rating')
          done()
        })
      }).catch(showError)
    })

    it('should get and hydrate - promise', function(done) {
      db.samples.get([1, 1], {
        hydrate: ['book', 'rating']
      }).then(function(sample) {
        ok(!!sample.id, 'sample.id')
        ok(!!sample.book.id, 'sample.book.id')
        ok(!!sample.rating.stars, 'sample.rating')
        done()
      }).catch(showError)
    })

    it('should find and hydrate - promise', function(done) {
      db.books.find({
        hydrate: 'author'
      }).then(function(books) {
        ok(!!books[0].id, 'books[0].id')
        ok(!!books[0].author.id, 'books[0].author.id')
        ok(!!books[1].id, 'books[1].id')
        ok(!!books[1].author.id, 'books[1].author.id')
        done()
      }).catch(showError)
    })

    it('should findOne and hydrate - cb', function(done) {
      db.books.findOne({
        hydrate: ['author']
      }, function(err, book) {
        no(err)
        ok(!!book.id, 'book.id')
        ok(!!book.author.id, 'book.author.id')
        done()
      })
    })

    it('should set', function(done) {
      db.authors.get(1, function(err, author) {
        no(err)
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
        no(err)
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
      }).catch(showError)
    })

    xit('should error when calling save(data)', function(done) {
      db.authors.get(1, function(err, author) {
        no(err)
        author.save({ name: 'Jack2' }, function(err, author) {
          ok(!!err, err)
          done()
        })
      })
    })

    it('should instantiate model and use constructor - cb', function(done) {
      db.books.get(1, function(err, book) {
        no(err)
        ok(book instanceof db.books.Row, 'incorrect type')
        ok(book.getTitle() === book.title, 'did not get title')
        ok(book.getTitle2() === book.title, 'did not run model constructor')
        var desc = Object.getOwnPropertyDescriptor(book, 'something')
        ok(!desc.enumerable, 'did not modify data in constructor')
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
        no(err)
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
      }).catch(showError)
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
          no(err)
          ok(book.title !== 'sqli', 'injected update ran')
          done()
        })
      })
    })

    it('should cache - cb', function(done) {
      db.books.db._opts.cache = mockRedis()
      db.books.get(1, function(err, book) {
        no(err)
        var new_title = 'New Title'
        book.update({
          title: new_title
        }, function(err) {
          no(err)
          db.books.get(1, function(err, book) {
            no(err)
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
      }).catch(showError)
    })

    it('should cache mget using composite keys - promise', function(done) {
      db.authors.db._opts.cache = mockRedis()
      db.authors.get(1).then(function (author) {
        var list = [
          { id: 1984 },
          { id: 1 },
          { id: 1408 }
        ]
        db.authors.mget(list).then(function(authors) {
          ok(authors[0].id === list[0].id, 'did not get author 1')
          ok(authors[1].id === list[1].id, 'did not get author 2')
          ok(authors[2].id === list[2].id, 'did not get author 3')
          db.authors.get([1408]).then(function (author) {
            ok(author.id === 1408, 'did not get author')
            done()
          })
        })
      }).catch(showError)
    })

    it('should delete', function(done) {
      var newBook = {
        title: 'XYZ Book',
        author: {
          name: 'XYZ Author'
        }
      }
      db.books.insert(newBook, function(err, book) {
        no(err)
        var bookId = book.id
        var authorId = book.author_id
        ok(!!book.id, 'did not insert book')
        book.delete(function(err) {
          no(err)
          ok(!book.id, 'book should be deleted')
          db.books.get(bookId, function (err, book) {
            ok(!!err && !!err.notFound, 'should not find deleted book')
            db.authors.get(authorId, function (err, author) {
              no(err)
              ok(!!author.id, 'should not delete author')
              done()
            })
          })
        })
      })
    })

    it('should not delete without cascade', function(done) {
      var newBook = {
        title: 'XYZ Book',
        author: {
          name: 'XYZ Author'
        }
      }
      db.books.insert(newBook, function(err, book) {
        no(err)
        var bookId = book.id
        var authorId = book.author_id
        ok(!!book.id, 'did not insert book')
        book.hydrate('author', function (err) {
          no(err)
          book.author.delete(function(err) {
            ok(!!err, 'should not delete without cascade')
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
        no(err)
        ok(book.id === 11, 'did not insert book')
        book.hydrate('author', function(err) {
          no(err)
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
      }).catch(showError)
    })

    it('should save 1-to-1-to-1 nested objects (insert + insert + insert)', function(done) {
      var newBookData = {
        title: 'my title',
        author: {
          name: 'Author #3',
          Country: {
            Code: 'US',
            name: 'United States'
          }
        }
      }
      db.books.save(newBookData, function(err, book) {
        no(err)
        book.hydrate('author', function(err) {
          no(err)
          book.author.hydrate('Country', function(err) {
            no(err)
            ok(book.author.Country.name === 'United States', 'did not save')
            done()
          })
        })
      })
    })

    it('should not save shorthand 1-to-m w/ column name conflict', function(done) {
      var newAuthor = {
        name: 'Jimbo Jimson',
        books: [
          { title: 'My First Book' }
        ]
      }
      db.authors.save(newAuthor).catch(function (err) {
        ok(!!err, 'should have error')
        done()
      })
    })

    it('should not save a 1-to-m field that is not an array', function(done) {
      var newAuthor = {
        name: 'Jimbo Jimson',
        'author:books': { title: 'My First Book' }
      }
      db.authors.save(newAuthor).catch(function (err) {
        ok(!!err, 'should have error')
        done()
      })
    })

    it('should save 1-to-m (insert + insert)', function(done) {
      var newAuthor = {
        name: 'Jimbo Jimson',
        'author:books': [
          { title: 'My First Book' },
          { title: 'My Second Book' }
        ]
      }
      db.authors.save(newAuthor, function(err, author) {
        no(err)
        ok(!!author.id, 'did not insert author')
        ok(author.name === newAuthor.name, 'wrong author.name')
        var property = 'author:books'
        author.hydrate([property], function(err) {
          no(err)
          ok(!!author[property], 'did not hydrate books')
          ok(author[property].length === newAuthor[property].length, 'wrong number of books')
          var book = author[property][0]
          ok(book.author_id === author.id, 'did not insert book')
          ok(book.title === newAuthor[property][0].title, 'wrong title')
          done()
        })
      })
    })

    it('should save shorthand 1-to-m (insert + insert)', function(done) {
      var newBook = {
        title: 'A Great Book',
        samples: [
          { description: 'Something!' },
          { description: 'Something else!' }
        ]
      }
      db.books.save(newBook, function(err, book) {
        no(err)
        ok(!!book.id, 'did not insert book')
        ok(book.title === newBook.title, 'wrong book.title')
        var property = 'samples'
        book.hydrate(property, function(err) {
          no(err)
          ok(!!book[property], 'did not hydrate samples')
          ok(book[property].length === newBook[property].length, 'wrong number of samples')
          var sample = book[property][0]
          ok(sample.book_id === book.id, 'did not insert sample')
          ok(sample.description === newBook[property][0].description, 'wrong description')
          done()
        })
      })
    })

    it('should propagate errors', function() {
      return db.books.find().then(function (books) {
        console.log('ReferenceError', undefinedVariable)
      }).catch(function (err) {
        ok(!!err, 'should propogate error')
      })
    })

    xit('TODO should populate linking table keys', function(done) {
      var newAuthor = {
        name: 'Chuck Palahniuk',
        ratings: [
          {
            stars: 5,
            book: { title: 'Fight Club' }
          },
          {
            stars: 4,
            book: { title: 'Choke' }
          }
        ]
      }
      db.authors.save(newAuthor, function(err, author) {
        no(err)
        ok(!!author.id, 'did not insert author')
        ok(author.name === newAuthor.name, 'wrong author.name')
        var property = 'ratings'
        author.hydrate([property], function(err) {
          no(err)
          ok(!!author[property], 'did not hydrate')
          ok(author[property].length === newAuthor[property].length, 'wrong qty')
          var rating = author[property][0]
          console.log('rating:', rating)
          rating.hydrate('book', function(err) {
            var book = rating.book
            console.log('book:', book)
            ok(book.author_id === author.id, 'did not save book.author_id')
            ok(book.title === newAuthor.ratings[0].book.title, 'wrong title')
            done()
          })
        })
      })
    })

    // TODO:
    // save rows of the same table in parallel
    // should fail saving a 1-to-m row that attempts to modify a foreign key column
    // should not allow updating foreign key value(s) in a 1-to-1 nested save
    // should not allow updating a 1-to-m row if primary key is specified and fk doesn't match this.pk
    // should not allow updating a 1-to-1 row if primary key is specified and pk not match this.ftbl_id
    // composite primary key insert / update
    // primary key id is specified for insert
    // table has no primary key
    // update table with javascript Date value
    // test sql-injection during save - not just select
    // onReady
    // failed transactions rollback as expected saving 1-to-1 and 1-to-m
    // 1-to-1 and 1-to-m unmodified values should not be updated
    // uncaught error when trying to save to a 1-to-m that exists but linked to a different table

    it('should kill the connection pool', function (done) {
      var isDone = false
      db.end(function () {
        if (isDone) return
        isDone = true
        done()
      })
    })

  })

})
