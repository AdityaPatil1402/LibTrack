// Seed catalogue for LibTrack.
//
// copies: one letter per physical copy, in order (ATOM001, ATOM002, ...).
//   A = AVAILABLE, I = ISSUED, U = UNDER_INSPECTION, D = DAMAGED, L = LOST, W = WITHDRAWN
//
// ISBNs: all titles use clearly marked DEMO identifiers (DEMO-ISBN-0001 ...), because real
// ISBNs could not be verified. page_count is an approximate demo value, and publication_year
// is the year of first publication.

export const STATUS_CODES = {
  A: 'AVAILABLE',
  I: 'ISSUED',
  U: 'UNDER_INSPECTION',
  D: 'DAMAGED',
  L: 'LOST',
  W: 'WITHDRAWN',
};

export const COPY_NOTES = {
  U: 'Returned by a borrower; awaiting inspection (seed data).',
  D: 'Marked damaged: spine and cover damage (seed data).',
  L: 'Reported lost (seed data).',
  W: 'Withdrawn from circulation (seed data).',
};

export const GENRES = [
  'Fiction',
  'Classics',
  'Science Fiction',
  'Fantasy',
  'Mystery & Thriller',
  'Science',
  'Technology',
  'Biography & Memoir',
  'History',
  'Psychology',
  'Business & Finance',
  'Self-Help',
];

