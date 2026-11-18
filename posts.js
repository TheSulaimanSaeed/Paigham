/*
  HOW TO ADD A BLOG POST
  1. Copy one block below, paste it at the TOP of the list.
  2. Change slug (short, lowercase, use-dashes), title, date (YYYY-MM-DD), excerpt, body.
  3. Write the body in Markdown: # headings, **bold**, *italic*, > quote, - lists, [text](link).
  4. Save, push to GitHub. Done.
  Delete the two sample posts when you're ready.
*/
window.POSTS = [
  {
    slug: "why-paigham",
    title: "Why I named this place Paigham",
    date: "2026-11-18",
    tag: "Journal",
    excerpt: "Paigham means message. This is where mine go.",
    body: `
Paigham (پیغام) means **message**. Every post here is one: something I learned, something I noticed, something I couldn't stop thinking about.

## What you'll find here

- Journal entries, written the same day
- Longer essays, written slowly
- Notes from biology, design and everything between

> A message doesn't need to be loud. It needs to arrive.

Thanks for reading.
`
  },
  {
    slug: "sample-post",
    title: "A sample post you can delete",
    date: "2026-11-10",
    tag: "Notes",
    excerpt: "Shows how headings, quotes and lists look on the page.",
    body: `
This is a sample. Open **posts.js** and replace it with your own writing.

## A heading

Regular paragraphs look like this. You can add [links](https://example.com), *italics* and **bold**.

1. First thing
2. Second thing
3. Third thing

> Quotes get a quiet line on the side.
`
  }
];
