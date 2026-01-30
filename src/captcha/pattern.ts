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