export const BOOKS = [
  {
    title: 'Atomic Habits',
    author: 'James Clear',
    genre: 'Self-Help',
    prefix: 'ATOM',
    year: 2018,
    pages: 320,
    curated: false,
    copies: 'AAAIIU',
    description:
      'A practical guide to building good habits and breaking bad ones through small, consistent changes. Clear explains how cues, cravings, responses and rewards shape behaviour, and how tiny improvements compound over time.',
  },
  {
    title: 'Sapiens: A Brief History of Humankind',
    author: 'Yuval Noah Harari',
    genre: 'History',
    prefix: 'SAPI',
    year: 2011,
    pages: 464,
    curated: true,
    copies: 'AAAI',
    description:
      'A sweeping history of our species, from early foragers to the modern age. Harari examines how shared myths, agriculture, money and science shaped societies and the way we live today.',
  },
  {
    title: 'The Alchemist',
    author: 'Paulo Coelho',
    genre: 'Fiction',
    prefix: 'ALCH',
    year: 1988,
    pages: 208,
    curated: true,
    copies: 'AAAA',
    description:
      'A shepherd boy named Santiago travels from Spain to the Egyptian desert in search of treasure. Along the way he learns to listen to his heart and to read the signs that point towards a personal destiny.',
  },
  {
    title: 'To Kill a Mockingbird',
    author: 'Harper Lee',
    genre: 'Classics',
    prefix: 'MOCK',
    year: 1960,
    pages: 336,
    curated: true,
    copies: 'AAI',
    description:
      'Set in the American South in the 1930s, the story follows young Scout Finch as her father, a lawyer, defends a Black man falsely accused of a crime. A moving study of prejudice, empathy and moral courage.',
  },
  {
    title: 'Nineteen Eighty-Four',
    author: 'George Orwell',
    genre: 'Science Fiction',
    prefix: 'NE84',
    year: 1949,
    pages: 328,
    curated: true,
    copies: 'AAIIW',
    description:
      'In a totalitarian state ruled by constant surveillance and rewritten truth, Winston Smith begins to question the Party. Orwell\'s dystopia remains a landmark warning about propaganda and the abuse of power.',
  },
  {
    title: 'Pride and Prejudice',
    author: 'Jane Austen',
    genre: 'Classics',
    prefix: 'PRID',
    year: 1813,
    pages: 432,
    curated: false,
    copies: 'AAAD',
    description:
      'Elizabeth Bennet navigates family pressure, social class and first impressions in Regency England, above all in her tense relationship with the proud Mr Darcy. A witty classic of manners and romance.',
  },
  {
    title: 'The Great Gatsby',
    author: 'F. Scott Fitzgerald',
    genre: 'Classics',
    prefix: 'GATS',
    year: 1925,
    pages: 180,
    curated: false,
    copies: 'AAI',
    description:
      'Narrated by Nick Carraway, the story traces the mysterious millionaire Jay Gatsby\'s obsession with Daisy Buchanan in Jazz Age New York. A short, glittering tragedy about ambition and the American Dream.',
  },
  {
    title: 'Clean Code',
    author: 'Robert C. Martin',
    genre: 'Technology',
    prefix: 'CLNC',
    year: 2008,
    pages: 464,
    curated: true,
    copies: 'AAAIU',
    description:
      'A handbook of software craftsmanship on writing readable, maintainable code. Martin works through naming, functions, formatting, error handling and refactoring with extended worked examples.',
  },
  {
    title: 'The Pragmatic Programmer',
    author: 'Andrew Hunt and David Thomas',
    genre: 'Technology',
    prefix: 'PRAG',
    year: 1999,
    pages: 352,
    curated: false,
    copies: 'AAI',
    description:
      'Practical advice for working developers, from taking responsibility for your code to automating routine tasks and building flexible software. Its short, memorable tips have shaped how many engineers approach their craft.',
  },
  {
    title: 'Introduction to Algorithms',
    author: 'Thomas H. Cormen',
    genre: 'Technology',
    prefix: 'ALGO',
    year: 1990,
    pages: 1312,
    curated: false,
    copies: 'AAIL',
    description:
      'A comprehensive textbook on the design and analysis of algorithms, covering sorting, graph algorithms, dynamic programming and more. Widely used in university courses and as a long-term reference.',
  },
  {
    title: 'A Brief History of Time',
    author: 'Stephen Hawking',
    genre: 'Science',
    prefix: 'TIME',
    year: 1988,
    pages: 256,
    curated: true,
    copies: 'AAA',
    description:
      'Hawking explains black holes, the Big Bang and the nature of time for general readers, using very little mathematics. A well-known introduction to modern cosmology.',
  },
  {
    title: 'Cosmos',
    author: 'Carl Sagan',
    genre: 'Science',
    prefix: 'COSM',
    year: 1980,
    pages: 396,
    curated: false,
    copies: 'AAIU',
    description:
      'Sagan guides readers through the history of science and the scale of the universe, from ancient astronomy to the search for life beyond Earth. Written with a deep sense of wonder.',
  },
  {
    title: 'The Selfish Gene',
    author: 'Richard Dawkins',
    genre: 'Science',
    prefix: 'GENE',
    year: 1976,
    pages: 360,
    curated: false,
    copies: 'AI',
    description:
      'Dawkins presents evolution from the gene\'s point of view and introduces the idea of the meme. An influential and much-debated work of popular science.',
  },
  {
    title: 'Wings of Fire',
    author: 'A. P. J. Abdul Kalam',
    genre: 'Biography & Memoir',
    prefix: 'WING',
    year: 1999,
    pages: 180,
    curated: true,
    copies: 'III',
    description:
      'The autobiography of A. P. J. Abdul Kalam, tracing his journey from a small town in Tamil Nadu to India\'s space and missile programmes. An inspiring story of perseverance, mentors and scientific ambition.',
  },
  {
    title: 'The Discovery of India',
    author: 'Jawaharlal Nehru',
    genre: 'History',
    prefix: 'DISC',
    year: 1946,
    pages: 640,
    curated: false,
    copies: 'AAW',
    description:
      'Written during Nehru\'s imprisonment in the 1940s, this book surveys India\'s history, philosophy and culture across thousands of years. A personal and reflective account of the country\'s heritage.',
  },
  {
    title: 'Train to Pakistan',
    author: 'Khushwant Singh',
    genre: 'Fiction',
    prefix: 'TRPK',
    year: 1956,
    pages: 192,
    curated: false,
    copies: 'AAA',
    description:
      'Set in a small Punjab border village in the summer of 1947, the novel shows how the violence of Partition shatters a community of Hindus, Sikhs and Muslims. A stark and humane historical novel.',
  },
  {
    title: 'The God of Small Things',
    author: 'Arundhati Roy',
    genre: 'Fiction',
    prefix: 'GODS',
    year: 1997,
    pages: 336,
    curated: false,
    copies: 'AID',
    description:
      'In Kerala, the twins Estha and Rahel grow up amid family secrets, caste boundaries and a tragedy that shapes their lives. Roy\'s lyrical debut won the Booker Prize.',
  },
  {
    title: 'Midnight\'s Children',
    author: 'Salman Rushdie',
    genre: 'Fiction',
    prefix: 'MIDN',
    year: 1981,
    pages: 536,
    curated: false,
    copies: 'AAI',
    description:
      'Saleem Sinai, born at the moment of India\'s independence, is mysteriously linked to the fate of the nation. A rich, inventive novel of magical realism and modern Indian history that won the Booker Prize.',
  },
  {
    title: 'The Hobbit',
    author: 'J. R. R. Tolkien',
    genre: 'Fantasy',
    prefix: 'HOBB',
    year: 1937,
    pages: 310,
    curated: false,
    copies: 'IID',
    description:
      'Bilbo Baggins is swept out of his comfortable home into a quest with a company of dwarves to reclaim treasure guarded by the dragon Smaug. A classic adventure that comes before The Lord of the Rings.',
  },
  {
    title: 'Harry Potter and the Philosopher\'s Stone',
    author: 'J. K. Rowling',
    genre: 'Fantasy',
    prefix: 'HPPS',
    year: 1997,
    pages: 332,
    curated: false,
    copies: 'IIIU',
    description:
      'Eleven-year-old Harry discovers he is a wizard and begins his first year at Hogwarts School of Witchcraft and Wizardry. The first book of a hugely popular fantasy series.',
  },
  {
    title: 'Dune',
    author: 'Frank Herbert',
    genre: 'Science Fiction',
    prefix: 'DUNE',
    year: 1965,
    pages: 612,
    curated: true,
    copies: 'II',
    description:
      'On the desert planet Arrakis, young Paul Atreides is drawn into a struggle over the most valuable resource in the universe. A landmark science fiction epic of politics, ecology and religion.',
  },
  {
    title: 'Foundation',
    author: 'Isaac Asimov',
    genre: 'Science Fiction',
    prefix: 'FOUN',
    year: 1951,
    pages: 255,
    curated: true,
    copies: 'AAI',
    description:
      'As a vast galactic empire declines, the mathematician Hari Seldon sets up a plan to shorten the dark age to come. The opening volume of Asimov\'s celebrated science fiction saga.',
  },
  {
    title: 'The Girl with the Dragon Tattoo',
    author: 'Stieg Larsson',
    genre: 'Mystery & Thriller',
    prefix: 'DRAG',
    year: 2005,
    pages: 590,
    curated: false,
    copies: 'AAIA',
    description:
      'Journalist Mikael Blomkvist and the hacker Lisbeth Salander investigate a decades-old disappearance within a wealthy Swedish family. A dark, fast-paced crime thriller.',
  },
  {
    title: 'And Then There Were None',
    author: 'Agatha Christie',
    genre: 'Mystery & Thriller',
    prefix: 'NONE',
    year: 1939,
    pages: 272,
    curated: false,
    copies: 'AAAI',
    description:
      'Ten strangers are lured to an isolated island and begin to die one by one, following the lines of a nursery rhyme. Christie\'s best-selling mystery is a masterclass in suspense.',
  },
  {
    title: 'Thinking, Fast and Slow',
    author: 'Daniel Kahneman',
    genre: 'Psychology',
    prefix: 'FAST',
    year: 2011,
    pages: 499,
    curated: true,
    copies: 'AAU',
    description:
      'Kahneman describes two modes of thought, one fast and intuitive and the other slow and deliberate, and shows how they lead to predictable errors in judgement. A summary of decades of behavioural research.',
  },
  {
    title: 'The Psychology of Money',
    author: 'Morgan Housel',
    genre: 'Business & Finance',
    prefix: 'PSYM',
    year: 2020,
    pages: 256,
    curated: true,
    copies: 'AAAAI',
    description:
      'Housel argues that behaviour, luck and mindset matter as much as knowledge when it comes to money. Short stories illustrate lessons on saving, investing and contentment.',
  },
  {
    title: 'Rich Dad Poor Dad',
    author: 'Robert T. Kiyosaki',
    genre: 'Business & Finance',
    prefix: 'RICH',
    year: 1997,
    pages: 336,
    curated: false,
    copies: 'AAAIL',
    description:
      'Kiyosaki contrasts the money views of his two "dads" to argue for financial education, owning assets and entrepreneurship. A popular and often debated personal-finance book.',
  },
  {
    title: 'Zero to One',
    author: 'Peter Thiel',
    genre: 'Business & Finance',
    prefix: 'ZERO',
    year: 2014,
    pages: 224,
    curated: false,
    copies: 'AAI',
    description:
      'Peter Thiel\'s notes on building companies that create something new instead of copying existing models. Covers monopoly, competition, technology and the value of a contrarian view.',
  },
  {
    title: 'The Diary of a Young Girl',
    author: 'Anne Frank',
    genre: 'Biography & Memoir',
    prefix: 'ANNE',
    year: 1947,
    pages: 283,
    curated: false,
    copies: 'AAAW',
    description:
      'Anne Frank\'s diary, written while hiding with her family in Amsterdam during the Nazi occupation. A personal and enduring record of adolescence and resilience.',
  },
  {
    title: 'Educated',
    author: 'Tara Westover',
    genre: 'Biography & Memoir',
    prefix: 'EDUC',
    year: 2018,
    pages: 352,
    curated: true,
    copies: 'AI',
    description:
      'Tara Westover recounts growing up in a survivalist family in rural Idaho, never attending school, and later earning a doctorate at Cambridge. A memoir about family, loyalty and self-invention.',
  },
];
