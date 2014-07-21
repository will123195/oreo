DROP TABLE IF EXISTS authors CASCADE;

CREATE TABLE authors (
  id SERIAL,
  name VARCHAR,
  books INTEGER[],
  CONSTRAINT author_pkey PRIMARY KEY(id)
);

DROP TABLE IF EXISTS books CASCADE;

CREATE TABLE books (
  id SERIAL,
  title VARCHAR,
  author_id INTEGER,
  CONSTRAINT book_pkey PRIMARY KEY(id),
  CONSTRAINT author FOREIGN KEY (author_id) REFERENCES authors(id)
);