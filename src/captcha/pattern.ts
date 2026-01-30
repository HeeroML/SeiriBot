import { randomBytes } from "node:crypto";

export type CaptchaOption = {
  text: string;
  emoji?: string;
};

type CaptchaQuestionOption = CaptchaOption & {
  correct: boolean;
};

type CaptchaQuestion = {
  question: string;
  options: CaptchaQuestionOption[];
};

const QUESTION_POOL: CaptchaQuestion[] = [
  {
    question: "Welche ist kein Obst?",
    options: [
      { text: "Trauben", emoji: "🍇", correct: false },
      { text: "Ananas", emoji: "🍍", correct: false },
      { text: "Karotte", emoji: "🥕", correct: true },
      { text: "Zitrone", emoji: "🍋", correct: false }
    ]
  },
  {
    question: "Welches ist kein Tier?",
    options: [
      { text: "Hund", emoji: "🐶", correct: false },
      { text: "Katze", emoji: "🐱", correct: false },
      { text: "Maus", emoji: "🐭", correct: false },
      { text: "Bus", emoji: "🚌", correct: true }
    ]
  },
  {
    question: "Welches ist kein Fahrzeug?",
    options: [
      { text: "Auto", emoji: "🚗", correct: false },
      { text: "Fahrrad", emoji: "🚲", correct: false },
      { text: "Flugzeug", emoji: "✈️", correct: false },
      { text: "Apfel", emoji: "🍎", correct: true }
    ]
  },
  {
    question: "Welches ist kein Werkzeug?",
    options: [
      { text: "Hammer", emoji: "🔨", correct: false },
      { text: "Schraubenschluessel", emoji: "🔧", correct: false },
      { text: "Zange", emoji: "🗜️", correct: false },
      { text: "Brot", emoji: "🍞", correct: true }
    ]
  },
  {
    question: "Welches ist kein Kleidungsstueck?",
    options: [
      { text: "T-Shirt", emoji: "👕", correct: false },
      { text: "Hose", emoji: "👖", correct: false },
      { text: "Schuh", emoji: "👟", correct: false },
      { text: "Buch", emoji: "📚", correct: true }
    ]
  },
  {
    question: "Welches ist kein Getraenk?",
    options: [
      { text: "Kaffee", emoji: "☕", correct: false },
      { text: "Milch", emoji: "🥛", correct: false },
      { text: "Saft", emoji: "🧃", correct: false },
      { text: "Stuhl", emoji: "🪑", correct: true }
    ]
  },
  {
    question: "Welches ist kein Wetter?",
    options: [
      { text: "Sonne", emoji: "☀️", correct: false },
      { text: "Regen", emoji: "🌧️", correct: false },
      { text: "Schnee", emoji: "❄️", correct: false },
      { text: "Gitarre", emoji: "🎸", correct: true }
    ]
  },
  {
    question: "Welches ist kein Bueroartikel?",
    options: [
      { text: "Stift", emoji: "🖊️", correct: false },
      { text: "Bueroklammer", emoji: "📎", correct: false },
      { text: "Reisszwecke", emoji: "📌", correct: false },
      { text: "Pizza", emoji: "🍕", correct: true }
    ]
  },
  {
    question: "Welches ist kein Geraet?",
    options: [
      { text: "Handy", emoji: "📱", correct: false },
      { text: "Laptop", emoji: "💻", correct: false },
      { text: "Monitor", emoji: "🖥️", correct: false },
      { text: "Croissant", emoji: "🥐", correct: true }
    ]
  },
  {
    question: "Welches ist kein Gemuese?",
    options: [
      { text: "Karotte", emoji: "🥕", correct: false },
      { text: "Brokkoli", emoji: "🥦", correct: false },
      { text: "Kartoffel", emoji: "🥔", correct: false },
      { text: "Keks", emoji: "🍪", correct: true }
    ]
  },
  {
    question: "Welches ist kein Musikinstrument?",
    options: [
      { text: "Gitarre", emoji: "🎸", correct: false },
      { text: "Trommel", emoji: "🥁", correct: false },
      { text: "Klavier", emoji: "🎹", correct: false },
      { text: "Fahrrad", emoji: "🚲", correct: true }
    ]
  },
  {
    question: "Welches ist kein Sport?",
    options: [
      { text: "Fussball", emoji: "⚽", correct: false },
      { text: "Basketball", emoji: "🏀", correct: false },
      { text: "Tennis", emoji: "🎾", correct: false },
      { text: "Banane", emoji: "🍌", correct: true }
    ]
  },
  {
    question: "Welches ist kein Koerperteil?",
    options: [
      { text: "Hand", emoji: "✋", correct: false },
      { text: "Ohr", emoji: "👂", correct: false },
      { text: "Nase", emoji: "👃", correct: false },
      { text: "Messer", emoji: "🔪", correct: true }
    ]
  },
  {
    question: "Welches ist kein Schmuck?",
    options: [
      { text: "Ring", emoji: "💍", correct: false },
      { text: "Kette", emoji: "📿", correct: false },
      { text: "Edelstein", emoji: "💎", correct: false },
      { text: "Schluessel", emoji: "🔑", correct: true }
    ]
  },
  {
    question: "Welches ist kein Gebaeck?",
    options: [
      { text: "Croissant", emoji: "🥐", correct: false },
      { text: "Brot", emoji: "🍞", correct: false },
      { text: "Keks", emoji: "🍪", correct: false },
      { text: "Gabel", emoji: "🍴", correct: true }
    ]
  },
  {
    question: "Welches ist kein Vogel?",
    options: [
      { text: "Adler", emoji: "🦅", correct: false },
      { text: "Kueken", emoji: "🐥", correct: false },
      { text: "Ente", emoji: "🦆", correct: false },
      { text: "Schnecke", emoji: "🐌", correct: true }
    ]
  },
  {
    question: "Welches ist kein Insekt?",
    options: [
      { text: "Biene", emoji: "🐝", correct: false },
      { text: "Schmetterling", emoji: "🦋", correct: false },
      { text: "Kaefer", emoji: "🪲", correct: false },
      { text: "Schildkroete", emoji: "🐢", correct: true }
    ]
  },
  {
    question: "Welches ist kein Meerestier?",
    options: [
      { text: "Fisch", emoji: "🐟", correct: false },
      { text: "Krake", emoji: "🐙", correct: false },
      { text: "Delphin", emoji: "🐬", correct: false },
      { text: "Katze", emoji: "🐱", correct: true }
    ]
  },
  {
    question: "Welches ist kein Spielzeug?",
    options: [
      { text: "Teddy", emoji: "🧸", correct: false },
      { text: "Ball", emoji: "⚽", correct: false },
      { text: "Puzzle", emoji: "🧩", correct: false },
      { text: "Zahnbuerste", emoji: "🪥", correct: true }
    ]
  }
];

export type PatternCaptcha = {
  question: string;
  options: CaptchaOption[];
  correctIndex: number;
};

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle<T>(items: T[]): T[] {
  const array = [...items];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export function generateNonce(bytes = 4): string {
  return randomBytes(bytes).toString("hex");
}

export function generatePatternCaptcha(): PatternCaptcha {
  const base = QUESTION_POOL[randomInt(0, QUESTION_POOL.length - 1)];
  const options = shuffle(base.options);
  const correctIndex = options.findIndex((option) => option.correct);
  const correctCount = options.filter((option) => option.correct).length;

  if (correctIndex < 0 || correctCount !== 1) {
    throw new Error("Invalid captcha configuration.");
  }

  return {
    question: base.question,
    options: options.map(({ text, emoji }) => ({ text, emoji })),
    correctIndex: correctIndex + 1
  };
}
