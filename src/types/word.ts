export type Topic =
  | "emotion"
  | "education"
  | "time_process"
  | "society"
  | "technology";

export type Difficulty = "CET4" | "CET6";

export type WordItem = {
  id: string;
  word: string;
  meanings: string[];
  topic: Topic;
  example: string;
  related: string[];
  opposite?: string[];
  difficulty: Difficulty;
  memoryHint: string;
  x: number;
  y: number;
};
