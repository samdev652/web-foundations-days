let notes = [
  { id: 1, text: "Buy milk and bread", category: "personal" },
  { id: 2, text: "Finish the Day 3 assignment", category: "study" },
  { id: 3, text: "Email the project report to Grace", category: "work" },
  { id: 4, text: "Revise JavaScript arrays", category: "study" },
  { id: 5, text: "Call mum", category: "personal" },
];

const CATEGORIES = ["personal", "work", "study"];

// Trim, collapse repeated spaces, and lower-case for comparisons
function normalise(text) {
  return String(text).trim().replace(/\s+/g, " ").toLowerCase();
}

function searchNotes(word) {
  const target = String(word).toLowerCase();
  return notes.filter((note) => note.text.toLowerCase().includes(target));
}

function longestNote() {
  if (notes.length === 0) {
    return null;
  }
  let longest = notes[0];
  for (const note of notes) {
    if (note.text.length > longest.text.length) {
      longest = note;
    }
  }
  return longest;
}

function countByCategory() {
  const counts = {};
  for (const note of notes) {
    counts[note.category] = (counts[note.category] || 0) + 1;
  }
  return counts;
}

function getSummary() {
  const counts = countByCategory();
  const total = notes.length;
  const word = total === 1 ? "note" : "notes";

  if (total === 0) {
    return `0 ${word}.`;
  }

  const parts = CATEGORIES
    .filter((category) => counts[category])
    .map((category) => `${counts[category]} ${category}`);

  return `${total} ${word}: ${parts.join(", ")}.`;
}

function isDuplicate(text) {
  const target = normalise(text);
  return notes.some((note) => normalise(note.text) === target);
}

function addNote(text, category) {
  const cleaned = typeof text === "string" ? text.trim().replace(/\s+/g, " ") : "";

  if (cleaned.length < 1 || cleaned.length > 200) {
    console.log("Not added: text must be 1-200 characters.");
    return false;
  }
  if (!CATEGORIES.includes(category)) {
    console.log(`Not added: category must be one of ${CATEGORIES.join(", ")}.`);
    return false;
  }
  if (isDuplicate(cleaned)) {
    console.log("Not added: a note with this text already exists.");
    return false;
  }

  const nextId = notes.length > 0 ? Math.max(...notes.map((n) => n.id)) + 1 : 1;
  notes.push({ id: nextId, text: cleaned, category: category });
  console.log(`Added note ${nextId}: ${cleaned}`);
  return true;
}

// ---------- Tests ----------

// searchNotes
console.log(searchNotes("MILK"));
// [ { id: 1, text: "Buy milk and bread", category: "personal" } ]
console.log(searchNotes("xyz"));
// [] (no results)

// longestNote
console.log(longestNote());
// { id: 3, text: "Email the project report to Grace", category: "work" }
const savedNotes = notes;
notes = [];
console.log(longestNote());
// null (empty array)
notes = savedNotes;

// countByCategory
console.log(countByCategory());
// { personal: 2, study: 2, work: 1 }
notes = [];
console.log(countByCategory());
// {} (empty array)
notes = savedNotes;

// getSummary
console.log(getSummary());
// "5 notes: 2 personal, 1 work, 2 study."
notes = [savedNotes[0]];
console.log(getSummary());
// "1 note: 1 personal."
notes = [];
console.log(getSummary());
// "0 notes."
notes = savedNotes;

// isDuplicate
console.log(isDuplicate("  BUY   milk and bread "));
// true (ignores case and extra spaces)
console.log(isDuplicate("Walk the dog"));
// false

// addNote
console.log(addNote("Walk the dog", "personal"));
// Added note 6: Walk the dog
// true
console.log(addNote("  WALK the   dog ", "personal"));
// Not added: a note with this text already exists.
// false
console.log(addNote("   ", "work"));
// Not added: text must be 1-200 characters.
// false
console.log(addNote("a".repeat(201), "work"));
// Not added: text must be 1-200 characters.
// false
console.log(addNote("Plan the sprint", "hobby"));
// Not added: category must be one of personal, work, study.
// false
console.log(getSummary());
// "6 notes: 3 personal, 1 work, 2 study."