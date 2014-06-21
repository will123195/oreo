# oreo

A simple ORM for PostgreSQL

## Features

- No configuration necessary
- Automatically discovers tables, primary keys and foreign keys
- Ability to "hydrate" foreign keys
- Ability to "hydrate" arrays of foreign keys
- Object caching / Query memoization

## Usage

Suppose we have the following schema:

```
CREATE TABLE author (
  id SERIAL,
  name VARCHAR,
  books INTEGER[],
  CONSTRAINT author_pkey PRIMARY KEY(id)
);

CREATE TABLE book (
  id SERIAL,
  title VARCHAR,
  author_id INTEGER,
  CONSTRAINT book_pkey PRIMARY KEY(id),
  CONSTRAINT book_fk1 FOREIGN KEY (author_id) REFERENCES author(id)
);
```

```js
var oreo = require('oreo')

var orm = oreo()    // defaults to localhost:5432

orm.discover()      // discover tables, primary keys and foreign keys
```

```js
orm.book.insert({
  title: 'On the Road',
  author: {
    name: 'Jack Kerouac'
  }
}, function(err, book) {
  console.log(book)
  // { id: 1, title: On the Road, author_id: 1 } 
})
```

```js
orm.book.get(book.id, function(err, book) {
  console.log(book)
  // { id: 1, title: On the Road, author_id: 1 } 
  book.hydrate(function(err, book) {
    console.log(book)
    // { id: 1, title: On the Road, author_id: 1, author: { name: Jack Kerouac, books: [1] } }

    book.update({
      title: 'New Title'
    }, function(err, book) {
      console.log(book)
      // { id: 1, title: New Title, author_id: 1 } 
    })
  })
})
```

```js
orm.configure('')

orm.author.get(1, function(err, author) {
  author.hydrate('books')
  // author.books[0].title
})

orm.album.find({
  order: 'name asc',
  offset: 5,
  limit: 5
}, function(err, albums) {

})
```

## Advanced Usage

- Create triggers that automatically populate arrays of 1-to-many foreign keys
- Create triggers that "replicate" to Redis Foreign Data Wrapper (for high-speed reads)

