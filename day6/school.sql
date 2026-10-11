-- School database (SQLite)
PRAGMA foreign_keys = ON;

-- Drop in reverse order so the script can be re-run
DROP TABLE IF EXISTS enrolments;

DROP TABLE IF EXISTS courses;

DROP TABLE IF EXISTS students;

-- ---------- Tables ----------

CREATE TABLE students (
    student_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE
);

CREATE TABLE courses (
    course_id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    credits INTEGER NOT NULL CHECK (credits > 0)
);

CREATE TABLE enrolments (
    enrolment_id INTEGER PRIMARY KEY,
    student_id INTEGER NOT NULL,
    course_id INTEGER NOT NULL,
    grade INTEGER CHECK (grade BETWEEN 0 AND 100),
    FOREIGN KEY (student_id) REFERENCES students (student_id),
    FOREIGN KEY (course_id) REFERENCES courses (course_id),
    UNIQUE (student_id, course_id) -- same student cannot enrol on the same course twice
);

-- ---------- Sample data ----------

INSERT INTO
    students (name, email)
VALUES (
        'Amina Wanjiru',
        'amina@example.com'
    ),
    (
        'Brian Otieno',
        'brian@example.com'
    ),
    (
        'Cynthia Mutua',
        'cynthia@example.com'
    ),
    (
        'David Kiprop',
        'david@example.com'
    );

INSERT INTO
    courses (code, title, credits)
VALUES ('CS101', 'Web Development', 3),
    ('CS102', 'Databases', 3),
    (
        'CS103',
        'Python Programming',
        4
    );

INSERT INTO
    enrolments (student_id, course_id, grade)
VALUES (1, 1, 78),
    (1, 2, 82),
    (2, 1, 65),
    (3, 2, 90),
    (3, 3, NULL),
    (2, 3, 71);

-- ---------- Queries ----------

-- 1. All courses for one student (by name)
SELECT c.code, c.title, e.grade
FROM
    students s
    JOIN enrolments e ON e.student_id = s.student_id
    JOIN courses c ON c.course_id = e.course_id
WHERE
    s.name = 'Amina Wanjiru';

-- 2. All students on one course
SELECT s.name, s.email, e.grade
FROM
    courses c
    JOIN enrolments e ON e.course_id = c.course_id
    JOIN students s ON s.student_id = e.student_id
WHERE
    c.title = 'Web Development';

-- 3. Number of students per course
SELECT c.title, COUNT(e.enrolment_id) AS student_count
FROM courses c
    LEFT JOIN enrolments e ON e.course_id = c.course_id
GROUP BY
    c.course_id,
    c.title;

-- 4. Students who have no enrolments
SELECT s.name, s.email
FROM students s
    LEFT JOIN enrolments e ON e.student_id = s.student_id
WHERE
    e.enrolment_id IS NULL;

-- 5. Update one enrolment's grade (Brian's grade in Web Development)
UPDATE enrolments
SET
    grade = 85
WHERE
    student_id = (
        SELECT student_id
        FROM students
        WHERE
            name = 'Brian Otieno'
    )
    AND course_id = (
        SELECT course_id
        FROM courses
        WHERE
            code = 'CS101'
    );

-- Check the update
SELECT s.name, c.title, e.grade
FROM
    enrolments e
    JOIN students s ON s.student_id = e.student_id
    JOIN courses c ON c.course_id = e.course_id
WHERE
    s.name = 'Brian Otieno';