# School Database Design

## Tables

### students

- Stores one row per student.
- Columns: `student_id` (primary key), `name`, `email`.
- `email` is `NOT NULL` and `UNIQUE`, so two students cannot share an address.

### courses

- Stores one row per course.
- Columns: `course_id` (primary key), `code` (unique, e.g. CS101), `title`, `credits`.

### enrolments

- Stores one row per student-on-course pairing, so it records the fact that a student is enrolled.
- Columns: `enrolment_id` (primary key), `student_id` and `course_id` (both foreign keys), `grade`.
- `grade` can be `NULL` because a new enrolment has no grade yet.
- `UNIQUE (student_id, course_id)` stops the same student enrolling on the same course twice.

## Relationships

- **students to enrolments: one-to-many.** One student can have many enrolments, but each enrolment belongs to exactly one student.
- **courses to enrolments: one-to-many.** One course can have many enrolments, but each enrolment belongs to exactly one course.
- **students to courses: many-to-many.** A student can take many courses, and a course can have many students.

A many-to-many relationship cannot be stored directly in two tables. A `course_id` column in `students` would limit each student to one course, and a `student_id` column in `courses` would limit each course to one student. The `enrolments` join table solves this by turning the relationship into two one-to-many relationships. It also gives a natural place to store data that belongs to the pairing itself, which is the grade.

## Index

I would add an index on `enrolments(course_id)`:

sql
CREATE INDEX idx_enrolments_course_id ON enrolments (course_id);

The `UNIQUE (student_id, course_id)` rule already creates an index that helps lookups starting with `student_id`, but not lookups by `course_id` alone. Finding all students on a course and counting students per course both filter or join on `course_id`, and without the index the database would scan the whole enrolments table as it grows.

## SQL or NoSQL?

I would choose SQL for this system. The data is highly structured and relational: students, courses and enrolments always have the same fields and are linked to each other. A relational database enforces that integrity for us, with foreign keys that stop an enrolment pointing at a student who does not exist, a unique constraint that blocks duplicate enrolments, and `NOT NULL` rules that keep required data present. Questions like "which students have no enrolments" or "how many students are on each course" are also natural with joins and `GROUP BY`. A NoSQL document database would suit data with flexible, changing shapes or huge scale, but here it would mean duplicating student or course details inside documents and enforcing the rules in application code, which is easier to get wrong.
