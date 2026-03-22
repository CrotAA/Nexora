export type Topic =
  | "emotion"
  | "education"
  | "time_process"
  | "society"
  | "technology";

export type Difficulty = "CET4" | "CET6";
export type RelationType =
  | "semantic"
  | "topic"
  | "opposite"
  | "imported"
  | "behavior";

export type RelationSource = "seed" | "auto" | "user";

export type WordItem = {
  id: string;
  word: string;
  phonetic?: string;
  audioUrl?: string;
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

export type WordRelation = {
  id: string;
  sourceWordId: string;
  targetWordId: string;
  type: RelationType;
  strength: number;
  source: RelationSource;
};
