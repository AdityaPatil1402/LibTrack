import { useState } from 'react';

// Placeholder covers: the catalogue has no cover images yet, so each title gets a generated cover.
// The colours come from the book id, so a title always keeps the same cover.
const PALETTES = [
  ['#4f8cff', '#8b5cf6'],
  ['#3b82f6', '#06b6d4'],
  ['#8b5cf6', '#ec4899'],
  ['#6366f1', '#0ea5e9'],
  ['#7c3aed', '#3b82f6'],
  ['#2563eb', '#a855f7'],
  ['#0ea5e9', '#6366f1'],
  ['#9333ea', '#4f8cff'],
];

function wrapTitle(title, maxChars = 14, maxLines = 4) {
  const lines = [];
  let line = '';
  for (const word of title.split(/\s+/)) {
    if (line && `${line} ${word}`.length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].slice(0, maxChars - 1)}…`;
    return kept;
  }
  return lines;
}

function PlaceholderCover({ id, title, author }) {
  const [from, to] = PALETTES[Math.abs(id) % PALETTES.length];
  const gradientId = `cover-${id}`;
  const lines = wrapTitle(title);
  return (
    <svg viewBox="0 0 200 300" role="img" aria-label={`Placeholder cover for ${title}`} className="cover-svg">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
      </defs>
      <rect width="200" height="300" fill={`url(#${gradientId})`} />
      <rect width="12" height="300" fill="#000" opacity="0.18" />
      <circle cx="170" cy="40" r="70" fill="#fff" opacity="0.07" />
      <circle cx="30" cy="290" r="90" fill="#000" opacity="0.1" />
      <g fill="#fff" fontFamily="Georgia, 'Times New Roman', serif">
        {lines.map((text, index) => (
          <text key={text + index} x="28" y={96 + index * 26} fontSize="21" fontWeight="700">
            {text}
          </text>
        ))}
        <text x="28" y="268" fontSize="12" opacity="0.85" fontFamily="system-ui, sans-serif">
          {author.length > 24 ? `${author.slice(0, 23)}…` : author}
        </text>
      </g>
    </svg>
  );
}

/** Shows the real cover image when one exists, otherwise the generated placeholder. */
export default function BookCover({ book, className = '' }) {
  const [failed, setFailed] = useState(false);
  const hasImage = Boolean(book.coverUrl) && !failed;
  return (
    <div className={`cover ${className}`}>
      {hasImage ? (
        <img src={book.coverUrl} alt={`Cover of ${book.title}`} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <PlaceholderCover id={book.id} title={book.title} author={book.author} />
      )}
    </div>
  );
}
