# Library API Design: Books Resource

Base URL: `/api`

All request and response bodies use JSON.

## Endpoints

### 1. List all books

- **Method:** GET
- **Path:** `/books`
- **Description:** Returns every book in the library.
- **Request body:** none
- **Success status:** 200 OK

### 2. Get one book

- **Method:** GET
- **Path:** `/books/{id}`
- **Description:** Returns the book with the given id.
- **Request body:** none
- **Success status:** 200 OK

### 3. Create a book

- **Method:** POST
- **Path:** `/books`
- **Description:** Adds a new book to the library.
- **Example request body:**

json
{
"title": "Things Fall Apart",
"author": "Chinua Achebe",
"year": 1958,
"isbn": "9780385474542"
}

- **Success status:** 201 Created

### 4. Replace a book

- **Method:** PUT
- **Path:** `/books/{id}`
- **Description:** Replaces all the details of an existing book.
- **Example request body:**

json
{
"title": "Things Fall Apart",
"author": "Chinua Achebe",
"year": 1958,
"isbn": "9780385474542"
}

- **Success status:** 200 OK

### 5. Update part of a book

- **Method:** PATCH
- **Path:** `/books/{id}`
- **Description:** Changes only the fields that are sent.
- **Example request body:**

json
{
"year": 1959
}

- **Success status:** 200 OK

### 6. Delete a book

- **Method:** DELETE
- **Path:** `/books/{id}`
- **Description:** Removes the book from the library.
- **Request body:** none
- **Success status:** 204 No Content

### 7. List books by an author

- **Method:** GET
- **Path:** `/books?author=Chinua%20Achebe`
- **Description:** Returns only the books written by the author given in the `author` query parameter.
- **Request body:** none
- **Success status:** 200 OK

## Error codes

### 400 Bad Request

- The request is invalid or incomplete.
- **Example:** `POST /books` with no `title`, or with `"year": "last year"` instead of a number.

### 404 Not Found

- The requested resource does not exist.
- **Example:** `GET /books/9999` when no book has the id 9999.
