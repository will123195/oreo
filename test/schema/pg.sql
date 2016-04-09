DROP TABLE IF EXISTS authors CASCADE;
DROP TABLE IF EXISTS battles CASCADE;
DROP TABLE IF EXISTS books CASCADE;
DROP TABLE IF EXISTS "Countries" CASCADE;
DROP TABLE IF EXISTS ratings CASCADE;
DROP TABLE IF EXISTS samples CASCADE;


CREATE TABLE "Countries" (
  "Code" VARCHAR,
  name VARCHAR,
  CONSTRAINT "countriesPkey" PRIMARY KEY("Code")
);

CREATE TABLE authors (
  id SERIAL,
  name VARCHAR,
  books INTEGER[],
  "Country" VARCHAR,
  CONSTRAINT authors_pkey PRIMARY KEY(id),
  CONSTRAINT "Country" FOREIGN KEY ("Country") REFERENCES "Countries"("Code")
);

CREATE TABLE books (
  id SERIAL,
  title VARCHAR,
  author_id INTEGER,
  something VARCHAR,
  CONSTRAINT books_pkey PRIMARY KEY(id),
  CONSTRAINT author FOREIGN KEY (author_id) REFERENCES authors(id)
);

CREATE TABLE ratings (
  author_id INTEGER NOT NULL,
  book_id INTEGER NOT NULL,
  stars INTEGER,
  CONSTRAINT author1 FOREIGN KEY (author_id) REFERENCES authors(id),
  CONSTRAINT book1 FOREIGN KEY (book_id) REFERENCES books(id),
  CONSTRAINT ratings_pkey PRIMARY KEY(author_id, book_id),
  CONSTRAINT ratings_stars_key UNIQUE(stars)
);

CREATE TABLE samples (
  id SERIAL,
  author_id INTEGER,
  book_id INTEGER,
  description VARCHAR,
  CONSTRAINT samples_pkey PRIMARY KEY(id),
  CONSTRAINT book FOREIGN KEY (book_id) REFERENCES books(id),
  CONSTRAINT rating FOREIGN KEY (author_id, book_id) REFERENCES ratings(author_id, book_id)
);

CREATE TABLE battles (
  id SERIAL,
  author1_id INTEGER,
  author2_id INTEGER,
  CONSTRAINT battles_pkey PRIMARY KEY(id),
  CONSTRAINT a1 FOREIGN KEY (author1_id) REFERENCES authors(id),
  CONSTRAINT a2 FOREIGN KEY (author2_id) REFERENCES authors(id)
);
